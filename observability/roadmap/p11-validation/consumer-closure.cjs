'use strict';
// Reviewable cross-parent patches and isolated Spring tests; never deploys or reads signing keys.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const dir = path.join(root, '.local', 'p11-consumer-closure-20261115');
const file = path.join(dir, 'closure.json');
const action = process.argv[2];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tokenPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const save = r => fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n');
function run(bin, args, cwd = root) {
  const q = cp.spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (q.status !== 0) throw Error('Read-only/configuration command failed: ' + bin + ' ' + args[0]);
  return q.stdout.trim();
}
const git = (location, args) => run('git', ['-c', 'safe.directory=' + location.replaceAll('\\', '/'), '-C', location, ...args]);
function reports(candidate, expected) {
  const location = path.join(candidate, 'target/surefire-reports');
  return Object.entries(expected).map(([name, number]) => {
    const f = path.join(location, 'TEST-' + name + '.xml');
    const bytes = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.from('');
    const text = bytes.toString();
    if (text.match(tokenPattern)) throw Error('Bearer token detected in newly generated test report; do not publish');
    return { name, ...counts(text, 'junit', number), sha256: hash(bytes),
      authorityOrderFailure: /authorities\[0\]/.test(text) && /FACTOR_BEARER/.test(text) };
  });
}
async function maven(candidate, label, environment = {}) {
  const log = path.join(dir, label + '.log');
  const fd = fs.openSync(log, 'wx');
  const script = '& .\\mvnw.cmd -o -B -ntp test "-DargLine=-Xmx384m" "-Dspring.test.mockmvc.print=NONE"';
  const child = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: candidate, windowsHide: true, env: { ...process.env, MAVEN_OPTS: '-Xmx384m', ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
  const buffers = new Map();
  for (const stream of [child.stdout, child.stderr]) {
    buffers.set(stream, '');
    stream.on('data', chunk => {
      const lines = (buffers.get(stream) + chunk.toString()).split('\n');
      buffers.set(stream, lines.pop());
      for (const line of lines) fs.writeSync(fd, line.replace(tokenPattern, '[REDACTED_JWT]') + '\n');
    });
  }
  let timer;
  const result = await Promise.race([new Promise(resolve => {
    child.once('exit', code => resolve({ exitCode: code }));
    child.once('error', () => resolve({ exitCode: null, launchFailed: true }));
  }), new Promise(resolve => { timer = setTimeout(() => {
    if (child.exitCode === null && child.pid) cp.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    resolve({ exitCode: null, timeout: true });
  }, 480000); })]);
  clearTimeout(timer);
  for (const remainder of buffers.values()) if (remainder) fs.writeSync(fd, remainder.replace(tokenPattern, '[REDACTED_JWT]') + '\n');
  fs.closeSync(fd);
  return { ...result, command: script, log, logSha256: hash(fs.readFileSync(log)) };
}
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw Error('Candidate anchor is not unique: ' + JSON.stringify(before.slice(0, 80)));
  return text.replace(before, after);
}
function patchFile(name, entries) {
  const base = path.join(dir, 'patch-' + name);
  for (const side of ['a', 'b']) fs.mkdirSync(path.join(base, side), { recursive: true });
  for (const e of entries) for (const [side, text] of [['a', e.before], ['b', e.after]]) if (text !== null) {
    const target = path.join(base, side, e.file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
  }
  const q = cp.spawnSync('git', ['diff', '--no-index', '--', 'a', 'b'], { cwd: base, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (q.status !== 1) throw Error('Expected a nonempty reviewable patch');
  const content = q.stdout.replaceAll('a/a/', 'a/').replaceAll('a/b/', 'a/').replaceAll('b/b/', 'b/');
  const target = path.join(__dirname, name + '.patch');
  fs.writeFileSync(target, content, { flag: 'wx' });
  return { file: target, sha256: hash(Buffer.from(content)) };
}
async function main() {
  if (action === 'prepare') {
    if (fs.existsSync(file)) throw Error('Prior closure evidence preserved');
    fs.mkdirSync(dir, { recursive: true });
    const source = 'D:/springboot-project/springboot-learning-api';
    const sha = git(source, ['rev-parse', 'HEAD']);
    if (sha !== 'f3cf9fe3e85acbef12e5e9743a89ebd18ea19793') throw Error('Unexpected Spring consumer revision');
    const archive = path.join(dir, 'spring-learning.tar');
    git(source, ['archive', '--format=tar', '--output=' + archive, sha]);
    for (const name of ['baseline', 'candidate']) {
      const target = path.join(dir, name); fs.mkdirSync(target); run('tar', ['-xf', archive, '-C', target]);
    }
    const r = { phase: 'P11', source: { parent: git('D:/springboot-project', ['rev-parse', 'HEAD']), consumer: sha,
      publisher: git('D:/springboot-project/springboot-jwks-api', ['rev-parse', 'HEAD']), archiveSha256: hash(fs.readFileSync(archive)) },
      realDevelopmentToken: { status: 'NOT VERIFIED', reason: 'User confirms no development credentials; no accounts/credentials may be created or modified' } };
    save(r); console.log(JSON.stringify(r)); return;
  }
  const r = JSON.parse(fs.readFileSync(file));
  const baseline = path.join(dir, 'baseline');
  const candidateLabel = process.argv[3] || 'candidate';
  if (!/^candidate(?:-[23])?$/.test(candidateLabel)) throw Error('Invalid private candidate label');
  const candidate = path.join(dir, candidateLabel);
  if (action === 'baseline') {
    let target = baseline;
    const attempt = (r.baselineAttempts?.length || (r.baseline ? 1 : 0)) + 1;
    if (attempt > 3) throw Error('Bounded reproduction attempts exhausted');
    if (attempt > 1) { target = path.join(dir, 'baseline-' + attempt); fs.mkdirSync(target); run('tar', ['-xf', path.join(dir, 'spring-learning.tar'), '-C', target]); }
    const result = await maven(target, 'baseline-full-suite' + (attempt === 1 ? '' : '-' + attempt));
    result.suites = reports(target, { 'com.japaneselearning.learning.controller.JwtAuthenticationTest': 22, 'com.japaneselearning.learning.controller.TestControllerTest': 2 });
    result.reproduced = result.suites.some(s => s.authorityOrderFailure && s.failed > 0 && s.errors === 0);
    r.baselineAttempts ??= r.baseline ? [r.baseline] : [];
    r.baselineAttempts.push(result);
    r.baseline = result; save(r); console.log(JSON.stringify(result));
  } else if (action === 'patch') {
    const relative = 'src/test/java/com/japaneselearning/learning/controller/JwtAuthenticationTest.java';
    const original = fs.readFileSync(path.join(baseline, relative), 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    let changed = replaceOnce(original.replace(/\r\n/g, '\n'), 'import com.japaneselearning.learning.config.JwtDecoderConfig;', 'import com.japaneselearning.learning.client.JwksServiceClient;\nimport com.japaneselearning.learning.config.ServiceEndpointProperties;\nimport com.japaneselearning.learning.dto.response.PublicKeyDTO;\nimport com.japaneselearning.learning.config.JwtDecoderConfig;');
    changed = replaceOnce(changed, 'import static org.assertj.core.api.Assertions.*;', 'import static org.assertj.core.api.Assertions.*;\nimport static org.hamcrest.Matchers.hasItem;\nimport static org.hamcrest.Matchers.not;');
    changed = replaceOnce(changed, '    MockMvc mvc;', '    MockMvc mvc;\n\n    @Autowired\n    JwksServiceClient client;\n\n    @Autowired\n    ServiceEndpointProperties endpoints;');
    changed = replaceOnce(changed, '        registry.add("app.security.jwt.jwk-set-uri", JwtAuthenticationTest::uri);', '        registry.add("app.security.jwt.jwk-set-uri", JwtAuthenticationTest::uri);\n        registry.add("services.jwks.base-url",\n                () -> "http://127.0.0.1:" + SERVER.getAddress().getPort());\n        registry.add("services.jwks.get-public-keys", () -> "/api/v1/jwks/user");');
    changed = replaceOnce(changed, '.andExpect(jsonPath("$.data.authorities[0]").value("ROLE_USER"))', '.andExpect(jsonPath("$.data.authorities").value(hasItem("ROLE_USER")))\n                .andExpect(jsonPath("$.data.authorities").value(not(hasItem("ROLE_ADMIN"))))');
    changed = replaceOnce(changed, '.andExpect(jsonPath("$.data.authorities[0]").value("ROLE_ADMIN"))', '.andExpect(jsonPath("$.data.authorities").value(hasItem("ROLE_ADMIN")))\n                .andExpect(jsonPath("$.data.authorities").value(not(hasItem("ROLE_USER"))))');
    changed = replaceOnce(changed, ' + "/jwks";', ' + "/api/v1/jwks/user";');
    changed = replaceOnce(changed, 'server.createContext("/jwks",', 'server.createContext("/api/v1/jwks/user",');
    const extra = '    @Test\n    void httpClientUsesTheSameOwnerScopedPathAsJwtVerification() {\n        assertThat(endpoints.getJwks().getPublicKeys()).isEqualTo("/api/v1/jwks/user");\n        assertThat(endpoints.getJwks().baseUrl() + endpoints.getJwks().getPublicKeys())\n                .isEqualTo(uri());\n        assertThat(client.getPublicKeys().keys())\n                .extracting(PublicKeyDTO::kid)\n                .containsExactlyInAnyOrder("test-v1", "test-v2");\n    }\n\n';
    changed = replaceOnce(changed, '    @Test\n    void missingToken()', extra + '    @Test\n    void missingToken()');
    const resources = 'src/test/resources/application.properties';
    const beforeResources = fs.readFileSync(path.join(baseline, resources), 'utf8');
    const afterResources = beforeResources.replaceAll('/.well-known/jwks.json', '/api/v1/jwks/user');
    r.consumerPatch = patchFile('spring-learning-consumer', [{ file: relative, before: original, after: changed.replace(/\n/g, eol) }, { file: resources, before: beforeResources, after: afterResources }]);
    const prefix = path.relative(root, candidate).replaceAll('\\', '/');
    run('git', ['apply', '--check', '--directory=' + prefix, r.consumerPatch.file]);
    run('git', ['apply', '--directory=' + prefix, r.consumerPatch.file]);
    const overlay = '# Opt-in consumer-only candidate. Requires an independently approved owner-partitioned publisher.\n# Do not apply to the currently pinned legacy publisher; no deployment is authorized here.\nservices:\n  learning-api:\n    environment:\n      JWT_JWK_SET_URI: http://jwks-api:8080/api/v1/jwks/user\n      JWKS_SERVICE_GET_PUBLIC_KEYS: /api/v1/jwks/user\n';
    r.parentPatch = patchFile('spring-owner-consumer-overlay', [{ file: 'compose.jwks-owner-consumer.yml', before: null, after: overlay }]);
    const parent = path.join(dir, 'parent-candidate'); fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, 'docker-compose.yml'), git('D:/springboot-project', ['show', r.source.parent + ':docker-compose.yml']) + '\n');
    run('git', ['apply', '--check', '--directory=' + path.relative(root, parent).replaceAll('\\', '/'), r.parentPatch.file]);
    run('git', ['apply', '--directory=' + path.relative(root, parent).replaceAll('\\', '/'), r.parentPatch.file]);
    r.patchesAppliedToIgnoredCandidatesOnly = true; save(r); console.log(JSON.stringify({ consumerPatch: r.consumerPatch, parentPatch: r.parentPatch }));
  } else if (action === 'candidate') {
    if (candidateLabel !== 'candidate') {
      fs.mkdirSync(candidate);
      run('tar', ['-xf', path.join(dir, 'spring-learning.tar'), '-C', candidate]);
      run('git', ['apply', '--check', '--directory=' + path.relative(root, candidate).replaceAll('\\', '/'), r.consumerPatch.file]);
      run('git', ['apply', '--directory=' + path.relative(root, candidate).replaceAll('\\', '/'), r.consumerPatch.file]);
    }
    const runDir = path.join(dir, candidateLabel + '-fixture'); fs.mkdirSync(runDir);
    const keys = Object.fromEntries(['user', 'learning', 'unknown'].map(owner => [owner, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })]));
    const producerPort = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const producerBase = 'http://127.0.0.1:' + producerPort;
    const release = JSON.parse(fs.readFileSync(path.join(__dirname, 'release-manifest.json')));
    const artifact = release.artifacts.find(a => a.name === 'jwks-new-a-online');
    const jar = path.join(root, artifact.root, 'jwks-0.0.1-SNAPSHOT.jar');
    if (hash(fs.readFileSync(jar)) !== artifact.sha256) throw Error('Frozen publisher artifact changed');
    const args = ['-Xmx192m', '-XX:MaxMetaspaceSize=160m', '-XX:ReservedCodeCacheSize=64m', '-jar', jar, '--server.address=127.0.0.1', '--server.port=' + producerPort];
    for (const [i, owner] of ['user', 'learning'].entries()) {
      const publicFile = path.join(runDir, owner + '-fixture-public.pem');
      fs.writeFileSync(publicFile, keys[owner].publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
      const prefix = '--app.security.jwks.keys[' + i + '].';
      args.push(prefix + 'kid=p11-' + owner, prefix + 'public-key-path=' + publicFile, prefix + 'owner=' + owner.toUpperCase());
    }
    const fd = fs.openSync(path.join(runDir, 'publisher.log'), 'wx');
    const producer = cp.spawn('java', args, { windowsHide: true, cwd: runDir, env: { ...process.env, APP_LOG_DIR: path.join(runDir, 'publisher-logs'), APP_LOG_MAX_FILE_SIZE: '1MB', APP_LOG_TOTAL_SIZE_CAP: '4MB', MANAGEMENT_TRACING_EXPORT_OTLP_ENABLED: 'false', METRICS_LISTENER_ENABLED: 'false' }, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    const capability = crypto.randomBytes(24).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const statuses = Object.fromEntries(['validUser', 'validAdmin', 'malformed', 'wrongSignature', 'unknownKid', 'wrongIssuer', 'expired', 'missingRole', 'unsupportedRole', 'missingExpiration', 'missingIssuedAt', 'missingKid', 'futureNotBefore', 'futureIssuedAt', 'wrongAlgorithm', 'learningOwner', 'audienceBoundary', 'missingSubject'].map(n => [n, ['validUser', 'validAdmin', 'audienceBoundary'].includes(n) ? 200 : ['missingRole', 'unsupportedRole'].includes(n) ? 403 : 401]));
    const token = name => {
      if (name === 'malformed') return 'p11-invalid-token';
      const owner = name === 'learningOwner' ? 'learning' : name === 'wrongSignature' ? 'unknown' : 'user';
      const header = { alg: name === 'wrongAlgorithm' ? 'RS512' : 'RS256', typ: 'JWT', kid: name === 'unknownKid' ? 'p11-unknown' : name === 'learningOwner' ? 'p11-learning' : 'p11-user' };
      const claims = { iss: name === 'wrongIssuer' ? 'p11-wrong-issuer' : 'japaneselearning-user-service', sub: '42', iat: now - 3600, exp: name === 'expired' ? now - 300 : now + 1800, role: name === 'validAdmin' ? 2 : name === 'unsupportedRole' ? 3 : 1 };
      if (name === 'missingRole') delete claims.role;
      if (name === 'missingExpiration') delete claims.exp;
      if (name === 'missingIssuedAt') delete claims.iat;
      if (name === 'missingKid') delete header.kid;
      if (name === 'missingSubject') delete claims.sub;
      if (name === 'futureNotBefore') claims.nbf = now + 300;
      if (name === 'futureIssuedAt') claims.iat = now + 300;
      if (name === 'audienceBoundary') claims.aud = 'p11-unenforced-audience';
      const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
      const unsigned = encode(header) + '.' + encode(claims);
      return unsigned + '.' + crypto.sign(name === 'wrongAlgorithm' ? 'RSA-SHA512' : 'RSA-SHA256', Buffer.from(unsigned), keys[owner].privateKey).toString('base64url');
    };
    const bridge = http.createServer((request, response) => {
      const parts = request.url.split('/');
      if (request.method !== 'GET' || parts[1] !== capability) { response.writeHead(404).end(); return; }
      const [kind, name] = parts.slice(2);
      response.setHeader('Cache-Control', 'no-store');
      if (kind === 'publisher') response.end(producerBase);
      else if (Object.hasOwn(statuses, name) && kind === 'token') response.end(token(name));
      else if (Object.hasOwn(statuses, name) && kind === 'status') response.end(String(statuses[name]));
      else response.writeHead(404).end();
    });
    await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
    try {
      let ready = false;
      for (let i = 0; i < 120; i++) {
        if (producer.exitCode !== null) throw Error('Owned publisher exited');
        try { const q = await fetch(producerBase + '/api/v1/jwks/user', { signal: AbortSignal.timeout(1000) }); if (q.status === 200) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!ready) throw Error('Owned publisher readiness deadline');
      const test = path.join(candidate, 'src/test/java/p11/P11SpringConsumerContractTest.java'); fs.mkdirSync(path.dirname(test), { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'java/P11SpringConsumerContractTest.java'), test, fs.constants.COPYFILE_EXCL);
      r.ownedPublisher = { pid: producer.pid, image: 'native Java', artifactSha256: artifact.sha256, fixtureKeys: 'Fresh public PEM files only; private material/token fixtures in process memory' }; save(r);
      r.candidateAttempts ??= r.candidate ? [r.candidate] : [];
      r.candidate = await maven(candidate, candidateLabel + '-full-suite', { P11_CLOSURE_FIXTURE_URL: 'http://127.0.0.1:' + bridge.address().port + '/' + capability });
      r.candidate.driverSha256 = hash(fs.readFileSync(__filename));
      r.candidate.fixtureTestSha256 = hash(fs.readFileSync(test));
      r.candidate.suites = reports(candidate, { 'com.japaneselearning.learning.controller.JwtAuthenticationTest': 23, 'com.japaneselearning.learning.controller.TestControllerTest': 2, 'p11.P11SpringConsumerContractTest': 19 });
      r.candidate.pass = r.candidate.exitCode === 0 && r.candidate.suites.every(s => s.pass);
      r.candidateAttempts.push(r.candidate);
    } finally {
      bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve));
      if (producer.exitCode === null) { producer.kill(); await new Promise(resolve => producer.once('exit', resolve)); }
      r.publisherStopped = producer.exitCode !== null || producer.signalCode !== null;
      r.publisherExit = { exitCode: producer.exitCode, signal: producer.signalCode }; save(r);
    }
    console.log(JSON.stringify({ candidate: r.candidate, publisherStopped: r.publisherStopped }));
    if (!r.candidate.pass) process.exitCode = 1;
  } else if (action === 'config') {
    const parent = path.join(dir, 'parent-candidate');
    const model = overlay => {
      const value = JSON.parse(run('docker', ['compose', '-p', 'p11-consumer-source-only', '-f', path.join(parent, 'docker-compose.yml'), ...(overlay ? ['-f', path.join(parent, 'compose.jwks-owner-consumer.yml')] : []), 'config', '--no-interpolate', '--no-env-resolution', '--no-path-resolution', '--format', 'json']));
      for (const service of Object.values(value.services)) if (Array.isArray(service.environment)) service.environment = Object.fromEntries(service.environment.map(line => {
        const i = line.indexOf('='); return i < 0 ? [line, null] : [line.slice(0, i), line.slice(i + 1)];
      }));
      for (const service of Object.values(value.services)) if (service.environment) service.environment = Object.fromEntries(Object.entries(service.environment).map(([key, value]) => [key, value === null ? null : String(value)]));
      return value;
    };
    const before = model(false), after = model(true);
    const a = after.services['learning-api'].environment;
    if (a.JWT_JWK_SET_URI !== 'http://jwks-api:8080/api/v1/jwks/user' || a.JWKS_SERVICE_GET_PUBLIC_KEYS !== '/api/v1/jwks/user') throw Error('Owner paths not aligned');
    const stripped = structuredClone(after);
    for (const key of ['JWT_JWK_SET_URI', 'JWKS_SERVICE_GET_PUBLIC_KEYS']) stripped.services['learning-api'].environment[key] = before.services['learning-api'].environment[key];
    if (!require('node:util').isDeepStrictEqual(stripped, before)) throw Error('Overlay changes more than the two intended consumer fields');
    run('git', ['apply', '--check', '--reverse', '--directory=' + path.relative(root, parent).replaceAll('\\', '/'), r.parentPatch.file]);
    r.parentPatch.sha256 = hash(fs.readFileSync(r.parentPatch.file));
    r.config = { pass: true, offlineSourceModel: true, fieldsChanged: ['JWT_JWK_SET_URI', 'JWKS_SERVICE_GET_PUBLIC_KEYS'], legacyBaseUnchanged: true, deployed: false }; save(r); console.log(JSON.stringify(r.config));
  } else throw Error('Unknown closure action');
}
main().catch(error => { console.error(error.message.replace(tokenPattern, '[REDACTED_JWT]')); process.exitCode = 1; });
