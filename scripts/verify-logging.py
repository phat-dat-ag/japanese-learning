"""Isolated Docker test: real ingestion, mappings, UI auth, restart, outage, and rotation.
Creates only jp-logging-check-* resources and removes that test project's volumes.
Never reads application logs or writes existing application volumes.
"""
import base64
import copy
import http.client
import json
import os
import importlib.util
import secrets
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ('opensearch', 'logging-init', 'fluent-bit', 'opensearch-dashboards', 'logs-ui', 'logging-ui-init')


def run(args, body=None, env=None):
    result = subprocess.run(args, cwd=ROOT, input=body, capture_output=True, text=True, encoding='utf-8', env=env)
    if result.returncode:
        (ROOT / '.local' / 'logging-last-error.txt').write_text(result.stderr, encoding='utf-8')
        raise RuntimeError('Docker check failed; diagnostics withheld. Inspect this test project locally.')
    return result.stdout


def main():
    env = os.environ.copy()
    for key in ('MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MSSQL_SA_PASSWORD', 'GRAFANA_ADMIN_PASSWORD'):
        env[key] = 'Aa1!' + secrets.token_hex(24)
    env.update(RELEASE_TAG='logging-config-check', MSSQL_PID='Express')
    spec = importlib.util.spec_from_file_location('production', ROOT / 'scripts/production.py')
    production = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(production)
    # Validate the production boundary without using or printing real database secrets.
    args = production.compose_args(ROOT / '.env', 'logging-config-check', monitoring=True)
    production.validate(json.loads(run(args + ['config', '--format', 'json'], env=env)))
    print('PASS: combined production/metrics/logging Compose security configuration.', flush=True)
    if '--config-only' in sys.argv:
        return
    # Test the current checkout, not an older image left by a different project.
    run(['docker', 'compose', '-f', 'docker-compose.yml', 'build',
         'opensearch', 'fluent-bit', 'opensearch-dashboards'])
    project = 'jp-logging-check-' + uuid.uuid4().hex[:10]
    directory = ROOT / '.local' / project
    directory.mkdir(parents=True)
    source = json.loads(run(['docker', 'compose', '-f', 'docker-compose.yml', 'config', '--format', 'json']))
    services = {name: copy.deepcopy(source['services'][name]) for name in SERVICES}
    for name, service in services.items():
        if service.pop('build', None):
            service.setdefault('image', source['name'] + '-' + name)
        # Compose's JSON serializer represents a zero core limit as {}, which is
        # not accepted when that resolved JSON is reused as a Compose input.
        for name, limit in service.get('ulimits', {}).items():
            if limit == {}:
                service['ulimits'][name] = 0
    services['logs-ui']['ports'][0]['published'] = '0'
    services['seed'] = {
        'image': source['services']['logging-init']['image'], 'user': '0:0', 'network_mode': 'none',
        'entrypoint': ['python', '-B', '/config/verify-fixtures.py'],
        'volumes': [
            {'type': 'bind', 'source': str(ROOT / 'observability/logging'), 'target': '/config', 'read_only': True},
            *[{'type': 'volume', 'source': volume, 'target': target} for volume, target in (
                ('jwks_api_logs', '/logs/jwks'), ('user_api_logs', '/logs/user'), ('vocabulary_api_logs', '/logs/vocabulary'))]]}
    config = {'services': services,
              'networks': {name: {k: v for k, v in item.items() if k != 'name'} for name, item in source['networks'].items() if name.startswith('log-')},
              'volumes': {name: {} for name in ('opensearch_data', 'dashboards_data', 'fluent_bit_state',
                                              'jwks_api_logs', 'user_api_logs', 'vocabulary_api_logs')}}
    file = directory / 'compose.json'
    file.write_text(json.dumps(config), encoding='utf-8')
    cmd = ['docker', 'compose', '-p', project, '-f', str(file)]
    print('Testing isolated project ' + project, flush=True)
    try:
        marker = 'logcheck-' + uuid.uuid4().hex
        run(cmd + ['run', '--rm', '-e', 'MARKER=' + marker, 'seed'])
        run(cmd + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '300', *SERVICES])
        opensearch = run(cmd + ['ps', '-q', 'opensearch']).strip()
        running = json.loads(run(['docker', 'inspect', *run(cmd + ['ps', '-q']).split()]))
        for item in running:
            assert item['HostConfig']['ReadonlyRootfs']
            assert item['Config']['User'] not in ('', '0', 'root', '0:0')
            assert 'ALL' in item['HostConfig']['CapDrop']
            if item['Config']['Labels']['com.docker.compose.service'] != 'logs-ui':
                assert not item['HostConfig'].get('PortBindings')

        def api(path, body=None):
            args = ['docker', 'exec', '-i', opensearch, 'curl', '-fsS', 'http://127.0.0.1:9200' + path]
            if body is not None:
                args += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
            return json.loads(run(args, None if body is None else json.dumps(body)))

        def wait_for(value):
            deadline = time.monotonic() + 90
            while True:
                try:
                    response = api('/application-logs-*/_search', {'size': 20, 'query': {'term': {'correlation_id': value}}})
                    if len(response['hits']['hits']) == 3:
                        for item in response['hits']['hits']:
                            expected = 'application-logs-' + item['_source']['service_name'] + '-'
                            assert item['_index'].startswith(expected), 'Service routed to the wrong index'
                        return [item['_source'] for item in response['hits']['hits']]
                except (RuntimeError, KeyError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Expected all three service records in OpenSearch; test project: ' + project)
                time.sleep(2)

        records = wait_for(marker)
        assert {item['service_name'] for item in records} == {'jwks-api', 'user-api', 'vocabulary-api'}
        assert all(item['http_status'] == 200 and isinstance(item['duration_ms'], (int, float)) for item in records)
        assert all('original' in item for item in records)
        assert next(item for item in records if item['service_name'] == 'vocabulary-api')['is_slow'] is True
        assert next(item for item in records if item['service_name'] == 'user-api')['is_slow'] is False
        api('/application-logs-*/_refresh', {})
        policy = api('/_plugins/_ism/policies/application-logs-retention')
        assert policy['policy']['states'][0]['transitions'][0]['conditions']['min_index_age'] == '30d'
        run(cmd + ['run', '--rm', 'logging-init'])
        print('PASS: three schemas normalized/indexed, typed fields and originals retained, retention/setup idempotent.', flush=True)

        port = int(run(cmd + ['port', 'logs-ui', '8080']).strip().rsplit(':', 1)[1])
        credentials = dict(line.split('=', 1) for line in (ROOT / '.env.logging').read_text().splitlines() if line and not line.startswith('#'))
        token = base64.b64encode((credentials['LOGS_UI_USERNAME'] + ':' + credentials['LOGS_UI_PASSWORD']).encode()).decode()
        for headers, expected in (({}, 401), ({'Authorization': 'Basic ' + token}, 200)):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=20)
            connection.request('GET', '/api/status', headers=headers)
            response = connection.getresponse()
            assert response.status == expected
            response.read()
            connection.close()
        print('PASS: UI rejects anonymous access and accepts generated bcrypt credentials.', flush=True)
        run(cmd + ['restart', 'fluent-bit'])
        time.sleep(5)
        assert len(wait_for(marker)) == 3
        run(cmd + ['stop', 'opensearch'])
        buffered = 'buffered-' + uuid.uuid4().hex
        run(cmd + ['run', '--rm', '-e', 'MARKER=' + buffered, 'seed'])
        time.sleep(6)
        run(cmd + ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '240', 'opensearch'])
        wait_for(buffered)
        rotated = 'rotated-' + uuid.uuid4().hex
        run(cmd + ['run', '--rm', '-e', 'MARKER=' + rotated, '-e', 'ROTATE=1', 'seed'])
        wait_for(rotated)
        print('PASS: offsets survive restart; outage buffering and file rotation deliver all three services.', flush=True)
    except Exception:
        diagnostics = subprocess.run(cmd + ['logs', '--no-color', '--tail', '80'], cwd=ROOT, capture_output=True, text=True)
        (directory / 'diagnostics.txt').write_text(diagnostics.stdout + diagnostics.stderr, encoding='utf-8')
        ids = subprocess.run(cmd + ['ps', '-aq'], cwd=ROOT, capture_output=True, text=True).stdout.split()
        if ids:
            state = subprocess.run(['docker', 'inspect', '--format', '{{.Name}} {{json .State}}', *ids], capture_output=True, text=True)
            (directory / 'states.txt').write_text(state.stdout, encoding='utf-8')
        raise
    finally:
        assert project.startswith('jp-logging-check-') and len(project) == len('jp-logging-check-') + 10
        run(cmd + ['down', '--volumes', '--remove-orphans'])
        print('Removed isolated verification containers and volumes.', flush=True)


if __name__ == '__main__':
    main()
