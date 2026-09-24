"""Runtime checks for verify-final-e2e.py. Only receives an isolated Environment."""
import base64
import contextlib
import importlib.util
import io
import sys
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.client
import json
import re
import subprocess
import time
import urllib.parse


def operation(e, action):
    spec = importlib.util.spec_from_file_location('production_cli', e.directory.parents[2] / 'scripts/production.py')
    ops = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ops)
    original_run, original_argv = ops.run, sys.argv
    def run(args, **kwargs):
        if args[:2] == ['docker', 'compose']:
            return original_run(args, input=e.encoded)
        return original_run(args, **kwargs)
    ops.run = run
    ops.compose_args = lambda *args, **kwargs: e.stdin_cmd
    sys.argv = ['production.py', '--env-file', str(e.env_file), '--project', e.project, '--monitoring', action]
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            ops.main()
    finally:
        sys.argv = original_argv
    assert not any(value in output.getvalue() for value in e.sensitive if len(value) >= 8), 'Operations output leaked a secret'
    return output.getvalue()


class Client:
    def __init__(self, environment):
        self.e = environment
        self.last_auth = 0

    def request(self, path, expected, *, token=None, body=None, method=None, headers=None, pace=True):
        if pace and path in ('/api/auth/register', '/api/auth/login'):
            time.sleep(max(0, 6.2 - (time.monotonic() - self.last_auth)))
            self.last_auth = time.monotonic()
        request_headers = {'X-Correlation-ID': 'final-e2e-correlation'}
        request_headers.update(headers or {})
        if token:
            request_headers['Authorization'] = 'Bearer ' + token
        if body is not None and not isinstance(body, (str, bytes)):
            body = json.dumps(body).encode()
            request_headers['Content-Type'] = 'application/json'
        connection = http.client.HTTPConnection('127.0.0.1', self.e.port, timeout=30)
        try:
            connection.request(method or ('POST' if body is not None else 'GET'), path, body, request_headers)
            response = connection.getresponse()
            data = response.read()
            assert response.status == expected, path.split('?')[0] + ': expected ' + str(expected) + ', got ' + str(response.status)
            for key, value in (('X-Content-Type-Options', 'nosniff'), ('X-Frame-Options', 'DENY'), ('Referrer-Policy', 'no-referrer'), ('Cache-Control', 'no-store')):
                assert response.getheader(key) == value, 'Security header missing: ' + key
            assert response.getheader('X-Correlation-ID') == request_headers['X-Correlation-ID'], 'Correlation mismatch'
            if expected >= 400:
                text = data.decode(errors='replace')
                for forbidden in ('StackTrace', 'stackTrace', 'SQLException', 'SqlException', 'java.lang.', '/deployments/', '/app/', 'ConnectionString', 'Password='):
                    assert forbidden not in text, 'Internal diagnostic in error response'
                assert not any(value.encode() in data for value in self.e.sensitive if len(value) > 8), 'Secret in error response'
            return json.loads(data) if 'application/json' in response.getheader('Content-Type', '') else data
        finally:
            connection.close()
            if pace:
                time.sleep(0.08)


