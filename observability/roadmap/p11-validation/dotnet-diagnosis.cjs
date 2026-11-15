'use strict';
// Offline receipt analysis only. Never loads blocked assemblies or changes policy.
const fs = require('node:fs');
const crypto = require('node:crypto');
const base = '.local/p11-dotnet-closure-20261115';
const paths = {
  historical: '.local/p11-rc-20261115/dotnet-a-retry/tests/JapaneseLearning.User.UnitTests/TestResults/p11-security.trx',
  current: '.local/p11-rc-20261115/dotnet-b/tests/JapaneseLearning.User.UnitTests/TestResults/p11-adoption.trx'
};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (process.argv[2] === 'finalize') {
  const acceptance = 'observability/roadmap/p11-validation/acceptance.json';
  const bytes = fs.readFileSync(acceptance);
  const previousSha256 = hash(bytes);
  fs.writeFileSync(base + '/acceptance-before-' + previousSha256 + '.json', bytes, { flag: 'wx' });
  const next = JSON.parse(bytes);
  const diagnosisFile = base + '/diagnosis-verified.json';
  const diagnosis = JSON.parse(fs.readFileSync(diagnosisFile));
  const runtimeFile = base + '/technical.json';
  const runtime = JSON.parse(fs.readFileSync(runtimeFile));
  next.scope = 'Policy-compliant .NET failure diagnosis and coordinated JWKS rollout/rollback proposal; no runtime migration';
  next.authority = 'User P11 .NET Regression Closure and JWKS Rollout Readiness; no deployment or security-policy changes authorized';
  next.checks.dotnetExecutionDiagnosis = 'PASS: Code Integrity3077 corroborates policy denial; all 65 failed records policy-related; two enum theory discovery errors explain81-to79';
  next.checks.freshDotnetCompleteRegression = 'BLOCKED: no policy-approved generated-assembly execution method established; selected79 results are14 passed/65 failed, not full solution PASS';
  next.checks.jwksOrderedRolloutRollbackPlan = 'PASS as proposal only: paired maintenance cutover/rollback, preflight and positive/negative checks; .NET and explicit runtime approval gates closed';
  next.dotnetClosure = { previousAcceptanceSha256: previousSha256, report: 'p11-dotnet-rollout-readiness.md',
    diagnosis: { file: diagnosisFile, sha256: hash(fs.readFileSync(diagnosisFile)), failures: diagnosis.failures, policyFailures: diagnosis.policyFailures, discoveryErrors: diagnosis.discoveryErrors },
    freshExecutionPerformed: false, productionStatus: 'BLOCKED', runtimeMigrationPerformed: false,
    preservation: { file: runtimeFile, sha256: hash(fs.readFileSync(runtimeFile)), ...runtime.preservation } };
  fs.writeFileSync(acceptance, JSON.stringify(next, null, 2) + '\n');
  const prefix = '## Current .NET diagnosis and rollout gate — 2026-11-15\n\n**P11 PARTIAL; production BLOCKED; 11/12.** [Execution diagnosis and ordered JWKS rollout/rollback proposal](p11-dotnet-rollout-readiness.md) confirms Code Integrity policy denial in all 65 failed .NET records. Two enum-valued theory discovery errors explain the 81-to-79 count; no independent code assertion failure is established. Existing signed SDK was already used; no approved alternative execution environment is established. Fresh selected and full-solution regression remain BLOCKED; no new test execution or runtime migration occurred. The owner overlay remains inactive and pins unchanged. All 52 containers, 25 volumes, three backups, schedules and revisions compare unchanged. Explicit deployment approval and all remaining production gates remain required. Earlier evidence below remains historical.\n\n';
  for (const name of ['p11-readiness.md', 'p11-verification.md', 'implementation-roadmap.md']) {
    const file = 'observability/roadmap/' + name;
    fs.writeFileSync(file, prefix + fs.readFileSync(file, 'utf8'));
  }
  console.log(JSON.stringify({ previousAcceptanceSha256: previousSha256, preservation: runtime.preservation }));
  process.exit(0);
}
function analyze(file) {
  const bytes = fs.readFileSync(file), xml = bytes.toString();
  const records = [...xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)].map(m => ({
    name: m[1].match(/\btestName="([^"]*)"/)?.[1], outcome: m[1].match(/\boutcome="([^"]*)"/)?.[1],
    policyError: /0x800711C7/.test(m[2]), discoveryError: /Exception during discovery/.test(m[2])
  }));
  return { file, sha256: hash(bytes), counters: xml.match(/<Counters\s[^>]+>/)?.[0], records };
}
const historical = analyze(paths.historical), current = analyze(paths.current);
const failed = current.records.filter(r => r.outcome === 'Failed');
const report = { phase: 'P11', status: 'PARTIAL', productionStatus: 'BLOCKED', historical, current,
  failures: failed.length, policyFailures: failed.filter(r => r.policyError).length,
  independentlyObservedNonPolicyFailures: failed.filter(r => !r.policyError).length,
  discoveryErrors: failed.filter(r => r.discoveryError).map(r => r.name),
  explanation: 'Two UserRole enum theories normally expand into four cases. Domain DLL denial yields two discovery-error placeholders: 81 - 4 + 2 = 79.',
  scope: '81 is the selected security/auth/logging cohort, not the complete solution. Failed test bodies remain unverified; this receipt is analysis, not a new execution.',
  windowsEventFinding: 'Read-only Code Integrity event 3077 confirmed VerifiedAndReputableDesktop policy 27555.1000.240208; requested signing level2, validated1, status0xc0e90002. Domain DLL flat SHA256 BED1E9CA3A849B083D6A376DFBF72017AA4EB236B416118CBD9DE5066AE840AF.',
  options: { trustedSdk: 'Existing signed SDK9.0.317 already used; does not authorize generated DLLs', approvedDirectory: 'No approved path established; do not move files to evade denial', docker: 'No established test target; pinned SDK image absent; new execution environment needs security/resource approval', remote: 'Security-approved signing/build or CI host required; none supplied' } };
if (failed.length !== 65 || report.policyFailures !== 65 || report.discoveryErrors.length !== 2) throw Error('Receipt analysis does not match independent XML inspection');
fs.writeFileSync(base + '/diagnosis-verified.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ failures: report.failures, policyFailures: report.policyFailures, otherFailures: report.independentlyObservedNonPolicyFailures, discoveryErrors: report.discoveryErrors }));
