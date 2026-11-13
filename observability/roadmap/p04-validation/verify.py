"""Read-only source/exposition checks. Uses only named local test exports; no services."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE/'evidence'
EXPORTS = [
    ROOT/'dotnet/tests/JapaneseLearning.User.UnitTests/bin/Debug/net9.0/p04-exposition.prom',
    ROOT/'dotnet/tests/JapaneseLearning.User.UnitTests/bin/Debug/net9.0/p04-sql-fixture.prom',
    *sorted((ROOT/'dotnet/tests/JapaneseLearning.User.UnitTests/bin/Debug/net9.0').glob('p04-dependency-*.prom')),
    ROOT/'quarkus/target/p04-exposition.prom',
    ROOT/'quarkus/target/p04-mysql-spi.prom',
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(path):
    text = path.read_text(encoding='utf-8')
    families = dict(re.findall(r'^# TYPE (\S+) (\S+)$', text, re.M))
    labels = {}
    samples = 0
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.match(r'([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*?)\})?\s+', line)
        assert match, line
        samples += 1
        values = re.findall(r'([a-zA-Z_][a-zA-Z0-9_]*)="([^"\\]*)"', match[2] or '')
        for key, value in values:
            labels.setdefault(match[1], {}).setdefault(key, set()).add(value)
    return {'source':str(path.relative_to(ROOT)).replace('\\','/'),
            'scope':'local app process or synthetic provider SPI fixture; not deployed scrape',
            'sha256':digest(path), 'samples':samples, 'families':families,
            'labels':{name:{key:sorted(value) for key,value in tags.items()} for name,tags in labels.items()}}


class P04Checks(unittest.TestCase):
    def test_preserves_preexisting_program_p03_and_protected_configuration(self):
        before = json.loads((EVIDENCE/'preflight.json').read_text())
        for path, value in before['p03_hashes'].items():
            self.assertEqual(value, digest(ROOT/path), path)
        program = 'dotnet/src/JapaneseLearning.User.Api/Program.cs'
        self.assertEqual(before['preexisting_files'][program], digest(ROOT/program))
        for path, value in before['protected_source_sha256'].items():
            self.assertEqual(value, digest(ROOT/path), path)
        process = subprocess.run(['git', 'diff', '--exit-code', '--', 'docker-compose.yml',
            'compose.observability.yml', 'compose.production.yml', 'compose.production-observability.yml',
            'observability/prometheus.yml', 'observability/grafana'], cwd=ROOT, capture_output=True)
        self.assertEqual(0, process.returncode)
        self.assertIn('quarkus.swagger-ui.always-include=true',
                      (ROOT/'quarkus/src/main/resources/application.properties').read_text())

    def test_scrape_candidates_keep_api_jobs_and_add_no_duplicates(self):
        candidate = (HERE/'prometheus.p04.yml').read_text()
        original = (ROOT/'observability/prometheus.yml').read_text()
        jobs = re.findall(r'^  - job_name: (\S+)', candidate, re.M)
        self.assertEqual(['user-api','vocabulary-api','prometheus','fluent-bit'], jobs)
        self.assertEqual(len(jobs), len(set(jobs)))
        self.assertEqual(4, candidate.count('sample_limit: 5000'))
        self.assertEqual(4, candidate.count('label_limit: 16'))
        api_blocks = candidate.split('  - job_name: prometheus')[0].split('scrape_configs:')[1]
        self.assertEqual(original.split('scrape_configs:')[1].strip(), api_blocks.strip())
        self.assertNotRegex(candidate.lower(), r'bearer_token|authorization|password|rule_files')
        for path in ROOT.glob('*compose*.yml'):
            self.assertNotIn('p04-validation', path.read_text())

    def test_preregistry_patterns_are_disjoint_for_registered_routes_and_ten_thousand_unknowns(self):
        properties = (ROOT/'quarkus/src/main/resources/application.properties').read_text()
        value = next(line.split('=',1)[1] for line in properties.splitlines()
                     if line.startswith('quarkus.micrometer.binder.http-server.match-patterns='))
        rules = [(re.compile(pattern), target) for pattern,target in
                 (part.rsplit('=',1) for part in value.split(','))]
        cases = {'/api/v1/flashcards/123':'/api/v1/flashcards',
            '/api/v1/jlpt-levels':'/api/v1/jlpt-levels', '/api/v1/lessons':'/api/v1/lessons',
            '/api/v1/lessons/123/content':'/p04/grammar',
            '/api/v1/lessons/content/import':'/p04/grammar',
            '/api/v1/admin/kanji-quiz/questions/123':'/p04/quiz_admin',
            '/api/v1/kanji-quiz/history':'/p04/quiz',
            '/api/v1/admin/vocabularies/123':'/p04/vocabulary_admin',
            '/api/vocabularies/import':'/api/vocabularies/import'}
        for path, expected in cases.items():
            self.assertEqual([expected], [target for pattern,target in rules if pattern.match(path)])
        for index in range(10000):
            path = '/unknown/secret-sentinel-'+str(index)
            self.assertEqual(['/other'], [target for pattern,target in rules if pattern.match(path)])

    def test_real_test_expositions_have_safe_labels_and_bounded_sample_counts(self):
        self.assertGreaterEqual(len(EXPORTS), 8)
        for path in EXPORTS:
            self.assertTrue(path.exists(), str(path))
            text = path.read_text()
            for marker in ('sentinel', 'trace_id=', 'span_id=', 'user_id=', 'correlation',
                           'Authorization=', 'connectionString=', 'clientName=', 'uri='):
                self.assertNotIn(marker, text, str(path))
            result = inventory(path)
            self.assertGreater(result['samples'], 0)
            self.assertLess(result['samples'], 5000)

    def test_native_provider_and_runtime_dependencies_are_reused(self):
        project = (ROOT/'dotnet/src/JapaneseLearning.User.Api/JapaneseLearning.User.Api.csproj').read_text()
        self.assertIn('prometheus-net.AspNetCore', project)
        self.assertNotIn('OpenTelemetry', project)
        self.assertIn('quarkus-micrometer-registry-prometheus', (ROOT/'quarkus/pom.xml').read_text())
        self.assertNotIn('quarkus-smallrye-metrics', (ROOT/'quarkus/pom.xml').read_text())
        self.assertIn('EventCounterIntervalSec', (ROOT/'dotnet/src/JapaneseLearning.User.Api/Observability/SqlClientMetrics.cs').read_text())


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(P04Checks))
    (EVIDENCE/'fixture-results.json').write_text(json.dumps({'executed':result.testsRun,
        'failures':len(result.failures), 'errors':len(result.errors),
        'scope':'source checks and actual local test exposition files; no Docker/Prometheus scrape'},indent=2)+'\n')
    if result.wasSuccessful():
        (EVIDENCE/'metrics-inventory.json').write_text(json.dumps([inventory(p) for p in EXPORTS],indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
