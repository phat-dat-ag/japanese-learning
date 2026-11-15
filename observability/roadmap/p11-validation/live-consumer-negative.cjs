'use strict';
// No login/accounts, production credentials or persisted tokens. Negative probes only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const directory = path.join(root, '.local', 'p11-consumer-closure-20261115');
const output = path.join(directory, 'live-negative.json');
async function main() {
  if (fs.existsSync(output)) throw Error('Prior negative evidence preserved');
  const before = JSON.parse(fs.readFileSync(path.join(directory, 'technical.json'))).before;
  for (const name of ['user-api', 'vocabulary-api', 'jwks-api']) {
    if (!before.containers.some(c => c.project === 'jp_learning_dev' && c.name === '/jp_learning_dev-' + name + '-1' && c.state === 'running')) throw Error('Expected development baseline absent');
  }
  const response = await fetch('http://127.0.0.1:8083/api/v1/jwks/user', { signal: AbortSignal.timeout(5000) });
  if (response.status !== 200) throw Error('Development public JWKS unavailable');
  const jwks = await response.json();
  if (!jwks.keys?.length || !jwks.keys.every(k => k.kty === 'RSA' && k.alg === 'RS256')) throw Error('Unexpected development public key contract');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const results = [];
  for (const [scenario, kid] of [['untrustedSignatureKnownKid', jwks.keys[0].kid], ['unknownKidUntrustedSigner', 'p11-unknown-' + crypto.randomBytes(8).toString('hex')]]) {
    const unsigned = encode({ alg: 'RS256', typ: 'JWT', kid }) + '.' + encode({ iss: 'JapaneseLearning.User', aud: 'JapaneseLearning', sub: crypto.randomUUID(), role: 'User', iat: now, exp: now + 120 });
    const token = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
    for (const [consumer, url] of [['dotnet', 'http://127.0.0.1:8081/api/auth/me'], ['quarkus', 'http://127.0.0.1:8082/api/v1/jlpt-levels']]) {
      const q = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
      results.push({ consumer, scenario, expected: 401, actual: q.status, pass: q.status === 401 });
    }
  }
  const report = { utc: new Date().toISOString(), scope: 'Existing development services; four untrusted-signer negative probes only',
    results, negativeChecks: results.every(r => r.pass) ? 'PASS' : 'FAIL',
    actualDotnetIssuedTokenToQuarkus: 'NOT VERIFIED',
    reason: 'User confirms no development test credentials and prohibits account/credential creation without approval',
    restrictions: ['No login/registration/refresh request made', 'No private signing-key file read or modified', 'No bearer token printed/persisted',
      'These signature-negative cases do not isolate issuer/audience/expiry/role enforcement; no trusted-signature live token available'],
    permittedAlternative: 'Existing development HTTP login would avoid native Windows DLL execution; requires a separately provided existing development-only test account' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
  if (report.negativeChecks !== 'PASS') process.exitCode = 1;
}
main().catch(error => { console.error('Negative probe failed: ' + error.message); process.exitCode = 1; });
