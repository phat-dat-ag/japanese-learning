'use strict';
// Source-only adoption regression; logs/artifacts remain ignored. Never deploys.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.local/p11-spring-adoption-20261115');
const name = process.argv[2];
const cases = {
  learning: ['D:/springboot-project/springboot-learning-api', '', 25],
  user: ['D:/springboot-project/springboot-user-api', '', null],
  jwks: [path.join(root, '.local/p11-rc-20261115/jwks-new-b'), 'JwksEndpointsTest,RsaKeyProviderTest,MetricsListenerAddressTest', 21],
  quarkus: [path.join(root, '.local/p11-rc-20261115/quarkus-b'), 'JwtSecurityTest', 21]
};
if (!cases[name]) throw Error('Unknown cohort');
const [cwd, filter, expected] = cases[name];
const suffix = process.argv[3] || 'regression';
if (!/^[a-z-]+$/.test(suffix)) throw Error('Invalid attempt label');
const receipt = path.join(base, name + '-' + suffix + '.json');
if (fs.existsSync(receipt)) throw Error('Preserve previous result');
const log = path.join(base, name + '-' + suffix + '.log');
const fd = fs.openSync(log, 'wx');
const script = '& .\\mvnw.cmd -o -B -ntp test "-DargLine=-Xmx384m" "-Dspring.test.mockmvc.print=NONE" "-Dquarkus.http.test-port=0"' + (filter ? ' "-Dtest=' + filter + '"' : '');
const startedUtc = new Date().toISOString();
const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  cwd, env: { ...process.env, MAVEN_OPTS: '-Xmx384m' }, timeout: 600000, stdio: ['ignore', fd, fd]
});
fs.closeSync(fd);
const reports = path.join(cwd, 'target/surefire-reports');
const suites = fs.existsSync(reports) ? fs.readdirSync(reports).filter(f => /^TEST-.*\.xml$/.test(f)).map(f => {
  const file = path.join(reports, f);
  const xml = fs.readFileSync(file, 'utf8');
  const tests = Number(xml.match(/<testsuite\s[^>]*\btests="(\d+)"/)?.[1]);
  return { file, fresh: fs.statSync(file).mtimeMs >= Date.parse(startedUtc), ...counts(xml, 'junit', tests) };
}).filter(s => s.fresh) : [];
const tests = suites.reduce((n, s) => n + s.tests, 0);
const result = { name, cwd, script, startedUtc, finishedUtc: new Date().toISOString(), exitCode: q.status,
  error: q.error?.code || null, tests, expected, suites, pass: q.status === 0 && tests > 0 && (expected === null || expected === tests) && suites.every(s => s.pass),
  log, logSha256: crypto.createHash('sha256').update(fs.readFileSync(log)).digest('hex') };
fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
if (!result.pass) process.exitCode = 1;
