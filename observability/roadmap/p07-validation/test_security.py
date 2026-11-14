"""Execute real Lua filters and offline security/compatibility fixtures; no containers."""
import json
import math
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.local/p07-tools'))
from lupa.luajit21 import LuaRuntime

CANDIDATE = ROOT / 'observability/p07'
EVIDENCE = Path(__file__).resolve().parent / 'evidence'


def plain(value):
    if hasattr(value, 'items'):
        return {key: plain(item) for key, item in value.items()}
    return value


class LuaPrivacyTests(unittest.TestCase):
    def setUp(self):
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.lua.execute((CANDIDATE / 'fluent-bit/normalize.lua').read_text())

    def adapt(self, record, tag='apps.user-api'):
        carrier = self.lua.table_from(record, recursive=True) if record is not None else None
        code, timestamp, result = self.lua.globals().normalize(tag,
            self.lua.table_from({'sec': 1763000000, 'nsec': 123}), carrier)
        self.assertEqual(timestamp['nsec'], 123)
        return code, plain(result)

    def test_nested_header_body_credentials_and_original_are_not_forwarded(self):
        for field in ['original', 'Properties', 'Authorization', 'Cookie', 'password', 'privateKey',
                      'connectionString', 'request', 'response', 'body', 'headers', 'sessionId', 'email']:
            record = {field: {'nested': 'P07_SECRET_SENTINEL'}, 'event_name': 'http.request.completed',
                      'http_status': 200, 'duration_ms': 1.25, 'count': 3}
            code, result = self.adapt(record)
            self.assertEqual(code, 2)
            self.assertNotIn('P07_SECRET_SENTINEL', json.dumps(result))
            self.assertNotIn(field, result)
            self.assertEqual(result['http_status'], 200)
            self.assertEqual(result['duration_ms'], 1.25)
            self.assertEqual(result['count'], 3)

    def test_free_text_errors_routes_and_encoded_values_are_removed(self):
        for secret in ['P07_TOKEN_SENTINEL', 'user@example.test', 'Bearer P07_TOKEN',
                       '%50%30%37_SECRET', '\\u0050\\u0030\\u0037_SECRET',
                       'jdbc:mysql://account:secret@fixture.invalid/db', '-----BEGIN PRIVATE KEY-----']:
            code, result = self.adapt({'message': secret, 'RenderedMessage': secret, 'log': secret,
                'event_name': secret, 'error_type': secret, 'error_code': secret, 'operation': secret,
                'http_route': '/api/users/' + secret, 'http_method': 'GET', 'service_version': secret,
                'service_instance_id': secret})
            self.assertEqual(code, 2)
            self.assertNotIn(secret, json.dumps(result))
            self.assertEqual(result['message'], 'log.message')
            self.assertEqual(result['http_route'], '/unmatched')

    def test_both_native_producers_retain_numeric_boolean_and_independent_context(self):
        for tag in ['apps.user-api', 'apps.vocabulary-api']:
            code, result = self.adapt({'event_name': 'http.request.completed', 'http_status': 503,
                'duration_ms': 2.5, 'authenticated': False, 'is_slow': False,
                'correlation_id': 'diagnostic_1', 'trace_id': 'a' * 32, 'span_id': 'b' * 16,
                'parent_span_id': 'c' * 16, 'environment': 'test', 'route_family': 'auth',
                'http_method': 'POST', 'http_route': '/api/auth/login', 'error_category': 'dependency',
                'error_type': 'System.TimeoutException', 'error_code': 'INTERNAL_SERVER_ERROR'}, tag)
            self.assertEqual(code, 2)
            self.assertEqual(result['service_name'], tag[5:])
            self.assertEqual(result['correlation_id'], 'diagnostic_1')
            self.assertEqual(result['trace_id'], 'a' * 32)
            self.assertEqual(result['span_id'], 'b' * 16)
            self.assertIs(result['authenticated'], False)
            self.assertEqual(result['error_type'], 'System.TimeoutException')
            self.assertEqual(result['error_category'], 'dependency')
            self.assertEqual(result['http_route'], '/api/auth/login')

    def test_dotnet_native_properties_compatibility(self):
        code, result = self.adapt({'Timestamp': '2026-11-13T00:00:00.0000000Z',
            'Level': 'Information', 'Properties': {'EventName': 'HttpRequestCompleted',
                'CorrelationId': 'native_1', 'StatusCode': 401, 'ElapsedMilliseconds': 3.5,
                'IsSlow': False, 'Environment': 'Test', 'Password': 'P07_SECRET'}})
        self.assertEqual(code, 2)
        self.assertEqual(result['level'], 'INFO')
        self.assertEqual(result['event_name'], 'http.request.completed')
        self.assertEqual(result['timestamp_source'], 'producer')
        self.assertEqual(result['correlation_id'], 'native_1')

    def test_unknown_services_and_filter_errors_fail_closed(self):
        for record, tag in [(None, 'apps.user-api'), ({}, 'apps.foreign'), ({}, None)]:
            code, result = self.adapt(record, tag)
            self.assertEqual(code, -1)
            self.assertEqual(result, {})

    def test_invalid_dates_and_numeric_extremes_cannot_poison_documents(self):
        for stamp in ['2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z']:
            code, result = self.adapt({'@timestamp': stamp, 'duration_ms': math.inf,
                                      'count': 1e100, 'http_status': 200.5})
            self.assertEqual(code, 2)
            self.assertEqual(result['timestamp_source'], 'collector')
            self.assertNotEqual(result['@timestamp'], stamp)
            self.assertNotIn('duration_ms', result)
            self.assertNotIn('count', result)
            self.assertNotIn('http_status', result)

    def test_business_events_remain_distinct_without_session_identifiers(self):
        code, result = self.adapt({'event_name': 'quiz.answer.completed', 'count': 1, 'total': 2,
            'message': 'sessionId=P07_SESSION', 'sessionId': 'P07_SESSION'}, 'apps.vocabulary-api')
        self.assertEqual(code, 2)
        self.assertEqual(result['event_name'], 'quiz.answer.completed')
        self.assertEqual(result['count'], 1)
        self.assertNotIn('P07_SESSION', json.dumps(result))

    def test_actual_p03_lua_fixture_now_executes(self):
        lua = LuaRuntime(unpack_returned_tuples=True)
        output = []
        lua.globals().print = lambda value: output.append(str(value))
        lua.execute((ROOT / 'observability/roadmap/p03-validation/test_adapter.lua').read_text())
        self.assertTrue(output and output[-1].startswith('PASS:'))
        (EVIDENCE / 'p03-lua-execution.json').write_text(json.dumps({
            'engine': lua.eval('jit.version'), 'output': output,
            'scope': 'Actual P03 Lua adapter fixture; not Fluent Bit MessagePack or stored OpenSearch'}, indent=2) + '\n')


