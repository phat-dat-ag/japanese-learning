'use strict';
// Build the explicitly identified uncommitted consumer candidate, never deploy it.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const base = process.argv[4] ? path.resolve(root, process.argv[4]) : path.join(root, '.local/p11-spring-adoption-20261115');
if (!base.startsWith(path.join(root, '.local') + path.sep)) throw Error('Ignored local evidence path required');
const source = 'D:/springboot-project/springboot-learning-api';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function run(bin, args, cwd = root) {
  const env = bin === 'git' && args[0] === 'apply' ? { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) } : process.env;
  const q = cp.spawnSync(bin, args, { cwd, env, encoding: null, timeout: 60000 });
  if (q.status !== 0) throw Error('Command failed: ' + bin + ' ' + args[0]);
  return q.stdout;
}
const git = args => run('git', ['-c', 'safe.directory=' + source, '-C', source, ...args]);
const action = process.argv[2];
if (action === 'build') {
  const label = process.argv[3];
  if (!/^[ab]$/.test(label)) throw Error('Invalid label');
  fs.mkdirSync(base, { recursive: true });
  const dir = path.join(base, 'learning-' + label);
  fs.mkdirSync(dir);
  const sha = git(['rev-parse', 'HEAD']).toString().trim();
  const archive = path.join(dir, 'source.tar');
  git(['archive', '--format=tar', '--output=' + archive, sha]);
  run('tar', ['-xf', archive, '-C', dir]);
  const diff = git(['diff', '--binary', '--', 'src/test']);
  const patch = path.join(dir, 'working-tests.patch');
  fs.writeFileSync(patch, diff);
  run('git', ['apply', patch], dir);
  for (const file of ['src/test/java/com/japaneselearning/learning/controller/JwtAuthenticationTest.java', 'src/test/resources/application.properties']) {
    const normalize = location => fs.readFileSync(path.join(location, file), 'utf8').replace(/\r\n/g, '\n');
    if (normalize(dir) !== normalize(source)) throw Error('Applied candidate test input does not match installed source');
  }
  const timestamp = git(['show', '-s', '--format=%cI', 'HEAD']).toString().trim();
  const script = '& .\\mvnw.cmd -o -B -ntp package "-DskipTests" "-Dproject.build.outputTimestamp=' + timestamp + '"';
  const log = path.join(dir, 'build.log');
  const fd = fs.openSync(log, 'wx');
  const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd: dir, env: { ...process.env, MAVEN_OPTS: '-Xmx384m' }, timeout: 600000, stdio: ['ignore', fd, fd]
  });
  fs.closeSync(fd);
  const artifacts = fs.existsSync(path.join(dir, 'target')) ? fs.readdirSync(path.join(dir, 'target')).filter(f => f.endsWith('.jar')).map(f => {
    const file = path.join(dir, 'target', f);
    return { file, bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file)) };
  }) : [];
  const record = { sha, uncommittedCandidate: true, sourceArchiveSha256: hash(fs.readFileSync(archive)), testDiffSha256: hash(diff), timestamp, script, exitCode: q.status, artifacts, logSha256: hash(fs.readFileSync(log)) };
  fs.writeFileSync(path.join(base, 'build-' + label + '.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(record));
  if (q.status !== 0 || !artifacts.length) process.exitCode = 1;
} else if (action === 'compose') {
  const parent = 'D:/springboot-project';
  const args = ['compose', '-f', parent + '/docker-compose.yml'];
  const opts = ['config', '--no-interpolate', '--no-env-resolution', '--no-path-resolution', '--format', 'json'];
  const before = JSON.parse(run('docker', [...args, ...opts]));
  const after = JSON.parse(run('docker', [...args, '-f', parent + '/compose.jwks-owner-consumer.yml', ...opts]));
  function normalize(model) {
    for (const service of Object.values(model.services)) {
      let env = service.environment;
      if (Array.isArray(env)) env = Object.fromEntries(env.map(s => { const i = s.indexOf('='); return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)]; }));
      if (env) service.environment = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === null ? null : String(v)]));
    }
    return model;
  }
  normalize(before); normalize(after);
  const fields = ['JWT_JWK_SET_URI', 'JWKS_SERVICE_GET_PUBLIC_KEYS'];
  const changes = fields.map(field => ({ field, before: before.services['learning-api'].environment[field], after: after.services['learning-api'].environment[field] }));
  for (const field of fields) after.services['learning-api'].environment[field] = before.services['learning-api'].environment[field];
  const pass = require('node:util').isDeepStrictEqual(before, after) && changes[0].after === 'http://jwks-api:8080/api/v1/jwks/user' && changes[1].after === '/api/v1/jwks/user';
  const record = { pass, changes, baseLegacyUnchanged: true, overlayActivated: false };
  fs.writeFileSync(path.join(base, 'compose.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(record));
  if (!pass) process.exitCode = 1;
} else throw Error('Unknown action');
