// Read-only smoke checks. Keys and JWTs stay in memory; no accounts/data are created.
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(execFileSync('docker', ['compose', '-p', 'jp_dev', 'config', '--format', 'json'], { encoding: 'utf8' }));
const containers = JSON.parse(execFileSync('docker', ['inspect', 'jp_dev-jwks-api-1', 'jp_dev-user-api-1', 'jp_dev-vocabulary-api-1'], { encoding: 'utf8' }));
const env = config.services['jwks-api'].environment;
const issuer = config.services['user-api'].environment.Jwt__Issuer;
const audience = config.services['user-api'].environment.Jwt__Audience;
const port = (service) => config.services[service].ports[0].published;
const base = (service) => `http://127.0.0.1:${port(service)}`;
const response = await fetch(base('jwks-api') + '/api/v1/jwks/user');
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'max-age=300, public');
const jwks = await response.json();
assert.equal(jwks.keys.length, 3);
const bind = containers[0].Mounts.filter(m => m.Type === 'bind');
assert.equal(bind.length, 3);
for (let i = 0; i < 3; i++) {
  assert.equal(env[`APP_SECURITY_JWKS_KEYS_${i}_OWNER`], 'USER');
  const path = env[`APP_SECURITY_JWKS_KEYS_${i}_PUBLICKEYPATH`];
  const mount = bind.find(m => m.Destination === path);
  assert.ok(mount && !mount.RW);
  const pem = readFileSync(mount.Source, 'utf8');
  assert.ok(pem.startsWith('-----BEGIN PUBLIC KEY-----'));
  const expected = createPublicKey(pem).export({ format: 'jwk' });
  const key = jwks.keys.find(k => k.kid === env[`APP_SECURITY_JWKS_KEYS_${i}_KID`]);
  assert.ok(key);
  assert.deepEqual(Object.keys(key).sort(), ['alg', 'e', 'kid', 'kty', 'n', 'use']);
  assert.equal(key.n, expected.n);
  assert.equal(key.e, expected.e);
  assert.equal(key.alg, 'RS256');
}
assert.deepEqual(await (await fetch(base('jwks-api') + '/api/v1/jwks/learning')).json(), { keys: [] });
assert.equal((await fetch(base('jwks-api') + '/api/v1/jwks/unknown')).status, 404);
assert.ok([401, 404].includes((await fetch(base('jwks-api') + '/.well-known/jwks.json')).status));
for (const c of containers) assert.equal(c.State.Health.Status, 'healthy');
for (const name of ['user-api', 'vocabulary-api']) {
  const e = config.services[name].environment;
  assert.equal(e[name === 'user-api' ? 'Jwt__JwksUrl' : 'AUTH_JWKS_URL'], 'http://jwks-api:8080/api/v1/jwks/user');
}
console.log('PASS: healthy services, User-only keys, preserved kids/RSA components, caching, empty Learning, unknown/retired routes, public-only read-only mounts and trusted URLs.');

const signing = config.services['user-api'].environment;
const privateMount = containers[1].Mounts.find(m => m.Destination === '/run/keys/jwt');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = { iss: issuer, aud: audience, sub: randomUUID(), role: 'User', exp: Math.floor(Date.now() / 1000) + 120 };
const token = (key, kid, payload = claims) => {
  const data = encode({ alg: 'RS256', typ: 'JWT', kid }) + '.' + encode(payload);
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
};
async function check(jwt, expected) {
  for (const [service, path] of [['user-api', '/api/auth/me'], ['vocabulary-api', '/api/v1/jlpt-levels']]) {
    const result = await fetch(base(service) + path, { headers: { Authorization: `Bearer ${jwt}` } });
    assert.equal(result.status, expected, `${service}: unexpected authentication status`);
  }
}
let first;
for (let i = 0; i < 3; i++) {
  const path = signing[`APP_SECURITY_SIGNING_KEYS_${i}_PRIVATE_KEY_PATH`];
  const key = readFileSync(privateMount.Source + path.slice('/run/keys/jwt'.length));
  const kid = signing[`APP_SECURITY_SIGNING_KEYS_${i}_KID`];
  first ??= { key, kid };
  await check(token(key, kid), 200);
  const admin = token(key, kid, { ...claims, role: 'Admin' });
  await check(admin, 200);
  assert.equal((await fetch(base('user-api') + '/api/auth/admin-test', { headers: { Authorization: `Bearer ${admin}` } })).status, 200);
}
for (const change of [{ iss: 'wrong' }, { aud: 'wrong' }, { exp: 1 }]) {
  await check(token(first.key, first.kid, { ...claims, ...change }), 401);
}
// Ephemeral untrusted-owner fixture: never configured, mounted, saved or copied.
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
await check(token(foreign, first.kid), 401);
await check(token(foreign, 'untrusted-owner-test'), 401);
console.log('PASS: all existing signing kids authenticate User/Admin; wrong issuer/audience, expiry, foreign signatures and foreign kids rejected by both real APIs. No persistent fixtures created.');
