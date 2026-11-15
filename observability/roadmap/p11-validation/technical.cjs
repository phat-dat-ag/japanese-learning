'use strict';
// Targeted development checks. All output payloads/credentials stay private or in memory.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const r = require('../../p08/runtime.cjs');
const backup = require('../../p08/backup.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const [mode, directory] = process.argv.slice(2);
const dir = path.resolve(directory || '.local/p11-remediation-20261115');
if (!dir.startsWith(path.join(root, '.local') + path.sep)) throw Error('Private evidence path required');
const file = path.join(dir, 'technical.json');
function run(bin, args) {
  const q = cp.spawnSync(bin, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (q.status !== 0) throw Error('Read-only command failed: ' + bin + ' ' + args[0]);
  return q.stdout.trim();
}
const ps = s => run('powershell.exe', ['-NoProfile', '-Command', s]);
function snapshot() {
  const containers = r.docker(['ps', '-aq', '--no-trunc']).split(/\s+/).filter(Boolean).sort().map(id => JSON.parse(r.docker(['inspect', '--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"image":{{json .Image}},"started":{{json .State.StartedAt}},"state":{{json .State.Status}},"exit":{{json .State.ExitCode}},"health":{{with index .State "Health"}}{{json .Status}}{{else}}null{{end}},"restarts":{{json .RestartCount}},"mounts":{{json .Mounts}}}', id])));
  const volumes = r.docker(['volume', 'ls', '-q']).split(/\s+/).filter(Boolean).sort().map(n => JSON.parse(r.docker(['volume', 'inspect', '--format', '{"name":{{json .Name}},"driver":{{json .Driver}},"created":{{json .CreatedAt}},"mountpoint":{{json .Mountpoint}}}', n])));
  const destination = 'D:/JapaneseLearningBackups';
  const backups = fs.readdirSync(destination).sort().filter(n => /^p08-local-[a-f0-9]{32}\.enc$/.test(n)).map(n => {
    const p = path.join(destination, n), s = fs.lstatSync(p);
    if (!s.isFile() || s.isSymbolicLink()) throw Error('Unexpected backup file');
    return { name: n, bytes: s.size, mtime: s.mtimeMs, sha256: r.hash(fs.readFileSync(p)) };
  });
  const taskDefinitions = r.hash(ps("Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | Sort-Object TaskName | ForEach-Object { Export-ScheduledTask -TaskName $_.TaskName }"));
  return { utc: new Date().toISOString(), containers, volumes, backups, taskDefinitions,
    head: run('git', ['rev-parse', 'HEAD']), gitlinks: run('git', ['ls-files', '--stage', 'angular', 'dotnet', 'quarkus', 'springboot-jwks-api']) };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function main() {
  if (mode === 'baseline') {
    if (fs.existsSync(file)) throw Error('Existing baseline preserved; choose a new private directory');
    fs.mkdirSync(dir, { recursive: true });
    const before = snapshot();
    fs.writeFileSync(file, JSON.stringify({ before, results: {} }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ file, containers: before.containers.length, development: before.containers.filter(c => c.project === 'jp_learning_dev').map(c => ({ name: c.name, state: c.state, health: c.health, exit: c.exit })), volumes: before.volumes.length, backups: before.backups.length }));
    return;
  }
  const report = JSON.parse(fs.readFileSync(file));
  const record = (name, value) => { report.results[name] = value; fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n'); };
  if (mode === 'verify-backups') {
    const config = JSON.parse(fs.readFileSync('.local/p08-development/config.json'));
    const results = report.before.backups.map(b => {
      const data = backup.verify(path.join(config.destination, b.name), config.keyFile);
      return { name: b.name, authenticated: true, files: data.manifest.files.length, createdUtc: data.manifest.createdUtc,
        newestRecoverableUtc: data.manifest.newestRecoverableUtc, ageSeconds: (Date.now() - Date.parse(data.manifest.newestRecoverableUtc)) / 1000 };
    });
    record('existingBackupAuthentication', results);
    console.log(JSON.stringify(results));
  } else if (mode === 'backup') {
    const configPath = '.local/p08-development/config.json';
    const config = JSON.parse(fs.readFileSync(configPath));
    // Existing runner performs retention. Refuse acquisition if any old generation could expire.
    // No retention change, skip switch, key/config rewrite or artifact deletion is introduced.
    const dry = require('../../p08/local-backup.cjs').retention(config.destination, config.keyFile, config.policy.retentionDays, Date.now() + 3600000, false);
    if (dry.deleted.length) throw Error('Acquisition blocked: existing runner would expire a protected generation');
    record('retentionPreflight', { pass: true, expiredCandidates: dry.deleted.length, guardHorizonSeconds: 3600 });
    const q = cp.spawnSync(process.execPath, ['observability/p08/local-backup.cjs', configPath, '--force'], { encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 });
    fs.writeFileSync(path.join(dir, 'backup-private.log'), (q.stdout || '') + (q.stderr || ''), { flag: 'wx' });
    record('backupExecution', { exitCode: q.status, signal: q.signal, errorCode: q.error?.code || null });
    console.log(JSON.stringify({ backupExitCode: q.status, log: path.join(dir, 'backup-private.log') }));
    if (q.status !== 0) process.exitCode = 1;
  } else if (mode === 'public-auth') {
    const value = {};
    for (const [service, fields] of [['user-api', ['Jwt__Issuer', 'Jwt__Audience', 'Jwt__JwksUrl']], ['vocabulary-api', ['AUTH_JWT_ISSUER', 'AUTH_JWT_AUDIENCE', 'AUTH_JWKS_URL']]]) {
      const predicates = fields.map(name => '(eq (index $parts 0) "' + name + '")').join(' ');
      const template = '{{range .Config.Env}}{{$parts := split . "="}}{{if or ' + predicates + '}}{{println .}}{{end}}{{end}}';
      value[service] = Object.fromEntries(r.docker(['inspect', '--format', template, r.container(service)]).split('\n').filter(Boolean).map(line => {
        const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
      }));
    }
    record('publicAuthConfiguration', value);
    console.log(JSON.stringify(value));
  } else if (mode === 'exposure') {
    const rows = report.before.containers.filter(c => c.project === 'jp_learning_dev').map(c => ({ name: c.name,
      ...JSON.parse(r.docker(['inspect', '--format', '{"ports":{{json .NetworkSettings.Ports}},"composeFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}}}', c.id])) }));
    const published = rows.flatMap(x => Object.values(x.ports || {}).flat().filter(Boolean));
    const value = { pass: published.every(p => p.HostIp === '127.0.0.1' || p.HostIp === '::1'),
      published: published.length, composeFiles: [...new Set(rows.map(x => x.composeFiles))] };
    record('liveExposure', value);
    console.log(JSON.stringify(value));
    if (!value.pass) process.exitCode = 1;
  } else if (mode === 'pipeline') {
    const crypto = require('node:crypto');
    const cases = [];
    for (const [service, url] of [['user', 'http://127.0.0.1:8081/api/auth/me'], ['vocabulary', 'http://127.0.0.1:8082/api/v1/jlpt-levels']]) {
      const marker = 'p11-' + crypto.randomBytes(12).toString('hex');
      const response = await fetch(url, { headers: { Authorization: 'Bearer p11-invalid', 'X-Correlation-ID': marker }, signal: AbortSignal.timeout(10000) });
      if (response.status !== 401) throw Error('Synthetic unauthenticated request was not denied');
      let count = 0;
      for (let i = 0; i < 15; i++) {
        const q = r.osGet('/application-logs-*/_search', { method: 'POST', body: { size: 0, track_total_hits: true, query: { term: { correlation_id: marker } } } });
        count = q.hits.total.value;
        if (count) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      cases.push({ service, marker, httpStatus: response.status, searchableLogs: count, pass: count > 0 });
    }
    record('pipeline', cases);
    console.log(JSON.stringify(cases));
    if (cases.some(c => !c.pass)) process.exitCode = 1;
  } else if (mode === 'live') {
    const results = {};
    const check = async (name, fn) => { try { results[name] = { status: 'PASS', actual: await fn() }; } catch (e) { results[name] = { status: 'FAIL', reason: e.message }; } };
    await check('prometheusTargets', async () => {
      const q = await r.http('http://127.0.0.1:9091/api/v1/targets');
      const targets = q.data.activeTargets.map(t => ({ job: t.labels.job, health: t.health }));
      if (!targets.length || targets.some(t => t.health !== 'up')) throw Error('Unhealthy scrape target');
      return targets;
    });
    await check('rules', async () => {
      const q = await r.http('http://127.0.0.1:9091/api/v1/rules');
      const rules = q.data.groups.flatMap(g => g.rules);
      if (rules.some(x => x.health !== 'ok')) throw Error('Unhealthy rule evaluation');
      return { groups: q.data.groups.length, rules: rules.length, firing: rules.filter(x => x.state === 'firing').map(x => x.name) };
    });
    await check('grafana', async () => ({ dashboards: (await r.grafana('/api/search?type=dash-db')).map(d => d.uid),
      prometheus: (await r.grafana('/api/datasources/uid/jp-dev-prometheus/health')).status,
      tempo: (await r.grafana('/api/datasources/uid/jp-dev-tempo/health')).status }));
    await check('logs', async () => {
      const q = r.osGet('/application-logs-*/_search', { method: 'POST', body: { size: 0, track_total_hits: true, aggs: { newest: { max: { field: 'collected_at' } } } } });
      return { documents: q.hits.total.value, newestCollectedAt: q.aggregations.newest.value_as_string || null };
    });
    await check('jwks', async () => {
      const response = await fetch('http://127.0.0.1:8083/api/v1/jwks/user', { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (response.status !== 200 || !data.keys.length || data.keys.some(k => k.kty !== 'RSA' || k.alg !== 'RS256' || Object.keys(k).some(n => !['kty', 'kid', 'use', 'alg', 'n', 'e'].includes(n)))) throw Error('Unexpected public key contract');
      return { status: response.status, keys: data.keys.length, cache: response.headers.get('cache-control') };
    });
    for (const [name, url, expected] of [['emptyLearning', 'http://127.0.0.1:8083/api/v1/jwks/learning', 200], ['unknownOwner', 'http://127.0.0.1:8083/api/v1/jwks/unknown', 404], ['userRejectInvalid', 'http://127.0.0.1:8081/api/auth/me', 401], ['vocabularyRejectInvalid', 'http://127.0.0.1:8082/api/v1/jlpt-levels', 401]]) {
      await check(name, async () => {
        const q = await fetch(url, { headers: { Authorization: 'Bearer p11-invalid' }, signal: AbortSignal.timeout(10000) });
        if (q.status !== expected) throw Error('Unexpected HTTP status ' + q.status);
        if (name === 'emptyLearning' && (await q.json()).keys.length) throw Error('Learning keys unexpectedly populated');
        return { status: q.status };
      });
    }
    record('live', results);
    console.log(JSON.stringify(results));
    if (Object.values(results).some(x => x.status !== 'PASS')) process.exitCode = 1;
  } else if (mode === 'finish') {
    const after = snapshot();
    const b = report.before;
    const preservation = { containers: equal(b.containers, after.containers), volumes: equal(b.volumes, after.volumes),
      originalBackups: b.backups.every(v => equal(v, after.backups.find(x => x.name === v.name))),
      schedules: b.taskDefinitions === after.taskDefinitions, revisions: b.head === after.head && b.gitlinks === after.gitlinks };
    report.after = after;
    report.preservation = preservation;
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ file, preservation, addedBackups: after.backups.filter(v => !b.backups.some(x => x.name === v.name)).map(v => v.name), sha256: r.hash(fs.readFileSync(file)) }));
    if (Object.values(preservation).some(v => !v)) process.exitCode = 1;
  } else throw Error('Unknown check mode');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