def bootstrap(e):
    from datetime import datetime, timezone
    for name in e.config['services']:
        item = e.state[name]
        host = item['HostConfig']
        assert host['ReadonlyRootfs'] and host['Init'] and not host['Privileged']
        assert host['Memory'] and host['MemorySwap'] == host['Memory'] and host['NanoCpus'] and host['PidsLimit']
        assert all('size=' in value and 'nosuid' in value and 'nodev' in value for value in host['Tmpfs'].values())
        assert item['Config']['User'] not in ('', '0', 'root', '0:0')
        if name != 'user-api':
            assert all(mount['Destination'] != '/app/secrets/jwt/private.pem' for mount in item['Mounts'])
        if name not in ('frontend', 'grafana'):
            assert not host.get('PortBindings'), 'Internal service published a port'
        if name in ('sqlserver-init', 'flyway-user', 'flyway-vocabulary'):
            assert item['State']['ExitCode'] == 0 and item['State']['Status'] == 'exited'
            assert host['RestartPolicy']['Name'] == 'no'
        else:
            assert item['State']['Health']['Status'] == 'healthy'
            assert host['RestartPolicy']['Name'] == 'unless-stopped'
            fields = dict(line.split(':', 1) for line in e.execute(name, 'cat', '/proc/1/status').splitlines() if ':' in line)
            allowed = 1 << 10 if name == 'sqlserver' else 0
            assert int(fields['Uid'].split()[0]) != 0 and fields['NoNewPrivs'].strip() == '1'
            assert int(fields['CapBnd'].strip(), 16) == allowed
            assert int(fields['CapEff'].strip(), 16) & ~allowed == 0
    assert int(e.mysql('SELECT COUNT(*) FROM flyway_schema_history WHERE success=1;')) == len(list((e.directory.parents[2] / 'quarkus/src/main/resources/db/migration').glob('V*.sql')))
    assert int(e.sql('SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE success=1;').strip()) == len(list((e.directory.parents[2] / 'dotnet/db/migration').glob('V*.sql')))
    assert int(e.mysql('SELECT COUNT(*) FROM jlpt_levels;')) == 5
    assert int(e.mysql('SELECT COUNT(*) FROM parts_of_speech;')) == 11
    assert int(e.mysql("SELECT COUNT(*) FROM lessons;")) == 0
    # Lessons are domain data. Provision this fixture explicitly in the isolated
    # test database; production migrations must not invent it for an import.
    e.mysql("INSERT INTO lessons (level_id, lesson_number, title, description, display_order) "
            "SELECT id, 1, 'Final E2E Lesson', NULL, 1 FROM jlpt_levels WHERE code='N5';")
    assert int(e.mysql("SELECT COUNT(*) FROM lessons l JOIN jlpt_levels j ON j.id=l.level_id WHERE j.code='N5' AND l.lesson_number=1;")) == 1
    assert int(e.mysql('SELECT COUNT(*) FROM vocabulary;')) == 0
    assert int(e.sql('SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Users;').strip()) == 0
    def stamp(text):
        return datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()
    for job, dependent in (('sqlserver-init', 'flyway-user'), ('flyway-user', 'user-api'), ('flyway-vocabulary', 'vocabulary-api')):
        assert stamp(e.state[job]['State']['FinishedAt']) <= stamp(e.state[dependent]['State']['StartedAt']), 'Migration ordering violated'
    # Docker event history proves health preceded dependent start, not merely eventual health.
    time.sleep(0.2)
    e.stop_events()
    events = e.events
    def event(service, action):
        found = [item['timeNano'] for item in events if item.get('Action') == action and item.get('Actor', {}).get('Attributes', {}).get('com.docker.compose.service') == service]
        assert found, 'Startup event absent: ' + service + '/' + action
        return min(found)
    for dependency, dependent in (('mysql', 'flyway-vocabulary'), ('sqlserver', 'sqlserver-init'), ('user-api', 'vocabulary-api'), ('user-api', 'gateway'), ('vocabulary-api', 'gateway'), ('gateway', 'frontend')):
        assert event(dependency, 'health_status: healthy') <= event(dependent, 'start'), 'Readiness ordering violated'
    for name in ('frontend', 'gateway', 'vocabulary-api'):
        e.execute(name, 'sh', '-c', 'test ! -e /app/secrets/jwt/private.pem')
    e.passed('fresh databases, complete migration history, reference data, startup event ordering and all container restrictions')


def frontend(e, client, security):
    index = client.request('/', 200)
    assert b'<app-root>' in index
    for path in ('/login', '/register', '/flashcards/levels', '/admin/import'):
        assert client.request(path, 200) == index, 'SPA deep link failed'
    for asset in re.findall(rb'(?:src|href)="([^\"]+\.(?:js|css))"', index):
        bundle = client.request('/' + asset.decode(), 200)
        assert isinstance(bundle, bytes)
        assert all(value.encode() not in bundle for value in e.sensitive)
        assert b'http://user-api' not in bundle and b'http://localhost:' not in bundle
    for path in ('/metrics', '/q/metrics', '/.well-known/jwks.json', '/.env', '/health/ready', '/missing.js', '/api/unknown'):
        client.request(path, 404)
    for ids in ([], [('X-Correlation-ID', 'invalid id')], [('X-Correlation-ID', 'x' * 65)], [('X-Correlation-ID', 'one'), ('X-Correlation-ID', 'two')]):
        result = security.request(e.port, '/api/auth/me', headers=ids)
        security.check_response(result, 401, correlation=None)
    security.check_response(security.request(e.port, '/api/auth/me', headers=[('X-Correlation-ID', 'valid-final-id')]), 401, correlation='valid-final-id')
    client.request('/api/auth/me', 405, method='TRACE')
    connection = http.client.HTTPConnection('127.0.0.1', e.port, timeout=10)
    try:
        connection.putrequest('POST', '/api/vocabularies/import')
        connection.putheader('Content-Length', str(10 * 1024 * 1024 + 1))
        connection.endheaders()
        response = connection.getresponse()
        assert response.status == 413 and response.getheader('X-Correlation-ID')
        response.read()
    finally:
        connection.close()
    e.passed('production static bundles, SPA fallback, private-path rejection, correlation edge cases, methods and 10 MiB limit')


