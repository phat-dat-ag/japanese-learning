"""Verify the production topology using isolated, retained named database volumes.
Build :step89-check images first. Generated credentials travel over stdin only.
Never touches the development project or deletes a Docker volume.
"""
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hardening = load('hardening', 'verify-container-hardening.py')
operations = load('production', 'production.py')
metrics = load('metrics', 'verify-observability.py')


def main():
    project = 'jp-production-check-' + uuid.uuid4().hex[:10]
    env = os.environ.copy()
    db_password = 'Aa1!' + secrets.token_hex(24)
    mysql_password = secrets.token_hex(24)
    grafana_password = secrets.token_hex(24)
    env.update(MSSQL_PID='Express', RELEASE_TAG='step89-check', JWT_ISSUER='step89', JWT_AUDIENCE='step89',
               JWT_KEY_ID='step89', MYSQL_PASSWORD=mysql_password, MYSQL_ROOT_PASSWORD=secrets.token_hex(24),
               MSSQL_SA_PASSWORD=db_password, GRAFANA_ADMIN_PASSWORD=grafana_password)
    cmd = operations.compose_args(ROOT / 'deployment/production.env.example', project, True)
    result = subprocess.run(cmd + ['config', '--format', 'json'], cwd=ROOT, env=env, capture_output=True, text=True)
    assert result.returncode == 0, 'Production Compose invalid; diagnostics withheld'
    config = json.loads(result.stdout)
    operations.validate(config)
    missing = dict(env, MYSQL_PASSWORD='')
    rejected = subprocess.run(cmd + ['config', '--quiet'], cwd=ROOT, env=missing, capture_output=True, text=True)
    assert rejected.returncode != 0 and 'MYSQL_PASSWORD' in rejected.stderr
    assert all(value not in rejected.stdout + rejected.stderr for value in (db_password, mysql_password, grafana_password))
    print('PASS: missing production secret rejected without exposing values.', flush=True)
    # Preserve production networks, hardening and named-volume storage. Only use random
    # loopback test ports, with generated credentials and an isolated project name.
    for name, service in config['services'].items():
        service['ulimits']['core'] = 0
        service.pop('build', None)
        if name in ('frontend', 'grafana'):
            port = 8080 if name == 'frontend' else 3000
            service['ports'] = [f'127.0.0.1::{port}']
        service['environment'] = {key: value.replace('$', '$$') if isinstance(value, str) else value
                                  for key, value in service.get('environment', {}).items()}
    encoded = json.dumps(config)
    compose = ['compose', '-p', project, '-f', '-']
    docker = hardening.docker
    sensitive = [db_password, mysql_password, grafana_password, env['MYSQL_ROOT_PASSWORD']]
    try:
        print('Starting isolated production stack: ' + project, flush=True)
        original_run = operations.run
        def production_run(args, **kwargs):
            if args[:2] == ['docker', 'compose']:
                return docker(*args[1:], input=encoded)
            return original_run(args, **kwargs)
        operations.run = production_run
        operations.deploy(['docker', *compose], config, project, True)
        operations.verify(project, True)
        hardening.check_runtime(project)
        state = hardening.containers(project)
        port = int(state['frontend']['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'])
        status, index, headers = metrics.request(port, '/')
        assert status == 200 and '<app-root>' in index
        assert headers['X-Content-Type-Options'] == 'nosniff'
        assert re.fullmatch(r'[A-Za-z0-9_-]{1,64}', headers['X-Correlation-ID'])
        status, _, local_error = metrics.request(port, '/missing.js', {'X-Correlation-ID': 'invalid id'})
        assert status == 404 and re.fullmatch(r'[A-Za-z0-9_-]{1,64}', local_error['X-Correlation-ID'])
        for path in ('/login', '/flashcards/levels', '/admin/import'):
            status, page, _ = metrics.request(port, path)
            assert status == 200 and page == index, 'SPA fallback failed'
        assets = re.findall(r'(?:src|href)="([^\"]+\.(?:js|css))"', index)
        assert assets, 'No production bundles in document'
        for asset in assets:
            status, bundle, _ = metrics.request(port, '/' + asset)
            assert status == 200
            assert all(value not in bundle for value in (*sensitive, 'http://localhost:', 'http://user-api:', 'http://vocabulary-api:'))
        for path in ('/missing.js', '/metrics', '/q/metrics', '/.well-known/jwks.json', '/health/ready', '/.env'):
            assert metrics.request(port, path)[0] == 404, 'Infrastructure/static route leaked'
        print('PASS: production document and bundles, SPA deep links, security headers, infrastructure exclusions.', flush=True)
        api = lambda path, code, body=None, token=None: hardening.api(port, path, code, body, token)
        account = {'username': 'productionprobe', 'email': 'production@example.invalid', 'password': 'Aa1!' + secrets.token_hex(24)}
        sensitive.append(account['password'])
        api('/api/auth/register', 201, account)
        login = api('/api/auth/login', 200, {'email': account['email'], 'password': account['password']})
        token = login['accessToken']
        sensitive += [token, login['refreshToken']]
        api('/api/auth/me', 200, token=token)
        api('/api/auth/admin-test', 403, token=token)
        for path in ('/api/v1/jlpt-levels', '/api/v1/lessons?level=n5', '/api/v1/flashcards?level=n5&size=1'):
            api(path, 200, token=token)
        api('/api/v1/jlpt-levels', 401)
        api('/api/v1/jlpt-levels', 401, token='invalid-token-probe')
        error = api('/api/v1/lessons', 400, token=token)
        assert 'stackTrace' not in json.dumps(error) and 'Exception' not in json.dumps(error)
        refreshed = api('/api/auth/refresh', 200, {'refreshToken': login['refreshToken']})
        sensitive += [refreshed['accessToken'], refreshed['refreshToken']]
        api('/api/auth/logout', 204, {'refreshToken': refreshed['refreshToken']})
        api('/api/auth/refresh', 401, {'refreshToken': refreshed['refreshToken']})
        jwks = json.loads(docker('exec', state['user-api']['Id'], 'curl', '-fsS', 'http://127.0.0.1:8080/.well-known/jwks.json'))
        assert jwks['keys'] and all('d' not in key for key in jwks['keys'])
        # Only the generated account in this disposable project's DB is promoted.
        docker('exec', state['sqlserver']['Id'], 'sh', '-c',
               'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -d JapaneseLearningUser -Q "UPDATE dbo.Users SET Role=2 WHERE Email=\'production@example.invalid\';"')
        admin = api('/api/auth/login', 200, {'email': account['email'], 'password': account['password']})
        sensitive += [admin['accessToken'], admin['refreshToken']]
        api('/api/auth/admin-test', 200, token=admin['accessToken'])
        # Valid multipart framing with invalid JSON checks authorization without importing data.
        payload = '--probe\r\nContent-Disposition: form-data; name="file"; filename="probe.json"\r\nContent-Type: application/json\r\n\r\ninvalid-json\r\n--probe--\r\n'
        for bearer, expected in ((token, 403), (admin['accessToken'], 400)):
            status, _, _ = metrics.request(port, '/api/vocabularies/import',
                {'Authorization': 'Bearer ' + bearer, 'Content-Type': 'multipart/form-data; boundary=probe'}, 'POST', payload)
            assert status == expected, 'Import role check failed: ' + str(status)
        print('PASS: register/login, JWT/JWKS, User/Admin, refresh/logout, flashcard/lesson/JLPT, import role and safe errors.', flush=True)
        # Real limiter burst and refill through the production frontend.
        statuses = [metrics.request(port, '/api/auth/login', {'Content-Type': 'application/json'}, 'POST', '{}')[0] for _ in range(8)]
        assert 429 in statuses
        time.sleep(7)
        assert metrics.request(port, '/api/auth/login', {'Content-Type': 'application/json'}, 'POST', '{}')[0] == 400
        print('PASS: Gateway rate limiting and recovery through frontend.', flush=True)
        # Read backend metrics internally; no backend or Prometheus ports are published.
        for name, path in (('user-api', '/metrics'), ('vocabulary-api', '/q/metrics')):
            body = docker('exec', state[name]['Id'], 'curl', '-fsS', 'http://127.0.0.1:8080' + path)
            assert not any(value in body for value in sensitive)
        grafana_port = int(state['grafana']['NetworkSettings']['Ports']['3000/tcp'][0]['HostPort'])
        auth = {'Authorization': 'Basic ' + base64.b64encode(('admin:' + grafana_password).encode()).decode()}
        assert metrics.request(grafana_port, '/api/datasources')[0] == 401
        for _ in range(25):
            status, body, _ = metrics.request(grafana_port, '/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?query=up', auth)
            samples = json.loads(body).get('data', {}).get('result', [])
            if status == 200 and len(samples) == 2 and all(item['value'][1] == '1' for item in samples):
                break
            time.sleep(2)
        else:
            raise AssertionError('Production scrape targets not UP')
        dashboard = json.loads((ROOT / 'observability/grafana/dashboards/apis.json').read_text())
        for panel in dashboard['panels']:
            query = urllib.parse.urlencode({'query': panel['targets'][0]['expr']})
            status, body, _ = metrics.request(grafana_port, '/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?' + query, auth)
            assert status == 200 and json.loads(body)['status'] == 'success'
        print('PASS: internal metrics, both Prometheus targets UP, authenticated Grafana and all panel queries.', flush=True)
        # Reuse aggregate fingerprints from Step 8.6 on this project via Compose env.
        old_configuration, old_docker = hardening.configuration, hardening.docker
        hardening.configuration = lambda: config
        def scoped_docker(*args, **kwargs):
            if args and args[0] == 'compose':
                return docker(*compose, *args[1:], input=encoded)
            return docker(*args, **kwargs)
        hardening.docker = scoped_docker
        before = hardening.persistence_snapshot()
        docker(*compose, 'stop', 'frontend', 'gateway', 'vocabulary-api', 'user-api', input=encoded)
        docker(*compose, 'up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '240', 'mysql', 'sqlserver', input=encoded)
        assert before == hardening.persistence_snapshot(), 'Database persistence changed'
        operations.deploy(['docker', *compose], config, project, True)
        hardening.configuration, hardening.docker = old_configuration, old_docker
        operations.verify(project, True)
        state = hardening.containers(project)
        port = int(state['frontend']['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'])
        persisted = hardening.api(port, '/api/auth/login', 200, {'email': account['email'], 'password': account['password']})
        sensitive += [persisted['accessToken'], persisted['refreshToken']]
        print('PASS: database volume identities and data fingerprints survive recreation; repeated migrations succeed; persisted account works.', flush=True)
        for item in state.values():
            logs = docker('logs', item['Id'])
            assert not any(value in logs for value in sensitive), 'Sensitive value in service log'
        print('PASS: inspected service logs, metrics and frontend bundles contain no generated credentials/tokens.', flush=True)
    finally:
        docker(*compose, 'down', '--timeout', '75', input=encoded)
        print('Stopped isolated project; database/monitoring test volumes retained: ' + project, flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not print captured Docker diagnostics, environments or request contents.
        print('FAIL: production verification: ' + (str(error) if isinstance(error, AssertionError) else type(error).__name__), flush=True)
        raise SystemExit(1)
