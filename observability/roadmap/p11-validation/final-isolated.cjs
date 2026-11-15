'use strict';
// One manifest-owned, resource-bounded environment. Never touches protected lifecycle/volumes.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), Module = require('node:module');
const rt = require('../../p08/runtime.cjs');
const root = path.resolve(__dirname, '../../..'); process.chdir(root);
const base = path.resolve(process.argv[3] || '.local/p11-final-execution-20261115'), stateFile = path.join(base, 'ownership.json');
if (!base.startsWith(path.join(root, '.local') + path.sep)) throw Error('Ignored local evidence directory required');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let state;
const idCache = new Map();
let bridge, bridgePending;
function load() { state = read(stateFile); if (!/^jp_p11_20261115_[a-f0-9]{8}$/.test(state.project) || path.resolve(state.stage) !== path.join(base, state.project)) throw Error('Ownership manifest rejected'); return state; }
function save() { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); }
function command(bin, args, options = {}) { const q = cp.spawnSync(bin, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 96 * 1024 * 1024, ...options }); if (q.status !== 0) { try { fs.writeFileSync(path.join(base, 'command-diagnostic-' + crypto.randomBytes(4).toString('hex') + '.txt'), q.stderr || '', { flag: 'wx' }); } catch {} throw Error('Isolated command failed: ' + bin + ' ' + args[0]); } return q.stdout.trim(); }
function docker(args, input, timeout = 30000) { return command('docker', args, { input, timeout }); }
function id(service) {
  if (idCache.has(service)) return idCache.get(service);
  const value = docker(['ps', '-aq', '--no-trunc', '--filter', 'label=jp.p11.run=' + state.project, '--filter', 'label=com.docker.compose.service=' + service]);
  if (!/^[a-f0-9]{64}$/.test(value)) throw Error('Expected one owned ' + service);
  const meta = JSON.parse(docker(['inspect', '--format', '{"id":{{json .Id}},"owner":{{json (index .Config.Labels "jp.p11.run")}},"mounts":{{json .Mounts}}}', value]));
  if (meta.owner !== state.project || state.protectedIds.includes(value) || meta.mounts.some(m => m.Type === 'volume' && !m.Name.startsWith(state.project + '_'))) throw Error('Protected/shared resource rejected');
  idCache.set(service, value); return value;
}
function compose(...args) { return docker(['compose', '-p', state.project, '-f', path.join(state.stage, 'compose.json'), ...args], undefined, 120000); }
function client(url, options = {}) {
  state.requests = (state.requests || 0) + 1;
  if (state.requests > (state.requestLimit || 1400) || Date.now() > state.deadline) throw Error('Workload bound exceeded');
  if (state.requests % 25 === 0) save();
  const output = docker(['exec', '-i', id('agent'), 'python', '/agent.py', 'request'], JSON.stringify({ url, ...options }), 45000);
  return JSON.parse(output);
}
async function ready(url, max = 90) { for (let n = 0; n < max; n++) { if (Date.now() > state.deadline) throw Error('Workload deadline'); try { const q = client(url); if (q.status === 200) return; } catch {} await wait(1000); } throw Error('Isolated readiness failed: ' + new URL(url).hostname); }
function ensure(q) { if (q.status !== 200 && q.status !== 201 && q.status !== 204) { const e = Error('Isolated native HTTP failed: ' + q.status); e.httpStatus = q.status; e.transient = [429, 500, 502, 503, 504, 599].includes(q.status); throw e; } return q.data; }
function startBridge() {
  if (bridge) return;
  const file = path.join(state.stage, 'agent.py');
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes("sys.argv[1] == 'bridge'")) {
    text += "\n    elif sys.argv[1] == 'bridge':\n        for line in sys.stdin:\n            try:\n                result = request(**json.loads(line))\n            except Exception as error:\n                result = {'status':599,'data':None,'errorKind':type(error).__name__}\n            print(json.dumps(result),flush=True)\n";
    fs.writeFileSync(file, text);
  }
  bridge = cp.spawn('docker', ['exec', '-i', id('agent'), 'python', '-u', '/agent.py', 'bridge'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  require('node:readline').createInterface({ input: bridge.stdout }).on('line', line => { const p = bridgePending; bridgePending = null; if (p) { clearTimeout(p.timer); try { p.resolve(JSON.parse(line)); } catch { p.reject(Error('Isolated RPC response malformed')); } } });
  bridge.stderr.on('data', b => { fs.appendFileSync(path.join(state.stage, 'bridge-private-error.txt'), b); });
  bridge.on('exit', () => { if (bridgePending) { clearTimeout(bridgePending.timer); bridgePending.reject(Error('Isolated RPC exited')); bridgePending = null; } });
}
function clientAsync(url, options = {}) {
  startBridge();
  if (bridgePending) return Promise.reject(Error('Concurrent isolated RPC rejected'));
  state.requests++; if (state.requests > (state.requestLimit || 1400) || Date.now() > state.deadline) return Promise.reject(Error('Workload bound exceeded'));
  if (state.requests % 25 === 0) save();
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { bridgePending = null; reject(Error('Bounded isolated RPC timeout')); }, 35000); bridgePending = { resolve, reject, timer }; bridge.stdin.write(JSON.stringify({ url, ...options }) + '\n'); });
}
async function sample(label) {
  const ps = command('powershell.exe', ['-NoProfile', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic; $m=New-Object Microsoft.VisualBasic.Devices.ComputerInfo; [pscustomobject]@{availableMiB=[double]$m.AvailablePhysicalMemory/1MB} | ConvertTo-Json -Compress"]);
  const stats = docker(['stats', '--no-stream', '--format', '{{json .}}']).split('\n').filter(Boolean).map(JSON.parse).filter(s => s.Name.startsWith(state.project + '-'));
  const row = { label, utc: new Date().toISOString(), windowsAvailableMiB: JSON.parse(ps).availableMiB, containers: stats.map(s => ({ name: s.Name, cpuPercent: parseFloat(s.CPUPerc), memory: s.MemUsage, blockIO: s.BlockIO })) };
  state.samples.push(row); save();
  if (row.windowsAvailableMiB < 1024) throw Error('Host memory reserve breached');
  return row;
}
async function prepare() {
  if (fs.existsSync(stateFile)) throw Error('Existing manifest preserved');
  const protectedState = read(path.join(base, 'technical.json')).before;
  const resources = JSON.parse(command('powershell.exe', ['-NoProfile', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic; $m=New-Object Microsoft.VisualBasic.Devices.ComputerInfo; $d=New-Object System.IO.DriveInfo('D:'); [pscustomobject]@{freeMiB=[double]$m.AvailablePhysicalMemory/1MB;diskFree=$d.AvailableFreeSpace} | ConvertTo-Json -Compress"]));
  if (resources.freeMiB < 2144 || resources.diskFree < 4 * 1024 ** 3) throw Error('Insufficient measured headroom for staged isolated telemetry model');
  const project = 'jp_p11_20261115_' + crypto.randomBytes(4).toString('hex'), stage = path.join(base, project), priv = path.join(stage, 'private');
  fs.mkdirSync(priv, { recursive: true });
  state = { project, stage, createdUtc: new Date().toISOString(), deadline: Date.now() + 1200000, requests: 0, resources, protectedIds: protectedState.containers.map(c => c.id), protectedVolumes: protectedState.volumes.map(v => v.name), samples: [], results: {}, cleanup: [] };
  const image = service => {
    const c = protectedState.containers.find(c => c.name === '/jp_learning_dev-' + service + '-1'); if (!c) throw Error('Approved cached image absent');
    const current = cp.spawnSync('docker', ['image', 'inspect', c.image, '--format', '{{.Id}}'], { encoding: 'utf8' });
    if (current.status === 0) return current.stdout.trim();
    if (!['opensearch', 'fluent-bit'].includes(service)) throw Error('Exact approved image unavailable');
    const cached = docker(['image', 'inspect', 'jp_learning_dev-' + service + ':latest', '--format', '{{.Id}}']);
    state.cachedCandidateDifferences = [...(state.cachedCandidateDifferences || []), { service, deployed: c.image, isolatedCachedCandidate: cached, note: 'Existing locally built candidate; no deployed-image equivalence claim' }];
    return cached;
  };
  state.images = Object.fromEntries(['tempo', 'grafana', 'prometheus', 'opensearch', 'storage-monitor', 'fluent-bit'].map(s => [s, image(s)]));
  state.taskB = { status: 'BLOCKED', reason: 'Current SQL candidate alone requires3072MiB; plus existing1024MiB host reserve exceeds measured free RAM before any API/JWKS/telemetry service. No undersized/mock DB substitution.', measuredFreeMiB: resources.freeMiB, minimumSqlPlusReserveMiB: 4096 };
  state.taskC = { status: 'BLOCKED', reason: 'No approved independent .NET SDK9.0.317 environment; exact repository-pinned SDK image not cached. No image download or blocked Windows test rerun.' };
  const openssl = (...args) => command('C:/Program Files/Git/usr/bin/openssl.exe', args, { cwd: priv });
  openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', 'ca.key');
  openssl('req', '-new', '-x509', '-key', 'ca.key', '-days', '2', '-subj', '/CN=P11-isolated-CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'ca.pem');
  for (const [name, cn, eku, san] of [['node', 'p08-node', 'serverAuth,clientAuth', 'DNS:restore'], ['admin', 'p08-admin', 'clientAuth', '']]) {
    openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', name + '.key');
    openssl('req', '-new', '-key', name + '.key', '-subj', '/CN=' + cn, '-out', name + '.csr');
    fs.writeFileSync(path.join(priv, name + '.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=' + eku + '\n' + (san ? 'subjectAltName=' + san + '\n' : ''));
    openssl('x509', '-req', '-in', name + '.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '1', '-extfile', name + '.ext', '-out', name + '.pem');
  }
  const credentials = Object.fromEntries(['reader', 'writer', 'grafana', 'sink'].map(k => [k, 'P11-' + crypto.randomBytes(24).toString('hex') + '-Aa1!']));
  fs.writeFileSync(path.join(priv, 'credentials.json'), JSON.stringify(credentials), { mode: 0o600 });
  fs.copyFileSync('observability/p08/recovery-agent.py', path.join(stage, 'agent.py'));
  fs.writeFileSync(path.join(priv, 'internal_users.yml'), '_meta:\n  type: internalusers\n  config_version: 2\n');
  const osConfig = ['cluster.name: ' + project, 'node.name: p08-node', 'network.host: 0.0.0.0', 'discovery.type: single-node', 'plugins.security.ssl.transport.pemcert_filepath: p08/node.pem', 'plugins.security.ssl.transport.pemkey_filepath: p08/node.key', 'plugins.security.ssl.transport.pemtrustedcas_filepath: p08/ca.pem', 'plugins.security.ssl.transport.enforce_hostname_verification: true', 'plugins.security.ssl.http.enabled: true', 'plugins.security.ssl.http.pemcert_filepath: p08/node.pem', 'plugins.security.ssl.http.pemkey_filepath: p08/node.key', 'plugins.security.ssl.http.pemtrustedcas_filepath: p08/ca.pem', 'plugins.security.ssl.http.clientauth_mode: OPTIONAL', 'plugins.security.authcz.admin_dn: ["CN=p08-admin"]', 'plugins.security.nodes_dn: ["CN=p08-node"]', 'plugins.security.allow_unsafe_democertificates: false', 'action.destructive_requires_name: true'].join('\n') + '\n';
  fs.writeFileSync(path.join(priv, 'opensearch.yml'), osConfig);
  const baseline = fs.readFileSync('observability/p07/tempo.yml', 'utf8').replace(/\r\n/g, '\n').replace('max_block_duration: 5m', 'max_block_duration: 1s').replace('      protocols:\n', '      protocols:\n        http:\n          endpoint: 0.0.0.0:4318\n');
  if (!baseline.includes('http:')) throw Error('Tempo fixture receiver adaptation failed');
  const candidate = baseline.replace(/query_frontend:\r?\n/, 'query_frontend:\n  trace_by_id:\n    query_shards: 4\n    concurrent_shards: 1\n');
  fs.writeFileSync(path.join(priv, 'tempo-baseline.yml'), baseline); fs.writeFileSync(path.join(priv, 'tempo-candidate.yml'), candidate);
  fs.writeFileSync(path.join(priv, 'prometheus.json'), JSON.stringify({ global: { scrape_interval: '2s' }, scrape_configs: [{ job_name: 'isolated-prometheus', static_configs: [{ targets: ['prometheus:9090'] }] }] }));
  const fixtures = path.join(stage, 'logs'); fs.mkdirSync(fixtures);
  for (const service of ['user', 'vocabulary', 'jwks']) fs.writeFileSync(path.join(fixtures, service + '.log'), JSON.stringify({ '@timestamp': new Date().toISOString(), collected_at: new Date().toISOString(), service_name: service + '-api', environment: 'development', log_type: 'application', level: 'Information', message: 'P11 owned isolated fixture', correlation_id: 'p11-owned-fixture' }) + '\n');
  fs.writeFileSync(path.join(priv, 'fluent-bit.conf'), '[SERVICE]\n    Flush 1\n    Log_Level error\n    Parsers_File /fluent-bit/etc/parsers.conf\n' + ['user', 'vocabulary', 'jwks'].map(s => '[INPUT]\n    Name tail\n    Tag ' + s + '\n    Path /fixtures/' + s + '.log\n    Parser json\n    DB /state/' + s + '.db\n    Read_from_Head On\n').join('') + '[OUTPUT]\n    Name opensearch\n    Match *\n    Host restore\n    Port 9200\n    HTTP_User writer\n    HTTP_Passwd ' + credentials.writer + '\n    Index application-logs-isolated\n    Suppress_Type_Name On\n    Generate_ID On\n    tls On\n    tls.verify On\n    tls.ca_file /private/ca.pem\n');
  const common = { read_only: true, restart: 'no', cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], networks: ['isolated'], cpus: 0.5, pids_limit: 128, labels: { 'jp.p11.run': project }, logging: { driver: 'none' } };
  const bind = (source, target) => ({ type: 'bind', source, target, read_only: true });
  const model = { services: {}, networks: { isolated: { internal: true, labels: { 'jp.p11.run': project } } }, volumes: {} };
  function volume(key, target, size, uid, gid, service, readOnly = false) {
    if (!model.volumes[key]) model.volumes[key] = { driver: 'local', driver_opts: { type: 'tmpfs', device: 'tmpfs', o: 'size=' + size + ',uid=' + uid + ',gid=' + gid + ',mode=0750' }, labels: { 'jp.p11.run': project } };
    service.volumes.push({ type: 'volume', source: key, target, read_only: readOnly });
  }
  model.services.agent = { ...common, image: state.images['storage-monitor'], user: '0:0', mem_limit: '128m', memswap_limit: '128m', entrypoint: ['python', '/agent.py', 'serve'], environment: { PYTHONDONTWRITEBYTECODE: '1' }, tmpfs: ['/tmp:size=16777216,mode=1777'], volumes: [bind(priv, '/private'), bind(path.join(stage, 'agent.py'), '/agent.py')] };
  model.services.tempo = { ...common, image: state.images.tempo, user: '10001:10001', cpus: 1, mem_limit: '512m', memswap_limit: '512m', command: ['-config.file=/config.yml'], volumes: [bind(path.join(priv, 'tempo-baseline.yml'), '/config.yml')], tmpfs: ['/tmp:size=16777216,mode=1777'] };
  volume('tempo', '/var/tempo', 67108864, 10001, 10001, model.services.tempo);
  model.services.restore = { ...common, image: state.images.opensearch, user: '1000:1000', cpus: 1, mem_limit: '1024m', memswap_limit: '1024m', entrypoint: ['/usr/share/opensearch/bin/opensearch'], environment: { OPENSEARCH_JAVA_OPTS: '-Xms128m -Xmx128m -XX:ActiveProcessorCount=2' }, volumes: [bind(priv, '/usr/share/opensearch/config/p08'), bind(path.join(priv, 'opensearch.yml'), '/usr/share/opensearch/config/opensearch.yml'), bind(path.join(priv, 'internal_users.yml'), '/usr/share/opensearch/config/opensearch-security/internal_users.yml')], ulimits: { nofile: { soft: 65536, hard: 65536 }, core: 0 } };
  volume('osdata', '/usr/share/opensearch/data', 134217728, 1000, 1000, model.services.restore); volume('oslogs', '/usr/share/opensearch/logs', 67108864, 1000, 1000, model.services.restore); volume('ostmp', '/tmp', 67108864, 1000, 1000, model.services.restore);
  model.services.prometheus = { ...common, image: state.images.prometheus, user: '65534:65534', mem_limit: '256m', memswap_limit: '256m', command: ['--config.file=/private/prometheus.json', '--storage.tsdb.path=/prometheus', '--storage.tsdb.retention.time=2d', '--storage.tsdb.retention.size=64MB', '--log.level=warn'], volumes: [bind(priv, '/private')], tmpfs: ['/tmp:size=16777216,mode=1777'] }; volume('prom', '/prometheus', 268435456, 65534, 65534, model.services.prometheus);
  model.services.grafana = { ...common, image: state.images.grafana, user: '472:472', mem_limit: '256m', memswap_limit: '256m', environment: { GF_SECURITY_ADMIN_USER: 'p08-admin', GF_SECURITY_ADMIN_PASSWORD: credentials.grafana, GF_AUTH_ANONYMOUS_ENABLED: 'false', GF_ANALYTICS_REPORTING_ENABLED: 'false', GF_ANALYTICS_CHECK_FOR_UPDATES: 'false', GF_PLUGINS_PREINSTALL_DISABLED: 'true', GF_LOG_LEVEL: 'warn' }, volumes: [], tmpfs: ['/tmp:size=16777216,mode=1777'] }; volume('grafana', '/var/lib/grafana', 67108864, 472, 472, model.services.grafana);
  model.services.collector = { ...common, image: state.images['fluent-bit'], user: '185:185', entrypoint: ['/fluent-bit/bin/fluent-bit'], mem_limit: '32m', memswap_limit: '32m', command: ['-c', '/private/fluent-bit.conf'], volumes: [bind(priv, '/private'), bind(fixtures, '/fixtures')] }; volume('offsets', '/state', 16777216, 185, 185, model.services.collector);
  for (const key of Object.keys(model.volumes)) model.services.agent.volumes.push({ type: 'volume', source: key, target: key === 'offsets' ? '/stores/fluent-bit' : '/hold/' + key, read_only: true });
  const memoryMiB = Object.values(model.services).reduce((n, s) => n + parseInt(s.mem_limit), 0);
  const simultaneousMiB = 1024 + 32 + 128; // One store at a time; agent holds only new volumes.
  if (simultaneousMiB + 192 + 1024 > resources.freeMiB) throw Error('Staged isolated model exceeds measured headroom');
  for (const s of Object.values(model.services)) for (const v of s.volumes) if (v.type === 'bind' && (!v.read_only || !path.resolve(v.source).startsWith(stage + path.sep))) throw Error('Unsafe bind');
  state.model = model; state.modelBounds = { sumServiceCapsMiB: memoryMiB, maxSimultaneousMiB: simultaneousMiB, mode: 'Sequential store acquisition; never all stores concurrently', hostNodeMiB: 192, hostReserveMiB: 1024, requestLimit: 1400, durationSeconds: 1200, dataStorageBytes: Object.values(model.volumes).reduce((n, v) => n + Number(v.driver_opts.o.match(/size=(\d+)/)[1]), 0) };
  fs.writeFileSync(path.join(stage, 'compose.json'), JSON.stringify(model, null, 2)); save();
  compose('create', '--no-build', '--pull', 'never', 'agent', 'tempo');
  for (const service of ['agent', 'tempo']) id(service);
  docker(['start', id('agent'), id('tempo')]);
  await ready('http://tempo:3200/ready');
  state.results.coldTempoBaseline = true; save();
  console.log(JSON.stringify({ project, bounds: state.modelBounds, coldTempoBaseline: true, taskB: state.taskB, taskC: state.taskC }));
}
async function ingest() {
  const traces = [], stamp = BigInt(Date.now()) * 1000000n;
  for (let n = 0; n < 600; n++) { const traceId = crypto.randomBytes(16).toString('hex'); traces.push({ id: traceId, spanId: crypto.randomBytes(8).toString('hex'), start: String(stamp + BigInt(n) * 1000n), end: String(stamp + BigInt(n) * 1000n + 1000000n) }); }
  for (let n = 0; n < traces.length; n += 50) {
    const spans = traces.slice(n, n + 50).map(t => ({ traceId: t.id, spanId: t.spanId, name: 'p11-isolated-native', kind: 2, startTimeUnixNano: t.start, endTimeUnixNano: t.end, status: { code: 1 } }));
    const q = client('http://tempo:4318/v1/traces', { method: 'POST', body: { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'p11-isolated' } }] }, scopeSpans: [{ scope: { name: 'p11-qualification' }, spans }] }] } }); ensure(q); await wait(1200);
  }
  state.traces = traces; save(); await wait(8000);
  console.log(JSON.stringify({ ingestedTraces: traces.length, isolated: true }));
}
async function benchmark(label, limit = 100) {
  const latencies = [], failures = [], payloadHashes = {};
  for (const t of state.traces.filter((_, i) => i % 6 === 0).slice(0, limit)) {
    const started = Date.now(), q = await clientAsync('http://tempo:3200/api/traces/' + t.id); latencies.push(Date.now() - started);
    if (q.status !== 200) failures.push(q.status);
    else { const spans = (q.data.batches || q.data.resourceSpans || []).flatMap(b => b.scopeSpans || b.instrumentationLibrarySpans || []).flatMap(s => s.spans || []); if (!spans.length) throw Error('Empty native trace'); payloadHashes[t.id] = traceDigest(q.data); }
    if (latencies.length % 25 === 0) await sample(label + '-' + latencies.length);
    await wait(150);
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const result = { requests: latencies.length, failures, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1), payloadHashes };
  state.results[label] = result; save(); console.log(JSON.stringify({ label, ...result, payloadHashes: undefined }));
}
function grpcEvidence(label) {
  const q = cp.spawnSync('docker', ['logs', '--tail', '2000', id('tempo')], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const lines = (q.stdout + q.stderr).split('\n');
  state.results[label + 'Grpc'] = { available: q.status === 0, keepaliveFailures: lines.filter(l => /keepalive.*failed|keepalive.*timeout/i.test(l)).length, frontendConnectionFailures: lines.filter(l => /error contacting frontend/i.test(l)).length, healthcheckFailures: lines.filter(l => /failing healthcheck/i.test(l)).length, deadlineErrors: lines.filter(l => /context deadline exceeded/i.test(l)).length }; save();
}
async function switchTempo(candidate) {
  const previous = id('tempo'); docker(['stop', '--time', '10', previous]); docker(['rm', previous]);
  idCache.delete('tempo');
  state.model.services.tempo.volumes[0].source = path.join(state.stage, 'private', candidate ? 'tempo-candidate.yml' : 'tempo-baseline.yml');
  state.model.services.tempo.logging = { driver: 'local', options: { 'max-size': '2m', 'max-file': '2' } };
  fs.writeFileSync(path.join(state.stage, 'compose.json'), JSON.stringify(state.model, null, 2)); save();
  compose('create', '--no-build', '--pull', 'never', 'tempo'); docker(['start', id('tempo')]); await ready('http://tempo:3200/ready');
}
function traceDigest(value) {
  function canonical(v, key) { if (Array.isArray(v)) { const result = v.map(x => canonical(x)); return key === 'attributes' ? result.sort((a, b) => String(a.key).localeCompare(String(b.key))) : result; } if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k], k)])); return v; }
  const spans = (value.batches || value.resourceSpans || []).flatMap(b => (b.scopeSpans || b.instrumentationLibrarySpans || []).flatMap(s => (s.spans || []).map(span => ({ resource: b.resource, scope: s.scope || s.instrumentationLibrary, span })))).sort((a, b) => a.span.spanId.localeCompare(b.span.spanId));
  return sha(Buffer.from(JSON.stringify(canonical(spans))));
}
async function crossBlock() {
  const stamp = BigInt(Date.now()) * 1000000n;
  const spans = state.traces.slice(0, 3).map(t => ({ traceId: t.id, spanId: crypto.randomBytes(8).toString('hex'), name: 'p11-cross-block', kind: 2, startTimeUnixNano: String(stamp), endTimeUnixNano: String(stamp + 1000000n) }));
  ensure(client('http://tempo:4318/v1/traces', { method: 'POST', body: { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'p11-isolated' } }] }, scopeSpans: [{ scope: { name: 'p11-qualification' }, spans }] }] } }));
  await wait(15000); state.crossBlock = {};
  for (const t of state.traces.slice(0, 3)) { const value = ensure(client('http://tempo:3200/api/traces/' + t.id)); const count = (value.batches || value.resourceSpans || []).flatMap(b => b.scopeSpans || b.instrumentationLibrarySpans || []).flatMap(s => s.spans || []).length; if (count !== 2) throw Error('Cross-block trace incomplete'); state.crossBlock[t.id] = { spans: count, hash: traceDigest(value) }; }
  save(); await benchmark('baselineCanonical');
}
async function collectorDiagnostic() {
    if (docker(['ps', '-aq', '--filter', 'label=jp.p11.run=' + state.project, '--filter', 'label=com.docker.compose.service=collector'])) {
      docker(['stop', '--time', '10', id('collector')]); docker(['rm', id('collector')]); idCache.delete('collector');
    }
    const model = read(path.join(state.stage, 'compose.json'));
    model.services.collector.logging = { driver: 'local', options: { 'max-size': '2m', 'max-file': '2' } };
    model.services.collector.user = '185:185';
    model.services.collector.entrypoint = ['/fluent-bit/bin/fluent-bit'];
    fs.writeFileSync(path.join(state.stage, 'compose.json'), JSON.stringify(model, null, 2));
    compose('create', '--no-build', '--pull', 'never', 'collector'); docker(['start', id('collector')]);
    await wait(10000);
    fs.writeFileSync(path.join(state.stage, 'collector-private.log'), docker(['logs', '--tail', '60', id('collector')]));
    console.log('Owned collector diagnostics retained privately');
}
function isolatedRuntime() {
  load();
  const request = (url, options = {}) => clientAsync(url, options);
  return {
    osGet: async (route, options = {}) => { activate('restore'); return ensure(await request('https://restore:9200' + route, options)); },
    os: (route, options = {}) => { activate('restore'); return request('https://restore:9200' + route, options); },
    http: async url => { if (!url.startsWith('http://127.0.0.1:9091/')) throw Error('Unapproved host endpoint'); activate('prometheus'); return ensure(await request(url.replace('http://127.0.0.1:9091', 'http://prometheus:9090'))); },
    internal: async url => {
      if (!url.startsWith('http://tempo:3200/')) throw Error('Unapproved internal endpoint');
      const match = /^http:\/\/tempo:3200\/api\/traces\/([a-f0-9]{32})$/.exec(url);
      if (state.reviewedTraceCache && match) {
        if (Date.now() > state.deadline) throw Error('Cached acquisition deadline exceeded');
        const file = path.join(state.stage, 'export', 'traces', match[1] + '.json');
        if (sha(fs.readFileSync(file)) !== state.reviewedTraceCache[match[1]]) throw Error('Previously acquired native trace changed');
        return read(file);
      }
      activate('tempo'); return ensure(await request(url));
    },
    grafana: async route => { activate('grafana'); return ensure(await request('http://grafana:3000' + route)); },
    container: service => { if (service !== 'storage-monitor') throw Error('Unexpected source container'); return id('agent'); },
    docker: args => { if (args[0] !== 'exec' || args[1] !== id('agent') || args[2] !== 'python') throw Error('Nonisolated exporter operation'); return docker(state.sqliteReader ? ['exec', id('sqlite'), ...args.slice(2)] : args); }, hash: sha
  };
}
function activate(service, bootstrap = false) {
  if (state.activeStore === service && docker(['inspect', '--format', '{{.State.Running}}', id(service)]) === 'true') return;
  for (const name of ['collector', 'restore', 'prometheus', 'tempo', 'grafana']) {
    if (name === service) continue;
    const exists = docker(['ps', '-q', '--filter', 'label=jp.p11.run=' + state.project, '--filter', 'label=com.docker.compose.service=' + name]);
    if (exists) docker(['stop', '--time', '10', id(name)]);
  }
  docker(['start', id(service)]); state.activeStore = service; save();
  const url = { restore: 'https://restore:9200/', prometheus: 'http://prometheus:9090/-/ready', tempo: 'http://tempo:3200/ready', grafana: 'http://grafana:3000/api/health' }[service];
  let ready = false;
  for (let n = 0; n < 90; n++) {
    if (Date.now() > state.deadline) throw Error('Workload deadline');
    try { const q = client(url); if (q.status === 200 || bootstrap && service === 'restore' && q.status === 503) { ready = true; break; } } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw Error('Staged service readiness failed: ' + service);
}
async function validateConfig() {
  const config = path.join(state.stage, 'private/tempo-candidate.yml');
  const container = docker(['create', '--name', state.project + '-validate', '--label', 'jp.p11.run=' + state.project, '--network', 'none', '--read-only', '--memory', '128m', '--memory-swap', '128m', '--cpus', '.25', '--pids-limit', '32', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--mount', 'type=bind,src=' + config + ',dst=/config.yml,readonly', state.images.tempo, '-config.file=/config.yml', '-config.verify=true']);
  try {
    const owner = docker(['inspect', '--format', '{{index .Config.Labels "jp.p11.run"}}', container]); if (owner !== state.project || state.protectedIds.includes(container)) throw Error('Validator ownership');
    docker(['start', '-a', container], undefined, 30000);
    const exit = Number(docker(['inspect', '--format', '{{.State.ExitCode}}', container]));
    if (exit) throw Error('Tempo config verification failed');
    state.results.exactVersionConfigValid = { image: state.images.tempo, exitCode: exit, configSha256: sha(fs.readFileSync(config)) }; save();
  } finally { if (docker(['inspect', '--format', '{{index .Config.Labels "jp.p11.run"}}', container]) !== state.project) throw Error('Validator cleanup ownership'); docker(['rm', container]); }
  console.log('Exact Tempo2.10.3 configuration validation PASS');
}
async function seedStores() {
  compose('create', '--no-build', '--pull', 'never', 'restore', 'prometheus', 'grafana', 'collector');
  for (const s of ['restore', 'prometheus', 'grafana', 'collector']) id(s);
  activate('restore', true);
  const cert = '/usr/share/opensearch/config/p08/';
  docker(['exec', '-e', 'JAVA_OPTS=-Xms16m -Xmx64m -XX:ActiveProcessorCount=2 -XX:MaxMetaspaceSize=96m', id('restore'), 'bash', '/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh', '-cd', '/usr/share/opensearch/config/opensearch-security', '-h', 'restore', '-p', '9200', '-icl', '-cacert', cert + 'ca.pem', '-cert', cert + 'admin.pem', '-key', cert + 'admin.key'], undefined, 120000);
  await ready('https://restore:9200/');
  const credentials = read(path.join(state.stage, 'private/credentials.json'));
  for (const user of ['reader', 'writer']) {
    ensure(client('https://restore:9200/_plugins/_security/api/internalusers/' + user, { method: 'PUT', body: { password: credentials[user] } }));
    ensure(client('https://restore:9200/_plugins/_security/api/roles/p11_' + user, { method: 'PUT', body: { cluster_permissions: user === 'writer' ? ['indices:data/write/bulk'] : [], index_permissions: [{ index_patterns: ['application-logs-*'], allowed_actions: [user === 'reader' ? 'read' : 'write'] }] } }));
    ensure(client('https://restore:9200/_plugins/_security/api/rolesmapping/p11_' + user, { method: 'PUT', body: { users: [user] } }));
  }
  const template = read('observability/p07/opensearch/index-template.json').template;
  ensure(client('https://restore:9200/application-logs-isolated', { method: 'PUT', body: { settings: { number_of_shards: 1, number_of_replicas: 0 }, mappings: template.mappings } }));
  docker(['start', id('collector')]);
  return completeStores();
}
async function completeStores() {
  let count = 0;
  for (let i = 0; i < 30; i++) { await wait(1000); const q = client('https://restore:9200/application-logs-isolated/_count'); count = q.data?.count || 0; if (count === 3) break; }
  if (count !== 3) throw Error('Isolated Fluent Bit ingestion incomplete');
  if (client('https://restore:9200/application-logs-isolated/_count', { who: 'none' }).status !== 401) throw Error('Anonymous log access not denied');
  await sample('logs-seeded');
  activate('prometheus'); await wait(8000); await sample('metrics-seeded');
  activate('grafana');
  for (const [uid, type, url] of [['jp-dev-prometheus', 'prometheus', 'http://prometheus:9090'], ['jp-dev-tempo', 'tempo', 'http://tempo:3200']]) ensure(client('http://grafana:3000/api/datasources', { method: 'POST', body: { uid, name: uid, type, access: 'proxy', url } }));
  for (const file of ['monitoring-health.json', 'p09-api-operations.json', 'p09-telemetry-capacity.json']) {
    const dashboard = read('observability/p05-candidate/grafana/dashboards/' + file); delete dashboard.id;
    ensure(client('http://grafana:3000/api/dashboards/db', { method: 'POST', body: { dashboard, overwrite: true } }));
  }
  if (client('http://grafana:3000/api/datasources', { who: 'none' }).status !== 401) throw Error('Anonymous Grafana access not denied');
  state.results.isolatedStoresSeeded = { logs: count, dashboards: 3, metrics: 'Actual native scrape samples', offsets: 'Three native Fluent Bit SQLite databases', dataIdentity: 'Synthetic isolated workloads, not business application verification' }; save();
  await sample('dashboards-seeded'); console.log(JSON.stringify(state.results.isolatedStoresSeeded));
}
async function backupStores() {
  const directory = path.join(state.stage, 'export-' + crypto.randomBytes(4).toString('hex')); fs.mkdirSync(directory);
  let source = fs.readFileSync('observability/p08/local-backup.cjs', 'utf8');
  const anchor = "r=require('./runtime.cjs')";
  if (source.split(anchor).length !== 2) throw Error('Exporter adapter anchor changed');
  source = source.replace(anchor, 'r=require(' + JSON.stringify(__filename) + ').isolatedRuntime()');
  if (source.split('r.osGet(').length !== 5 || source.split('r.os(').length !== 2) throw Error('Async isolation adapter anchors changed');
  source = source.replaceAll('r.osGet(', 'await r.osGet(').replaceAll('r.os(', 'await r.os(');
  const filename = path.resolve('observability/p08/p11-isolated-runtime.cjs'), mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); mod._compile(source, filename);
  const data = await mod.exports.acquire(directory, { generation: 'p11-isolated-' + state.project, tempoExport: { timeoutSeconds: 60, maxAttempts: 3, deadlineSeconds: 600 } });
  const key = path.join(state.stage, 'private/package.key'); fs.writeFileSync(key, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
  const spec = { artifacts: data.roots.map(a => ({ ...a, consistency: 'immutable-native-export', classification: 'reviewed-telemetry' })), newestRecoverableUtc: data.newestRecoverableUtc, configFiles: ['observability/p07/tempo.yml', 'observability/p07/prometheus/rules/storage.rules.yml'] };
  const encrypted = path.join(state.stage, 'isolated-complete.enc'); mod.exports.publish(spec, key, encrypted);
  const b = require('../../p08/backup.cjs'), verified = b.verify(encrypted, key), restore = path.join(state.stage, 'private/recovered'); b.restore(encrypted, key, restore);
  const traceFiles = verified.entries.filter(e => e.name.startsWith('traces/'));
  const complete = data.sources.traces.ids.length === state.traces.length && traceFiles.length === state.traces.length && data.sources.traces.payloads.every(p => traceFiles.some(f => f.name === 'traces/' + p.id + '.json' && f.sha256 === p.sha256));
  const coverage = verified.manifest.inventory.map(i => i.id).sort();
  if (!complete || coverage.join() !== ['logs', 'metrics', 'traces', 'dashboards', 'offsets', 'recovery'].sort().join()) throw Error('Six-store completeness failed');
  const offsets = JSON.parse(docker(['exec', id('agent'), 'python', '-c', "import sqlite3,json; r={};\nfor n in ['user','vocabulary','jwks']:\n c=sqlite3.connect('file:/private/recovered/offsets/'+n+'.db?mode=ro&immutable=1',uri=True);r[n]=c.execute('pragma integrity_check').fetchall()==[('ok',)];c.close()\nprint(json.dumps(r))"]));
  if (Object.values(offsets).some(v => !v)) throw Error('Restored native offset integrity failed');
  state.results.isolatedBackup = { pass: true, encryptedSha256: sha(fs.readFileSync(encrypted)), manifestFiles: verified.manifest.files.length, coverage, tracesExpected: state.traces.length, tracesVerified: traceFiles.length, metricSamples: data.sources.metrics.samples, logs: data.sources.logs.total, dashboards: data.sources.dashboards.uids.length, offsets, allRestoredFileHashesMatch: verified.manifest.files.every(f => sha(fs.readFileSync(path.join(restore, f.name))) === f.sha256), tempo: data.sources.traces.acquisition, scope: 'Actual native six-store isolated acquisition and authenticated byte restore, not business-stack rollback or active backup' }; save();
  console.log(JSON.stringify(state.results.isolatedBackup));
}
module.exports = { isolatedRuntime };
async function main() {
  const action = process.argv[2];
  if (action === 'retry-oom') {
    load();
    const meta = JSON.parse(docker(['inspect', '--format', '{{json .State}}', id('restore')]));
    if (!meta.OOMKilled || meta.Running) throw Error('Expected confirmed owned OOM exit');
    const headroom = await sample('before-isolated-oom-retry');
    if (headroom.windowsAvailableMiB < 1024 + 1024 + 128 + 192) throw Error('Insufficient measured retry headroom');
    state.results.isolatedStoreFirstFailure = { service: 'OpenSearch', memoryMiB: 768, oomKilled: true, exitCode: meta.ExitCode };
    docker(['rm', id('restore')]); idCache.delete('restore');
    const model = read(path.join(state.stage, 'compose.json'));
    model.services.restore.mem_limit = '1024m'; model.services.restore.memswap_limit = '1024m';
    model.services.restore.logging = { driver: 'local', options: { 'max-size': '2m', 'max-file': '2' } };
    fs.writeFileSync(path.join(state.stage, 'compose.json'), JSON.stringify(model, null, 2));
    state.modelBounds.maxSimultaneousMiB = 1184;
    save(); return seedStores();
  }
  if (action === 'retry-prepare') {
    load();
    if (docker(['ps', '-aq', '--filter', 'label=jp.p11.run=' + state.project])) throw Error('Prior resources require guarded cleanup first');
    const archived = path.join(base, 'ownership-failed-' + state.project + '-' + crypto.randomBytes(3).toString('hex') + '.json');
    if (path.dirname(path.resolve(stateFile)) !== base || path.dirname(path.resolve(archived)) !== base || fs.existsSync(archived)) throw Error('Archive containment/collision');
    fs.renameSync(stateFile, archived); return prepare();
  }
  if (action === 'prepare') return prepare();
  load();
  if (action === 'qualify-backup') {
    await switchTempo(true);
    await ingest();
    await seedStores();
    return backupStores();
  }
  if (action === 'collector-diagnostic') return collectorDiagnostic();
  if (action === 'sqlite-backup') {
    const volume = state.project + '_offsets';
    if (state.protectedVolumes.includes(volume) || docker(['volume', 'inspect', '--format', '{{index .Labels "jp.p11.run"}}', volume]) !== state.project) throw Error('Offset ownership rejected');
    docker(['run', '-d', '--name', state.project + '-sqlite', '--label', 'jp.p11.run=' + state.project, '--label', 'com.docker.compose.service=sqlite', '--network', 'none', '--read-only', '--memory', '64m', '--memory-swap', '64m', '--cpus', '.25', '--pids-limit', '32', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--user', '185:185', '--mount', 'type=volume,src=' + volume + ',dst=/stores/fluent-bit', '--entrypoint', 'python', state.images['storage-monitor'], '-c', 'import time; time.sleep(600)']);
    state.sqliteReader = true; save(); return backupStores();
  }
  if (action === 'cached-backup') {
    const cache = path.join(state.stage, 'export', 'traces');
    state.reviewedTraceCache = Object.fromEntries(state.traces.map(t => {
      const file = path.join(cache, t.id + '.json'); return [t.id, sha(fs.readFileSync(file))];
    }));
    state.previousRequestPhase = { attempted: state.requests, admittedLimit: 1400, result: 'Cap reached; no package published' };
    state.requests = 0; state.requestLimit = 300; state.phase = 'package-previous-native-traces'; save();
    return backupStores();
  }
  if (action === 'resume-stores') { await completeStores(); return backupStores(); }
  if (action === 'ingest') return ingest();
  if (action === 'baseline') return benchmark('baseline');
  if (action === 'cross-block') return crossBlock();
  if (action === 'baseline-rpc') return benchmark('baselineRPC');
  if (action === 'validate-config') return validateConfig();
  if (action === 'seed-stores') return seedStores();
  if (action === 'backup-stores') return backupStores();
  if (action === 'candidate') { await switchTempo(true); return benchmark('candidate'); }
  if (action === 'rollback') { await switchTempo(false); await benchmark('rollback', 25); grpcEvidence('rollback'); return; }
  if (action === 'candidate-backup') {
    await switchTempo(true); await benchmark('candidateFinal', 10); grpcEvidence('candidateFinal');
    const baseline = state.results.baselineCanonical.payloadHashes, candidate = state.results.candidate.payloadHashes;
    const equivalent = Object.keys(candidate).length === 100 && Object.entries(candidate).every(([id, value]) => value === baseline[id]);
    if (!equivalent) throw Error('Baseline/candidate complete span digest mismatch');
    for (const [id, expected] of Object.entries(state.crossBlock)) if (traceDigest(ensure(await clientAsync('http://tempo:3200/api/traces/' + id))) !== expected.hash) throw Error('Cross-block candidate payload mismatch');
    state.results.spanEquivalence = { compared: 100, pass: true, crossBlockTraces: Object.keys(state.crossBlock).length }; save();
    return;
  }
  if (action === 'acquisition-phase') {
    if (!state.results.spanEquivalence?.pass || !state.results.rollback || !state.results.candidateFinal) throw Error('Comparison evidence incomplete');
    await sample('phase-transition');
    state.phases = [{ name: 'baseline-candidate-rollback', startedUtc: state.createdUtc, completionRecordedUtc: new Date().toISOString(), deadline: state.deadline, requests: state.requests, allRequestsAdmissionGuarded: true, deadlineExpiredBeforeBookkeeping: Date.now() > state.deadline, note: 'No expired comparison request admitted; transition/bookkeeping may occur after phase deadline. This does not certify20-minute total resource lifetime.' }];
    state.deadline = Date.now() + 900000; state.phase = 'six-store-acquisition'; state.phaseStartRequests = state.requests; save();
    return seedStores();
  }
  if (action === 'cleanup') {
    const ids = docker(['ps', '-aq', '--no-trunc', '--filter', 'label=jp.p11.run=' + state.project]).split(/\s+/).filter(Boolean);
    for (const value of ids) {
      const q = JSON.parse(docker(['inspect', '--format', '{"id":{{json .Id}},"owner":{{json (index .Config.Labels "jp.p11.run")}},"mounts":{{json .Mounts}}}', value]));
      if (q.owner !== state.project || state.protectedIds.includes(q.id) || q.mounts.some(m => m.Type === 'volume' && state.protectedVolumes.includes(m.Name))) throw Error('Cleanup protected identity rejected');
      docker(['stop', '--time', '5', q.id]); docker(['rm', q.id]); state.cleanup.push({ kind: 'container', id: q.id }); save();
    }
    const volumes = docker(['volume', 'ls', '-q', '--filter', 'label=jp.p11.run=' + state.project]).split(/\s+/).filter(Boolean);
    for (const name of volumes) {
      const owner = docker(['volume', 'inspect', '--format', '{{index .Labels "jp.p11.run"}}', name]);
      if (owner !== state.project || !name.startsWith(state.project + '_') || state.protectedVolumes.includes(name)) throw Error('Cleanup protected volume rejected');
      docker(['volume', 'rm', name]); state.cleanup.push({ kind: 'volume', name }); save();
    }
    const networks = docker(['network', 'ls', '-q', '--filter', 'label=jp.p11.run=' + state.project]).split(/\s+/).filter(Boolean);
    for (const value of networks) {
      const meta = JSON.parse(docker(['network', 'inspect', '--format', '{"owner":{{json (index .Labels "jp.p11.run")}},"name":{{json .Name}},"containers":{{json .Containers}}}', value]));
      if (meta.owner !== state.project || !meta.name.startsWith(state.project + '_') || Object.keys(meta.containers).length) throw Error('Cleanup network ownership rejected');
      docker(['network', 'rm', value]); state.cleanup.push({ kind: 'network', id: value }); save();
    }
    state.cleaned = true; save(); console.log(JSON.stringify({ cleaned: true, resources: state.cleanup.length })); return;
  }
  if (action === 'active-plan') {
    const source = path.resolve('observability/p07/tempo.yml'), bytes = fs.readFileSync(source), text = bytes.toString(), eol = text.includes('\r\n') ? '\r\n' : '\n';
    const replacement = ['query_frontend:', '  trace_by_id:', '    query_shards: 4', '    concurrent_shards: 1', ''].join(eol);
    const candidate = text.replace('query_frontend:' + eol, replacement);
    if (candidate === text) throw Error('Active plan anchor changed');
    const before = path.join(state.stage, 'active-tempo-original.yml'), after = path.join(state.stage, 'active-tempo-candidate.yml');
    fs.writeFileSync(before, bytes, { flag: 'wx' }); fs.writeFileSync(after, candidate, { flag: 'wx' });
    const protectedTempo = read(path.join(base, 'technical.json')).before.containers.find(c => c.name === '/jp_learning_dev-tempo-1');
    const plan = { approval: 'NOT AUTHORIZED; do not execute', activeContainerId: protectedTempo.id, image: protectedTempo.image, source, originalFile: before, originalSha256: sha(bytes), candidateFile: after, candidateSha256: sha(Buffer.from(candidate)),
      onlySemanticChanges: { 'query_frontend.trace_by_id.query_shards': 4, 'query_frontend.trace_by_id.concurrent_shards': 1 },
      unchanged: ['512MiB/oneCPU', '24h retention', '15s API and10s querier timeouts', 'existing volumes/keys/JWKS pins/auth behavior'],
      preconditions: ['Isolated candidate and six-store qualification accepted', 'Disposable resources cleaned and original52/25/three backups preserved', 'Explicit approval for exact source write, one Tempo-only restart and one fresh active backup acquisition', 'Confirm no running backup/drill and record actual memory/headroom', 'Verify source originalSha256 immediately before write; abort on drift'],
      applyCommands: ["Copy-Item -LiteralPath '" + after + "' -Destination '" + source + "'", 'docker restart --time 30 ' + protectedTempo.id],
      rollbackCommands: ["Copy-Item -LiteralPath '" + before + "' -Destination '" + source + "'", 'docker restart --time 30 ' + protectedTempo.id],
      afterChecks: ['Same container/image/mount identities with approved expected start-time change only', 'Readiness, ingestion, complete trace/span retrieval and no gRPC failures', 'Existing daily task acquisition exits0, all six inventories authenticate, all Tempo payload IDs/hashes match', 'Original backups/keys/data identities preserved; no data rollback or volume replacement'],
      boundary: 'Candidate is copied from active source with only two fields; isolated HTTP receiver/block-duration overrides are NOT applied. Restart commands are preparation, not execution.' };
    fs.writeFileSync(path.join(base, 'active-plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ prepared: true, authorized: false, sourceSha256: plan.originalSha256, candidateSha256: plan.candidateSha256 })); return;
  }
  throw Error('Unknown qualification action');
}
if (require.main === module) main().catch(e => { if (state) { state.error = e.message; save(); } console.error(e.message); process.exitCode = 1; }).finally(() => { if (bridge) bridge.stdin.end(); });
