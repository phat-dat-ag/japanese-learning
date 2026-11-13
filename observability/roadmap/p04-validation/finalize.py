"""Summarize actual test evidence and compare Git/source preservation; never changes Git."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE/'evidence'
sys.path.insert(0, str(ROOT/'observability/roadmap/p03-validation'))
from snapshot import capture


def save(name, data):
    (EVIDENCE/name).write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(repo, *args):
    return subprocess.check_output(['git','-C',str(ROOT/repo),*args], stderr=subprocess.PIPE).decode().strip()


before = json.loads((EVIDENCE/'preflight.json').read_text())
after = capture()
save('final.json', after)
checks = {}
for repo, initial in before['repositories'].items():
    final = after['repositories'][repo]
    for field in ('head','branch','index_sha256'):
        checks[repo+':'+field] = initial[field] == final[field]
    if repo in ('angular','springboot-jwks-api'):
        checks[repo+':status'] = initial['status'] == final['status']
        checks[repo+':diff'] = initial['diff_sha256'] == final['diff_sha256']
checks['gitlinks'] = before['gitlinks'] == after['gitlinks']
checks['p03_artifacts'] = all(sha(ROOT/path) == value for path,value in before['p03_hashes'].items())
checks['protected_gateway_collector'] = before['protected_source_sha256'] == after['protected_source_sha256']
program = 'dotnet/src/JapaneseLearning.User.Api/Program.cs'
checks['preexisting_dotnet_program'] = sha(ROOT/program) == before['preexisting_files'][program]
properties = 'src/main/resources/application.properties'
head = git('quarkus', 'show', 'HEAD:'+properties)
old_match = next(line for line in head.splitlines()
                 if line.startswith('quarkus.micrometer.binder.http-server.match-patterns='))
text = (ROOT/'quarkus'/properties).read_text()
restored = '\n'.join(old_match if line.startswith('quarkus.micrometer.binder.http-server.match-patterns=')
    else '# Opt in only to HTTP and runtime binders; no client URLs, DB labels or arbitrary extensions.'
    if line.startswith('# Opt in to reviewed HTTP/runtime/pool meters;') else line
    for line in text.splitlines()
    if not line.startswith(('quarkus.micrometer.binder.http-client.', 'quarkus.datasource.metrics.enabled=')))+'\n'
expected = before['preexisting_files']['quarkus/'+properties]
checks['preexisting_quarkus_changes_preserved'] = expected in (
    hashlib.sha256(restored.encode()).hexdigest(),
    hashlib.sha256(restored.replace('\n','\r\n').encode()).hexdigest())

allowed = {
    'dotnet': {'src/JapaneseLearning.User.Api/Observability/ApplicationMetrics.cs',
        'src/JapaneseLearning.User.Api/Observability/SqlClientMetrics.cs',
        'src/JapaneseLearning.User.Api/Common/Logging/JwksLoggingHandler.cs',
        'tests/JapaneseLearning.User.UnitTests/Observability/ApplicationMetricsTests.cs',
        'tests/JapaneseLearning.User.UnitTests/Observability/DependencyMetricsTests.cs'},
    'quarkus': {'src/main/resources/application.properties',
        'src/main/java/com/japaneselearning/common/exception/handler/GlobalExceptionMapper.java',
        'src/main/java/com/japaneselearning/common/metrics/ApplicationMetricsFilter.java',
        'src/main/java/com/japaneselearning/common/metrics/SecurityMetrics.java',
        'src/main/java/com/japaneselearning/common/metrics/DatabaseFailureMetrics.java',
        'src/main/java/com/japaneselearning/common/metrics/JwksMetricsFilter.java',
        'src/test/java/com/japaneselearning/common/metrics/ApplicationMetricsFilterTest.java',
        'src/test/java/com/japaneselearning/common/metrics/PoolMetricsTest.java',
        'src/test/java/com/japaneselearning/common/metrics/JwksMetricsFilterTest.java',
        'src/test/java/com/japaneselearning/security/ApplicationMetricsTest.java'},
}
for repo, names in allowed.items():
    changed = set(git(repo,'diff','--name-only').splitlines())
    changed.update(git(repo,'ls-files','--others','--exclude-standard').splitlines())
    preexisting = {line[3:] for line in before['repositories'][repo]['status']}
    checks[repo+':scoped_paths'] = changed <= names | preexisting
save('preservation.json', {'utc':datetime.now(timezone.utc).isoformat(), 'checks':checks,
    'docker':'BLOCKED inspection; no resource mutation commands issued; equality NOT VERIFIED',
    'springboot_project':'no access or modification; no independent before/after assertion',
    'temp_directories':'P03 untouched; existing application tests may create/dispose their own synthetic fixture state',
    'action_audit':'No commit/push/branch/index operation, deployment, migration, secret/key or stored-data operation'})
assert all(checks.values()), checks

trx = ROOT/'dotnet/tests/JapaneseLearning.User.UnitTests/TestResults/p04-unit-final.trx'
counters = ET.parse(trx).find('.//{*}Counters').attrib
selected = set('ApplicationMetricsFilterTest,ApplicationMetricsTest,PoolMetricsTest,JwksMetricsFilterTest,JwtSecurityTest,ProductionErrorTest,CanonicalLoggingTest,StructuredLogTest,OperationLogTest,OperationLogBehaviorTest,VocabularyOperationLogTest,VocabularyStageLoggingTest,CorrelationIdValidationTest,ApplicationFileLoggingTest,JwksCorrelationFilterTest'.split(','))
suites = []
for path in (ROOT/'quarkus/target/surefire-reports').glob('TEST-*.xml'):
    suite = ET.parse(path).getroot()
    if suite.attrib['name'].split('.')[-1] in selected:
        suites.append({'name':suite.attrib['name'], **{key:int(suite.attrib.get(key,0))
            for key in ('tests','failures','errors','skipped')}, 'sha256':sha(path)})
assert len(suites) == len(selected)
summary = {'dotnet':{'counters':counters,'trx_sha256':sha(trx)},
    'quarkus':{'suites':suites,'totals':{key:sum(s[key] for s in suites)
                  for key in ('tests','failures','errors','skipped')}},
    'fixtures':json.loads((EVIDENCE/'fixture-results.json').read_text()),
    'deployed_metrics_scrape':'BLOCKED Docker access; zero deployed targets verified',
    'promtool':'NOT VERIFIED executable unavailable; YAML syntax checked with installed Prettier'}
save('test-summary.json', summary)
assert counters['failed'] == '0' and all(s['failures'] == s['errors'] == 0 for s in suites)

docs = sorted((ROOT/'observability/roadmap').glob('p04-*.md'))
assert len(docs) == 7
links = 0
for document in docs:
    for target in re.findall(r'\]\(([^)]+)\)',document.read_text()):
        if target.startswith(('http:','https:','#')) or target.endswith('change-manifest.json'):
            continue
        assert (document.parent/target.split('#')[0]).exists(), (document,target)
        links += 1
java_files = [ROOT/repo/name for repo,names in allowed.items() for name in names if name.endswith('.java')]
for path in java_files:
    source = path.read_text()
    assert not re.search(r'import\s+(?:static\s+)?[\w.]+\.\*;',source), path
    assert '\t' not in source, path
    assert all(len(line) <= 100 for line in source.splitlines()), path
save('documentation-check.json', {'reports':len(docs),'local_links':links,'java_style_guards':len(java_files),
    'result':'PASS basic guards; R01-R19 manually reviewed; links checked for target existence'})

paths = [*docs, *[p for p in HERE.iterdir() if p.is_file()],
    *[p for p in EVIDENCE.iterdir() if p.is_file() and p.name != 'change-manifest.json'],
    *[ROOT/repo/name for repo,names in allowed.items() for name in names]]
entries = []
for path in sorted(paths):
    diff = subprocess.run(['git','diff','--no-index','--check','--','/dev/null',str(path)],capture_output=True,text=True)
    # Existing modified source can contain pre-existing whitespace; check task diff separately.
    if '/p04-' in str(path).replace('\\','/'):
        assert not diff.stdout.strip(), (path,diff.stdout)
    repo = next((name for name in allowed if path.is_relative_to(ROOT/name)), None)
    tracked = repo and bool(git(repo,'ls-files','--',str(path.relative_to(ROOT/repo))))
    entries.append({'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path),
                    'kind':'modified' if tracked else 'new'})
save('change-manifest.json', {'scope':'P04 only; excludes manifest itself, pre-existing Program.cs and ignored outputs',
    'files':entries,'preexisting_edits':'Program.cs untouched; application.properties retains Swagger edit',
    'new_custom_metric_families':{'dotnet':['app_security_events_total','app_dependency_duration_seconds',
        'app_database_operations_total','app_database_pool_connections'],
        'quarkus':['app_security_events_total','app_dependency_requests_total',
        'app_dependency_duration_seconds','app_database_failures_total']},
    'native_metrics_reused':['http_requests_received_total','http_request_duration_seconds',
        'http_requests_in_progress','http_server_requests_seconds','http_client_requests_seconds',
        'sql.pool.* allowlist','DotNetStats','Micrometer JVM/process/system'],
    'scrape_changes':'Inactive candidate only: retain user-api/vocabulary-api, add prometheus/fluent-bit; no JWKS activation'})
print(json.dumps({'preservation_checks':len(checks), 'all_preserved':all(checks.values()),
    'dotnet_passed':counters['passed'],'quarkus':summary['quarkus']['totals'],
    'reports':len(docs),'local_links':links,'manifest_entries':len(entries)}))
