'use strict';
// Disposable native processes and fresh fixture keys only. No live containers or credentials.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = path.join(root, '.local', 'p11-rc-20261115');
const runName = process.argv[2] || 'compatibility';
if (!/^compatibility(?:-[a-z0-9]+)?$/.test(runName)) throw Error('Invalid private run name');
const dir = path.join(base, runName);
const children = [];
const producers = {};
const producerLaunch = {};
const report = { scope: 'Native loopback fixture producers and actual consumer code; synthetic keys/tokens; no protected DB', startedUtc: new Date().toISOString(), endpoints: [], consumers: {}, ownedPids: [] };
const save = () => fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
function spawn(bin, args, name, cwd, env = {}) {
  const fd = fs.openSync(path.join(dir, name + '.log'), 'wx');
  const child = cp.spawn(bin, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', fd, fd] });
  child.fixtureTree = bin === 'powershell.exe';
  fs.closeSync(fd);
  child.on('error', () => {});
  children.push(child);
  report.ownedPids.push({ name, pid: child.pid });
  save();
  return child;
}
function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (child.fixtureTree) cp.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill();
}
async function ready(child, url) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('Owned fixture exited before readiness');
    try { const q = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (q.status === 200) return; } catch {}
    await sleep(500);
  }
  throw Error('Owned fixture readiness deadline');
}
function jar(name) {
  const builds = JSON.parse(fs.readFileSync(path.join(base, 'builds.json')));
  const a = builds.artifacts[name + '-a-online'] || builds.artifacts[name + '-a-retry'] || builds.artifacts[name + '-a'];
  if (!a) throw Error('No successful committed producer build: ' + name);
  const j = a.files.find(f => f.file.endsWith('.jar'));
  const file = path.join(a.root, j.file);
  if (hash(fs.readFileSync(file)) !== j.sha256) throw Error('Producer artifact drift');
  return file;
}
async function main() {
  if (fs.existsSync(dir)) throw Error('Preserve prior compatibility evidence; do not overwrite');
  fs.mkdirSync(dir);
  const keys = {};
  for (const owner of ['user', 'learning', 'unknown']) {
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    keys[owner] = pair;
    fs.writeFileSync(path.join(dir, owner + '-public.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
    fs.writeFileSync(path.join(dir, owner + '-private.pem'), pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  }
  const urls = {};
  for (const version of ['new', 'old']) {
    const assigned = await port();
    urls[version] = 'http://127.0.0.1:' + assigned;
    const args = ['-Xmx192m', '-XX:MaxMetaspaceSize=160m', '-XX:ReservedCodeCacheSize=64m', '-jar', jar('jwks-' + version), '--server.address=127.0.0.1', '--server.port=' + assigned];
    for (const [i, owner] of ['user', 'learning'].entries()) {
      const prefix = '--app.security.jwks.keys[' + i + '].';
      args.push(prefix + 'kid=p11-' + owner, prefix + 'public-key-path=' + path.join(dir, owner + '-public.pem'));
      if (version === 'new') args.push(prefix + 'owner=' + owner.toUpperCase());
      else args.push(prefix + 'private-key-path=' + path.join(dir, owner + '-private.pem'), prefix + 'active=' + (owner === 'user'));
    }
    const environment = { APP_LOG_DIR: path.join(dir, 'logs-' + version), APP_LOG_MAX_FILE_SIZE: '1MB', APP_LOG_TOTAL_SIZE_CAP: '4MB', MANAGEMENT_TRACING_EXPORT_OTLP_ENABLED: 'false', METRICS_LISTENER_ENABLED: 'false' };
    const child = spawn('java', args, 'jwks-' + version, dir, environment);
    producers[version] = child;
    producerLaunch[version] = { args, environment };
    const route = version === 'new' ? '/api/v1/jwks/user' : '/.well-known/jwks.json';
    await ready(child, urls[version] + route);
    for (const endpoint of ['/.well-known/jwks.json', '/api/v1/jwks/user', '/api/v1/jwks/learning', '/api/v1/jwks/unknown']) {
      const q = await fetch(urls[version] + endpoint, { signal: AbortSignal.timeout(5000) });
      let body; try { body = await q.json(); } catch { body = {}; }
      if (q.status === 200) {
        const expected = version === 'old' ? ['p11-user', 'p11-learning'] : [endpoint.endsWith('user') ? 'p11-user' : 'p11-learning'];
        if (JSON.stringify(body.keys?.map(k => k.kid).sort()) !== JSON.stringify(expected.sort())) throw Error('Incorrect published owner keys');
        for (const key of body.keys) {
          const expectedKey = keys[key.kid.slice(4)].publicKey.export({ format: 'jwk' });
          if (key.n !== expectedKey.n || key.e !== expectedKey.e || key.alg !== 'RS256' || Object.keys(key).some(k => !['kty', 'kid', 'use', 'alg', 'n', 'e'].includes(k))) throw Error('Incorrect public JWK');
        }
      }
      const expectedStatus = version === 'new' ? (endpoint.endsWith('/user') || endpoint.endsWith('/learning') ? 200 : endpoint.endsWith('/unknown') ? 404 : 401) : endpoint === '/.well-known/jwks.json' ? 200 : 401;
      report.endpoints.push({ version, endpoint, status: q.status, expectedStatus, pass: q.status === expectedStatus, keys: body.keys?.map(k => k.kid), cache: q.headers.get('cache-control') });
    }
    save();
  }
  stop(producers.old);
  await new Promise(resolve => producers.old.once('exit', resolve));
  const now = Math.floor(Date.now() / 1000);
  function token(issuer, scenario = 'valid') {
    if (scenario === 'malformed') return 'p11-invalid-token';
    const owner = scenario === 'learningOwner' ? 'learning' : scenario === 'wrongSignature' ? 'unknown' : 'user';
    const kid = scenario === 'unknownKid' ? 'p11-unknown' : scenario === 'learningOwner' ? 'p11-learning' : 'p11-user';
    const payload = { iss: scenario === 'wrongIssuer' ? 'p11-wrong-issuer' : issuer, aud: scenario === 'wrongAudience' ? 'p11-wrong-audience' : 'JapaneseLearning',
      sub: 'db3d0876-c533-4ec3-90a2-b78102cb9fe7', unique_name: 'p11-fixture', email: 'p11@example.invalid', role: issuer === 'JapaneseLearning.User' ? 'User' : 1,
      iat: now - 3600, exp: scenario === 'expired' ? now - 300 : now + 1800 };
    const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = encode({ alg: 'RS256', typ: 'JWT', kid }) + '.' + encode(payload);
    return unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), keys[owner].privateKey).toString('base64url');
  }
  const props = { 'new.base.url': urls.new, 'new.user.url': urls.new + '/api/v1/jwks/user',
    'user.private.path': path.join(dir, 'user-private.pem').replaceAll('\\', '/'), 'user.public.path': path.join(dir, 'user-public.pem').replaceAll('\\', '/') };
  const cases = ['valid', 'expired', 'wrongIssuer', 'wrongAudience', 'unknownKid', 'wrongSignature', 'learningOwner', 'malformed'];
  for (const name of cases) {
    props['jp.' + name + '.token'] = token('JapaneseLearning.User', name);
    props['jp.' + name + '.status'] = name === 'valid' ? '200' : '401';
  }
  for (const [name, scenario, version, accepted] of [['validNew', 'valid', 'new', true], ['validOld', 'valid', 'old', true],
    ['wrongIssuer', 'wrongIssuer', 'new', false], ['expired', 'expired', 'new', false], ['unknownKid', 'unknownKid', 'new', false],
    ['wrongSignature', 'wrongSignature', 'new', false], ['learningOwnerNew', 'learningOwner', 'new', false], ['learningOwnerOld', 'learningOwner', 'old', true], ['wrongAudience', 'wrongAudience', 'new', true]]) {
    props['spring.' + name + '.token'] = token('japaneselearning-user-service', scenario);
    props['spring.' + name + '.url'] = urls[version] + (version === 'new' ? '/api/v1/jwks/user' : '/.well-known/jwks.json');
    props['spring.' + name + '.accepted'] = String(accepted);
  }
  const casesFile = path.join(dir, 'cases.properties');
  fs.writeFileSync(casesFile, Object.entries(props).map(([k, v]) => k + '=' + v).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  if (!process.argv.includes('--skip-blocked-native')) {
  const apiPort = await port();
  const apiRoot = path.join(base, 'dotnet-a-retry', 'publish');
  const api = spawn('dotnet', [path.join(apiRoot, 'JapaneseLearning.User.Api.dll')], 'dotnet', apiRoot, {
    ASPNETCORE_URLS: 'http://127.0.0.1:' + apiPort, ASPNETCORE_ENVIRONMENT: 'Production', Http__RedirectToHttps: 'false',
    Database__ConnectionString: 'Server=127.0.0.1,1;Database=p11_unused;User Id=p11;Password=p11-synthetic-only;Encrypt=false;Connect Timeout=1',
    Jwt__JwksUrl: props['new.user.url'], Jwt__RequireHttpsMetadata: 'false', Jwt__Issuer: 'JapaneseLearning.User', Jwt__Audience: 'JapaneseLearning',
    Jwt__SigningKeys__0__Kid: 'p11-user', Jwt__SigningKeys__0__PrivateKeyPath: props['user.private.path'], Jwt__SigningKeys__0__Active: 'true',
    LogFiles__Directory: path.join(dir, 'dotnet-logs'), LogFiles__FileSizeLimitBytes: '1048576', LogFiles__RetainedFileCountLimit: '2',
    Tracing__Enabled: 'false' });
  await ready(api, 'http://127.0.0.1:' + apiPort + '/health/live');
  report.consumers.dotnet = [];
  for (const name of cases) {
    const q = await fetch('http://127.0.0.1:' + apiPort + '/api/auth/me', { headers: { Authorization: 'Bearer ' + props['jp.' + name + '.token'] }, signal: AbortSignal.timeout(10000) });
    const expected = Number(props['jp.' + name + '.status']);
    report.consumers.dotnet.push({ case: name, status: q.status, expected, pass: q.status === expected });
  }
  api.kill();
  await new Promise(resolve => api.once('exit', resolve));
  save();
  } else {
    report.nativeDotnet = { status: 'NOT VERIFIED', reason: 'Windows Application Control blocked the original native published DLL; no policy bypass attempted', priorEvidence: path.join(base, 'compatibility', 'dotnet.log') };
  }
  const dotnetCandidate = path.join(base, 'dotnet-a-retry');
  fs.copyFileSync(path.join(__dirname, 'P11RealProducerTests.cs'), path.join(dotnetCandidate, 'tests/JapaneseLearning.User.UnitTests/Security/P11RealProducerTests.cs'), fs.constants.COPYFILE_EXCL);
  const dotnetScript = 'dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj -c Release --filter FullyQualifiedName~P11RealProducerTests -p:UseSharedCompilation=false -m:1 --logger "trx;LogFileName=p11-realproducer.trx" --nologo';
  const dotnetTest = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', dotnetScript], 'dotnet-consumer', dotnetCandidate, { P11_CASES: casesFile, DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1' });
  let dotnetTimer;
  const dotnetResult = await Promise.race([new Promise(resolve => dotnetTest.once('exit', code => resolve({ code }))), new Promise(resolve => { dotnetTimer = setTimeout(() => resolve({ timeout: true }), 180000); })]);
  clearTimeout(dotnetTimer);
  if (dotnetResult.timeout) stop(dotnetTest);
  const trx = path.join(dotnetCandidate, 'tests/JapaneseLearning.User.UnitTests/TestResults/p11-realproducer.trx');
  const trxText = fs.existsSync(trx) ? fs.readFileSync(trx, 'utf8') : '';
  const dotnetCounts = counts(trxText, 'trx', 8);
  dotnetResult.nativeExitCode = dotnetResult.code;
  dotnetResult.counts = dotnetCounts;
  if (!dotnetCounts.pass) {
    dotnetResult.code = null;
    dotnetResult.status = 'BLOCKED';
    dotnetResult.reason = 'All eight tests must execute; native exit 0 cannot establish acceptance';
  }
  report.consumers.dotnetComponent = dotnetResult;
  const issuedToken = path.join(dir, 'dotnet-issued.token');
  if (dotnetResult.code === 0 && fs.existsSync(issuedToken)) {
    props['jp.valid.token'] = fs.readFileSync(issuedToken, 'utf8');
    fs.writeFileSync(casesFile, Object.entries(props).map(([k, v]) => k + '=' + v).join('\n') + '\n');
    report.crossStackToken = { issuer: 'Actual committed .NET TokenService', destination: 'Quarkus real OIDC via owner-scoped JWKS', tokenPublished: false };
  }
  save();
  for (const [name, pass, testClass] of [['quarkus', 'a-retry', 'P11CrossStackTest'], ['spring-learning', 'a-retry', 'P11SpringLearningTest'], ['spring-user', 'a', 'P11SpringUserTest']]) {
    if (name === 'spring-learning') {
      producers.old = spawn('java', producerLaunch.old.args, 'jwks-old-restarted-fixture', dir, producerLaunch.old.environment);
      await ready(producers.old, urls.old + '/.well-known/jwks.json');
    }
    if (name === 'spring-user') {
      for (const child of Object.values(producers)) stop(child);
      await sleep(500);
    }
    const candidate = path.join(base, name + '-' + pass);
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate);
      const q = cp.spawnSync('tar', ['-xf', path.join(base, name + '.tar'), '-C', candidate]);
      if (q.status !== 0) throw Error('Cannot extract consumer');
    }
    const testDir = path.join(candidate, 'src', 'test', 'java', 'p11');
    fs.mkdirSync(testDir, { recursive: true });
    for (const file of ['P11Cases.java', testClass + '.java']) fs.copyFileSync(path.join(__dirname, 'java', file), path.join(testDir, file), fs.constants.COPYFILE_EXCL);
    const heap = name === 'quarkus' ? 384 : 256;
    const script = '& .\\mvnw.cmd -o -B -ntp test "-Dtest=' + testClass + '" "-DargLine=-Xmx' + heap + 'm" "-Dquarkus.http.test-port=0"';
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], name, candidate,
      { P11_CASES: casesFile, MAVEN_OPTS: '-Xmx256m' });
    let timer;
    const result = await Promise.race([new Promise(resolve => child.once('exit', code => resolve({ code }))), new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 240000); })]);
    clearTimeout(timer);
    if (result.timeout) stop(child);
    const xmlFile = path.join(candidate, 'target/surefire-reports/TEST-p11.' + testClass + '.xml');
    if (fs.existsSync(xmlFile)) {
      result.counts = counts(fs.readFileSync(xmlFile, 'utf8'), 'junit', name === 'quarkus' ? 8 : name === 'spring-learning' ? 9 : 7);
      result.reportSha256 = hash(fs.readFileSync(xmlFile));
      if (!result.counts.pass) result.incomplete = true;
    } else result.incomplete = true;
    report.consumers[name] = { ...result, testClass, log: path.join(dir, name + '.log') };
    save();
  }
  report.status = report.endpoints.every(x => x.pass) && report.consumers.dotnetComponent?.code === 0 && ['quarkus', 'spring-learning', 'spring-user'].every(n => report.consumers[n]?.code === 0 && !report.consumers[n]?.incomplete) ? 'PASS' : 'PARTIAL';
}
main().catch(e => { report.status = 'FAIL'; report.error = e.message; process.exitCode = 1; }).finally(async () => {
  for (const child of children) stop(child);
  report.finishedUtc = new Date().toISOString();
  if (fs.existsSync(dir)) save();
  console.log(JSON.stringify({ status: report.status, error: report.error, endpoints: report.endpoints, consumers: report.consumers, output: path.join(dir, 'results.json') }));
  if (report.status !== 'PASS') process.exitCode = 1;
});
