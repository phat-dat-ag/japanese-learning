'use strict';
// Real development login; credentials, access/refresh tokens and personal claims stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const file = path.resolve(process.argv[2] || 'observability/local-test-credentials.json');
const directory = path.join(root, '.local', 'p11-live-token-20261115');
const output = path.join(directory, 'proof.json');
const report = { phase: 'P11', scope: 'Existing jp_learning_dev .NET issuer -> existing Quarkus and gateway; no production credentials', startedUtc: new Date().toISOString(), checks: [], actualDotnetIssuedTokenToQuarkus: 'NOT VERIFIED' };
let phase = 'preflight';
async function request(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
}
async function main() {
  if (fs.existsSync(output)) throw Error('Prior proof preserved');
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Credential file must stay in workspace');
  const ignored = cp.spawnSync('git', ['check-ignore', '--quiet', '--', relative]);
  const tracked = cp.spawnSync('git', ['ls-files', '--', relative], { encoding: 'utf8' });
  if (ignored.status !== 0 || tracked.stdout.trim()) throw Error('Credential file must be ignored and untracked');
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw Error('Expected regular local credential file');
  const credentialBytes = fs.readFileSync(file);
  let credentials;
  try { credentials = JSON.parse(credentialBytes); } catch { throw Error('Credential JSON invalid'); }
  const email = credentials.email || credentials.username;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof credentials.password !== 'string' || !credentials.password) throw Error('Login API requires an email address and password; supplied username must be the account email');
  const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'technical.json'))).before;
  for (const service of ['user-api', 'vocabulary-api', 'jwks-api', 'gateway']) if (!baseline.containers.some(c => c.project === 'jp_learning_dev' && c.name === '/jp_learning_dev-' + service + '-1' && c.state === 'running')) throw Error('Development baseline incomplete');
  report.credentialFileIgnored = true;
  let refreshToken;
  try {
    phase = 'login';
    const login = await request('http://127.0.0.1:8081/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: credentials.password }) });
    report.loginHttpStatus = login.status;
    if (login.status !== 200) throw Error('Development login rejected; no credential guesses or retry');
    const body = await login.json();
    const accessToken = body.data?.accessToken;
    refreshToken = body.data?.refreshToken;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') throw Error('Unexpected login response schema');
    phase = 'token-verification';
    const parts = accessToken.split('.');
    if (parts.length !== 3) throw Error('Unexpected access-token format');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const q = await request('http://127.0.0.1:8083/api/v1/jwks/user');
    if (q.status !== 200) throw Error('Development User public JWKS unavailable');
    const keys = (await q.json()).keys;
    const key = keys.find(k => k.kid === header.kid);
    if (header.alg !== 'RS256' || !key || key.alg !== 'RS256') throw Error('Unexpected token/public-key contract');
    const verified = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!verified || claims.iss !== 'JapaneseLearning.User' || !audience.includes('JapaneseLearning') || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw Error('Actual issuer/token contract did not verify');
    const role = ['User', 'Admin'].includes(claims.role) ? claims.role : 'OTHER';
    report.tokenContract = { rs256SignatureVerifiedAgainstUserJwks: true, kidPresentInUserSet: true, issuerMatches: true, audienceMatches: true, unexpiredAtUse: true, roleClass: role };
    phase = 'authenticated-requests';
    for (const [name, url] of [
      ['dotnet-me', 'http://127.0.0.1:8081/api/auth/me'],
      ['quarkus-levels', 'http://127.0.0.1:8082/api/v1/jlpt-levels'],
      ['gateway-dotnet-me', 'http://127.0.0.1:8080/api/auth/me'],
      ['gateway-quarkus-levels', 'http://127.0.0.1:8080/api/v1/jlpt-levels']
    ]) {
      const response = await request(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      let success = false;
      if (response.status === 200) success = (await response.json()).success === true;
      report.checks.push({ name, expected: 200, actual: response.status, successEnvelope: success, pass: response.status === 200 && success });
    }
    if (role === 'User' || role === 'Admin') {
      const admin = await request('http://127.0.0.1:8081/api/auth/admin-test', { headers: { Authorization: 'Bearer ' + accessToken } });
      const expected = role === 'Admin' ? 200 : 403;
      report.checks.push({ name: 'dotnet-role-enforcement', expected, actual: admin.status, pass: admin.status === expected });
    }
    if (role === 'User') {
      const admin = await request('http://127.0.0.1:8082/api/v1/admin/kanji-quiz/questions?page=0&size=1', { headers: { Authorization: 'Bearer ' + accessToken } });
      report.checks.push({ name: 'quarkus-user-denied-admin', expected: 403, actual: admin.status, pass: admin.status === 403 });
    } else report.userDeniedAdminScope = 'NOT VERIFIED: provided account is not a User-role principal; no role/claim/account alteration';
    report.actualDotnetIssuedTokenToQuarkus = report.checks.find(c => c.name === 'quarkus-levels').pass ? 'PASS' : 'FAIL';
    report.status = report.checks.every(c => c.pass) ? 'PASS' : 'PARTIAL';
    report.remainingClaimNegatives = 'Trusted-signature wrong issuer/audience/expiry/role variants not manufactured: no signing-key access or claims changes. Prior isolated negative cohorts remain separately qualified.';
  } finally {
    if (refreshToken) {
      try {
        const logout = await request('http://127.0.0.1:8081/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
        report.ownRefreshSessionCleanup = { expected: 204, actual: logout.status, pass: logout.status === 204 };
        if (logout.status !== 204) report.status = 'PARTIAL';
      } catch { report.ownRefreshSessionCleanup = { pass: false, reason: 'Normal logout unavailable; no broad account/session mutation attempted' }; report.status = 'PARTIAL'; }
    }
    report.credentialFileUntouched = credentialBytes.equals(fs.readFileSync(file));
  }
  report.tokenPrivacy = { bearerOrRefreshTokenPrinted: false, bearerOrRefreshTokenPersisted: false, personalClaimsPublished: false, existingKeyFilesRead: false };
  report.authStateBoundary = 'Normal login creates its own refresh-session record; normal logout revokes only that record. No account/password/key/claim/config changes. Access token is discarded from process memory and expires normally.';
}
main().catch(() => { report.status = 'BLOCKED'; report.failurePhase = phase; report.reason = phase === 'preflight' ? 'Credential/preflight requirements not met; no secret values emitted' : phase === 'login' ? 'Login did not yield the expected successful development response; credentials not retried or guessed' : 'Live token/consumer verification failed; no raw response/exception published'; process.exitCode = 1; }).finally(() => {
  report.finishedUtc = new Date().toISOString();
  if (!fs.existsSync(output)) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
  if (report.status !== 'PASS') process.exitCode = 1;
});
