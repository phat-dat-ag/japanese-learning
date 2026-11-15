'use strict';
// Offline qualification only: no .NET assembly loading, image pulls or workload execution.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = '.local/p11-environment-qualification-20261115';
const output = 'observability/roadmap/p11-validation/dotnet-environment.json';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function git(args) {
  const q = cp.spawnSync('git', ['-C', 'dotnet', ...args], { encoding: 'utf8' });
  if (q.status !== 0) throw Error('Source Git check failed');
  return q.stdout.trim();
}
function inventory() {
  const commit = git(['rev-parse', 'HEAD']);
  if (commit !== 'bbbab2f4dc80c0275152d4bf008f52b75c5778d6' || git(['status', '--porcelain']).length) throw Error('Review changed source before qualification');
  const files = git(['ls-files', 'tests', 'src']).split('\n');
  const suites = [];
  const dependencies = [];
  for (const relative of files) {
    const text = fs.readFileSync(path.join('dotnet', relative), 'utf8');
    if (relative.endsWith('.csproj')) {
      dependencies.push({ file: relative, target: text.match(/<TargetFramework>([^<]+)/)?.[1],
        packages: [...text.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g)].map(m => ({ name: m[1], version: m[2] })) });
    }
    if (!relative.startsWith('tests/') || !relative.endsWith('.cs')) continue;
    if (/\b(?:MemberData|ClassData|AutoData|InlineAutoData)\b|\bSkip\s*=|^\s*#(?:if|else|endif)/m.test(text)) throw Error('Unsupported dynamic/conditional inventory: ' + relative);
    const methods = [];
    const regex = /((?:^\s*\[(?:Fact|Theory|InlineData)[^\r\n]*\]\s*\r?\n)+)\s*public\s+(?:async\s+)?(?:Task(?:<[^>]+>)?|void)\s+(\w+)\s*\(/gm;
    for (const m of text.matchAll(regex)) {
      const theory = /\[Theory\]/.test(m[1]);
      const cases = theory ? [...m[1].matchAll(/\[InlineData\(/g)].length : 1;
      if (!cases) throw Error('Theory without static cases');
      methods.push({ name: m[2], kind: theory ? 'Theory' : 'Fact', cases });
    }
    const declared = [...text.matchAll(/^\s*\[(?:Fact|Theory)(?:\([^\r\n]*\))?\]/gm)].length;
    if (declared !== methods.length) throw Error('Incomplete method inventory: ' + relative);
    if (methods.length) suites.push({ file: relative, className: text.match(/namespace\s+([\w.]+)\s*;/)[1] + '.' + text.match(/public sealed class\s+(\w+)/)[1],
      sha256: sha256(Buffer.from(text)), methods, cases: methods.reduce((n, m) => n + m.cases, 0) });
  }
  const expected = suites.reduce((n, s) => n + s.cases, 0);
  const result = { phase: 'P11', status: 'SPECIFICATION ONLY; EXECUTION BLOCKED', productionStatus: 'BLOCKED',
    sourceCommit: commit, project: 'tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj', solution: 'JapaneseLearning.User.sln',
    inventoryKind: 'Static source-derived; runtime discovery/execution NOT VERIFIED', expectedCases: expected,
    methods: suites.reduce((n, s) => n + s.methods.length, 0), suites, dependencies,
    toolchain: { requestedSdk: '9.0.317', target: 'net9.0', windowsRuntimeObserved: '9.0.19',
      repositoryImage: 'mcr.microsoft.com/dotnet/sdk:9.0@sha256:01fabc4758d1d74e39eda700c8463dae6241a61481f973683692ddcb59a5eeb7',
      imageAuthorization: 'NOT APPROVED for test workload; digest presence is not execution authorization',
      imageSdkVersion: 'NOT VERIFIED offline; require9.0.317 or explicit reviewed specification revision',
      proposedPlatform: 'linux/amd64', testSdk: '17.12.0', xunit: '2.9.2', adapter: '2.8.2' },
    availableApprovedEnvironments: [], executedHere: false,
    limitations: ['No SDK global.json or NuGet lock closure', 'No approved independent runner, registry or artifact trust workflow found', 'No image pull or test execution authorized', 'Complete inventory requires runtime reconciliation; historical81 is a subset'] };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ expectedCases: expected, methods: result.methods, suites: suites.map(s => ({ name: s.className.split('.').pop(), cases: s.cases })) }));
}
function verifyTrx(xml, expectedInventory) {
  const result = counts(xml, 'trx', expectedInventory.expectedCases);
  const perMethod = new Map();
  const definitions = [...xml.matchAll(/<UnitTest\b[^>]*>[\s\S]*?<TestMethod\s([^>]+)\/>[\s\S]*?<\/UnitTest>/g)];
  for (const m of definitions) {
    const name = m[1].match(/\bname="([^"]+)"/)?.[1];
    const cls = m[1].match(/\bclassName="([^"]+)"/)?.[1];
    const key = cls + '.' + name;
    perMethod.set(key, (perMethod.get(key) || 0) + 1);
  }
  const expected = new Map(expectedInventory.suites.flatMap(s => s.methods.map(m => [s.className + '.' + m.name, m.cases])));
  const methodInventoryMatches = expected.size === perMethod.size && [...expected].every(([k, n]) => perMethod.get(k) === n);
  const results = [...xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>[\s\S]*?<\/UnitTestResult>)/g)];
  const everyResultPassed = results.length === expectedInventory.expectedCases && results.every(m => /\boutcome="Passed"/.test(m[1]));
  const runCompleted = /<ResultSummary\b[^>]*\boutcome="Completed"/.test(xml);
  return { ...result, methodInventoryMatches, everyResultPassed, runCompleted, pass: result.pass && methodInventoryMatches && everyResultPassed && runCompleted };
}
function integrity() {
  const checks = [];
  function check(file, expected) {
    checks.push({ file, pass: fs.existsSync(file) && sha256(fs.readFileSync(file)) === expected });
  }
  const initial = JSON.parse(fs.readFileSync('observability/roadmap/p11-validation/release-manifest.json'));
  check(initial.immutableIdentity.file, initial.immutableIdentity.sha256);
  const frozen = JSON.parse(fs.readFileSync(initial.immutableIdentity.file));
  for (const s of Object.values(frozen.source)) check(s.archive, s.sha256);
  for (const a of frozen.artifacts) for (const f of a.files) check(path.join(a.root, f.file), f.sha256);
  const spring = JSON.parse(fs.readFileSync('observability/roadmap/p11-validation/spring-release-manifest.json'));
  check(spring.immutableIdentity.file, spring.immutableIdentity.sha256);
  const adopted = JSON.parse(fs.readFileSync(spring.immutableIdentity.file));
  for (const build of Object.values(adopted.builds)) for (const a of build.artifacts) check(a.file, a.sha256);
  const result = { checked: checks.length, failed: checks.filter(x => !x.pass), algorithm: 'SHA256',
    scope: 'Retained manifests, eight source archives and recorded native artifacts; not Linux image or execution qualification' };
  fs.writeFileSync(base + '/integrity.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
  if (result.failed.length) process.exitCode = 1;
}
const action = process.argv[2];
if (action === 'finalize') {
  const acceptance = 'observability/roadmap/p11-validation/acceptance.json';
  const previous = fs.readFileSync(acceptance);
  const previousSha256 = sha256(previous);
  const specification = JSON.parse(fs.readFileSync(output));
  const runtimeFile = base + '/technical.json';
  const runtime = JSON.parse(fs.readFileSync(runtimeFile));
  if (!runtime.preservation || Object.values(runtime.preservation).some(v => v !== true)) throw Error('Preservation comparison not complete');
  const integrityFile = base + '/integrity.json';
  const integrityResult = JSON.parse(fs.readFileSync(integrityFile));
  fs.writeFileSync(base + '/acceptance-before-' + previousSha256 + '.json', previous, { flag: 'wx' });
  const next = JSON.parse(previous);
  next.scope = 'Independent .NET environment specification and source inventory; offline release checks; execution pending security-owner approval';
  next.authority = 'User P11 Policy-Compliant .NET Test Environment Qualification; no unapproved image/binary/workload execution';
  next.checks.fullDotnetSourceInventory = 'PASS as source-derived inventory only:151 cases,62 methods,16 classes; runtime discovery NOT VERIFIED';
  next.checks.approvedIndependentDotnetEnvironment = 'BLOCKED: none established from repository evidence; reviewable specification and explicit security-owner request prepared';
  next.checks.offlineReleaseIntegrityThisContinuation = integrityResult.failed.length ? 'FAIL' : 'PASS:443 SHA256 checks on retained frozen manifests, source archives and selected artifacts';
  next.dotnetEnvironmentQualification = { report: 'p11-dotnet-environment.md', specification: { file: output, sha256: sha256(fs.readFileSync(output)), expectedCases: specification.expectedCases, inventoryKind: specification.inventoryKind },
    approvedEnvironments: [], executed: false, approval: 'PENDING: security owner, agent/image/toolchain/feed/workload/limits/evidence reference requested',
    resultGateChecks: '9 offline checks PASS; not .NET execution',
    previousAcceptanceSha256: previousSha256,
    integrity: { file: integrityFile, sha256: sha256(fs.readFileSync(integrityFile)), ...integrityResult },
    preservation: { file: runtimeFile, sha256: sha256(fs.readFileSync(runtimeFile)), ...runtime.preservation } };
  fs.writeFileSync(acceptance, JSON.stringify(next, null, 2) + '\n');
  const prefix = '## Current independent .NET environment qualification — 2026-11-15\n\n**P11 PARTIAL; production BLOCKED; 11/12.** [Independent test specification and approval request](p11-dotnet-environment.md) records no established approved independent runner. Static inventory is 151 expected cases across 62 methods/16 classes; runtime discovery is not claimed. Nine offline result-gate checks and 443 retained artifact/manifest/source hash checks pass. Security-owner approval of environment/image, dependency closure, isolation, resource limits and evidence handling is pending; no workload or image was downloaded/executed. Latest Windows regression remains 14 passed/65 policy-blocked failures. All 52 containers, 25 volumes, three backups, schedules and revisions compare unchanged. Owner overlay stays inactive and JWKS pins unchanged. Earlier evidence below remains historical.\n\n';
  for (const name of ['p11-readiness.md', 'p11-verification.md', 'implementation-roadmap.md']) {
    const file = 'observability/roadmap/' + name;
    fs.writeFileSync(file, prefix + fs.readFileSync(file, 'utf8'));
  }
  console.log(JSON.stringify({ expectedCases: specification.expectedCases, previousAcceptanceSha256: previousSha256, preservation: runtime.preservation }));
} else if (action === 'inventory') inventory();
else if (action === 'integrity') integrity();
else if (action === 'verify-trx') {
  const result = verifyTrx(fs.readFileSync(process.argv[3], 'utf8'), JSON.parse(fs.readFileSync(output)));
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
} else if (action === 'self-test') {
  const assert = require('node:assert/strict');
  const inv = { expectedCases: 1, suites: [{ className: 'T', methods: [{ name: 'M', cases: 1 }] }] };
  const valid = '<TestRun><ResultSummary outcome="Completed"><Counters executed="1" passed="1" failed="0" error="0" notExecuted="0"/></ResultSummary><UnitTestResult outcome="Passed"/><UnitTest id="a"><TestMethod className="T" name="M"/></UnitTest></TestRun>';
  assert.equal(verifyTrx(valid, inv).pass, true);
  for (const bad of [valid.replace('executed="1"', 'executed="0"'), valid.replace('outcome="Passed"', 'outcome="Failed"'), valid.replace('name="M"', 'name="Wrong"'), valid.replace('notExecuted="0"', 'notExecuted="1"'), valid.replace('outcome="Completed"', 'outcome="Failed"'), '<TestRun/>']) assert.equal(verifyTrx(bad, inv).pass, false);
  const full = JSON.parse(fs.readFileSync(output));
  const subset = { ...full, expectedCases: 81, suites: full.suites.filter(s => s.className.includes('.Security.') || /\.(AuthenticationLoggingTests|AuthSuccessContractTests|JwksLoggingTests)$/.test(s.className)) };
  assert.equal(verifyTrx(fs.readFileSync('.local/p11-rc-20261115/dotnet-a-retry/tests/JapaneseLearning.User.UnitTests/TestResults/p11-security.trx', 'utf8'), subset).pass, true);
  assert.equal(verifyTrx(fs.readFileSync('.local/p11-rc-20261115/dotnet-b/tests/JapaneseLearning.User.UnitTests/TestResults/p11-adoption.trx', 'utf8'), subset).pass, false);
  console.log('9 result-gate checks PASS, including historical81 acceptance and blocked79 rejection');
} else throw Error('Unknown offline action');