class ConfigurationAndBudgetTests(unittest.TestCase):
    def test_current_jwks_spool_path_is_covered_without_shared_source_changes(self):
        source = (ROOT / 'springboot-jwks-api/src/main/resources/logback-spring.xml').read_text()
        self.assertIn('/spool/', source)
        config = (CANDIDATE / 'fluent-bit/fluent-bit.conf').read_text()
        self.assertIn('Path /logs/jwks/spool/*.log', config)
        self.assertNotIn('Path /logs/jwks/*.log', config)

    def test_fluent_bit_records_cannot_use_filesystem_chunks(self):
        config = (CANDIDATE / 'fluent-bit/fluent-bit.conf').read_text()
        self.assertEqual(config.count('storage.type memory'), 3)
        self.assertEqual(config.count('Mem_Buf_Limit 8M'), 3)
        self.assertNotIn('storage.path', config)
        self.assertNotIn('filesystem', config)
        self.assertIn('Retry_Limit 3', config)
        self.assertIn('Trace_Output Off', config)

    def test_opensearch_future_source_shape_is_allowlisted(self):
        template = json.loads((CANDIDATE / 'opensearch/index-template.json').read_text())
        mapping = template['template']['mappings']
        self.assertFalse(mapping['dynamic'])
        self.assertNotIn('original', mapping['_source']['includes'])
        self.assertEqual(set(mapping['_source']['includes']), set(mapping['properties']))
        self.assertLessEqual(len(mapping['properties']), 64)
        lua = LuaPrivacyTests()
        lua.setUp()
        _, result = lua.adapt({'event_name': 'http.request.completed', 'http_status': 200,
                              'duration_ms': 2.5, 'body': 'P07_SECRET'})
        stored_shape_fixture = {k: v for k, v in result.items() if k in mapping['_source']['includes']}
        self.assertEqual(stored_shape_fixture['http_status'], 200)
        self.assertNotIn('P07_SECRET', json.dumps(stored_shape_fixture))

    def test_prometheus_privacy_does_not_rename_or_collapse_safe_series(self):
        before = json.loads((ROOT / 'observability/p05-candidate/prometheus/prometheus.yml').read_text())
        after = json.loads((CANDIDATE / 'prometheus/prometheus.yml').read_text())
        self.assertEqual(after['global'], before['global'])
        self.assertEqual(after['storage']['exemplars']['max_exemplars'], 0)
        required = {'job', 'instance', '__name__', 'route', 'route_family', 'code', 'status', 'method',
                    'http_method', 'le', 'dependency', 'operation', 'outcome', 'state', 'pool', 'category'}
        for job, previous in zip(after['scrape_configs'], before['scrape_configs']):
            for key, value in previous.items():
                self.assertEqual(job[key], value)
            for rule in job.get('metric_relabel_configs', []):
                self.assertEqual(rule['action'], 'drop')
                self.assertFalse(set(rule['source_labels']) & required)
                self.assertNotEqual(rule['regex'], '')
        self.assertEqual((CANDIDATE / 'prometheus/rules/p05.rules.yml').read_bytes(),
                         (ROOT / 'observability/p05-candidate/prometheus/rules/p05.rules.yml').read_bytes())

    def test_grafana_existing_datasources_and_providers_are_byte_identical(self):
        for source in (ROOT / 'observability/p06/grafana/provisioning').rglob('*'):
            if source.is_file():
                target = CANDIDATE / 'grafana/provisioning' / source.relative_to(ROOT / 'observability/p06/grafana/provisioning')
                self.assertEqual(source.read_bytes(), target.read_bytes())
        root = (ROOT / 'docker-compose.yml').read_text()
        self.assertIn('GF_USERS_AUTO_ASSIGN_ORG_ROLE: Viewer', root)
        self.assertIn('source: ./observability/p07/grafana/provisioning', root)

    def test_collector_drops_links_events_and_freeform_routes_before_batching(self):
        data = json.loads((CANDIDATE / 'collector.yml').read_text())
        processors = data['service']['pipelines']['traces']['processors']
        self.assertLess(processors.index('transform/privacy'), processors.index('batch'))
        self.assertIn('Len(links) > 0', data['processors']['filter/privacy']['traces']['span'])
        self.assertEqual(data['processors']['filter/privacy']['traces']['spanevent'], ['true'])
        statements = json.dumps(data['processors']['transform/privacy']['trace_statements'])
        self.assertIn('delete_key(attributes, \\"http.route\\")', statements)
        exporter = data['exporters']['otlp/tempo']
        self.assertEqual(exporter['sending_queue']['queue_size'], 64)
        self.assertEqual(exporter['retry_on_failure']['max_elapsed_time'], '30s')

    def test_storage_formulas_and_pressure_thresholds_are_explicit_assumptions(self):
        data = json.loads((Path(__file__).parent / 'storage-budget.json').read_text())
        a = data['assumptions']
        log_bytes_day = a['application_services'] * a['events_per_service_second'] * a['bytes_per_event'] * 86400
        self.assertEqual(log_bytes_day, 265420800)
        search_bytes = log_bytes_day * a['opensearch_index_expansion_factor'] * a['opensearch_retention_days']
        self.assertLess(search_bytes, data['budgets_gib']['opensearch'] * 1024**3)
        self.assertEqual(a['tempo_ingestion_limit_bytes_second'] * 86400, 1382400000)
        self.assertLess(sum(data['budgets_gib'].values()), data['total_pool_proposal_gib'])
        self.assertLess(data['warning_fraction'], data['critical_fraction'])
        self.assertLess(data['critical_fraction'], data['emergency_fraction'])
        self.assertFalse(data['hard_filesystem_quota_enforced'])

    def test_queue_overflow_and_retry_reference_model_reports_loss(self):
        # Reference model only: bounded memory rejects arrivals; not a Fluent Bit execution.
        capacity = 8 * 1024 * 1024
        accepted = min(10000, capacity // 2048)
        rejected = 10000 - accepted
        self.assertEqual(accepted, 4096)
        self.assertEqual(rejected, 5904)
        self.assertEqual(accepted + rejected, 10000)
        self.assertLessEqual(accepted * 2048, capacity)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    (EVIDENCE / 'security-tests.json').write_text(json.dumps({'engine': 'LuaJIT 2.1 via lupa 2.8',
        'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
        'runtime_backend_validation': False,
        'limitations': 'OTTL structure/native validation and document/queue models are not stored telemetry/runtime tests'}, indent=2) + '\n')
    sys.exit(not result.wasSuccessful())
