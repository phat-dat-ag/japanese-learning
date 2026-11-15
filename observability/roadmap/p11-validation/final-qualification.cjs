'use strict';
// Offline lock/build qualification only. No test assembly loading or runtime lifecycle actions.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = path.join(root, '.local/p11-final-acceptance-20261115');
const expected = 'bbbab2f4dc80c0275152d4bf008f52b75c5778d6';
const hash = (b, algorithm = 'sha256', encoding = 'hex') => crypto.createHash(algorithm).update(b).digest(encoding);
const write = (file, value) => fs.writeFileSync(path.join(base, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function git(args) {
  const q = cp.spawnSync('git', ['-C', 'dotnet', ...args], { encoding: 'utf8' });
  if (q.status !== 0) throw Error('Git metadata operation failed');
  return q.stdout.trim();
}
function tree(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const file = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw Error('Artifact link rejected');
    return e.isDirectory() ? tree(file) : [{ file, sha256: hash(fs.readFileSync(file)), bytes: fs.statSync(file).size }];
  });
}
function sdk(args, cwd, name) {
  const log = path.join(base, name + '.log');
  const fd = fs.openSync(log, 'wx');
  const startedUtc = new Date().toISOString();
  const q = cp.spawnSync('dotnet', args, { cwd, timeout: 600000,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1', DOTNET_CLI_HOME: path.join(base, 'sdk-home') }, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const result = { args, cwd, startedUtc, finishedUtc: new Date().toISOString(), exitCode: q.status, error: q.error?.code || null, logSha256: hash(fs.readFileSync(log)) };
  write(name + '.json', result);
  if (q.status !== 0) throw Error('Offline SDK operation failed; retained log: ' + name);
  return result;
}
function extract(label) {
  const archive = path.join(root, '.local/p11-rc-20261115/dotnet.tar');
  if (hash(fs.readFileSync(archive)) !== 'a6acda64b859a80d9ed79df42cabf680149cbf4edb944391e8c1b6e85a191b2a') throw Error('Source archive drift');
  const dir = path.join(base, label);
  fs.mkdirSync(dir);
  const q = cp.spawnSync('tar', ['-xf', archive, '-C', dir]);
  if (q.status !== 0) throw Error('Extraction failed');
  return dir;
}
const action = process.argv[2];
if (git(['rev-parse', 'HEAD']) !== expected) throw Error('Source revision changed');
if (action === 'locks') {
  if (git(['status', '--porcelain'])) throw Error('Preserve dirty .NET tree; review first');
  const assets = JSON.parse(fs.readFileSync('.local/p11-rc-20261115/dotnet-b/tests/JapaneseLearning.User.UnitTests/obj/project.assets.json'));
  const feed = path.join(base, 'feed');
  if (!fs.existsSync(feed)) fs.mkdirSync(feed);
  if (fs.readdirSync(feed).length) throw Error('Preserve populated prior feed');
  const packages = [];
  for (const [identity, library] of Object.entries(assets.libraries).filter(([, l]) => l.type === 'package')) {
    const relative = library.path;
    const name = relative.split('/')[0] + '.' + relative.split('/')[1] + '.nupkg';
    const candidate = Object.keys(assets.packageFolders).map(p => path.join(p, relative, name)).find(p => fs.existsSync(p));
    if (!candidate) throw Error('Required cached archive absent: ' + identity);
    const bytes = fs.readFileSync(candidate);
    const rawSha512 = fs.readFileSync(candidate + '.sha512', 'utf8').trim();
    const metadata = JSON.parse(fs.readFileSync(path.join(path.dirname(candidate), '.nupkg.metadata')));
    // NuGet contentHash excludes package signatures; archive SHA512 includes them.
    if (hash(bytes, 'sha512', 'base64') !== rawSha512 || metadata.contentHash !== library.sha512) throw Error('Cached package integrity mismatch: ' + identity);
    fs.copyFileSync(candidate, path.join(feed, name), fs.constants.COPYFILE_EXCL);
    packages.push({ identity, contentHash: library.sha512, archiveSha512: rawSha512, sha256: hash(bytes), bytes: bytes.length });
  }
  write('packages.json', { scope: 'Existing Windows restore closure; package bytes verified, vulnerability/Linux qualification not implied', packages });
  const dir = extract('lock-candidate');
  fs.writeFileSync(path.join(dir, 'global.json'), JSON.stringify({ sdk: { version: '9.0.317', rollForward: 'disable', allowPrerelease: false } }, null, 2) + '\n');
  const config = path.join(base, 'NuGet.offline.config');
  fs.writeFileSync(config, '<configuration><packageSources><clear/><add key="approved-existing-cache-copy" value="' + feed.replaceAll('\\', '/') + '"/></packageSources></configuration>');
  const common = ['JapaneseLearning.User.sln', '--configfile', config, '--packages', path.join(base, 'packages'), '-p:NuGetAudit=false'];
  sdk(['restore', ...common, '-p:RestorePackagesWithLockFile=true'], dir, 'lock-restore');
  const restored = JSON.parse(fs.readFileSync(path.join(dir, 'tests/JapaneseLearning.User.UnitTests/obj/project.assets.json')));
  if (packages.some(p => restored.libraries[p.identity]?.sha512 !== p.contentHash)) throw Error('Fresh restored content differs from prior baseline');
  const locks = tree(dir).filter(f => f.file.endsWith('packages.lock.json'));
  if (locks.length !== 5) throw Error('Require one lock per solution project');
  const before = locks.map(f => ({ file: path.relative(dir, f.file), sha256: f.sha256 }));
  sdk(['restore', ...common, '--locked-mode', '--force-evaluate'], dir, 'lock-recheck');
  if (before.some(f => hash(fs.readFileSync(path.join(dir, f.file))) !== f.sha256)) throw Error('Locked restore changed locks');
  write('lock-candidate.json', { source: expected, sdk: '9.0.317', packages: packages.length, locks: before, downloaded: false, testsExecuted: false, installed: false });
  console.log(JSON.stringify({ packages: packages.length, lockFiles: before, lockedRestore: 'PASS', installed: false }));
} else if (action === 'install-locks') {
  if (git(['status', '--porcelain'])) throw Error('Preserve unexpected .NET changes');
  const candidate = JSON.parse(fs.readFileSync(path.join(base, 'lock-candidate.json')));
  const files = ['global.json', ...candidate.locks.map(f => f.file)];
  for (const file of files) if (fs.existsSync(path.join('dotnet', file))) throw Error('Refuse overwriting existing file');
  const records = [];
  for (const file of files) {
    const source = path.join(base, 'lock-candidate', file);
    fs.copyFileSync(source, path.join('dotnet', file), fs.constants.COPYFILE_EXCL);
    records.push({ file: file.replaceAll('\\', '/'), sha256: hash(fs.readFileSync(source)) });
  }
  write('lock-installation.json', { source: expected, files: records, originalTrackedFilesUnchanged: !git(['diff', '--name-only']), staged: false });
  console.log(JSON.stringify({ files: records.length, source: expected, runtimeChanged: false }));
} else if (action === 'build') {
  const label = process.argv[3];
  if (!/^[ab]$/.test(label)) throw Error('Invalid build label');
  const dir = extract('build-' + label);
  const installed = JSON.parse(fs.readFileSync(path.join(base, 'lock-installation.json')));
  for (const f of installed.files) {
    const source = path.join(root, 'dotnet', f.file);
    if (hash(fs.readFileSync(source)) !== f.sha256) throw Error('Pin file drift');
    fs.copyFileSync(source, path.join(dir, f.file), fs.constants.COPYFILE_EXCL);
  }
  sdk(['restore', 'JapaneseLearning.User.sln', '--locked-mode', '--configfile', path.join(base, 'NuGet.offline.config'), '--packages', path.join(base, 'packages'), '-p:NuGetAudit=false'], dir, 'build-' + label + '-restore');
  const publish = path.join(dir, 'publish');
  sdk(['publish', 'src/JapaneseLearning.User.Api/JapaneseLearning.User.Api.csproj', '-c', 'Release', '--no-restore', '-o', publish,
    '-p:UseAppHost=false', '-p:UseSharedCompilation=false', '-p:ContinuousIntegrationBuild=true', '-p:SourceRevisionId=' + expected, '-p:PathMap=' + dir + '=/_/', '-m:1', '--nologo'], dir, 'build-' + label);
  const artifacts = tree(publish).map(f => ({ ...f, file: path.relative(publish, f.file).replaceAll('\\', '/') })).sort((a, b) => a.file.localeCompare(b.file));
  write('build-' + label + '-artifacts.json', { source: expected, pinOverlay: installed.files, root: publish, artifacts, executed: false });
  console.log(JSON.stringify({ label, artifacts: artifacts.length, publishOnly: true, testsExecuted: false }));
} else if (action === 'pin-package') {
  const installed = JSON.parse(fs.readFileSync(path.join(base, 'lock-installation.json')));
  const archive = path.join(base, 'dotnet-pins.tar');
  if (fs.existsSync(archive)) throw Error('Preserve prior pin package');
  const q = cp.spawnSync('tar', ['-cf', archive, '-C', path.join(root, 'dotnet'), ...installed.files.map(f => f.file)]);
  if (q.status !== 0) throw Error('Pin archive failed');
  const dir = extract('pin-package-check');
  const extracted = cp.spawnSync('tar', ['-xf', archive, '-C', dir]);
  if (extracted.status !== 0) throw Error('Pin package extraction failed');
  const pass = installed.files.every(f => hash(fs.readFileSync(path.join(dir, f.file))) === f.sha256);
  write('pin-package.json', { file: archive, sha256: hash(fs.readFileSync(archive)), bytes: fs.statSync(archive).size, pass, files: installed.files,
    scope: 'Exact-byte configuration transfer package; Git review patch may normalize line endings, tar preserves bytes' });
  console.log(JSON.stringify({ exactPinPackage: pass, sha256: hash(fs.readFileSync(archive)), files: installed.files.length }));
  if (!pass) process.exitCode = 1;
} else if (action === 'patch-check') {
  const review = JSON.parse(fs.readFileSync(path.join(base, 'review.json')));
  if (hash(fs.readFileSync(review.pinPatch.file)) !== review.pinPatch.sha256) throw Error('Pin patch drift');
  const dir = extract(process.argv[3] || 'patch-check');
  for (const args of [['apply', '--check', review.pinPatch.file], ['apply', review.pinPatch.file]]) {
    const q = cp.spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    if (q.status !== 0) throw Error('Pin overlay not applicable to base archive');
  }
  const pass = review.pinOverlay.every(f => hash(fs.readFileSync(path.join(dir, f.file))) === f.sha256);
  write('patch-check.json', { pass, files: review.pinOverlay.length, patchSha256: review.pinPatch.sha256, source: expected });
  console.log(JSON.stringify({ pinOverlayApplicableAndExact: pass }));
  if (!pass) process.exitCode = 1;
} else if (action === 'key-baseline' || action === 'key-finish') {
  const technical = JSON.parse(fs.readFileSync(path.join(base, 'technical.json')));
  const sources = [...new Set(technical.before.containers.flatMap(c => c.mounts.filter(m => m.Type === 'bind' && !m.RW && m.Destination === '/run/keys/jwt').map(m => m.Source)))];
  const fingerprints = sources.map(source => ({ source, files: tree(source).map(f => ({ file: path.relative(source, f.file), sha256: f.sha256, bytes: f.bytes })) }));
  if (action === 'key-baseline') {
    write('signing-key-baseline.json', { capturedUtc: new Date().toISOString(), scope: 'Hash-only reads of existing read-only JWT bind; no parsing/copying/key changes', fingerprints });
    console.log(JSON.stringify({ directories: sources.length, files: fingerprints.reduce((n, s) => n + s.files.length, 0) }));
  } else {
    const prior = JSON.parse(fs.readFileSync(path.join(base, 'signing-key-baseline.json')));
    const pass = JSON.stringify(prior.fingerprints) === JSON.stringify(fingerprints);
    write('signing-key-preservation.json', { pass, directories: sources.length, files: fingerprints.reduce((n, s) => n + s.files.length, 0), scope: 'Observed JWT bind files only; not an all-host key custody audit' });
    console.log(JSON.stringify({ keyFingerprintsUnchanged: pass }));
    if (!pass) process.exitCode = 1;
  }
} else if (action === 'review') {
  const a = JSON.parse(fs.readFileSync(path.join(base, 'build-a-artifacts.json')));
  const b = JSON.parse(fs.readFileSync(path.join(base, 'build-b-artifacts.json')));
  const equal = JSON.stringify(a.artifacts) === JSON.stringify(b.artifacts);
  const patch = [];
  for (const f of a.pinOverlay) {
    const q = cp.spawnSync('git', ['diff', '--no-index', '--', '/dev/null', f.file], { cwd: path.join(root, 'dotnet'), encoding: 'utf8' });
    if (q.status !== 1) throw Error('Expected new pin file diff');
    patch.push(q.stdout);
  }
  const pinPatch = path.join(base, 'dotnet-pins.patch');
  fs.writeFileSync(pinPatch, patch.join(''), { flag: 'wx' });
  const { inspect } = require('./manifest.cjs');
  const historical = ['observability/roadmap/p09-validation/evidence/manifest.json', 'observability/roadmap/p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/manifest.json'].map(file => inspect(root, file));
  const reports = fs.readdirSync('observability/roadmap').filter(f => /^p11.*\.md$/.test(f)).map(name => {
    const file = 'observability/roadmap/' + name;
    return { file, sha256: hash(fs.readFileSync(file)) };
  });
  const privacyFiles = ['observability/roadmap/p11-validation', ...reports.map(r => r.file), ...a.pinOverlay.map(f => 'dotnet/' + f.file)].flatMap(p => fs.statSync(p).isDirectory() ? tree(p).map(x => x.file) : [p]);
  const leaks = privacyFiles.filter(file => {
    const text = fs.readFileSync(file, 'utf8');
    return /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32}/.test(text) || /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(text);
  }).map(file => path.relative(root, path.resolve(file)));
  const ignored = cp.spawnSync('git', ['check-ignore', '-q', 'observability/local-test-credentials.json']).status === 0;
  const tracked = cp.spawnSync('git', ['ls-files', '--error-unmatch', 'observability/local-test-credentials.json'], { stdio: 'ignore' }).status === 0;
  const report = { candidateReproduction: { pass: equal, artifacts: a.artifacts.length, sameHostOnly: true, executed: false },
    source: expected, sdk: '9.0.317', pinOverlay: a.pinOverlay, pinPatch: { file: pinPatch, sha256: hash(fs.readFileSync(pinPatch)) },
    builds: { a, b }, historical, reportsReviewed: reports,
    privacy: { scannedFiles: privacyFiles.length, findings: leaks, credentialsIgnored: ignored, credentialsTracked: tracked, limitation: 'Bounded pattern scan; not a complete secret/custody review; credential values not read' },
    limitations: ['Fresh regression blocked by policy; no approved independent environment', 'Locked Windows native build is not Linux/OCI qualification or vulnerability assessment', 'No new release authorization or shared deployment'] };
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  const sha = hash(bytes);
  fs.writeFileSync(path.join(base, 'release-manifest-' + sha + '.json'), bytes, { flag: 'wx' });
  write('review.json', { ...report, builds: undefined, immutableManifest: { file: path.join(base, 'release-manifest-' + sha + '.json'), sha256: sha } });
  console.log(JSON.stringify({ reproduction: report.candidateReproduction, privacy: report.privacy, historical: historical.map(h => ({ file: h.file, strictPass: h.strictPass, exact: h.artifacts.filter(f => f.strictPass).length, discrepancies: h.artifacts.filter(f => !f.strictPass).length })), manifestSha256: sha }));
  if (!equal || leaks.length || !ignored || tracked) process.exitCode = 1;
} else if (action === 'finalize') {
  const technicalFile = path.join(base, 'technical.json');
  const technical = JSON.parse(fs.readFileSync(technicalFile));
  const keys = JSON.parse(fs.readFileSync(path.join(base, 'signing-key-preservation.json')));
  const review = JSON.parse(fs.readFileSync(path.join(base, 'review.json')));
  const packageRecord = JSON.parse(fs.readFileSync(path.join(base, 'pin-package.json')));
  const independent = JSON.parse(fs.readFileSync(path.join(base, 'independent-hashes.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!technical.preservation || Object.values(technical.preservation).some(v => !v) || !keys.pass || !packageRecord.pass || independent.failed) throw Error('Preservation/package/hash gate failed');
  const adoption = JSON.parse(fs.readFileSync('.local/p11-spring-adoption-20261115/adoption.json'));
  const spring = 'D:/springboot-project';
  const springGit = args => {
    const q = cp.spawnSync('git', ['-c', 'safe.directory=' + spring, '-C', spring, ...args], { encoding: 'utf8' });
    if (q.status !== 0) throw Error('Spring read-only identity check failed');
    return q.stdout.trim();
  };
  const springPreserved = springGit(['rev-parse', 'HEAD']) === adoption.before.parentHead && springGit(['ls-files', '--stage']) === adoption.before.parentIndex && hash(fs.readFileSync(spring + '/compose.jwks-owner-consumer.yml')) === adoption.after.overlay.sha256 && adoption.before.main.every(f => hash(fs.readFileSync(path.join(spring, 'springboot-learning-api/src/main', f.file))) === f.sha256);
  if (!springPreserved || git(['diff', '--name-only'])) throw Error('Unexpected protected source/index change');
  const readinessFile = 'observability/roadmap/p11-readiness.md';
  const readiness = fs.readFileSync(readinessFile, 'utf8');
  const matrix = readiness.split('\n').filter(l => /^\| P11-\d\d \|/.test(l)).map(line => {
    const c = line.split('|').slice(1, -1).map(s => s.trim());
    if (c.length !== 8 || !['PASS', 'FAIL', 'BLOCKED', 'NOT VERIFIED'].includes(c[4])) throw Error('Invalid acceptance matrix');
    return { id: c[0], exactCriterion: c[1], existingEvidence: c[2], verificationMethod: c[3], status: c[4], remainingAction: c[5], authority: c[6], local: c[7] };
  });
  if (matrix.length !== 20 || new Set(matrix.map(m => m.id)).size !== 20) throw Error('Incomplete definitive matrix');
  const specFile = 'observability/roadmap/p11-validation/dotnet-environment.json';
  const oldSpec = fs.readFileSync(specFile);
  fs.writeFileSync(path.join(base, 'environment-before-' + hash(oldSpec) + '.json'), oldSpec, { flag: 'wx' });
  const spec = JSON.parse(oldSpec);
  spec.currentPinOverlay = { baseCommit: expected, files: review.pinOverlay, package: packageRecord, qualification: 'Windows offline locked restore and native publish only; independent execution still BLOCKED' };
  spec.limitations = ['Linux/platform dependency closure and security provenance remain unqualified', 'No approved independent runner or artifact custody workflow', 'No test image/workload executed', '151 remains static source-derived inventory; no runtime substitution'];
  fs.writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n');
  const acceptanceFile = 'observability/roadmap/p11-validation/acceptance.json';
  const previous = fs.readFileSync(acceptanceFile);
  fs.writeFileSync(path.join(base, 'acceptance-before-' + hash(previous) + '.json'), previous, { flag: 'wx' });
  const acceptance = JSON.parse(previous);
  acceptance.scope = 'Final authoritative P11 gap matrix; local SDK/dependency locking, offline native builds and preservation; no production acceptance';
  acceptance.authority = 'User P11 Final Technical Closure and Production Acceptance; safe local work only, no new environment/security/runtime deployment approval';
  acceptance.status = 'PARTIAL'; acceptance.productionStatus = 'BLOCKED';
  acceptance.checks.localSdkDependencyLocking = 'PASS: six new configuration files;168 cached package archives; fresh offline restore and unchanged locked re-restore; no downloads/tests';
  acceptance.checks.localLockedNativeReproduction = 'PASS:101 identical A/B files and202 independent SHA256 checks; same Windows host only';
  acceptance.checks.springScratchBuildOverlayProvenance = 'FAIL: historical scratch build skipped test overlay through parent Git discovery; main source/JAR and actual checkout25/25 unaffected; helper corrected, historical receipt preserved';
  acceptance.checks.productionImmutableReleaseQualification = 'NOT VERIFIED: uncommitted pin/source overlays, independent Linux OCI/dependency/custody qualification and approvals absent';
  acceptance.checks.freshDotnetCompleteRegression = 'BLOCKED: no approved independent environment;151 source-derived cases; latest executed selected cohort14 passed/65 policy failures';
  acceptance.definitiveMatrix = { source: readinessFile, sha256: hash(fs.readFileSync(readinessFile)), requirements: matrix };
  acceptance.finalLocalClosure = { previousAcceptanceSha256: hash(previous), source: expected, pinOverlay: review.pinOverlay,
    minimumPinPackage: packageRecord, candidateManifest: review.immutableManifest, independentHashes: independent,
    candidateReproduction: review.candidateReproduction, localTests: '23/23 wrapper/manifest/backup-package checks PASS;9 result-gate checks PASS; not .NET runtime tests',
    provenanceCorrections: ['Raw signed package SHA512 differs from signature-normalized NuGet contentHash; initial comparison corrected before staging', 'Ignored scratch Git discovery skipped initial patch attempt; review patch line endings can also change global.json bytes; exact six-file tar transfer verifies all hashes', 'Earlier Spring native scratch overlay was not materialized; no historical receipt rewritten, production main/JAR unaffected'],
    preservation: { file: technicalFile, sha256: hash(fs.readFileSync(technicalFile)), ...technical.preservation, observedJwtFileHashes: keys, springOriginalMainIndexOverlay: springPreserved },
    dataLimits: 'Database/container/mount health and telemetry continuity only; no byte-identical active business rows/history claim',
    approvals: 'Named security/test environment, release/custody, both-parent adoption, production host, backup/recovery, deployment/rollback/handover and business approvals absent',
    noRuntimeMigration: true, noCommitPushMerge: true };
  fs.writeFileSync(acceptanceFile, JSON.stringify(acceptance, null, 2) + '\n');
  const summary = '## Final local P11 closure review — 2026-11-15\n\n**P11 PARTIAL; production BLOCKED;11/12.** The [definitive20-requirement matrix](p11-readiness.md) preserves every original mandatory gate and names missing decisions. Local SDK9.0.317 plus five NuGet lockfiles now restore offline from168 existing packages; two publishes match101 files and202 independent hashes.23 local regression checks and9 result-gate checks pass. Full151-case .NET execution remains BLOCKED by policy with no approved independent runner. Historical patch-provenance/byte-check failures are retained; exact six-file transfer package and corrected scratch patch handling are documented. All52 containers/25 volumes/three backups/tasks/revisions and observed JWT file hashes compare unchanged; active DB/telemetry bytes are not claimed identical. Shared pins/overlay stay unchanged/inactive. Production host/security/recovery, tested rollback/handover and accountable business/release approvals remain absent.\n\n';
  for (const name of ['p11-verification.md', 'implementation-roadmap.md']) {
    const file = 'observability/roadmap/' + name;
    fs.writeFileSync(file, summary + fs.readFileSync(file, 'utf8'));
  }
  write('final-results.json', { matrixStatuses: matrix.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), status: 'PARTIAL', productionStatus: 'BLOCKED', preservation: technical.preservation, keys, springPreserved, independent });
  console.log(JSON.stringify({ status: 'PARTIAL', matrixRequirements: matrix.length, springPreserved, pinPackageSha256: packageRecord.sha256, preservation: technical.preservation }));
} else if (action === 'close-records') {
  const corrected = JSON.parse(fs.readFileSync(path.join(base, 'spring-corrected/build-a.json')));
  const independent = JSON.parse(fs.readFileSync(path.join(base, 'spring-corrected/independent-hash.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (corrected.exitCode !== 0 || !independent.pass || !independent.matchesPriorArtifact) throw Error('Corrected Spring build not verified');
  const readinessFile = 'observability/roadmap/p11-readiness.md';
  let readiness = fs.readFileSync(readinessFile, 'utf8');
  readiness = readiness.replace('Historical manifests are untouched. Initial .NET patch transfer', 'A fresh corrected scratch build now verifies both installed test files before packaging and independently reproduces the same JAR SHA256 `a0314c68cd015789707ed84f443e46244a86f697c1b218d51a7c8f95ffdb69bd`. This closes the current helper/input finding; the earlier false provenance claim remains a historical FAIL. Historical manifests are untouched. Initial .NET patch transfer');
  fs.writeFileSync(readinessFile, readiness);
  const extra = '\nCorrected Spring scratch verification: `spring-release.cjs build a .local/p11-final-acceptance-20261115/spring-corrected` materializes and compares both test files before packaging. Build succeeds; independent SHA256 matches the prior66,322,391-byte JAR. Historical skipped-overlay provenance remains recorded as FAIL; current helper/input verification PASS. Private corrected build/hash receipts supplement the earlier frozen manifests.\n';
  fs.appendFileSync('observability/roadmap/p11-verification.md', extra);
  for (const name of ['p11-readiness.md', 'p11-verification.md', 'implementation-roadmap.md', 'p11-dotnet-environment.md']) {
    const file = 'observability/roadmap/' + name;
    let text = fs.readFileSync(file, 'utf8');
    for (const [a, b] of [['definitive20', 'definitive 20'], ['BLOCKED;11/12', 'BLOCKED; 11/12'], ['from168', 'from 168'], ['match101', 'match 101'], ['and202', 'and 202'], ['.23 local', '. 23 local'], ['and9 result', 'and 9 result'], ['Full151', 'Full 151'], ['All52', 'All 52'], ['containers/25', 'containers / 25'], ['volumes/three', 'volumes / three'], ['prior66', 'prior 66']]) text = text.replaceAll(a, b);
    fs.writeFileSync(file, text);
  }
  const acceptanceFile = 'observability/roadmap/p11-validation/acceptance.json';
  const previous = fs.readFileSync(acceptanceFile);
  fs.writeFileSync(path.join(base, 'acceptance-before-' + hash(previous) + '.json'), previous, { flag: 'wx' });
  const acceptance = JSON.parse(previous);
  acceptance.checks.springScratchBuildOverlayProvenance = 'PASS current corrected build: installed test files checked and same native JAR independently verified; prior skipped-overlay claim retained as historical FAIL';
  acceptance.finalLocalClosure.springCorrection = { file: 'spring-corrected/build-a.json', sha256: hash(fs.readFileSync(path.join(base, 'spring-corrected/build-a.json'))), independent };
  const runtimeFile = path.join(base, 'technical.json');
  acceptance.finalLocalClosure.preservation.sha256 = hash(fs.readFileSync(runtimeFile));
  const specFile = 'observability/roadmap/p11-validation/dotnet-environment.json';
  acceptance.dotnetEnvironmentQualification.specification.sha256 = hash(fs.readFileSync(specFile));
  acceptance.finalLocalClosure.currentEnvironmentSpecification = { file: specFile, sha256: hash(fs.readFileSync(specFile)), scope: '151-case source inventory plus exact uncommitted SDK/lock overlay; execution blocked' };
  acceptance.definitiveMatrix.sha256 = hash(fs.readFileSync(readinessFile));
  fs.writeFileSync(acceptanceFile, JSON.stringify(acceptance, null, 2) + '\n');
  const documents = fs.readdirSync('observability/roadmap').filter(n => /^p11.*\.md$/.test(n));
  const badLinks = [];
  for (const name of documents) {
    const file = 'observability/roadmap/' + name;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:|^#/.test(m[1])) continue;
      const target = m[1].split('#')[0];
      if (target && !fs.existsSync(path.resolve(path.dirname(file), target))) badLinks.push({ file, target });
    }
  }
  write('document-check.json', { documents: documents.length, badLinks, syntax: 'Separate node --check commands', scope: 'Local file existence; external links and heading anchors not certified' });
  console.log(JSON.stringify({ status: 'PARTIAL', documents: documents.length, badLinks, springCorrectedBuild: 'PASS' }));
  if (badLinks.length) process.exitCode = 1;
} else throw Error('Unknown qualification action');
