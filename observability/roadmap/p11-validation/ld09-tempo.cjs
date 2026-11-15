'use strict';
// Narrow LD-09 diagnostics/verification; existing runtime remains protected.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const r = require('../../p08/runtime.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = '.local/ld09-tempo-remediation-20261115';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const save = (name, data) => fs.writeFileSync(path.join(base, name + '.json'), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
function keys() {
  const source = 'secrets/private/user-api';
  return fs.readdirSync(source).sort().map(name => ({ name, sha256: hash(fs.readFileSync(path.join(source, name))) }));
}
async function main() {
  const action = process.argv[2];
  if (action === 'diagnose') {
    const failed = read('observability/roadmap/p08-validation/evidence/local-backup-7e58e3d5837f518ffe554ff66514d178.json');
    const q = cp.spawnSync('docker', ['logs', '--since', '2026-11-15T02:03:35Z', '--until', '2026-11-15T02:05:20Z', '--tail', '1000', r.container('tempo')], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (q.status !== 0) throw Error('Tempo diagnostic logs unreadable');
    const lines = (q.stdout + q.stderr).split('\n').filter(l => /timeout|deadline|cancel|error|slow/i.test(l));
    const result = { originalElapsedMs: Date.parse(failed.finishedUtc) - Date.parse(failed.createdUtc),
      originalOperationFamily: 'Tempo export: GET /api/search or GET /api/traces/{traceId}; exact original URL not recorded by wrapper',
      client: { wgetNetworkTimeoutSeconds: 10, outerDockerTimeoutMs: 15000, retries: 0 },
      serverSource: { queryTimeoutSeconds: 10, frontendApiTimeoutSeconds: 15 },
      logMatches: lines.map(l => ({ utc: l.match(/ts=([^\s]+)/)?.[1] || null, traceGet: /\/api\/traces\//.test(l), search: /\/api\/search/.test(l), deadline: /deadline|timeout/i.test(l), canceled: /cancel/i.test(l), response503: /503/.test(l), duration: l.match(/duration=([^\s]+)/)?.[1] || null })),
      originalCleanupFiles: failed.stagingCleanup.temporaryFilesRemoved,
      limitations: 'No original per-request endpoint/timing receipt. Original wget download timeout confirms client timer, not exact slow-request cause or resource pressure. Metadata-only service logs; no raw payloads/IDs.' };
    const protectedFiles = ['observability/roadmap/p01-quality-gates.md', 'observability/roadmap/p11-readiness.md', 'observability/roadmap/p11-verification.md', 'observability/roadmap/p11-validation/acceptance.json'];
    save('baseline', { protectedFiles: protectedFiles.map(file => ({ file, sha256: hash(fs.readFileSync(file)) })), keys: keys(), localAcceptanceSha256: hash(fs.readFileSync('observability/roadmap/p11-validation/local-development-acceptance.json')) });
    save('diagnosis', result); console.log(JSON.stringify(result));
  } else if (action === 'server-connections') {
    const q = cp.spawnSync('docker', ['logs', '--since', '2026-11-15T02:35:40Z', '--until', '2026-11-15T02:40:00Z', '--tail', '2000', r.container('tempo')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (q.status !== 0) throw Error('Tempo logs unreadable');
    const values = (q.stdout + q.stderr).split('\n').filter(l => /error contacting frontend|removing.*failing|error processing requests/.test(l)).map(l => {
      const field = name => { const m = l.match(new RegExp('\\b' + name + '=("(?:\\\\.|[^"\\\\])*"|[^ ]+)')); if (!m) return null; try { return JSON.parse(m[1]); } catch { return m[1]; } };
      const redact = s => s?.replace(/\b[a-f0-9]{32}\b/gi, '[trace-id]');
      return { utc: field('ts'), message: field('msg'), error: redact(field('err')) };
    });
    save('server-connections', { values }); console.log(JSON.stringify(values));
  } else if (action === 'server-failure') {
    const q = cp.spawnSync('docker', ['logs', '--since', '2026-11-15T02:35:40Z', '--until', '2026-11-15T02:39:30Z', '--tail', '2000', r.container('tempo')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (q.status !== 0) throw Error('Tempo logs unreadable');
    const rows = (q.stdout + q.stderr).split('\n').filter(l => /error|timeout|deadline|cancel|failed|503|unhealthy/i.test(l)).map(l => {
      const redact = s => s?.replace(/\b[a-f0-9]{32}\b/gi, '[trace-id]').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[block-id]');
      return { utc: l.match(/ts=([^\s]+)/)?.[1], message: redact(l.match(/msg="([^"]*)"/)?.[1]), error: redact(l.match(/(?:err|error)="([^"]*)"/)?.[1]), caller: l.match(/caller=([^\s]+)/)?.[1] };
    });
    const failure = read('observability/roadmap/p08-validation/evidence/local-backup-9d16d44e4eea0c6905d118dbf78578c4.json');
    const result = { rows, failedOperation: failure.tempoAcquisition.events, elapsedMs: failure.tempoAcquisition.elapsedMs };
    save('server-failure', result); console.log(JSON.stringify(result));
  } else if (action === 'framing-probe') {
    const failed = read('observability/roadmap/p08-validation/evidence/local-backup-45992585a1b8dc9808ae2ce1e9287f2b.json');
    const wanted = failed.tempoAcquisition.events[0].targetSha256, grafana = r.container('grafana'), end = Math.floor(Date.now() / 1000);
    const raw = r.docker(['exec', grafana, '/usr/bin/curl', '--silent', '--show-error', '--fail', '--max-time', '20', 'http://tempo:3200/api/search?' + new URLSearchParams({ start: String(end - 86400), end: String(end), limit: '1000' })], undefined, 25000);
    const target = JSON.parse(raw).traces.map(t => t.traceID.padStart(32, '0').toLowerCase()).find(id => hash(id) === wanted);
    if (!target) throw Error('Target unavailable');
    const results = [];
    for (const [name, extra] of [['original', []], ['connection-close', ['--header', 'Connection: close']], ['explicit-json', ['--header', 'Accept: application/json']]]) {
      const started = Date.now();
      const q = cp.spawnSync('docker', ['exec', grafana, 'wget', '-S', '-T', '5', '-O-', ...extra, 'http://tempo:3200/api/traces/' + target], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
      let jsonComplete = false; try { jsonComplete = !!JSON.parse(q.stdout).batches; } catch {}
      results.push({ name, exitCode: q.status, elapsedMs: Date.now() - started, bodyBytes: Buffer.byteLength(q.stdout || ''), jsonComplete,
        responseStatus: (q.stderr || '').match(/HTTP\/[\d.]+\s+(\d{3})/)?.[1], contentLength: (q.stderr || '').match(/content-length:\s*(\d+)/i)?.[1], transferEncoding: (q.stderr || '').match(/transfer-encoding:\s*([^\r\n]+)/i)?.[1]?.trim(), connection: (q.stderr || '').match(/connection:\s*([^\r\n]+)/i)?.[1]?.trim(), timeout: /timed out/.test(q.stderr || '') });
    }
    save('framing-probe', { targetSha256: wanted, results }); console.log(JSON.stringify(results));
  } else if (action === 'curl-target-probe') {
    const failed = read('observability/roadmap/p08-validation/evidence/local-backup-45992585a1b8dc9808ae2ce1e9287f2b.json');
    const targetHash = failed.tempoAcquisition.events[0].targetSha256, grafana = r.container('grafana');
    const get = url => {
      const started = Date.now();
      const raw = r.docker(['exec', grafana, '/usr/bin/curl', '--silent', '--show-error', '--max-time', '25', '-H', 'Accept: application/json', '-w', '\n%{http_code}', url], undefined, 30000);
      const lines = raw.split('\n'), status = Number(lines.pop()), body = lines.join('\n');
      return { status, elapsedMs: Date.now() - started, bytes: Buffer.byteLength(body), data: status === 200 ? JSON.parse(body) : null };
    };
    const end = Math.floor(Date.now() / 1000), search = get('http://tempo:3200/api/search?' + new URLSearchParams({ start: String(end - 86400), end: String(end), limit: '1000' }));
    const target = search.data?.traces?.map(t => t.traceID.padStart(32, '0').toLowerCase()).find(id => hash(id) === targetHash);
    const result = { search: { status: search.status, elapsedMs: search.elapsedMs, bytes: search.bytes, traces: search.data?.traces?.length }, targetStillSearchable: !!target, targetSha256: targetHash };
    if (target) {
      try { const trace = get('http://tempo:3200/api/traces/' + target); result.trace = { status: trace.status, elapsedMs: trace.elapsedMs, bytes: trace.bytes, batches: (trace.data?.batches || trace.data?.resourceSpans || []).length }; }
      catch (e) { result.trace = { failed: true, code: e.code, transient: e.transient }; }
    }
    save('curl-target-probe', result); console.log(JSON.stringify(result));
  } else if (action === 'target-probe') {
    const failure = read('observability/roadmap/p08-validation/evidence/local-backup-45992585a1b8dc9808ae2ce1e9287f2b.json');
    const targetHash = failure.tempoAcquisition.events[0].targetSha256;
    const end = Math.floor(Date.now() / 1000);
    const search = r.internal('http://tempo:3200/api/search?' + new URLSearchParams({ start: String(end - 86400), end: String(end), limit: '1000' }), { timeoutSeconds: 20 });
    const target = search.traces.map(t => t.traceID.padStart(32, '0').toLowerCase()).find(id => hash(id) === targetHash);
    if (!target) throw Error('Failed target no longer in native search; do not infer root cause');
    const grafana = r.container('grafana');
    const curlPath = r.docker(['exec', grafana, 'sh', '-c', 'command -v curl || true']);
    const results = { targetSha256: targetHash, stillSearchable: true, existingCurlAvailable: !!curlPath };
    if (curlPath) {
      const started = Date.now();
      try {
        const raw = r.docker(['exec', grafana, curlPath, '--silent', '--show-error', '--max-time', '25', '-D', '-', 'http://tempo:3200/api/traces/' + target], undefined, 30000);
        const i = raw.search(/\r?\n\r?\n/), headers = raw.slice(0, i), body = raw.slice(i).trim();
        results.curl = { elapsedMs: Date.now() - started, status: headers.match(/HTTP\/[\d.]+\s+(\d+)/)?.[1], contentType: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1], contentEncoding: headers.match(/content-encoding:\s*([^\r\n]+)/i)?.[1], transferEncoding: headers.match(/transfer-encoding:\s*([^\r\n]+)/i)?.[1], bodyBytes: Buffer.byteLength(body) };
      } catch (error) { results.curl = { elapsedMs: Date.now() - started, code: error.code, status: error.httpStatus, transient: error.transient, completed: false }; }
    }
    const started = Date.now();
    try { const p = await r.grafana('/api/datasources/proxy/uid/jp-dev-tempo/api/traces/' + target); results.grafanaProxy = { elapsedMs: Date.now() - started, batches: (p.batches || p.resourceSpans || []).length }; }
    catch { results.grafanaProxy = { elapsedMs: Date.now() - started, completed: false }; }
    save('target-probe', results); console.log(JSON.stringify(results));
  } else if (action === 'probe') {
    const end = Math.floor(Date.now() / 1000), started = Date.now();
    const search = r.internal('http://tempo:3200/api/search?' + new URLSearchParams({ start: String(end - 86400), end: String(end), limit: '1000' }), { timeoutSeconds: 20 });
    const searchMs = Date.now() - started;
    const payloads = [];
    for (const item of search.traces.slice(0, 3)) {
      const began = Date.now(), id = item.traceID.padStart(32, '0').toLowerCase();
      const value = r.internal('http://tempo:3200/api/traces/' + id, { timeoutSeconds: 20 });
      const spans = (value.batches || value.resourceSpans || []).flatMap(b => b.scopeSpans || b.instrumentationLibrarySpans || []).flatMap(s => s.spans || []);
      const identitiesMatch = spans.length > 0 && spans.every(s => {
        const v = s.traceId || s.traceID;
        return (typeof v === 'string' && /^[a-f0-9]{32}$/i.test(v) ? v.toLowerCase() : Buffer.from(v || '', 'base64').toString('hex')) === id;
      });
      payloads.push({ elapsedMs: Date.now() - began, jsonBytes: Buffer.byteLength(JSON.stringify(value)), spans: spans.length, identitiesMatch });
    }
    const config = r.docker(['exec', r.container('grafana'), 'wget', '-T', '20', '-qO-', 'http://tempo:3200/status/config']);
    const result = { searchMs, found: search.traces.length, completedJobs: search.metrics.completedJobs, totalJobs: search.metrics.totalJobs, payloads,
      liveServerQueryTimeouts: [...config.matchAll(/query_timeout:\s*([^\r\n]+)/g)].map(m => m[1].trim()), liveFrontendApiTimeout: config.match(/api_timeout:\s*([^\r\n]+)/)?.[1]?.trim() };
    if (!payloads.length || payloads.some(p => !p.identitiesMatch)) throw Error('Native Tempo schema not compatible with complete export');
    save('live-probe', result); console.log(JSON.stringify(result));
  } else if (action === 'preflight') {
    const c = read('.local/p08-development/config.json');
    const retention = require('../../p08/local-backup.cjs').retention(c.destination, c.keyFile, c.policy.retentionDays, Date.now() + 3600000, false);
    const ps = "$os=Get-CimInstance Win32_OperatingSystem; $v=Get-Volume -DriveLetter D; $tasks=Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | ForEach-Object {$i=Get-ScheduledTaskInfo -TaskName $_.TaskName; [pscustomobject]@{task=$_.TaskName;state=$_.State.ToString();lastResult=$i.LastTaskResult;nextUtc=$i.NextRunTime.ToUniversalTime().ToString('o');wrapper=($_.Actions.Count -eq 1 -and $_.Actions[0].Arguments -match 'Invoke-P08Local.ps1')}}; [pscustomobject]@{availableMemoryMiB=[double]$os.FreePhysicalMemory/1024;diskFreeBytes=$v.SizeRemaining;tasks=@($tasks)} | ConvertTo-Json -Depth 4 -Compress";
    const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    if (q.status !== 0) throw Error('Preflight resources/tasks unreadable');
    const resources = JSON.parse(q.stdout);
    const mounts = read(path.join(base, 'technical.json')).before.containers.flatMap(c => c.mounts).filter(m => m.Type === 'bind').map(m => path.resolve(m.Source).toLowerCase());
    const destination = fs.realpathSync(c.destination), lower = path.resolve(destination).toLowerCase();
    const isolated = !mounts.some(m => m === lower || lower.startsWith(m + path.sep) || m.startsWith(lower + path.sep));
    const locksAbsent = !fs.existsSync(path.join(destination, '.p08-local.lock'));
    const tasksReady = resources.tasks.length === 2 && resources.tasks.every(t => t.state === 'Ready' && t.wrapper && Date.parse(t.nextUtc) - Date.now() > 30 * 60000);
    const pass = retention.deleted.length === 0 && resources.availableMemoryMiB >= 1024 && resources.diskFreeBytes >= 1024 ** 3 && isolated && locksAbsent && tasksReady;
    const result = { pass, resources, destinationIsolatedFromAllContainerBinds: isolated, locksAbsent, expiredCandidates: retention.deleted.length, expectedAdditionalGeneration: 1,
      thresholds: { memoryMiB: 1024, freeDiskBytes: 1024 ** 3, nextScheduledRunMinutes: 30 }, scope: 'Existing approved daily workflow only; no task/retention/resource policy change' };
    const name = process.argv[3] || 'preflight';
    if (!/^[a-z-]+$/.test(name)) throw Error('Invalid preflight receipt label');
    save(name, result); console.log(JSON.stringify(result)); if (!pass) process.exitCode = 1;
  } else if (action === 'plan') {
    const source = 'observability/p07/tempo.yml', original = fs.readFileSync(source, 'utf8');
    const candidate = original.replace(/query_frontend:\r?\n/, 'query_frontend:\n  trace_by_id:\n    query_shards: 4\n    concurrent_shards: 1\n');
    if (candidate === original) throw Error('Candidate config anchor not found');
    const file = path.join(base, 'tempo-query-candidate.yml'); fs.writeFileSync(file, candidate, { flag: 'wx' });
    const proposal = { deployedSourceSha256: hash(Buffer.from(original)), candidateFile: file, candidateSha256: hash(Buffer.from(candidate)),
      implementedOrValidated: false, proposedFields: { 'query_frontend.trace_by_id.query_shards': 4, 'query_frontend.trace_by_id.concurrent_shards': 1 },
      preserved: ['512MiB/oneCPU existing limits', '24h retention', 'complete unpruned trace payloads', 'all data/key/volume identities', 'existing query timeouts and authentication'],
      basis: 'Observed frontend/querier gRPC unavailability under full lookup; lower fan-out is a qualification candidate, not a proven fix. Tempo2.10.3 source supports both fields and defaults query_shards to50.',
      source: 'https://raw.githubusercontent.com/grafana/tempo/v2.10.3/modules/frontend/config.go',
      requiredApproval: 'Separate approved isolated qualification scope/resources; then explicit approval for any static config application and Tempo-only restart. No such restart authorized by this task.',
      verification: ['Validate exact-version candidate config in approved isolated instance', 'Compare complete trace/span payload identities and digests, including cross-block traces', 'Exercise bounded representative backup pressure within existing CPU/memory caps', 'Only after authorization apply reviewed source/config and controlled restart with preservation comparison', 'Require fresh full authenticated backup with all six inventories, exact trace coverage and no partial publication before LD09 PASS'] };
    save('server-remediation-plan', proposal); console.log(JSON.stringify(proposal));
  } else if (action === 'progress') {
    const ps = "$t=Get-ScheduledTask -TaskName 'JapaneseLearning-P08-Daily'; $i=Get-ScheduledTaskInfo -TaskName $t.TaskName; $c=Get-Content -Raw '.local/p08-development/config.json' | ConvertFrom-Json; $stage=Get-ChildItem -LiteralPath $c.stagingRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; $counts=if($stage){@(Get-ChildItem -LiteralPath $stage.FullName -Directory | ForEach-Object {[pscustomobject]@{section=$_.Name;files=@(Get-ChildItem -LiteralPath $_.FullName -File).Count}})}else{@()}; [pscustomobject]@{state=$t.State.ToString();lastResult=$i.LastTaskResult;lastRunUtc=$i.LastRunTime.ToUniversalTime().ToString('o');progress=$counts} | ConvertTo-Json -Depth 4 -Compress";
    const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    if (q.status !== 0) throw Error('Task progress unreadable');
    console.log(q.stdout.trim());
  } else if (action === 'verify') {
    const c = read('.local/p08-development/config.json');
    const before = read(path.join(base, 'technical.json')).before;
    const ps = "$t=Get-ScheduledTask -TaskName 'JapaneseLearning-P08-Daily'; $i=Get-ScheduledTaskInfo -TaskName $t.TaskName; [pscustomobject]@{state=$t.State.ToString();lastResult=$i.LastTaskResult;lastRunUtc=$i.LastRunTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress";
    const taskRead = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    if (taskRead.status !== 0) throw Error('Task result unreadable');
    const task = JSON.parse(taskRead.stdout);
    if (task.state === 'Running') throw Error('Backup still running; no success inferred');
    const generations = fs.readdirSync(c.destination).filter(n => /^p08-local-[a-f0-9]{32}\.enc$/.test(n));
    const added = generations.filter(n => !before.backups.some(b => b.name === n));
    if (task.lastResult !== 0 || added.length !== 1) throw Error('Fresh task not successful or expected single complete generation absent');
    const file = path.join(c.destination, added[0]);
    const data = require('../../p08/backup.cjs').verify(file, c.keyFile);
    const runId = added[0].match(/[a-f0-9]{32}/)[0];
    const receipt = 'observability/roadmap/p08-validation/evidence/local-backup-' + runId + '.json';
    const report = read(receipt), sources = report.sources;
    const traceFiles = data.entries.filter(e => e.name.startsWith('traces/'));
    const expectedNames = sources.traces.ids.map(id => 'traces/' + id + '.json').sort();
    const actualNames = traceFiles.map(e => e.name).sort();
    const complete = JSON.stringify(expectedNames) === JSON.stringify(actualNames) && sources.traces.payloads.length === traceFiles.length && sources.traces.payloads.every(p => traceFiles.some(e => e.name === 'traces/' + p.id + '.json' && e.sha256 === p.sha256 && e.bytes === p.bytes));
    const coverage = data.manifest.inventory.map(a => a.id).sort();
    const required = ['logs', 'metrics', 'traces', 'dashboards', 'offsets', 'recovery'].sort();
    const originalsPreserved = before.backups.every(b => {
      const original = path.join(c.destination, b.name), stat = fs.statSync(original);
      require('../../p08/backup.cjs').verify(original, c.keyFile);
      return stat.size === b.bytes && stat.mtimeMs === b.mtime && hash(fs.readFileSync(original)) === b.sha256;
    });
    const noPendingGeneration = !fs.readdirSync(c.destination).some(n => n.includes('.pending-'));
    const pass = report.status === 'PASS' && report.checks.authenticated && report.checks.livePreserved && report.tempoAcquisition.complete && complete && JSON.stringify(coverage) === JSON.stringify(required) && originalsPreserved && !report.retention.deleted.length && noPendingGeneration;
    const result = { pass, task, receipt, receiptSha256: hash(fs.readFileSync(receipt)), generation: added[0], encryptedSha256: hash(fs.readFileSync(file)), encryptedBytes: fs.statSync(file).size,
      authenticatedManifest: true, manifestFiles: data.manifest.files.length, coverage,
      logs: sources.logs.total, metricSamples: sources.metrics.samples, metricChunks: sources.metrics.chunks.length,
      expectedTempoPayloads: expectedNames.length, verifiedTempoPayloads: traceFiles.length, tempoPayloadsComplete: complete,
      largestTempoJsonBytes: Math.max(...sources.traces.payloads.map(p => p.bytes)), tempoAcquisition: report.tempoAcquisition,
      dashboards: sources.dashboards.uids.length, offsetDatabases: sources.offsets.databases.length,
      originalsPreserved, retentionDeleted: report.retention.deleted.length, noPendingGeneration,
      stagingCleanup: report.stagingCleanup, scope: 'Authenticated fresh acquisition/completeness, not a new restore or rollback proof' };
    save('fresh-verification', result); console.log(JSON.stringify(result)); if (!pass) process.exitCode = 1;
  } else if (action === 'record') {
    const baseline = read(path.join(base, 'baseline.json'));
    const technical = read(path.join(base, 'technical.json'));
    const localFile = 'observability/roadmap/p11-validation/local-development-acceptance.json';
    const bytes = fs.readFileSync(localFile), model = JSON.parse(bytes);
    if (hash(bytes) !== baseline.localAcceptanceSha256) throw Error('Local acceptance changed unexpectedly; review before update');
    const productionPreserved = baseline.protectedFiles.every(f => hash(fs.readFileSync(f.file)) === f.sha256);
    const signingPreserved = JSON.stringify(keys()) === JSON.stringify(baseline.keys);
    const c = read('.local/p08-development/config.json');
    const generations = fs.readdirSync(c.destination).filter(n => /^p08-local-[a-f0-9]{32}\.enc$/.test(n));
    const noNewGeneration = generations.length === technical.before.backups.length && technical.before.backups.every(b => generations.includes(b.name));
    if (!productionPreserved || !signingPreserved || !technical.preservation || Object.values(technical.preservation).some(v => !v) || !noNewGeneration) throw Error('Preservation unresolved');
    const receipts = ['45992585a1b8dc9808ae2ce1e9287f2b', '9d16d44e4eea0c6905d118dbf78578c4'].map(id => {
      const file = 'observability/roadmap/p08-validation/evidence/local-backup-' + id + '.json', value = read(file);
      return { file, sha256: hash(fs.readFileSync(file)), status: value.status, error: value.error, elapsedMs: Date.parse(value.finishedUtc) - Date.parse(value.createdUtc), tempo: value.tempoAcquisition, stagingCleanup: value.stagingCleanup, noPackage: !value.package };
    });
    const unchanged = model.gates.filter(g => ['LD-10', 'LD-11', 'LD-14'].includes(g.id)).map(g => JSON.stringify(g));
    const files = ['observability/p08/local-backup.cjs', 'observability/p08/runtime.cjs', 'observability/p08/tempo-export.cjs', 'observability/roadmap/p08-validation/test-tempo-export.cjs', 'observability/roadmap/p11-validation/ld09-tempo.cjs', ...receipts.map(r => r.file)];
    const result = { status: 'FAIL', gate: 'LD-09', resolved: false,
      confirmed: 'Native trace GET stalls coincide with Tempo frontend/querier gRPC keepalive/healthcheck failures and loopback127.0.0.1:9095 dial timeouts; HTTP503 then client timeouts.20s and60s bounds both failed. Original exact URL was not recorded.',
      notProven: 'Physical cause of server stalls (including exact memory/IO contribution) is not established; warm200 responses rule out consistently oversized/corrupt payload or deterministic framing error. No pagination failure observed.',
      tests: { total: 36, passed: 36, failed: 0, skipped: 0, evidence: base + '/final-tests.tap' }, acquisitions: receipts,
      implementation: { clientTimeoutSeconds: 60, outerProcessTimeoutMs: 65000, maxAttempts: 3, backoffMs: [250, 1000], exportDeadlineSeconds: 600, configurableBounds: '16-90s request,1-3 attempts,60-900s export',
        completeness: 'All search jobs, unique IDs, matching nonempty payload identities and per-payload hashes required; saturated windows split; no time pruning or silent skips',
        publication: 'Authenticate private encrypted pending file; atomic create-only hardlink; remove only owned pending file; never replace an existing generation' },
      currentAcquisitionIntegrity: 'NOT VERIFIED: no fresh completed package exists; no partial generation published',
      originalGenerationIntegrity: technical.results.existingBackupAuthentication,
      preservation: { ...technical.preservation, productionPreserved, signingPreserved, noNewGeneration, taskDefinitionsUnchanged: technical.preservation.schedules, databaseAndTelemetry: 'Identity/mount/health continuity only; server suffered transient query/ingester health failures under export; no byte-identical history/no-loss claim' },
      files: files.map(file => ({ file, sha256: hash(fs.readFileSync(file)) })),
      proposedServerQualification: read(path.join(base, 'server-remediation-plan.json')),
      next: 'Approve isolated exact-version qualification of reduced frontend query fan-out within unchanged limits; any live static config application/Tempo restart needs separate explicit approval. Existing daily task remains fail-closed and may fail again; schedule unchanged.' };
    save('remediation-result', result);
    fs.writeFileSync(path.join(base, 'local-acceptance-before-' + hash(bytes) + '.json'), bytes, { flag: 'wx' });
    const gate = model.gates.find(g => g.id === 'LD-09');
    gate.actual.remediation = { file: base + '/remediation-result.json', sha256: hash(fs.readFileSync(path.join(base, 'remediation-result.json'))), result: 'FAIL; server-side gRPC availability blocks fresh complete acquisition', attempts: receipts.map(r => r.file) };
    model.ld09Remediation = result;
    model.lastUpdatedUtc = new Date().toISOString();
    if (unchanged.some((value, i) => value !== JSON.stringify(model.gates.filter(g => ['LD-10', 'LD-11', 'LD-14'].includes(g.id))[i]))) throw Error('Unrelated local gate changed');
    fs.writeFileSync(localFile, JSON.stringify(model, null, 2) + '\n');
    const note = '\n## LD-09 remediation investigation — ' + model.lastUpdatedUtc + '\n\n**LD-09 remains FAIL. Local counts remain11 PASS /1 FAIL /1 BLOCKED /2 NOT VERIFIED.** No successful fresh generation exists, so authentication/completeness of a new backup cannot be claimed. LD-10, LD-11 and LD-14 objects are unchanged. Original production criteria/matrix/acceptance remain byte-identical and PARTIAL/BLOCKED.\n\nThe original failure lasted88.586s and logged a10s wget timeout in Tempo export, without the exact URL. Instrumented attempts now identify `GET /api/traces/{traceId}`. The20s candidate exhausted three requests around20s each; the60s candidate received503 after56.461s, then timed out at60.180s and60.170s. Tempo server logs in that same window record failing distributor/querier healthchecks, gRPC keepalive ACK failures and dialing its own127.0.0.1:9095 timing out. This is a server-side availability failure, not merely a short HTTP timeout. Tempo was observed near its512MiB cap with high cumulative block IO, but the physical cause of the stalls is not proven by those observations alone. The same target later returned a complete972-byte200 response in130ms through existing curl and93ms through wget; no deterministic framing/large-response failure was established.\n\nClient hardening adds bounded configurable60s HTTP/65s process deadlines, at most three attempts with250ms/1s backoff, a600s whole-export deadline, safe error metadata, exact payload-ID/hash completeness checks and atomic authenticated create-only publication. Other internal HTTP callers retain their original10s default. No authentication, encryption, archive-size, retention, destination, signing, server configuration or schedule policy was weakened. Neither candidate produced a package; failures remained failures.36 unit/isolated regression tests pass, including six-store packaging, retry exhaustion, malformed/permanent failures, saturation, deadline, wrong/missing trace identity, checksum completeness and no-overwrite publication.\n\nFailed receipts retained: `' + receipts.map(r => r.file).join('`, `') + '`. Their private staging files were cleaned by the existing owned-run cleanup; zero original backups/live files were deleted. The first attempt was followed by one explicitly approved additional acquisition after the reviewed limit change; no overlapping jobs or third attempt occurred. All52 containers,25 volumes, three encrypted original generations, task definitions, JWT fingerprints and Git pins compare unchanged. All original generations still authenticate. Post-checks show four scrape targets up,54 rules healthy, three dashboards/datasources available and logs/JWKS queryable. Transient Tempo health failures during export are recorded; no global no-loss or byte-identical active-data claim is made.\n\nAn ignored **proposal only**, `.local/ld09-tempo-remediation-20261115/tempo-query-candidate.yml`, lowers frontend trace-by-ID shards/concurrency for isolated qualification without changing512MiB/oneCPU, retention, timeouts or trace contents. [Exact Tempo2.10.3 source](https://raw.githubusercontent.com/grafana/tempo/v2.10.3/modules/frontend/config.go) supports the fields and defaults query shards to50. It has not been applied or validated and is not a proven fix. Require isolated whole-trace/span digest equivalence and representative resource-bounded acquisition, followed by separate explicit approval for any live config/restart. Do not add time-window pruning: [Tempo documents](https://grafana.com/docs/tempo/latest/api_docs/) that trace lookup bounds may yield partial traces. Current instructions prohibit the restart needed to apply static server settings; no restart or recreation occurred.\n\nThis remediation changed `' + files.join('`, `') + '` plus this local report, local machine result and roadmap summary. It did not change other local gates or production records. Current daily automation may still fail on the server condition; it was not disabled or silently marked fixed.\n';
    fs.appendFileSync('observability/roadmap/p11-local-development-acceptance.md', note);
    const roadmap = 'observability/roadmap/implementation-roadmap.md';
    fs.writeFileSync(roadmap, '## LD-09 Tempo backup remediation — pending server qualification\n\n**P11-LOCAL-DEV remains BLOCKED:11 PASS/1 FAIL/1 BLOCKED/2 NOT VERIFIED.** Bounded client hardening passes36 tests, but instrumented fresh acquisitions still fail on Tempo trace GETs with server gRPC health/loopback timeouts. No fresh or partial generation published; all original runtime/data/keys/backups/pins preserved. [LD-09 evidence and required next approval](p11-local-development-acceptance.md). LD-10/11/14 unchanged. Original P11 production PARTIAL/BLOCKED; readiness NOT APPROVED. No runtime server change, restart, deployment or12/12 production claim.\n\n' + fs.readFileSync(roadmap, 'utf8'));
    console.log(JSON.stringify({ gate: 'LD-09', status: 'FAIL', counts: model.totals, productionPreserved, signingPreserved, noNewGeneration, unchangedOtherGates: true }));
  } else throw Error('Unknown LD09 action');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
