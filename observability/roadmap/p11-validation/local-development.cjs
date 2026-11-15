'use strict';
// Separate local profile. Never writes production acceptance, changes services or loads test DLLs.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const r = require('../../p08/runtime.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const evidenceRoot = path.resolve(root, process.argv[3] || '.local/p11-local-development-20261115');
if (!evidenceRoot.startsWith(path.join(root, '.local') + path.sep)) throw Error('Ignored local evidence directory required');
const base = path.relative(root, evidenceRoot).replaceAll('\\', '/');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const save = (name, data) => fs.writeFileSync(path.join(base, name + '.json'), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const repos = ['.', 'angular', 'dotnet', 'quarkus', 'springboot-jwks-api', 'D:/springboot-project', 'D:/springboot-project/springboot-user-api', 'D:/springboot-project/springboot-learning-api', 'D:/springboot-project/springboot-jwks-api'];
function git(dir, args) {
  const absolute = path.resolve(dir).replaceAll('\\', '/');
  const q = cp.spawnSync('git', ['-c', 'safe.directory=' + absolute, '-C', absolute, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (q.status !== 0) throw Error('Read-only Git operation failed');
  return q.stdout.trim();
}
function keyHashes() {
  const technical = read(path.join(base, 'technical.json'));
  const dirs = [...new Set(technical.before.containers.flatMap(c => c.mounts.filter(m => m.Type === 'bind' && !m.RW && m.Destination === '/run/keys/jwt').map(m => m.Source)))];
  return dirs.map(dir => ({ dir, files: fs.readdirSync(dir).sort().map(name => ({ name, sha256: hash(fs.readFileSync(path.join(dir, name))) })) }));
}
function identities() {
  return repos.map(dir => ({ dir, head: git(dir, ['rev-parse', 'HEAD']), indexSha256: hash(git(dir, ['ls-files', '--stage'])), status: git(dir, ['status', '--porcelain=v1']) }));
}
async function main() {
  const action = process.argv[2];
  if (action === 'baseline') {
    const files = ['observability/roadmap/p01-quality-gates.md', 'observability/roadmap/quality-gates.md', 'observability/roadmap/p11-validation/acceptance.json',
      ...fs.readdirSync('observability/roadmap').filter(f => /^p11.*\.md$/.test(f)).map(f => 'observability/roadmap/' + f)];
    save('baseline', { utc: new Date().toISOString(), productionFiles: files.map(file => ({ file, sha256: hash(fs.readFileSync(file)) })), repositories: identities(), signingKeys: keyHashes() });
    console.log(JSON.stringify({ protectedDocuments: files.length, repositories: repos.length }));
  } else if (action === 'supplement') {
    const results = {};
    const check = async (name, fn) => {
      try { results[name] = { status: 'PASS', actual: await fn() }; }
      catch (e) { results[name] = { status: 'FAIL', reason: e.message }; }
    };
    await check('traces', async () => {
      const traces = r.internal('http://tempo:3200/api/search?limit=5').traces || [];
      let retrieved = 0;
      for (const t of traces.slice(0, 3)) {
        if (!/^[a-f0-9]{1,32}$/.test(t.traceID || '')) continue;
        const q = r.internal('http://tempo:3200/api/traces/' + t.traceID.padStart(32, '0'));
        if ((q.batches || q.resourceSpans || []).length) retrieved++;
      }
      if (!retrieved) throw Error('No existing Tempo trace retrieved');
      return { searched: traces.length, retrieved, payloadPersisted: false };
    });
    await check('logTraceCorrelation', async () => {
      const logs = r.osGet('/application-logs-*/_search', { method: 'POST', body: { size: 20, sort: [{ '@timestamp': 'desc' }], _source: ['trace_id', 'span_id'], query: { exists: { field: 'trace_id' } } } });
      let correlated = 0;
      for (const hit of logs.hits.hits) {
        const id = hit._source.trace_id;
        if (!/^[a-f0-9]{32}$/.test(id || '') || /^0+$/.test(id)) continue;
        try { const trace = r.internal('http://tempo:3200/api/traces/' + id); if ((trace.batches || trace.resourceSpans || []).length) correlated++; } catch {}
        if (correlated >= 2) break;
      }
      if (!correlated) throw Error('No recent structured-log trace ID resolved in Tempo');
      return { logTracePairsRetrieved: correlated, rawIdsOrPayloadPersisted: false };
    });
    await check('retention', async () => {
      const flags = (await r.http('http://127.0.0.1:9091/api/v1/status/flags')).data;
      const prometheus = { time: flags['storage.tsdb.retention.time'], size: flags['storage.tsdb.retention.size'] };
      const tempoConfig = r.docker(['exec', r.container('grafana'), 'wget', '-T', '10', '-qO-', 'http://tempo:3200/status/config']);
      const tempoRetention = tempoConfig.match(/block_retention:\s*([^\r\n]+)/)?.[1]?.trim();
      const policy = r.os('/_plugins/_ism/policies');
      if (!prometheus.time || !prometheus.size || !tempoRetention || policy.status !== 200) throw Error('Retention configuration not fully readable');
      return { prometheus, tempoRetention, opensearchPolicyIds: (policy.data.policies || []).map(p => p._id), hardQuotaClaimed: false };
    });
    await check('localAccess', async () => {
      const grafana = (await fetch('http://127.0.0.1:3001/api/datasources')).status;
      const os = r.os('/_cluster/health', { who: 'none' }).status;
      const ui = (await fetch('http://127.0.0.1:5601/', { redirect: 'manual' })).status;
      if (grafana !== 401 || os !== 401 || ![401, 302].includes(ui)) throw Error('Unexpected anonymous access result');
      return { grafana, opensearch: os, logUi: ui };
    });
    await check('topologyAndCompose', async () => {
      const ds = await r.grafana('/api/datasources');
      r.docker(['compose', '-p', 'jp_learning_dev', '-f', 'docker-compose.yml', 'config', '--quiet']);
      const technical = read(path.join(base, 'technical.json'));
      const hasLoki = technical.before.containers.some(c => /loki/i.test(c.name));
      return { composeValid: true, lokiContainers: hasLoki, lokiDatasources: ds.filter(d => d.type === 'loki').length,
        lokiDisposition: 'Not configured in accepted jp_learning_dev topology; no Loki ingestion PASS claimed', coldStartupExecuted: false };
    });
    save('supplement', results);
    console.log(JSON.stringify(results));
    if (Object.values(results).some(c => c.status !== 'PASS')) process.exitCode = 1;
  } else if (action === 'backup-timeout-probe') {
    const end = Math.floor(Date.now() / 1000), started = Date.now();
    let result;
    try {
      const q = r.internal('http://tempo:3200/api/search?' + new URLSearchParams({ start: String(end - 86400), end: String(end), limit: '1000' }));
      result = { completed: true, elapsedMs: Date.now() - started, traces: (q.traces || []).length, completedJobs: q.metrics?.completedJobs, totalJobs: q.metrics?.totalJobs };
    } catch {
      result = { completed: false, elapsedMs: Date.now() - started, failure: 'Existing bounded24h Tempo search failed through approved internal HTTP helper; no URL payload/trace IDs saved' };
    }
    save('backup-timeout-probe', result); console.log(JSON.stringify(result));
  } else if (action === 'backup-result') {
    const ps = "$t=Get-ScheduledTask -TaskName 'JapaneseLearning-P08-Daily'; $i=Get-ScheduledTaskInfo -TaskName $t.TaskName; [pscustomobject]@{state=$t.State.ToString();lastResult=$i.LastTaskResult;lastRunUtc=$i.LastRunTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress";
    const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    if (q.status !== 0) throw Error('Task result unreadable');
    const task = JSON.parse(q.stdout);
    if (task.state === 'Running') throw Error('Task still running; no success inferred');
    const c = read('.local/p08-development/config.json');
    const original = read(path.join(base, 'technical.json')).before.backups;
    const extra = fs.readdirSync(c.destination).filter(name => /^p08-local-[a-f0-9]{32}\.enc$/.test(name) && !original.some(f => f.name === name));
    const verification = extra.map(name => {
      const full = path.join(c.destination, name);
      const data = require('../../p08/backup.cjs').verify(full, c.keyFile);
      const receipt = 'observability/roadmap/p08-validation/evidence/local-backup-' + name.match(/[a-f0-9]{32}/)[0] + '.json';
      return { name, sha256: hash(fs.readFileSync(full)), authenticated: true, files: data.manifest.files.length,
        newestRecoverableUtc: data.manifest.newestRecoverableUtc, receipt, receiptExists: fs.existsSync(receipt) };
    });
    const pass = task.lastResult === 0 && verification.length === 1 && verification.every(v => v.authenticated && v.receiptExists);
    save('backup-result', { pass, task, verification, originalGenerationsPreserved: original.every(f => hash(fs.readFileSync(path.join(c.destination, f.name))) === f.sha256),
      policyChanged: false, newRestorePerformed: false });
    console.log(JSON.stringify({ pass, task, additionalGenerations: verification.length, authenticated: verification.every(v => v.authenticated) })); if (!pass) process.exitCode = 1;
  } else if (action === 'backup-preflight') {
    const c = read('.local/p08-development/config.json');
    const retention = require('../../p08/local-backup.cjs').retention(c.destination, c.keyFile, c.policy.retentionDays, Date.now() + 3600000, false);
    const original = read(path.join(base, 'technical.json')).before.backups;
    const unchanged = original.every(f => fs.existsSync(path.join(c.destination, f.name)) && hash(fs.readFileSync(path.join(c.destination, f.name))) === f.sha256);
    if (retention.deleted.length || !unchanged) throw Error('Backup retry would risk original generations');
    save('backup-preflight', { pass: true, originalGenerations: original.length, expiredCandidates: retention.deleted.length, unchanged,
      scope: 'One existing approved daily backup task only; creates an additional generation, no restore/retention change/task-definition change' });
    console.log(JSON.stringify({ pass: true, originalGenerations: original.length, expiredCandidates: retention.deleted.length }));
  } else if (action === 'auth-evidence') {
    const current = read(path.join(base, 'technical.json')).before;
    const original = read('.local/p11-live-token-20261115/technical.json').after;
    const names = ['user-api', 'vocabulary-api', 'gateway', 'jwks-api'].map(n => '/jp_learning_dev-' + n + '-1');
    const runtimeUnchanged = names.every(name => {
      const before = original.containers.find(c => c.name === name), now = current.containers.find(c => c.name === name);
      return before && now && before.id === now.id && before.image === now.image && before.started === now.started && before.restarts === now.restarts && JSON.stringify(before.mounts) === JSON.stringify(now.mounts);
    });
    function selected(service, fields) {
      const values = JSON.parse(r.docker(['inspect', '--format', '{{json .Config.Env}}', r.container(service)]));
      const map = Object.fromEntries(values.map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
      return fields.every(([name, expected]) => map[name] === expected);
    }
    const dotnet = selected('user-api', [['Jwt__Issuer', 'JapaneseLearning.User'], ['Jwt__Audience', 'JapaneseLearning'], ['Jwt__JwksUrl', 'http://jwks-api:8080/api/v1/jwks/user']]);
    const quarkus = selected('vocabulary-api', [['AUTH_JWT_ISSUER', 'JapaneseLearning.User'], ['AUTH_JWT_AUDIENCE', 'JapaneseLearning'], ['AUTH_JWKS_URL', 'http://jwks-api:8080/api/v1/jwks/user']]);
    const proof = read('.local/p11-live-token-20261115/proof.json');
    const pass = runtimeUnchanged && dotnet && quarkus && proof.checks.length === 6 && proof.checks.every(c => c.pass) && proof.status === 'PASS';
    save('auth-evidence', { pass, runtimeUnchanged, dotnetContractMatches: dotnet, quarkusContractMatches: quarkus, reusedChecks: proof.checks.length,
      proofSha256: hash(fs.readFileSync('.local/p11-live-token-20261115/proof.json')), freshLoginPerformed: false,
      limits: 'Reuse unchanged deployed revision/config proof, not fresh token/session or full trusted-signature live-negative coverage' });
    console.log(JSON.stringify({ pass, runtimeUnchanged, dotnet, quarkus, reusedChecks: proof.checks.length })); if (!pass) process.exitCode = 1;
  } else if (action === 'retention-check') {
    const p = r.osGet('/_plugins/_ism/policies/application-logs-retention');
    const explain = r.os('/_plugins/_ism/explain/application-logs-*');
    const entries = Object.entries(explain.data || {}).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
    const result = { policyId: p._id, minIndexAges: (p.policy?.states || []).flatMap(s => (s.transitions || []).map(t => t.conditions?.min_index_age).filter(Boolean)),
      explainStatus: explain.status, indices: entries.length, policyAttached: entries.filter(([, v]) => v.policy_id === 'application-logs-retention' || v['index.plugins.index_state_management.policy_id'] === 'application-logs-retention').length,
      note: 'Configuration/attachment read only; no expiry or deletion was triggered' };
    save('retention-check', result); console.log(JSON.stringify(result));
  } else if (action === 'correlation-check') {
    const traces = r.internal('http://tempo:3200/api/search?limit=20').traces || [];
    let matches = 0, retrievable = 0;
    for (const t of traces) {
      if (!/^[a-f0-9]{1,32}$/i.test(t.traceID || '')) continue;
      const id = t.traceID.padStart(32, '0').toLowerCase();
      const logs = r.osGet('/application-logs-*/_search', { method: 'POST', body: { size: 0, query: { term: { trace_id: id } } } });
      if (logs.hits.total.value) {
        matches++;
        const trace = r.internal('http://tempo:3200/api/traces/' + id);
        if ((trace.batches || trace.resourceSpans || []).length) retrievable++;
      }
      if (retrievable >= 2) break;
    }
    const newest = r.osGet('/application-logs-*/_search', { method: 'POST', body: { size: 20, sort: [{ '@timestamp': 'desc' }], _source: ['trace_id', 'span_id'], query: { exists: { field: 'trace_id' } } } });
    const result = { searchedTempoCandidates: traces.length, matchingStructuredLogTraceIds: matches, matchingTracesRetrieved: retrievable,
      latestLogCandidateTypes: newest.hits.hits.map(h => ({ type: typeof h._source.trace_id, hex: /^[a-f0-9]{32}$/i.test(h._source.trace_id || ''), nonzero: !/^0+$/.test(h._source.trace_id || '') })),
      pass: retrievable > 0, scope: 'Sampled exported trace-to-log correlation; does not require every logged trace to be sampled/exported' };
    save('correlation-check', result); console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1;
  } else if (action === 'audit') {
    const findings = [], skipped = [];
    let scanned = 0;
    for (const dir of repos) {
      for (const file of git(dir, ['ls-files', '-z']).split('\0').filter(Boolean)) {
        const full = path.resolve(dir, file);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
        if (fs.statSync(full).size > 2 * 1024 * 1024) { skipped.push({ dir, file, reason: 'Over bounded text-scan limit' }); continue; }
        const bytes = fs.readFileSync(full);
        if (bytes.includes(0)) continue;
        const text = bytes.toString('utf8'); scanned++;
        const sensitivePath = /(^|\/)\.env(?:\.(?:production|local|development))?$|(^|\/)(?:local-test-credentials|credentials)\.json$/i.test(file);
        const payload = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32}/.test(text) || /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(text);
        const runtimePath = /(^|\/)(?:bin|obj|target|node_modules|TestResults|\.local)\//.test(file);
        if (sensitivePath || payload || runtimePath) findings.push({ dir, file, sensitivePath, payload, runtimePath });
      }
    }
    const ignored = cp.spawnSync('git', ['check-ignore', '-q', 'observability/local-test-credentials.json']).status === 0;
    const tracked = cp.spawnSync('git', ['ls-files', '--error-unmatch', 'observability/local-test-credentials.json'], { stdio: 'ignore' }).status === 0;
    const result = { scannedTrackedTextFiles: scanned, repositories: repos.length, findings, skipped, credentialIgnored: ignored, credentialTracked: tracked,
      scope: 'Current tracked trees; no credential-value read or whole Git-history/entropy scan. Evidence artifacts intentionally retained.' };
    save('git-security-audit', result); console.log(JSON.stringify(result));
    if (findings.length || !ignored || tracked) process.exitCode = 1;
  } else if (action === 'integrity') {
    let checked = 0; const failed = [];
    const check = (file, expected) => { checked++; if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== expected) failed.push(file); };
    for (const summary of ['release-manifest.json', 'spring-release-manifest.json']) {
      const metadata = read('observability/roadmap/p11-validation/' + summary);
      check(metadata.immutableIdentity.file, metadata.immutableIdentity.sha256);
      const manifest = read(metadata.immutableIdentity.file);
      if (manifest.source) for (const s of Object.values(manifest.source)) check(s.archive, s.sha256);
      if (manifest.artifacts) for (const a of manifest.artifacts) for (const f of a.files) check(path.join(a.root, f.file), f.sha256);
      if (manifest.builds) for (const b of Object.values(manifest.builds)) for (const f of b.artifacts) check(f.file, f.sha256);
    }
    const final = '.local/p11-final-acceptance-20261115/';
    const review = read(final + 'review.json');
    check(review.immutableManifest.file, review.immutableManifest.sha256);
    for (const f of review.pinOverlay) check(path.join('dotnet', f.file), f.sha256);
    const pins = read(final + 'pin-package.json'); check(pins.file, pins.sha256);
    for (const label of ['a', 'b']) { const b = read(final + 'build-' + label + '-artifacts.json'); for (const f of b.artifacts) check(path.join(b.root, f.file), f.sha256); }
    for (const f of read(final + 'spring-corrected/build-a.json').artifacts) check(f.file, f.sha256);
    save('integrity', { checked, failed, scope: 'Recorded native/source/pin candidates only; not independent-host/Linux reproduction' });
    console.log(JSON.stringify({ checked, failed })); if (failed.length) process.exitCode = 1;
  } else if (action === 'report') {
    const before = read(path.join(base, 'baseline.json'));
    const technical = read(path.join(base, 'technical.json'));
    const supplement = read(path.join(base, 'supplement.json'));
    const correlation = read(path.join(base, 'correlation-check.json'));
    const retention = read(path.join(base, 'retention-check.json'));
    const auth = read(path.join(base, 'auth-evidence.json'));
    const audit = read(path.join(base, 'git-security-audit.json'));
    const integrity = read(path.join(base, 'integrity.json'));
    const backup = read(path.join(base, 'backup-result.json'));
    const recoveryFile = 'observability/roadmap/p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/acceptance.json';
    const recovery = read(recoveryFile);
    const after = identities();
    const productionUnchanged = before.productionFiles.every(f => hash(fs.readFileSync(f.file)) === f.sha256);
    const revisionsAndIndexesPreserved = before.repositories.every((r, i) => r.head === after[i].head && r.indexSha256 === after[i].indexSha256);
    const keyBytesPreserved = JSON.stringify(before.signingKeys) === JSON.stringify(keyHashes());
    if (!technical.preservation || !productionUnchanged || !revisionsAndIndexesPreserved || !keyBytesPreserved || Object.values(technical.preservation).some(v => !v)) throw Error('Preservation must be resolved before local assessment');
    const live = technical.results.live;
    const pass = value => value ? 'PASS' : 'FAIL';
    const evidence = name => base + '/' + name + '.json';
    const gates = [];
    function gate(id, requirement, method, expected, locations, actual, status) { gates.push({ id: 'LD-' + id, mandatory: true, requirement, method, expected, evidence: locations, actual, status }); }
    const dev = technical.after.containers.filter(c => c.project === 'jp_learning_dev');
    const healthy = dev.length === 21 && dev.every(c => c.state === 'running' ? (!c.health || c.health === 'healthy') : c.state === 'exited' && c.exit === 0);
    gate('01', 'Existing application/service health and protected resource preservation', 'technical.cjs baseline/live/finish; supplemental backend probes', '21 development services:16 running, five completed jobs exit0; all available healthchecks healthy;52/25 protected identities preserved', [evidence('technical')], { developmentServices: dev.length, running: dev.filter(c => c.state === 'running').length, completedJobs: dev.filter(c => c.state === 'exited').length }, pass(healthy));
    gate('02', 'Real deployed application authentication and authorization', 'Reuse unchanged real-token proof; compare current service IDs/images/start/mounts and selected issuer/audience/JWKS fields; fresh malformed-token401 probes', 'Four direct/gateway valid-token200 checks and two User-to-Admin403 checks; current invalid tokens denied; no new login required for unchanged deployment', [evidence('auth-evidence'), 'observability/roadmap/p11-live-token.md'], { reusedChecks: auth.reusedChecks, currentContractAndRuntimeMatch: auth.pass, freshLogin: false }, pass(auth.pass && live.userRejectInvalid.status === 'PASS' && live.vocabularyRejectInvalid.status === 'PASS'));
    gate('03', 'JWKS compatibility for currently deployed Japanese configuration; Spring overlay inactive', 'Public endpoint contract and selected consumer settings; preserve both parent pins and source-only Spring overlay', 'USER public RS256 keys200, LEARNING empty200, unknown owner404; both Japanese consumers use USER; no legacy publisher rollout', [evidence('technical'), evidence('auth-evidence'), 'observability/roadmap/p11-spring-migration.md'], { currentPublisher: live.jwks, currentConsumersMatch: auth.dotnetContractMatches && auth.quarkusContractMatches, springRollout: 'inactive' }, pass(live.jwks.status === 'PASS' && auth.pass));
    gate('04', 'Structured logging and ingestion to configured stores', 'technical.cjs pipeline; topology inventory and datasource types', 'Both synthetic denied requests become searchable OpenSearch records; no raw payload persisted; Loki topology explicitly accounted for', [evidence('technical'), evidence('supplement'), 'observability/roadmap/p07-stored-data-privacy.md'], { pipeline: technical.results.pipeline, loki: supplement.topologyAndCompose.actual }, pass(technical.results.pipeline.every(p => p.pass)));
    gate('05', 'Prometheus metrics and scraping', 'technical.cjs live: /api/v1/targets; status flags; existing dashboard datasource', 'All four configured targets up; native metrics query/scrape path operational', [evidence('technical'), evidence('supplement')], live.prometheusTargets, live.prometheusTargets.status);
    gate('06', 'Distributed tracing retrieval and sampled trace/log correlation', 'Tempo search/get, then join exported trace IDs to structured logs and retrieve matching trace', 'At least one existing trace and one log-correlated exported trace retrievable; no all-logs-sampled claim', [evidence('supplement'), evidence('correlation-check')], { traces: supplement.traces, correlatedPairs: correlation.matchingTracesRetrieved, initialNewestLogProbe: 'FAIL retained; no cause established for each unmatched ID' }, pass(supplement.traces.status === 'PASS' && correlation.pass));
    gate('07', 'Grafana dashboards, datasources and alert evaluation', 'technical.cjs live: Grafana search/health and Prometheus rule evaluation; reuse P10 isolated firing/resolution evidence', 'Three dashboards present, Prometheus/Tempo datasources OK, all54 rules healthy; no live alert fault required', [evidence('technical'), recoveryFile], { grafana: live.grafana, rules: live.rules }, pass(live.grafana.status === 'PASS' && live.rules.status === 'PASS' && live.rules.actual.rules === 54));
    gate('08', 'Configured local retention and persistent-store continuity', 'Read actual Prometheus flags, Tempo config, OpenSearch ISM policy/explain; compare mounts/volumes', 'Prometheus2d/512MiB, Tempo24h, OpenSearch30d policy attached to every current application index; persistent identities unchanged under existing P07 development exception', [evidence('supplement'), evidence('retention-check'), evidence('technical')], { retention: supplement.retention.actual, opensearch: retention, preservedVolumes: technical.preservation.volumes, limitations: 'No forced expiry/deletion or hard filesystem quota claim' }, pass(supplement.retention.status === 'PASS' && retention.indices > 0 && retention.policyAttached === retention.indices));
    gate('09', 'Local backup integrity, freshness, recoverability and working daily automation', 'Authenticate all three original generations; review P10 native restore; one guarded existing daily task execution and its actual exit result', 'All generations authenticate; newest recovery point within24h; valid P10 local native restore within24h/4h; existing daily task completes exit0 without deleting originals', [evidence('technical'), evidence('backup-preflight'), evidence('backup-result'), 'observability/roadmap/p08-validation/evidence/local-backup-7e58e3d5837f518ffe554ff66514d178.json', recoveryFile], { originalAuthenticated: technical.results.existingBackupAuthentication, retry: backup, failure: 'Existing internal wget download timed out in Tempo export phase; search versus individual GET not established; later24h search succeeded' }, pass(backup.pass));
    gate('10', 'Recovery and rollback evidence applicable to current local stores/candidates', 'Review P08-P10 native evidence, store-format/config continuity and paired immutable image/config rollback proof', 'Accepted native restore remains applicable AND per-service local image/config/reader rollback has actual test evidence; plan alone insufficient', [recoveryFile, 'observability/roadmap/p11-dotnet-rollout-readiness.md'], { nativeRecoveryStatus: recovery.status, rpoSeconds: recovery.recovery.rpoSeconds, rtoSeconds: recovery.recovery.rtoSeconds, candidateRollbackExecuted: false }, 'NOT VERIFIED');
    gate('11', 'Complete relevant application regression without a new security exception', 'Approved execution of the full151-case .NET suite; reuse unchanged Java/gateway cohorts; run safe local verifier/package regressions', '151 .NET cases actually discovered/executed with zero failures/errors/skips; Java/auth evidence valid; source inventory is not execution', ['observability/roadmap/p11-dotnet-environment.md', 'observability/roadmap/p11-dotnet-rollout-readiness.md', 'observability/roadmap/p11-spring-migration.md', base + '/local-tests.tap'], { mandatoryDotnetCases: 151, latestExecutedSelectedDotnet: { executed: 79, passed: 14, failed: 65, cause: 'Application Control0x800711C7/Event3077' }, newDotnetRun: false, reusedJavaPasses: { springLearning: 25, springUser: 26, jwks: 21, quarkus: 21 }, freshVerifierTests: 23, freshResultGateChecks: 9 }, 'BLOCKED');
    gate('12', 'Configuration, dependency and local artifact integrity', 'Offline native/source/SDK/lock/pin-package manifest hashes; reuse same-host A/B evidence; preserve Git revisions', 'Every recorded checksum matches and six pin files unchanged; scope explicitly Windows/same-host only', [evidence('integrity'), '.local/p11-final-acceptance-20261115/review.json', '.local/p11-final-acceptance-20261115/pin-package.json'], integrity, pass(!integrity.failed.length));
    gate('13', 'Local secret handling, Git hygiene and access controls', 'Bounded tracked-tree scan in nine repositories; ignored/untracked credential check; anonymous Grafana/OpenSearch/log UI probes and loopback exposure', 'No tracked credential file/private payload/token/runtime-output findings; supplied credentials ignored; anonymous protected access denied; ten publications loopback', [evidence('git-security-audit'), evidence('supplement'), evidence('technical')], { audit, localAccess: supplement.localAccess, exposure: technical.results.liveExposure }, pass(!audit.findings.length && audit.credentialIgnored && !audit.credentialTracked && supplement.localAccess.status === 'PASS' && technical.results.liveExposure.pass));
    gate('14', 'Reproducible local startup and verification from identified candidate inputs', 'Compose config validation, source/build identities and cold startup/verification evidence; no existing service restart permitted', 'Exact current source/lock/config/image candidate can start in a safe authorized local environment and pass verification; config-only validation insufficient', [evidence('supplement'), '.local/p11-final-acceptance-20261115/review.json'], { composeValid: true, currentRuntimeHealthy: healthy, coldCandidateStartupExecuted: false, deployedImageToCurrentLockedSourceEquivalence: 'NOT VERIFIED' }, 'NOT VERIFIED');
    gate('15', 'Local operational documentation and handover package', 'Validated runbook links, exercised non-destructive verification commands, recorded personal-workstation procedures/limitations and blocked next actions', 'Local operator has start/verify/backup/recovery/rollback references and truthful results; no invented production ownership/signoff', ['observability/roadmap/p08-recovery-runbook.md', 'observability/roadmap/p09-incident-runbooks.md', 'observability/roadmap/p11-local-development-acceptance.md', evidence('technical')], { existingProceduresExercised: true, productionOwnershipClaimed: false }, 'PASS');
    const totals = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT VERIFIED': 0 };
    for (const g of gates) totals[g.status]++;
    const status = totals.BLOCKED ? 'BLOCKED' : totals.FAIL || totals['NOT VERIFIED'] ? 'PARTIAL' : 'PASS';
    const productionFile = before.productionFiles.find(f => f.file.endsWith('/acceptance.json'));
    const model = { profile: 'P11-LOCAL-DEV', status, createdUtc: new Date().toISOString(), environment: 'Personal Windows development workstation; jp_learning_dev; no staging/production host',
      originalProduction: { status: 'PARTIAL', acceptance: 'BLOCKED', readiness: 'NOT APPROVED', file: productionFile.file, sha256: productionFile.sha256, unchanged: productionUnchanged },
      priorPhases: 'P00-P10 retain PASS within existing documented development scopes; no12/12 production claim', totals, gates,
      regressionBasis: 'P01 required complete auth/security/privacy/compatibility regression and universal critical auth non-waiver; dotnet/AGENTS.md full solution command. No existing local policy authorizes replacing full151 cases with the historical81 subset. Local profile deliberately retains the full suite as mandatory; independent production qualification is still separate.',
      evidenceValidity: { realToken: auth, p10: { file: recoveryFile, sha256: hash(fs.readFileSync(recoveryFile)), scope: recovery.scope, noNewRestore: true, limits: 'Same local telemetry data types/reader formats/configuration; no business DB/host-loss recovery or candidate image rollback proof' },
        retentionExceptions: ['P07-DEV-QUOTA', 'P08-DEV-LOCAL-STORAGE'], correlationProbe: 'Initial newest-log lookup FAIL preserved; exported sampled trace reverse lookup PASS; no claim every missing ID was unsampled' },
      preservation: { ...technical.preservation, revisionsAndIndexesPreserved, keyBytesPreserved, productionDocumentsUnchanged: productionUnchanged, baselineContainers: 52, baselineVolumes: 25, originalEncryptedGenerations: 3, extraGenerations: backup.verification.length,
        databaseAndTelemetry: 'Identity/mount/health/query continuity only; active contents not claimed byte-identical' },
      repositoryIdentities: { before: before.repositories, after },
      changesThisRun: ['observability/roadmap/p11-local-development-acceptance.md', 'observability/roadmap/p11-validation/local-development-acceptance.json', 'observability/roadmap/p11-validation/local-development.cjs', 'observability/roadmap/implementation-roadmap.md', 'observability/roadmap/p08-validation/evidence/local-backup-7e58e3d5837f518ffe554ff66514d178.json'],
      noNewSpringOrApplicationChanges: true, noCommitPushMerge: true };
    const report = '# P11-LOCAL-DEV final acceptance\n\n**LOCAL DEVELOPMENT ACCEPTANCE: ' + status + '.** Original P11 production status: **PARTIAL**; production acceptance: **BLOCKED**; production readiness: **NOT APPROVED**. P00-P10 retain their existing accepted development scopes. Local completion is pending; no unconditional P11 PASS or12/12 production completion is claimed.\n\nThis is a separate profile created by the user\'s Local Development Final Acceptance instruction. The original20-clause [production matrix](p11-readiness.md), original P11 reports, criteria and [production acceptance JSON](p11-validation/acceptance.json) are byte-preserved. All15 local gates are mandatory.\n\n' +
      'Totals: **' + totals.PASS + ' PASS / ' + totals.FAIL + ' FAIL / ' + totals.BLOCKED + ' BLOCKED / ' + totals['NOT VERIFIED'] + ' NOT VERIFIED**. [Machine result](p11-validation/local-development-acceptance.json).\n\n' +
      '| Gate | Requirement | Verification command or method | Expected | Evidence | Actual | Status |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
      gates.map(g => '| ' + g.id + ' | ' + g.requirement + ' | ' + g.method + ' | ' + g.expected + ' | ' + g.evidence.join('; ') + ' | ' + JSON.stringify(g.actual).replaceAll('|', '\\|') + ' | **' + g.status + '** |').join('\n') + '\n\n' +
      '## Regression basis and evidence reuse\n\n' + model.regressionBasis + ' The current Java cohorts25/26/21/21 and Spring isolated44 checks remain supporting evidence at unchanged sources. The six real-token/gateway checks are reused after verifying identical four-service runtime identities/mounts and issuer/audience/JWKS expectations; no login or token replay occurred. Their historical valid-token result is not a fresh session or complete trusted-signature negative test. Local Node tests ran23/23 and result-gate checks9/9; neither is .NET execution. Current654 checksum checks pass. No image pull, known-blocked .NET rerun or new test environment was attempted.\n\n' +
      '## Backup, tracing and recovery findings\n\nAll three original encrypted generations authenticate. The latest recoverable point is within the existing24h local budget. After a no-expiry preflight, exactly one existing daily task was triggered under its approved P08 policy. It failed with exit1: internal wget download timed out in Tempo export (search versus individual GET not proven). No new generation was created; originals, task definitions and live resources remain unchanged. A later bounded24h Tempo search completed with883 traces and39/39 jobs; this does not erase the failed acquisition or prove each trace export succeeds. The failed P08 receipt and private wrapper diagnostic remain. No timeout/policy/security configuration was relaxed and no second backup retry occurred. LD-09 remains FAIL.\n\nThe initial newest-log trace probe found no matches and remains recorded FAIL. A bounded reverse lookup of exported Tempo traces found a structured-log/trace match, and that trace was retrieved; LD-06 meets its explicit sampled-correlation requirement. No cause is claimed for every unmatched log ID and no100-percent export guarantee is asserted.\n\nThe actual P10 native restore remains applicable supporting evidence: RPO34,403.272s/RTO544.245s,1,867 logs,828,320 metric samples,271 traces, dashboard/datasource/offset recovery and alert firing/resolution. The original encrypted recovery generation is retained and authenticated; configuration/reader formats were not changed here. This does not prove tested per-service current-candidate image/config rollback (LD-10), a fresh current-locked-source startup (LD-14), business-database restore or host-loss recovery. No new restore/fault/startup was authorized or executed.\n\n' +
      '## Topology, retention and local limitations\n\nThe accepted root topology has OpenSearch, Prometheus, Tempo and Grafana. Loki has no configured service/volume/datasource and no running container; P07 stored-data privacy records it outside jp_learning_dev and prohibits duplication. No Loki ingestion result is claimed or new infrastructure added. Actual retention is OpenSearch30d attached to7/7 application indices, Prometheus2d/512MiB and Tempo24h. No expiry/deletion was induced. P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE remain explicitly development-only: retention/alerts are not hard quotas; D: is not an independent failure domain.\n\nLocal releases have SDK9.0.317 plus five lockfiles, verified source/pin packages, identical101-file .NET A/B publishes, corrected Spring JAR identity, and retained Angular74-file/Quarkus254-file/new and old JWKS same-host evidence.654 checks verify recorded native/source/config artifacts. This is not independent-host, Linux OCI, vulnerability provenance, artifact custody or deployed-to-source equivalence qualification. Historical CRLF/finalization manifest failures are not rewritten.\n\n' +
      '## Preservation and Git hygiene\n\n' + JSON.stringify(model.preservation) + '\n\nThe bounded audit covered1,794 tracked text files across nine repositories with no findings or oversized skipped text files. Supplied `observability/local-test-credentials.json` is ignored/untracked; its values were not read. This is not a whole-history/entropy audit. New public evidence is checked separately for private-key/JWT-shaped payloads. Existing runtime artifacts remain ignored; historical intentionally retained evidence is not deleted. No credentials, private keys, raw telemetry or bearer tokens are published.\n\n' +
      '## Operational handover and next actions\n\nUse the existing [incident runbooks](p09-incident-runbooks.md), [backup policy](p08-development-policy.md), [recovery runbook](p08-recovery-runbook.md), [deployment guide](../../deployment/README.md), [test environment specification](p11-dotnet-environment.md) and [paired rollback plan](p11-dotnet-rollout-readiness.md). On a new review run, choose a fresh ignored evidence directory for `technical.cjs baseline`, `live`, `pipeline`, `verify-backups`, `exposure` and `finish`. Never replay occupied receipts or run startup/deploy/restore commands against this protected environment. Existing verification commands were actually exercised; production handover/on-call signoff is not invented.\n\nResolve LD-09 with targeted Tempo-export timeout diagnosis and a guarded successful existing-policy backup verification; do not truncate exports or relax data integrity. Resolve LD-11 through a security-approved .NET execution/signing environment and actual151-case runtime discovery/pass. Prepare separately authorized isolated per-service rollback (LD-10) and exact-candidate cold startup/verification (LD-14) plans before execution. Do not restart or recreate existing services. All original production-only qualification, dependency provenance/custody, JWKS adoption, TLS/access/capacity/telemetry/recovery/rollback, named ownership and business/release approval gates remain open.\n\n' +
      '## Complete change inventory for this run\n\n' + model.changesThisRun.map(f => '- `' + f + '`').join('\n') + '\n\nNo new Spring/application/submodule changes. Pre-existing dirty SDK/lockfiles, Spring overlay/test edits, P08 fix, ignore rule and earlier P11 work are preserved. The failed daily retry advanced scheduler last-run metadata but not its task definition. No successful generation or cleanup was fabricated. No Docker/WSL restart, service recreation, volume replacement, signing change, migration, commit, push or merge occurred.\n';
    fs.writeFileSync('observability/roadmap/p11-local-development-acceptance.md', report, { flag: 'wx' });
    fs.writeFileSync('observability/roadmap/p11-validation/local-development-acceptance.json', JSON.stringify(model, null, 2) + '\n', { flag: 'wx' });
    const roadmap = 'observability/roadmap/implementation-roadmap.md';
    const header = '## Separate local development final acceptance — P11-LOCAL-DEV\n\n**Local acceptance: ' + status + '** (' + totals.PASS + ' PASS/' + totals.FAIL + ' FAIL/' + totals.BLOCKED + ' BLOCKED/' + totals['NOT VERIFIED'] + ' NOT VERIFIED across15 mandatory local gates). [Local matrix and evidence](p11-local-development-acceptance.md), [local machine result](p11-validation/local-development-acceptance.json). Daily backup retry failed safely; full .NET151 regression remains policy-blocked; current-candidate rollback/startup proof is not verified. P00-P10 retain PASS in their existing scopes; local final completion is pending. **Original P11 production: PARTIAL; production acceptance: BLOCKED; readiness: NOT APPROVED.** Original20-clause matrix and production acceptance records are unchanged. No12/12 production completion or unconditional P11 PASS is claimed.\n\n';
    fs.writeFileSync(roadmap, header + fs.readFileSync(roadmap, 'utf8'));
    save('final-checks', { productionUnchanged, revisionsAndIndexesPreserved, keyBytesPreserved, totals, status });
    console.log(JSON.stringify({ profile: model.profile, status, totals, productionUnchanged, changes: model.changesThisRun }));
  } else if (action === 'validate') {
    const file = 'observability/roadmap/p11-validation/local-development-acceptance.json';
    const model = read(file), baseline = read(path.join(base, 'baseline.json'));
    const protectedUnchanged = baseline.productionFiles.every(f => hash(fs.readFileSync(f.file)) === f.sha256);
    const after = identities();
    const revisionIndexMatch = baseline.repositories.every((r, i) => r.head === after[i].head && r.indexSha256 === after[i].indexSha256);
    const keyMatch = JSON.stringify(baseline.signingKeys) === JSON.stringify(keyHashes());
    const leaks = [], badLinks = [];
    for (const current of model.changesThisRun) {
      const text = fs.readFileSync(current, 'utf8');
      if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32}/.test(text) || /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(text)) leaks.push(current);
      if (current.endsWith('.md')) for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        if (/^https?:|^#/.test(m[1])) continue;
        const target = m[1].split('#')[0];
        if (target && !fs.existsSync(path.resolve(path.dirname(current), target))) badLinks.push({ current, target });
      }
    }
    const totals = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT VERIFIED': 0 };
    for (const g of model.gates) { if (!g.mandatory || !Object.hasOwn(totals, g.status)) throw Error('Unexpected local gate'); totals[g.status]++; }
    const matrixValid = model.gates.length === 15 && new Set(model.gates.map(g => g.id)).size === 15 && JSON.stringify(totals) === JSON.stringify(model.totals);
    if (!protectedUnchanged || !revisionIndexMatch || !keyMatch || leaks.length || badLinks.length || !matrixValid) throw Error('Local record validation failed');
    model.repositoryIdentities.after = after;
    model.operator = 'Codex under explicit P11 Local Development Final Acceptance instruction; no human production signoff inferred';
    model.tools = { node: process.version, sdkPinned: read('dotnet/global.json').sdk.version, dotnetTestsExecutedThisRun: false };
    model.recordValidation = { protectedProductionDocuments: baseline.productionFiles.length, protectedUnchanged, revisionIndexMatch, observedSigningKeyFiles: baseline.signingKeys.reduce((n, d) => n + d.files.length, 0), keyMatch, scannedNewPublicFiles: model.changesThisRun.length, leaks, badLinks, matrixValid };
    model.evidenceHashes = fs.readdirSync(base).filter(f => f.endsWith('.json')).map(name => ({ file: path.join(base, name).replaceAll('\\', '/'), sha256: hash(fs.readFileSync(path.join(base, name))) }));
    fs.writeFileSync(file, JSON.stringify(model, null, 2) + '\n');
    save('record-validation-' + crypto.randomBytes(6).toString('hex'), { ...model.recordValidation, localJsonSha256: hash(fs.readFileSync(file)), localReportSha256: hash(fs.readFileSync('observability/roadmap/p11-local-development-acceptance.md')), result: model.status, totals });
    console.log(JSON.stringify({ localStatus: model.status, totals, protectedUnchanged, revisionIndexMatch, keyMatch, leaks, badLinks }));
  } else throw Error('Unknown local-only action');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
