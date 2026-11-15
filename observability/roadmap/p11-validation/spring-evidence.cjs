'use strict';
// Freeze a new candidate manifest; preserve earlier release and acceptance evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.local/p11-spring-adoption-20261115');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(base, name + '.json'), 'utf8'));
const a = read('build-a'), b = read('build-b');
const report = { phase: 'P11', status: 'PARTIAL', productionStatus: 'BLOCKED', createdUtc: new Date().toISOString(),
  adoption: read('adoption'), compose: read('compose'),
  tests: Object.fromEntries(['learning-regression', 'user-regression', 'jwks-user-context', 'quarkus-regression', 'dotnet-restored'].map(n => [n, read(n)])),
  builds: { a, b }, independentHashes: read('independent-hashes'), preservation: read('technical').preservation,
  reproduction: a.exitCode === 0 && b.exitCode === 0 && a.artifacts[0].sha256 === b.artifacts[0].sha256,
  limitations: ['Uncommitted base revision plus exact test patch; not an approved committed release', 'Same host/cache/toolchain only; no Linux OCI or independent-host build', 'Existing unlocked dependency/toolchain/base-image inputs remain', 'Fresh .NET execution blocked by Application Control; no bypass', 'Owner overlay inactive; old Spring publisher pin retained', 'Production authorization, independent review, custody, host/TLS/capacity, rollback and business signoff absent'] };
const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
const sha256 = hash(bytes);
const file = path.join(base, 'release-manifest-' + sha256 + '.json');
fs.writeFileSync(file, bytes, { flag: 'wx' });
const summary = { phase: 'P11', status: 'PARTIAL', productionStatus: 'BLOCKED',
  immutableIdentity: { file: path.relative(root, file).replaceAll('\\', '/'), sha256, mechanism: 'Create-only content-addressed local evidence; not signed/WORM storage' },
  springParent: report.adoption.after.parentHead, springLearning: a.sha,
  jwksJapanese: report.adoption.before.japaneseJwks, jwksSpring: report.adoption.before.springJwks,
  sourceArchiveSha256: a.sourceArchiveSha256, testPatchSha256: a.testDiffSha256,
  artifacts: a.artifacts.map(x => ({ ...x, file: path.relative(root, x.file).replaceAll('\\', '/') })),
  sameHostReproduction: report.reproduction, independentHashes: report.independentHashes,
  tests: Object.fromEntries(Object.entries(report.tests).map(([n, r]) => [n, { pass: r.pass, exitCode: r.exitCode, tests: r.tests ?? r.counts }])),
  preservation: report.preservation, limitations: report.limitations };
fs.writeFileSync(path.join(root, 'observability/roadmap/p11-validation/spring-release-manifest.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
const acceptance = path.join(root, 'observability/roadmap/p11-validation/acceptance.json');
const previous = fs.readFileSync(acceptance);
const previousSha = hash(previous);
fs.writeFileSync(path.join(base, 'acceptance-before-' + previousSha + '.json'), previous, { flag: 'wx' });
const next = JSON.parse(previous);
next.scope = 'Spring source-only opt-in consumer migration adopted; regression and local candidate artifact verification; no deployment';
next.authority = 'User P11 Spring JWKS Migration and Cross-Repository Regression; cross-workspace writes separately approved';
next.checks.springConsumerOwnerPathCandidate = 'PASS: adopted opt-in two-field overlay; legacy base unchanged; no activation';
next.checks.springAuthorityOrderCandidate = 'PASS: actual checkout complete affected suite 25/25; expected-role membership and opposite-role exclusion';
next.checks.springProtectedCheckoutAdoption = 'PASS: exact validated patch applied, 28 production source files/index/gitlinks unchanged';
next.checks.freshCrossRepositoryRegression = 'PARTIAL: Spring Learning25/User26/JWKS21/Quarkus21 PASS; .NET14 passed/65 failed with Application Control and discovery errors, expected81 not met';
next.checks.dualConsumerRuntimeCompatibility = 'PARTIAL: isolated Spring owner candidate44/44 and unchanged Japanese live token proof PASS; deployed Spring owner adoption not performed';
next.springMigration = { manifest: 'p11-validation/spring-release-manifest.json', previousAcceptanceSha256: previousSha, ...summary };
fs.writeFileSync(acceptance, JSON.stringify(next, null, 2) + '\n');
console.log(JSON.stringify({ file, sha256, previousAcceptanceSha256: previousSha, reproduction: report.reproduction }));
