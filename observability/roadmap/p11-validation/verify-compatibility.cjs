'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.local', 'p11-rc-20261115');
const output = path.join(base, 'compatibility-count-validation.json');
if (fs.existsSync(output)) throw Error('Existing validation receipt preserved');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const report = { utc: new Date().toISOString(), status: 'PARTIAL', rawAggregateNotAcceptance: true, consumers: {} };
const rawPath = path.join(base, 'compatibility-2/results.json');
const raw = JSON.parse(fs.readFileSync(rawPath));
report.rawEvidence = { file: path.relative(root, rawPath).replaceAll('\\', '/'), sha256: hash(fs.readFileSync(rawPath)), reportedStatus: raw.status };
report.endpoints = raw.endpoints;
const files = [
  ['dotnet', 'dotnet-a-retry/tests/JapaneseLearning.User.UnitTests/TestResults/p11-realproducer.trx', 'trx', 8],
  ['quarkus', 'quarkus-a-retry/target/surefire-reports/TEST-p11.P11CrossStackTest.xml', 'junit', 8],
  ['spring-learning', 'spring-learning-a-retry/target/surefire-reports/TEST-p11.P11SpringLearningTest.xml', 'junit', 9],
  ['spring-user', 'spring-user-a/target/surefire-reports/TEST-p11.P11SpringUserTest.xml', 'junit', 7]
];
for (const [name, relative, format, expected] of files) {
  const file = path.join(base, relative);
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from('');
  const checked = counts(bytes.toString(), format, expected);
  report.consumers[name] = { ...checked, status: checked.pass ? 'PASS' : 'BLOCKED', evidence: relative, sha256: hash(bytes) };
}
report.actualDotnetIssuedTokenAvailable = fs.existsSync(path.join(base, 'compatibility-2/dotnet-issued.token'));
report.crossServiceActualIssuerToQuarkus = report.actualDotnetIssuedTokenAvailable && report.consumers.dotnet.pass && report.consumers.quarkus.pass ? 'PASS' : 'NOT VERIFIED';
report.reason = 'Application Control blocked extended .NET assembly: native exit 0 with zero executed tests is rejected. Original raw receipt retained; post-run counts supersede its exit-only aggregate.';
if (Object.values(report.consumers).every(c => c.pass) && report.crossServiceActualIssuerToQuarkus === 'PASS' && report.endpoints.every(x => x.pass)) report.status = 'PASS';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
if (report.status !== 'PASS') process.exitCode = 1;
