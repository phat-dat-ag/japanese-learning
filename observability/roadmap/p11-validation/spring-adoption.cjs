'use strict';
// Explicitly authorized Spring consumer/test edits only; no deployment or gitlink change.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const parent = 'D:/springboot-project';
const consumer = parent + '/springboot-learning-api';
const directory = path.join(root, '.local/p11-spring-adoption-20261115');
const file = path.join(directory, 'adoption.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function git(cwd, args) {
  const q = cp.spawnSync('git', ['-c', 'safe.directory=' + cwd.replaceAll('\\', '/'), '-C', cwd, ...args], { encoding: 'utf8', timeout: 30000 });
  if (q.status !== 0) throw Error('Git check/apply failed: ' + args[0]);
  return q.stdout.trim();
}
function tree(dir) {
  const result = [];
  function visit(relative) {
    for (const e of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const name = path.join(relative, e.name);
      if (e.isSymbolicLink()) throw Error('Unexpected source link');
      if (e.isDirectory()) visit(name);
      else result.push({ file: name.replaceAll('\\', '/'), sha256: hash(fs.readFileSync(path.join(dir, name))) });
    }
  }
  visit(''); return result.sort((a, b) => a.file.localeCompare(b.file));
}
if (fs.existsSync(file)) throw Error('Existing adoption record preserved');
fs.mkdirSync(directory, { recursive: true });
const before = { parentHead: git(parent, ['rev-parse', 'HEAD']), consumerHead: git(consumer, ['rev-parse', 'HEAD']),
  japaneseJwks: git(path.join(root, 'springboot-jwks-api'), ['rev-parse', 'HEAD']), springJwks: git(parent + '/springboot-jwks-api', ['rev-parse', 'HEAD']),
  parentIndex: git(parent, ['ls-files', '--stage']), consumerIndex: git(consumer, ['ls-files', '--stage']), parentStatus: git(parent, ['status', '--porcelain=v1']), consumerStatus: git(consumer, ['status', '--porcelain=v1']), main: tree(consumer + '/src/main') };
if (before.parentHead !== '4053199a18cae4e1ee3e3f81cafca4d360469c52' || before.consumerHead !== 'f3cf9fe3e85acbef12e5e9743a89ebd18ea19793' || before.japaneseJwks !== 'e9b90c31dfa311e0121285c8b7caa37c09cf4287' || before.springJwks !== 'a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73' || before.parentStatus || before.consumerStatus) throw Error('Re-review changed or dirty Spring baseline');
const patches = [
  { cwd: parent, file: path.join(__dirname, 'spring-owner-consumer-overlay.patch'), expected: '7b196e135c0f0c14729f1ad4ff152e3af8ee84b133e98cad8e868d9f5a1391c1' },
  { cwd: consumer, file: path.join(__dirname, 'spring-learning-consumer.patch'), expected: '43755010b011e510c076b31135226e9afa377cce33b3d9b83378fb05e900900f' }
];
for (const p of patches) {
  if (hash(fs.readFileSync(p.file)) !== p.expected) throw Error('Previously validated patch changed');
  git(p.cwd, ['apply', '--check', p.file]);
}
const report = { phase: 'P11', startedUtc: new Date().toISOString(), authority: 'User P11 Spring JWKS Migration and Cross-Repository Regression explicitly authorizes these edits', before, patches: patches.map(p => ({ file: path.relative(root, p.file).replaceAll('\\', '/'), sha256: p.expected })), status: 'APPLYING', deployed: false };
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
try {
  for (const p of patches) git(p.cwd, ['apply', p.file]);
  const actual = tree(consumer + '/src/main');
  if (JSON.stringify(before.main) !== JSON.stringify(actual)) throw Error('Production source unexpectedly changed');
  if (before.parentIndex !== git(parent, ['ls-files', '--stage']) || before.consumerIndex !== git(consumer, ['ls-files', '--stage'])) throw Error('Index unexpectedly changed');
  const reference = path.join(root, '.local/p11-consumer-closure-20261115/candidate-2');
  const changedFiles = ['src/test/java/com/japaneselearning/learning/controller/JwtAuthenticationTest.java', 'src/test/resources/application.properties'];
  for (const name of changedFiles) {
    const normalize = dir => fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
    if (normalize(consumer) !== normalize(reference)) throw Error('Installed consumer patch differs from validated candidate');
  }
  report.after = { parentHead: git(parent, ['rev-parse', 'HEAD']), consumerHead: git(consumer, ['rev-parse', 'HEAD']), parentStatus: git(parent, ['status', '--porcelain=v1']), consumerStatus: git(consumer, ['status', '--porcelain=v1']), changedFiles,
    overlay: { file: parent + '/compose.jwks-owner-consumer.yml', sha256: hash(fs.readFileSync(parent + '/compose.jwks-owner-consumer.yml')) }, mainUnchanged: true, indexUnchanged: true, validatedCandidateContentMatches: true };
  report.status = 'APPLIED_SOURCE_ONLY';
} catch (error) { report.status = 'PARTIAL'; report.error = error.message; process.exitCode = 1; }
report.finishedUtc = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, after: report.after, error: report.error }));
