"""Idempotent mappings, daily-index retention, and Discover index-pattern setup."""
import json
import os
import ssl
import base64
import time
import urllib.error
import urllib.request

BASE = 'https://opensearch:9200'
TLS = ssl.create_default_context(cafile='/run/p07/ca.pem')
TLS.load_cert_chain('/run/p07/admin.pem', '/run/p07/admin.key')


def request(path, body=None, method=None, base=BASE):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json', 'osd-xsrf': 'logging-setup'})
    if base != BASE:
        # Default global metadata alias; avoid the version-specific tenant-header
        # mismatch. The reader has read-only access to this exact alias/index.
        req.add_header('Authorization', 'Basic ' + base64.b64encode(
            ('administrator:' + os.environ['P07_ADMIN_PASSWORD']).encode()).decode())
    with urllib.request.urlopen(req, timeout=20, context=TLS) as response:
        return json.load(response)


def configure():
    days = int(os.environ.get('LOG_RETENTION_DAYS', '30'))
    if not 1 <= days <= 3650:
        raise ValueError('LOG_RETENTION_DAYS must be between 1 and 3650')
    policy_path = '/_plugins/_ism/policies/application-logs-retention'
    policy = {'policy': {
        'description': 'Application log retention, measured from daily index creation',
        'default_state': 'retain',
        'states': [
            {'name': 'retain', 'actions': [], 'transitions': [
                {'state_name': 'delete', 'conditions': {'min_index_age': str(days) + 'd'}}]},
            {'name': 'delete', 'actions': [{'delete': {}}], 'transitions': []}],
        'ism_template': [{'index_patterns': ['application-logs-*'], 'priority': 100}]}}
    try:
        existing = request(policy_path)
        policy_path += '?if_seq_no={}&if_primary_term={}'.format(existing['_seq_no'], existing['_primary_term'])
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    request(policy_path, policy, 'PUT')
    properties = {key: {'type': 'keyword'} for key in (
        'service_name', 'environment', 'level', 'event_name', 'correlation_id', 'trace_id', 'span_id',
        'parent_span_id', 'http_method', 'http_route', 'caller_service', 'peer_address', 'handler_class',
        'handler_method', 'operation', 'operation_class', 'operation_method', 'outcome', 'error_code', 'error_type')}
    properties.update({
        '@timestamp': {'type': 'date'}, 'collected_at': {'type': 'date'}, 'message': {'type': 'text'},
        'http_status': {'type': 'integer'}, 'duration_ms': {'type': 'double'}, 'peer_port': {'type': 'integer'},
        'is_slow': {'type': 'boolean'}, 'authenticated': {'type': 'boolean'},
        'original': {'type': 'object', 'enabled': False}})
    request('/_index_template/application-logs', {'index_patterns': ['application-logs-*'], 'priority': 100,
        'template': {'settings': {'number_of_shards': 1, 'number_of_replicas': 0},
                     'mappings': {'dynamic': False, 'properties': properties}}}, 'PUT')
    with open('/p07/index-template.json', encoding='utf-8') as template_file:
        template = json.load(template_file)
    template['_meta'] = {'phase': 'P07', 'status': 'active development'}
    request('/_index_template/application-logs-p07', template, 'PUT')
    request('/_cluster/settings', {'persistent': {'search.max_buckets': 10000}}, 'PUT')
    print('Configured log mappings and {}-day index retention.'.format(days), flush=True)


def dashboards():
    deadline = time.monotonic() + 300
    while True:
        try:
            for name in ('application-logs', 'application-logs-jwks-api',
                         'application-logs-user-api', 'application-logs-vocabulary-api'):
                request('/api/saved_objects/index-pattern/' + name + '?overwrite=true',
                        {'attributes': {'title': name + '-*', 'timeFieldName': '@timestamp'}},
                        'POST', base='https://opensearch-dashboards:5601')
            request('/api/opensearch-dashboards/settings', {'changes': {'defaultIndex': 'application-logs'}},
                    'POST', base='https://opensearch-dashboards:5601')
            print('Configured combined and per-service Discover index patterns.', flush=True)
            return
        except (OSError, ValueError):
            if time.monotonic() > deadline:
                raise RuntimeError('Dashboards setup timed out') from None
            time.sleep(3)


if __name__ == '__main__':
    import sys
    if '--dashboards' in sys.argv:
        dashboards()
    else:
        configure()