def authentication(e, client):
    account = {'username': 'finale2e', 'email': 'final-e2e@example.invalid', 'password': 'Aa1!' + __import__('secrets').token_hex(24)}
    e.sensitive.append(account['password'])
    client.request('/api/auth/register', 201, body=account)
    client.request('/api/auth/register', 409, body=account)
    credentials = {'email': account['email'], 'password': account['password']}
    login = client.request('/api/auth/login', 200, body=credentials)
    token = login['accessToken']
    e.sensitive.extend((token, login['refreshToken']))
    me = client.request('/api/auth/me', 200, token=token)
    assert me['role'] == 'User'
    e.identities = (str(me['userId']), account['username'], account['email'])
    levels = client.request('/api/v1/jlpt-levels', 200, token=token)
    assert {level['code'] for level in levels['data']} == {'N1', 'N2', 'N3', 'N4', 'N5'}
    for path in ('/api/auth/me', '/api/auth/admin-test', '/api/v1/jlpt-levels'):
        client.request(path, 401)
        client.request(path, 401, token='malformed-token-probe')
    client.request('/api/auth/admin-test', 403, token=token)
    refreshed = client.request('/api/auth/refresh', 200, body={'refreshToken': login['refreshToken']})
    e.sensitive.extend((refreshed['accessToken'], refreshed['refreshToken']))
    assert refreshed['refreshToken'] != login['refreshToken']
    client.request('/api/auth/refresh', 401, body={'refreshToken': login['refreshToken']})
    client.request('/api/v1/jlpt-levels', 200, token=refreshed['accessToken'])
    client.request('/api/auth/logout', 204, body={'refreshToken': refreshed['refreshToken']})
    client.request('/api/auth/refresh', 401, body={'refreshToken': refreshed['refreshToken']})
    jwks = json.loads(e.execute('user-api', 'curl', '-fsS', 'http://localhost:8080/.well-known/jwks.json'))
    decode = lambda value: base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    header_part, payload_part, signature_part = token.split('.')
    header, payload = json.loads(decode(header_part)), json.loads(decode(payload_part))
    assert header['alg'] == 'RS256'
    key = next(key for key in jwks['keys'] if key['kid'] == header['kid'])
    assert not any(secret in key for secret in ('d', 'p', 'q', 'dp', 'dq', 'qi'))
    modulus, exponent = int.from_bytes(decode(key['n']), 'big'), int.from_bytes(decode(key['e']), 'big')
    size = (modulus.bit_length() + 7) // 8
    actual = pow(int.from_bytes(decode(signature_part), 'big'), exponent, modulus).to_bytes(size, 'big')
    digest_info = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256((header_part + '.' + payload_part).encode()).digest()
    assert actual == b'\x00\x01' + b'\xff' * (size - len(digest_info) - 3) + b'\x00' + digest_info, 'JWKS could not verify .NET RS256 signature'
    for claim, value in (('iss', 'wrong-issuer'), ('aud', 'wrong-audience'), ('exp', int(time.time()) - 600)):
        altered = dict(payload, **{claim: value})
        signed = e.sign(header, altered)
        for path in ('/api/auth/me', '/api/v1/jlpt-levels'):
            client.request(path, 401, token=signed)
    signature = bytearray(decode(signature_part)); signature[0] ^= 1
    wrong = header_part + '.' + payload_part + '.' + base64.urlsafe_b64encode(signature).rstrip(b'=').decode()
    e.sensitive.append(wrong)
    for path in ('/api/auth/me', '/api/v1/jlpt-levels'):
        client.request(path, 401, token=wrong)
    e.sql("UPDATE dbo.Users SET Role=2 WHERE Email='final-e2e@example.invalid';")
    admin = client.request('/api/auth/login', 200, body=credentials)
    e.sensitive.extend((admin['accessToken'], admin['refreshToken']))
    client.request('/api/auth/admin-test', 200, token=admin['accessToken'])
    e.passed('register/conflict/login, User/Admin, refresh rotation/replay/logout, RS256/JWKS, expiry, wrong issuer/audience/signature')
    return account, token, admin['accessToken']


