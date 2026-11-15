'use strict';
// Builds committed candidates in ignored directories; no Docker lifecycle or registry writes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = path.join(root, '.local', 'p11-rc-20261115');
const recordFile = path.join(base, 'builds.json');
const [action, name, pass = 'a'] = process.argv.slice(2);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function command(bin, args, cwd = root) {
  const r = cp.spawnSync(bin, args, { cwd, encoding: null, timeout: 60000, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw Error('Command failed: ' + bin + ' ' + args[0]);
  return r.stdout;
}
const git = (dir, args) => command('git', ['-c', 'safe.directory=' + dir.replaceAll('\\', '/'), '-C', dir, ...args]);
const write = report => fs.writeFileSync(recordFile, JSON.stringify(report, null, 2) + '\n');
function tree(dir) {
  const entries = [];
  function visit(relative) {
    for (const e of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const next = path.join(relative, e.name);
      if (e.isSymbolicLink()) throw Error('Artifact links rejected');
      if (e.isDirectory()) visit(next);
      else entries.push({ file: next.replaceAll('\\', '/'), bytes: fs.statSync(path.join(dir, next)).size, sha256: hash(fs.readFileSync(path.join(dir, next))) });
    }
  }
  visit('');
  return entries.sort((a, b) => a.file.localeCompare(b.file));
}
function extract(report, source, label) {
  const dir = path.join(base, source + '-' + label);
  if (fs.existsSync(dir)) throw Error('Candidate directory already exists; preserve prior attempt');
  fs.mkdirSync(dir);
  command('tar', ['-xf', report.sources[source].archive, '-C', dir]);
  return dir;
}
async function main() {
  if (action === 'prepare') {
    if (fs.existsSync(recordFile)) throw Error('Prior release candidate preserved');
    fs.mkdirSync(base, { recursive: true });
    const spring = fs.existsSync('C:/Personal/springboot-project/.git') ? 'C:/Personal/springboot-project' : 'D:/springboot-project';
    const locations = { root, dotnet: path.join(root, 'dotnet'), quarkus: path.join(root, 'quarkus'), angular: path.join(root, 'angular'),
      'jwks-new': path.join(root, 'springboot-jwks-api'), 'jwks-old': path.join(spring, 'springboot-jwks-api'),
      'spring-learning': path.join(spring, 'springboot-learning-api'), 'spring-user': path.join(spring, 'springboot-user-api') };
    const report = { phase: 'P11', scope: 'Committed-source local candidates, not production release approval', utc: new Date().toISOString(),
      requestedSpringPathAccessible: fs.existsSync('C:/Personal/springboot-project/.git'), actualSpringParent: spring, sources: {}, commands: [], artifacts: {} };
    for (const [name, dir] of Object.entries(locations)) {
      const sha = git(dir, ['rev-parse', 'HEAD']).toString().trim();
      const files = git(dir, ['ls-tree', '-r', '--name-only', sha]).toString().split('\n');
      if (files.some(f => /(^|\/)\.env$|(^|\/)secrets\/|\.(key|pem|pfx|p12|jks)$/i.test(f))) throw Error('Review key/secret-like tracked source paths before archiving ' + name);
      const archive = path.join(base, name + '.tar');
      git(dir, ['archive', '--format=tar', '--output=' + archive, sha]);
      const independent = git(dir, ['archive', '--format=tar', sha]);
      const sha256 = hash(fs.readFileSync(archive));
      if (hash(independent) !== sha256) throw Error('Independent Git archive differs');
      report.sources[name] = { path: dir, sha, commitUtc: git(dir, ['show', '-s', '--format=%cI', sha]).toString().trim(),
        gitlinks: git(dir, ['ls-tree', sha]).toString().split('\n').filter(l => l.startsWith('160000 ')),
        dirty: git(dir, ['status', '--porcelain=v1']).toString().trim(), archive, bytes: independent.length, sha256, archiveReproduced: true };
    }
    report.tools = { node: process.version, dotnet: command('dotnet', ['--version']).toString().trim(),
      java: cp.spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr.trim(), git: command('git', ['--version']).toString().trim() };
    write(report);
    console.log(JSON.stringify({ recordFile, sources: Object.fromEntries(Object.entries(report.sources).map(([n, s]) => [n, { sha: s.sha, archiveReproduced: s.archiveReproduced }])) }));
    return;
  }
  const report = JSON.parse(fs.readFileSync(recordFile));
  if (action === 'build') {
    if (!/^[ab](?:-(retry|online))?$/.test(pass) || !report.sources[name]) throw Error('Invalid candidate');
    const dir = extract(report, name, pass);
    let script;
    const timestamp = report.sources[name].commitUtc;
    if (name === 'dotnet') {
      script = 'dotnet publish src/JapaneseLearning.User.Api/JapaneseLearning.User.Api.csproj -c Release -o publish -p:UseAppHost=false -p:UseSharedCompilation=false -p:ContinuousIntegrationBuild=true -p:SourceRevisionId=' + report.sources[name].sha + ' -p:PathMap="' + dir + '=/_/" -m:1 --nologo';
    } else if (name === 'angular') {
      script = 'npm.cmd ci --offline --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm.cmd run build -- --configuration production';
    } else {
      script = '& .\\mvnw.cmd -o -B -ntp package "-DskipTests" "-Dproject.build.outputTimestamp=' + timestamp + '" "-Dquarkus.otel.exporter.otlp.enabled=false"';
    }
    if (pass.endsWith('-online')) script = script.replace(' -o -B', ' -B');
    const log = path.join(base, name + '-' + pass + '.log');
    const fd = fs.openSync(log, 'wx');
    const before = new Date().toISOString();
    const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      cwd: dir, env: { ...process.env, MAVEN_OPTS: '-Xmx384m', DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1', NG_CLI_ANALYTICS: 'false', NG_BUILD_MAX_WORKERS: '2' },
      timeout: 600000, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    report.commands.push({ name, pass, kind: 'build', script, startedUtc: before, finishedUtc: new Date().toISOString(), exitCode: q.status, signal: q.signal, error: q.error?.code || null, log, logSha256: hash(fs.readFileSync(log)) });
    if (q.status === 0) {
      let artifactRoot;
      if (name === 'dotnet') artifactRoot = path.join(dir, 'publish');
      else if (name === 'angular') artifactRoot = path.join(dir, 'dist');
      else if (name === 'quarkus') artifactRoot = path.join(dir, 'target', 'quarkus-app');
      else artifactRoot = path.join(dir, 'target');
      let files = tree(artifactRoot);
      if (!['dotnet', 'angular', 'quarkus'].includes(name)) files = files.filter(x => /^[^/]+\.jar$/.test(x.file));
      report.artifacts[name + '-' + pass] = { root: artifactRoot, files };
    }
    write(report);
    console.log(JSON.stringify({ name, pass, exitCode: q.status, files: report.artifacts[name + '-' + pass]?.files.length || 0, log }));
    if (q.status !== 0) process.exitCode = 1;
  } else if (action === 'test' || action === 'privacy') {
    const dir = path.join(base, name + '-' + pass);
    if (!fs.existsSync(dir)) throw Error('Build/extract candidate first');
    const scripts = action === 'privacy' ? {
      'jwks-new': '& .\\mvnw.cmd -o -B -ntp test "-Dtest=SafeSpanExporterTest,TracingIntegrationTest,StructuredJsonEncoderTest,RequestLoggingFilterTest,LoggingConfigurationTest,RequestLoggingServletTest,ObservabilityBaselineTest" "-DargLine=-Xmx384m"',
      quarkus: '& .\\mvnw.cmd -o -B -ntp test "-Dtest=JwksCorrelationFilterTest,JwksMetricsFilterTest,CanonicalLoggingTest,TracingTest,TracingHttpTest" "-DargLine=-Xmx512m" "-Dquarkus.http.test-port=0"'
    } : {
      dotnet: 'dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj -c Release --filter "FullyQualifiedName~Security|FullyQualifiedName~Logging.Authentication|FullyQualifiedName~Logging.AuthSuccess|FullyQualifiedName~Logging.Jwks" -p:UseSharedCompilation=false -m:1 --logger "trx;LogFileName=p11-security.trx" --nologo',
      quarkus: '& .\\mvnw.cmd -o -B -ntp test "-Dtest=JwtSecurityTest" "-DargLine=-Xmx512m" "-Dquarkus.http.test-port=0"',
      'jwks-new': '& .\\mvnw.cmd -o -B -ntp test "-Dtest=JwksEndpointsTest,RsaKeyProviderTest,MetricsListenerAddressTest" "-DargLine=-Xmx384m"',
      'spring-learning': '& .\\mvnw.cmd -o -B -ntp test "-Dtest=JwtAuthenticationTest" "-DargLine=-Xmx512m"'
    };
    let script = scripts[name];
    if (pass.endsWith('-online')) script = script?.replace(' -o -B', ' -B');
    if (!script) throw Error('No scoped test command');
    const log = path.join(base, name + '-' + pass + '-' + action + '.log');
    const fd = fs.openSync(log, 'wx');
    const startedUtc = new Date().toISOString();
    const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      cwd: dir, env: { ...process.env, MAVEN_OPTS: '-Xmx384m', DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1' }, timeout: 600000, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    report.commands.push({ name, pass, kind: action, script, startedUtc, finishedUtc: new Date().toISOString(), exitCode: q.status, signal: q.signal, log, logSha256: hash(fs.readFileSync(log)) });
    write(report);
    console.log(JSON.stringify({ name, exitCode: q.status, log }));
    if (q.status !== 0) process.exitCode = 1;
  } else if (action === 'extract') {
    console.log(extract(report, name, pass));
  } else if (action === 'verify') {
    for (const s of Object.values(report.sources)) if (hash(fs.readFileSync(s.archive)) !== s.sha256) throw Error('Source archive drift');
    for (const a of Object.values(report.artifacts)) for (const f of a.files) if (hash(fs.readFileSync(path.join(a.root, f.file))) !== f.sha256) throw Error('Artifact drift');
    const comparisons = {};
    for (const name of Object.keys(report.sources)) if ((report.artifacts[name + '-a'] || report.artifacts[name + '-a-retry'] || report.artifacts[name + '-a-online']) && report.artifacts[name + '-b']) {
      const a = (report.artifacts[name + '-a'] || report.artifacts[name + '-a-retry'] || report.artifacts[name + '-a-online']).files, b = report.artifacts[name + '-b'].files;
      comparisons[name] = { equal: JSON.stringify(a) === JSON.stringify(b), filesA: a.length, filesB: b.length,
        differences: [...new Set([...a.map(x => x.file), ...b.map(x => x.file)])].filter(f => a.find(x => x.file === f)?.sha256 !== b.find(x => x.file === f)?.sha256) };
    }
    const tests = [];
    for (const entry of report.commands.filter(c => c.kind === 'test' || c.kind === 'privacy')) {
      const directory = path.join(base, entry.name + '-' + (entry.pass || (entry.log.includes('a-retry') ? 'a-retry' : entry.log.includes('a-online') ? 'a-online' : 'a')));
      if (entry.name === 'dotnet') {
        const trx = path.join(directory, 'tests/JapaneseLearning.User.UnitTests/TestResults/p11-security.trx');
        if (fs.existsSync(trx)) {
          const xml = fs.readFileSync(trx, 'utf8');
          const counters = xml.match(/<Counters\s[^>]+>/)?.[0] || '';
          tests.push({ consumer: entry.name, file: trx, sha256: hash(fs.readFileSync(trx)), counters });
        }
      } else {
        const reports = path.join(directory, 'target/surefire-reports');
        if (!fs.existsSync(reports)) continue;
        for (const f of fs.readdirSync(reports).filter(n => n.startsWith('TEST-') && n.endsWith('.xml'))) {
          const file = path.join(reports, f), xml = fs.readFileSync(file, 'utf8');
          const tag = xml.match(/<testsuite\s[^>]+>/)?.[0] || '';
          const attr = name => tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1];
          tests.push({ consumer: entry.name, file, sha256: hash(fs.readFileSync(file)), suite: attr('name'), tests: Number(attr('tests')), failures: Number(attr('failures')), errors: Number(attr('errors')), skipped: Number(attr('skipped')) });
        }
      }
    }
    report.testReports = tests;
    report.integrity = { verifiedUtc: new Date().toISOString(), sourceArchives: Object.keys(report.sources).length, artifacts: Object.values(report.artifacts).reduce((n, a) => n + a.files.length, 0), comparisons };
    write(report);
    console.log(JSON.stringify(report.integrity));
  } else if (action === 'independent-hashes') {
    const script = "$r=Get-Content -Raw -LiteralPath '" + recordFile + "' | ConvertFrom-Json; $checks=@(); foreach($s in $r.sources.PSObject.Properties.Value){ $checks += ((Get-FileHash -Algorithm SHA256 -LiteralPath $s.archive).Hash.ToLowerInvariant() -eq $s.sha256) }; foreach($a in $r.artifacts.PSObject.Properties.Value){ foreach($f in $a.files){ $checks += ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $a.root $f.file)).Hash.ToLowerInvariant() -eq $f.sha256) } }; [pscustomobject]@{checked=$checks.Count;failed=@($checks | Where-Object { -not $_ }).Count;implementation='PowerShell Get-FileHash SHA256'} | ConvertTo-Json -Compress";
    const result = JSON.parse(command('powershell.exe', ['-NoProfile', '-Command', script]).toString());
    if (result.failed) throw Error('Independent SHA256 verification failed');
    report.independentIntegrity = result;
    write(report);
    console.log(JSON.stringify(result));
  } else throw Error('Unknown action');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
