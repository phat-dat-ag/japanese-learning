'use strict';
// Read-only readiness inventory. Reuses P08 Docker access; never starts services.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const runtime = require('../../p08/runtime.cjs');
const manifest = require('./manifest.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function run(bin, args) {
  const r = cp.spawnSync(bin, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw Error('Read-only command unavailable: ' + bin + ' ' + args[0]);
  return r.stdout.trim();
}
function attempt(fn) {
  try { return { status: 'PASS', actual: fn() }; }
  catch (e) { return { status: 'NOT VERIFIED', reason: e.message }; }
}
function git(dir, args) { return run('git', ['-c', 'safe.directory=' + dir.replaceAll('\\', '/'), '-C', dir, ...args]); }
function identity(dir) {
  return { head: git(dir, ['rev-parse', 'HEAD']), branch: git(dir, ['branch', '--show-current']),
    status: git(dir, ['status', '--porcelain=v1']), headGitlinks: git(dir, ['ls-tree', 'HEAD', ...['angular', 'dotnet', 'quarkus', 'springboot-jwks-api']]),
    indexGitlinks: git(dir, ['ls-files', '--stage', ...['angular', 'dotnet', 'quarkus', 'springboot-jwks-api']]),
    jwks: { head: git(path.join(dir, 'springboot-jwks-api'), ['rev-parse', 'HEAD']),
      status: git(path.join(dir, 'springboot-jwks-api'), ['status', '--porcelain=v1']),
      tracking: git(path.join(dir, 'springboot-jwks-api'), ['rev-parse', 'refs/remotes/origin/develop']) } };
}
function inventory() {
  return runtime.docker(['ps', '-aq', '--no-trunc']).split(/\s+/).filter(Boolean).sort().map(id =>
    JSON.parse(runtime.docker(['inspect', '--format', '{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},"started":{{json .State.StartedAt}},"state":{{json .State.Status}},"restarts":{{json .RestartCount}},"mounts":{{json .Mounts}}}', id])));
}
function backups() {
  return fs.readdirSync('D:/JapaneseLearningBackups').sort().filter(n => /^p08-local-[a-f0-9]{32}\.enc$/.test(n)).map(n => {
    const p = path.join('D:/JapaneseLearningBackups', n), s = fs.lstatSync(p);
    if (!s.isFile() || s.isSymbolicLink()) throw Error('Unexpected backup file type');
    return { file: n, bytes: s.size, mtimeMs: s.mtimeMs, sha256: hash(fs.readFileSync(p)) };
  });
}
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const runId = 'p11_review_' + stamp + '_' + crypto.randomBytes(4).toString('hex');
const dir = path.join(root, '.local', runId);
fs.mkdirSync(dir, { recursive: true });
const before = { runtime: attempt(inventory), backups: attempt(backups), parent: identity(root) };
const compose = attempt(() => {
  const model = JSON.parse(runtime.docker(['compose', '-p', 'jp_learning_dev', '-f', 'docker-compose.yml', 'config', '--format', 'json']));
  // Never save resolved environments, commands or credential-bearing model content.
  return Object.entries(model.services).map(([service, s]) => ({ service, image: s.image || null,
    ports: (s.ports || []).map(p => ({ host: p.host_ip || null, published: p.published, target: p.target })),
    networks: Object.keys(s.networks || {}), volumes: (s.volumes || []).map(v => ({ type: v.type, target: v.target, readOnly: !!v.read_only })) }));
});
const manifests = ['observability/roadmap/p09-validation/evidence/manifest.json',
  'observability/roadmap/p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/manifest.json'];
const integrity = manifests.map(file => {
  const result = attempt(() => {
    const r = manifest.inspect(root, file);
    return { pass: r.strictPass, count: r.artifacts.length, mismatches: r.artifacts.filter(a => !a.strictPass),
      classifications: r.artifacts.reduce((counts, a) => ({ ...counts, [a.kind]: (counts[a.kind] || 0) + 1 }), {}),
      explanation: 'Reconstructed line endings are diagnostic only; strict release byte-integrity remains mandatory' };
  });
  if (result.status === 'PASS' && !result.actual.pass) result.status = 'FAIL';
  return { file, ...result };
});
const sourceFiles = git(root, ['ls-files', 'docker-compose.yml', 'compose.*.yml', 'observability', 'deployment', 'scripts']).split('\n')
  .filter(f => f && !f.startsWith('observability/roadmap/') && !/\.enc$/.test(f));
const sources = sourceFiles.map(file => ({ file, sha256: hash(fs.readFileSync(file)) }));
const after = { runtime: attempt(inventory), backups: attempt(backups), parent: identity(root) };
function comparison(key) {
  if (before[key].status !== 'PASS' || after[key].status !== 'PASS') return { status: 'NOT VERIFIED', reason: 'Both snapshots required' };
  const pass = JSON.stringify(before[key].actual) === JSON.stringify(after[key].actual);
  return { status: pass ? 'PASS' : 'FAIL', expected: 'Identical before/after inventory', actual: pass };
}
const report = { phase: 'P11', status: 'PARTIAL', project: 'jp_learning_dev', runId, utc: new Date().toISOString(),
  scope: 'Read-only source/development review; no production acceptance', tools: { node: process.version, git: run('git', ['--version']), compose: attempt(() => runtime.docker(['compose', 'version', '--short'])) },
  operator: 'Codex under user P11 instruction; no production owner/signoff assigned', before, after, compose, integrity, sources,
  secondParent: attempt(() => identity('D:/springboot-project')),
  preservation: { runtime: comparison('runtime'), encryptedBackups: comparison('backups'), revisions: before.parent.head === after.parent.head && before.parent.indexGitlinks === after.parent.indexGitlinks && before.parent.jwks.head === after.parent.jwks.head },
  production: { status: 'BLOCKED', reason: 'No production authorization, named owners, host-specific evidence or business signoff' },
  workload: 'No generated load, fault, restore, lifecycle or notification operation', rollback: 'No runtime changes; remove only P11 documentation/review files if rejected',
  privacy: 'Only hashes, Git metadata and selected nonsecret Compose/runtime fields; no keys, env values or telemetry payloads',
  commands: ['node observability/roadmap/p11-validation/review.cjs', 'git read-only metadata commands', 'docker compose config --format json (filtered in memory)', 'docker ps/inspect (selective metadata)'],
  limitations: ['Source manifest is a candidate fingerprint, not an approved production release or rebuild proof', 'Encrypted backup hashes do not establish authentication, freshness or recoverability', 'Existing P10 native recovery evidence retained; no fresh drill executed', 'Schedules, live access/TLS/capacity/ingestion/alerts and full security/privacy/compatibility regression remain NOT VERIFIED'] };
const output = path.join(dir, 'review.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: hash(fs.readFileSync(output)), compose: compose.status,
  integrity: integrity.map(i => ({ file: i.file, status: i.status, checked: i.actual?.count, mismatches: i.actual?.mismatches.length })),
  preservation: report.preservation, secondParent: report.secondParent.status }));
if (integrity.some(i => i.status !== 'PASS' || !i.actual.pass) || Object.values(report.preservation).some(v => v?.status === 'FAIL')) process.exitCode = 1;