def application(e, client, user, admin):
    items = []
    for word in ('検証一', '検証二'):
        items.append({'word': word, 'normalizedWord': word, 'levels': ['N5'],
            'lessons': [{'level': 'N5', 'lessonNumber': 1, 'displayOrder': 1}],
            'readings': [{'reading': 'けんしょう', 'isPrimary': True, 'displayOrder': 1}],
            'meanings': [{'language': 'en', 'meaning': 'isolated final verification', 'isPrimary': True, 'displayOrder': 1}],
            'partsOfSpeech': ['NOUN'], 'kanji': [], 'pitchAccents': [], 'examples': [{'japaneseText': word, 'japaneseReading': '\u3051\u3093\u3057\u3087\u3046', 'meaningVi': 'kiem thu', 'meaningEn': 'verification', 'targetText': word, 'displayOrder': 1}]})
    content = '--final-probe\r\nContent-Disposition: form-data; name="file"; filename="final.json"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(items, ensure_ascii=False) + '\r\n--final-probe--\r\n'
    options = {'body': content.encode(), 'headers': {'Content-Type': 'multipart/form-data; boundary=final-probe'}}
    client.request('/api/vocabularies/import', 403, token=user, **options)
    result = client.request('/api/vocabularies/import', 200, token=admin, **options)
    assert result['data']['total'] == 2
    client.request('/api/vocabularies/import', 429, token=admin, **options)
    time.sleep(31)
    missing_items = [dict(items[0], lessons=[{'level': 'N5', 'lessonNumber': 99, 'displayOrder': 1}])]
    missing_content = '--missing-probe\r\nContent-Disposition: form-data; name="file"; filename="missing.json"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(missing_items, ensure_ascii=False) + '\r\n--missing-probe--\r\n'
    missing_file = b'--final-probe\r\nContent-Disposition: form-data; name="other"\r\n\r\nfixture\r\n--final-probe--\r\n'
    client.request('/api/vocabularies/import', 400, token=admin, body=missing_file, headers=options['headers'])
    time.sleep(31)
    client.request('/api/vocabularies/import', 400, token=admin, body=missing_content.encode(), headers={'Content-Type': 'multipart/form-data; boundary=missing-probe'})
    assert int(e.mysql('SELECT COUNT(*) FROM vocabulary;')) == 2
    lessons = client.request('/api/v1/lessons?level=N5', 200, token=user)['data']
    assert lessons and lessons[0]['lessonNumber'] == 1
    first = client.request('/api/v1/flashcards?level=N5&lesson=1&page=0&size=1', 200, token=user)['data']
    second = client.request('/api/v1/flashcards?level=N5&lesson=1&page=1&size=1', 200, token=user)['data']
    assert first['totalElements'] == 2 and first['totalPages'] == 2
    assert first['flashcardItems'][0]['id'] != second['flashcardItems'][0]['id']
    assert client.request('/api/v1/flashcards?level=N4', 200, token=user)['data']['totalElements'] == 0
    identity = first['flashcardItems'][0]['id']
    detail = client.request('/api/v1/flashcards/' + str(identity), 200, token=user)['data']
    assert detail['vocabulary']['word'] in ('検証一', '検証二') and detail['readings'] and detail['meanings']
    client.request('/api/v1/flashcards/99999999', 404, token=user)
    client.request('/api/v1/lessons', 400, token=user)
    client.request('/api/v1/flashcards?page=-1', 400, token=user)
    e.passed('successful Admin import and missing-file validation, User denial, import throttling/recovery, lessons, flashcard detail/filter/pagination and safe errors')
    return identity


def health_and_failure(e, client, token):
    def status(name, path):
        return int(e.execute(name, 'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '25', 'http://localhost:8080' + path))
    for name, prefix in (('user-api', '/health'), ('vocabulary-api', '/q/health')):
        assert status(name, prefix + '/live') == 200 and status(name, prefix + '/ready') == 200
    client.request('/health', 200)
    for db, api, prefix in (('mysql', 'vocabulary-api', '/q/health'), ('sqlserver', 'user-api', '/health')):
        e.compose('stop', db)
        try:
            assert status(api, prefix + '/live') == 200, 'Liveness depends on database'
            assert status(api, prefix + '/ready') == 503, 'Readiness ignored database outage'
            client.request('/health', 200)
            if db == 'mysql':
                client.request('/api/v1/jlpt-levels', 500, token=token)
        finally:
            e.compose('up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', db)
        deadline = time.monotonic() + 90
        while status(api, prefix + '/ready') != 200:
            assert time.monotonic() < deadline, 'Readiness did not recover'
            time.sleep(2)
    e.passed('live/ready health, isolated database outages, safe internal error and dependency recovery')


def rate_limits(e, client, token, security):
    def get(_):
        return security.request(e.port, '/api/v1/jlpt-levels', headers=[('Authorization', 'Bearer ' + token), ('X-Correlation-ID', 'rate-final')])
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(get, range(90)))
    assert any(result[0] == 429 for result in results), 'General limiter did not reject burst'
    for result in results:
        security.check_response(result, result[0], correlation='rate-final')
        assert result[0] in (200, 429)
    client.request('/health', 200)
    time.sleep(3)
    client.request('/api/v1/jlpt-levels', 200, token=token)
    results = [security.request(e.port, '/api/auth/login', method='POST', headers=[('Content-Type', 'application/json'), ('X-Correlation-ID', 'rate-final')], body=b'{}') for _ in range(8)]
    assert any(result[0] == 429 for result in results)
    for result in results:
        security.check_response(result, result[0], correlation='rate-final')
    time.sleep(7)
    client.request('/api/auth/login', 400, body={})
    e.passed('bounded general/auth bursts, 429 security/correlation headers, health exemption and rate recovery')


def observability(e, token, metrics):
    for name, path, runtime in (('user-api', '/metrics', 'dotnet_collection_count_total'), ('vocabulary-api', '/q/metrics', 'jvm_memory_used_bytes')):
        marker = 'metrics-cardinality-sentinel'
        for index in range(6):
            e.execute(name, 'curl', '-s', '-o', '/dev/null', '-X', 'PROBE' + str(index), '-H', 'Authorization: Bearer ' + marker, 'http://localhost:8080/unknown-' + str(index) + '?secret=' + marker)
        text = e.execute(name, 'curl', '-fsS', 'http://localhost:8080' + path)
        assert marker not in text and 'PROBE' not in text and all(value not in text for value in e.identities)
        assert runtime in text and 'process_' in text
        assert all(value not in text for value in e.sensitive)
        for forbidden in ('final-e2e-correlation', 'final-e2e@example.invalid', 'trace_id=', 'span_id=', 'uri=', 'clientName=', 'correlationId='):
            assert forbidden not in text, 'Unbounded/sensitive metric label'
        for line in text.splitlines():
            if line.startswith(('http_requests_', 'http_request_duration_', 'http_server_requests_')):
                assert set(re.findall(r'([a-zA-Z_]+)=', line)) <= {'http_method', 'method', 'route', 'code', 'status', 'le'}
    port = int(e.state['grafana']['NetworkSettings']['Ports']['3000/tcp'][0]['HostPort'])
    password = e.config['services']['grafana']['environment']['GF_SECURITY_ADMIN_PASSWORD']
    auth = {'Authorization': 'Basic ' + base64.b64encode(('admin:' + password).encode()).decode()}
    assert metrics.request(port, '/api/datasources')[0] == 401
    status, body, _ = metrics.request(port, '/api/dashboards/uid/japanese-learning-overview', auth)
    assert status == 200 and json.loads(body)['dashboard']['panels']
    for _ in range(20):
        _, body, _ = metrics.request(port, '/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?query=up', auth)
        data = json.loads(body)['data']['result']
        if len(data) == 2 and all(item['value'][1] == '1' for item in data):
            break
        time.sleep(2)
    else:
        raise AssertionError('Prometheus targets not UP')
    dashboard = json.loads((e.directory.parents[2] / 'observability/grafana/dashboards/apis.json').read_text())
    for panel in dashboard['panels']:
        query = urllib.parse.urlencode({'query': panel['targets'][0]['expr']})
        status, body, _ = metrics.request(port, '/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?' + query, auth)
        assert status == 200 and json.loads(body)['status'] == 'success'
    e.passed('bounded internal HTTP/runtime metrics, no sensitive labels, Prometheus two targets UP, authenticated Grafana and every panel query')


def persistence(e, client, account, identity):
    before = e.mysql('CHECKSUM TABLE vocabulary, jlpt_levels, lessons, lesson_vocabulary;') + e.sql('SET NOCOUNT ON; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.Users; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.RefreshTokens;')
    volumes = {name: sorted(mount['Name'] for mount in e.state[name]['Mounts'] if mount['Type'] == 'volume') for name in ('mysql', 'sqlserver')}
    e.compose('stop', 'frontend', 'gateway', 'vocabulary-api', 'user-api')
    e.compose('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '240', 'mysql', 'sqlserver')
    # Refresh IDs before any exec after recreation.
    ids = subprocess.check_output(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + e.project], text=True).split()
    e.state = {item['Config']['Labels']['com.docker.compose.service']: item for item in json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True))}
    after = e.mysql('CHECKSUM TABLE vocabulary, jlpt_levels, lessons, lesson_vocabulary;') + e.sql('SET NOCOUNT ON; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.Users; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.RefreshTokens;')
    assert before == after, 'Persisted data fingerprint changed on recreation'
    assert volumes == {name: sorted(mount['Name'] for mount in e.state[name]['Mounts'] if mount['Type'] == 'volume') for name in volumes}
    e.compose('up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '240', 'user-api', 'vocabulary-api')
    e.deploy()
    login = client.request('/api/auth/login', 200, body={'email': account['email'], 'password': account['password']})
    e.sensitive.extend((login['accessToken'], login['refreshToken']))
    client.request('/api/v1/flashcards/' + str(identity), 200, token=login['accessToken'])
    operation(e, 'restart')
    e.refresh()
    client.request('/health', 200)
    e.passed('named-volume identities/data survive DB and API recreation, saved user/import persist, migrations rerun, graceful restart succeeds')


def logs(e):
    for name, item in e.state.items():
        result = subprocess.run(['docker', 'logs', item['Id']], capture_output=True, text=True, encoding='utf-8')
        assert result.returncode == 0
        text = result.stdout + result.stderr
        assert not any(value in text for value in e.sensitive if len(value) >= 8), 'Secret in inspected logs: ' + name
        if name in ('frontend', 'gateway', 'user-api', 'vocabulary-api'):
            # Logs before recreation are checked separately before old containers disappear.
            assert 'correlation' in text.lower(), 'Missing request context in service logs: ' + name
    e.passed('correlated application/proxy logs and absence of generated passwords, JWTs, refresh tokens and private-key body')


def run(e):
    import importlib.util
    def load(name, file):
        spec = importlib.util.spec_from_file_location(name, e.directory.parents[2] / 'scripts' / file)
        result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
        return result
    client = Client(e)
    security = load('security', 'verify-gateway-security.py')
    metrics = load('metrics', 'verify-observability.py')
    bootstrap(e)
    secret_checks = load('secret_checks', 'final_e2e_secrets.py')
    secret_checks.image_contents(e)
    secret_checks.invalid_startup(e)
    frontend(e, client, security)
    account, user, admin = authentication(e, client)
    identity = application(e, client, user, admin)
    health_and_failure(e, client, user)
    rate_limits(e, client, user, security)
    observability(e, user, metrics)
    logs(e)
    assert 'healthy' in operation(e, 'status')
    operation(e, 'logs')
    operation(e, 'verify')
    e.passed('production operator status/logs/verify commands with safe output')
    persistence(e, client, account, identity)
    # Generate a request after the frontend restart for its fresh log stream.
    client.request('/api/auth/me', 401)
    logs(e)
