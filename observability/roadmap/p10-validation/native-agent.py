"""P10-only client, synthetic dependency adapter and private alert endpoint."""
import base64
import collections
import datetime
import errno
import hashlib
import hmac
import json
import os
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ALLOWED = {'agent:8000', 'prometheus:9090', 'tempo:3200', 'tempo:4318', 'collector:4318', 'collector:8888', 'fluent:2020', 'restore:9200', 'grafana:3000'}
PRIVATE = Path('/private')

def request(x):
    url = x['url']
    if urllib.parse.urlsplit(url).netloc not in ALLOWED:
        raise ValueError('non-fixture destination rejected')
    headers = {}
    context = None
    if url.startswith('https://restore:9200/'):
        context = ssl.create_default_context(cafile=str(PRIVATE / 'ca.pem'))
        if x.get('who', 'admin') == 'admin':
            context.load_cert_chain(str(PRIVATE / 'admin.pem'), str(PRIVATE / 'admin.key'))
        elif x.get('who') == 'writer':
            secret = json.loads((PRIVATE / 'credentials.json').read_text())['writer']
            headers['Authorization'] = 'Basic ' + base64.b64encode(('writer:' + secret).encode()).decode()
    if url.startswith('http://grafana:3000/') and x.get('who') != 'none':
        secret = json.loads((PRIVATE / 'credentials.json').read_text())['grafana']
        headers['Authorization'] = 'Basic ' + base64.b64encode(('admin:' + secret).encode()).decode()
    body = x.get('body')
    if body is not None:
        headers['Content-Type'] = 'application/x-ndjson' if x.get('ndjson') else 'application/json'
        body = body.encode() if isinstance(body, str) else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body, method=x.get('method', 'GET'), headers=headers), timeout=3, context=context) as r:
            raw = r.read(2 * 1024 * 1024)
            try:
                data = json.loads(raw)
            except ValueError:
                data = raw.decode(errors='replace')
            return {'status': r.status, 'data': data}
    except urllib.error.HTTPError as e:
        return {'status': e.code, 'data': None}
    except (OSError, TimeoutError) as exc:
        return {'status': 0, 'data': None, 'errorClass': type(exc).__name__, 'diagnostic': str(exc)}

def trace(i):
    now = time.time_ns()
    return {'resourceSpans': [{'resource': {'attributes': [{'key': 'service.name', 'value': {'stringValue': 'user-api'}}, {'key': 'service.namespace', 'value': {'stringValue': 'japanese-learning'}}, {'key': 'deployment.environment.name', 'value': {'stringValue': 'test'}}]}, 'scopeSpans': [{'scope': {'name': 'p10'}, 'spans': [{'traceId': f'{i:032x}', 'spanId': f'{i:016x}', 'name': 'p10-synthetic', 'kind': 2, 'startTimeUnixNano': str(now), 'endTimeUnixNano': str(now + 1000000), 'attributes': [{'key': 'http.request.method', 'value': {'stringValue': 'GET'}}, {'key': 'http.request.header.authorization', 'value': {'stringValue': 'P10_SENTINEL_TOKEN'}}]}]}]}]}

state = {'faults': {}, 'notifications': [], 'notification_batches': [], 'requests': 0, 'errors': 0}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def reply(self, code, data, content='application/json'):
        raw = data.encode() if isinstance(data, str) else json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', content)
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        if self.path == '/metrics':
            if state['faults'].get('scrape'):
                return self.reply(503, {})
            usage = os.statvfs('/queue')
            used = (usage.f_blocks - usage.f_bfree) * usage.f_frsize
            lines = ['p07_notification_test ' + str(int(bool(state['faults'].get('notification')))), 'p07_backing_disk_available_bytes 107374182400', f'p07_telemetry_storage_used_bytes{{store="fluent-bit"}} {used}', f'p07_telemetry_storage_budget_bytes{{store="fluent-bit"}} {usage.f_blocks * usage.f_frsize}']
            if state['faults'].get('privacy'):
                lines.append('p10_privacy_good_total 1')
                for key in ['authorization','password','api_key','user_id','email','cookie','url','db_statement']:
                    lines.append('p10_privacy_bad_total{' + key + '="P10_METRIC_SENTINEL_483912"} 1')
            for name in ['database', 'jwks', 'gateway', 'application']:
                lines.append(f'p10_dependency_available{{dependency="{name}"}} {int(not state["faults"].get(name, False))}')
            return self.reply(200, '\n'.join(lines) + '\n', 'text/plain; version=0.0.4')
        if self.path == '/state':
            return self.reply(200, state)
        if self.path == '/application':
            state['requests'] += 1
            if self.headers.get('Authorization') != 'Bearer ' + json.loads((PRIVATE / 'credentials.json').read_text())['application']:
                return self.reply(401, {'error': 'invalid_test_token'})
            failed = [x for x in ['database', 'jwks', 'gateway', 'application'] if state['faults'].get(x)]
            state['errors'] += int(bool(failed))
            return self.reply(503 if failed else 200, {'outcome': 'dependency_unavailable' if failed else 'ok'})
        return self.reply(404, {})
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0'))
        if n > 65536:
            return self.reply(413, {})
        data = json.loads(self.rfile.read(n) or '{}')
        if self.path == '/fault':
            state['faults'].update(data)
        elif self.path == '/api/v2/alerts':
            batch = []
            for a in data:
                end = datetime.datetime.fromisoformat(a['endsAt'].replace('Z', '+00:00')).timestamp()
                item = {'name': a['labels'].get('alertname'), 'labels': a['labels'], 'annotations': a.get('annotations', {}), 'state': 'resolved' if end <= time.time() else 'firing', 'received': time.time()}
                state['notifications'].append(item)
                batch.append(item['name'])
            state['notification_batches'].append(batch)
        else:
            return self.reply(404, {})
        return self.reply(200, {})

def main():
    op = sys.argv[1]
    if op == 'serve':
        ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
        return
    x = json.load(sys.stdin)
    if op == 'request':
        result = request(x)
    elif op == 'generate':
        count = x.get('count', 20)
        assert 0 < count <= 100
        start = time.monotonic()
        rows = []
        statuses = []
        for i in range(x['start'], x['start'] + count):
            if x['kind'] == 'logs':
                row = {'sequence': i, 'event': 'p10-synthetic', 'timestamp': time.time()}
                if x.get('deterministic'):
                    row['event_id'] = 'p10-event-' + str(i).zfill(6)
                with open('/source/events.json', 'a') as f:
                    f.write(json.dumps(row) + '\n')
                    if x.get('deterministic'):
                        f.flush()
                        os.fsync(f.fileno())
                rows.append(row)
            else:
                statuses.append(request({'url': 'http://collector:4318/v1/traces', 'method': 'POST', 'body': trace(i)})['status'])
            time.sleep(0.25)
        result = {'count': count, 'ids': list(range(x['start'], x['start'] + count)), 'seconds': time.monotonic()-start, 'statuses': dict(collections.Counter(statuses)), 'bytes': sum(len(json.dumps(r)) + 1 for r in rows)}
    elif op == 'lifecycle':
        import sqlite3
        rows = [json.loads(line) for line in Path('/source/events.json').read_text().splitlines()]
        conn = sqlite3.connect('file:/queue/offsets.db?mode=ro', uri=True)
        result = {'sourceIds': [r['event_id'] for r in rows], 'sourceBytes': Path('/source/events.json').stat().st_size,
                  'offsets': conn.execute('SELECT name,offset FROM in_tail_files ORDER BY name').fetchall(),
                  'sqliteIntegrity': conn.execute('PRAGMA integrity_check').fetchone()[0],
                  'chunks': [{'name': str(p.relative_to('/queue')), 'bytes': p.stat().st_size} for p in Path('/queue').rglob('*.flb')]}
    elif op == 'reconcile':
        # One finite pass; search confirmation, never offsets, is the acknowledgement.
        rows = [json.loads(line) for line in Path('/source/events.json').read_text().splitlines()]
        ids = [r['event_id'] for r in rows]
        assert len(rows) <= 100 and len(set(ids)) == len(ids)
        q = request({'url': 'https://restore:9200/p10-events/_search', 'method': 'POST',
                     'body': {'size': 100, 'query': {'ids': {'values': ids}}}})
        if q['status'] != 200:
            raise ValueError('No authoritative search acknowledgement')
        delivered = {h['_id'] for h in q['data']['hits']['hits']}
        missing = [r for r in rows if r['event_id'] not in delivered]
        target = Path('/source/reconcile-once.json')
        if target.exists():
            raise ValueError('One-pass replay already exists')
        with target.open('x') as f:
            for row in missing:
                f.write(json.dumps(row) + '\n')
                f.flush()
                os.fsync(f.fileno())
                time.sleep(.25)
        result = {'generatedUnique': len(rows), 'alreadySearchable': len(delivered),
                  'replayedIds': [r['event_id'] for r in missing], 'replayPasses': 1,
                  'bytes': target.stat().st_size, 'sourcePreserved': True}
    elif op == 'privacy-fixtures':
        directory = Path('/source/privacy'); directory.mkdir(exist_ok=True)
        sentinels = {k: 'P10_' + k.upper() + '_SENTINEL_483912' for k in ['jwt','credential','authorization','query','request_body','response_body','pii','signing_key']}
        rows = []
        for i, (kind, value) in enumerate(sentinels.items()):
            rows.append({'@timestamp': '2026-11-14T00:00:00Z', 'level': 'INFO', 'event_name': 'http.request.completed',
                         'service_name': 'user-api', 'environment': 'test', 'correlation_id': 'p10privacy' + str(i),
                         'http_method': 'GET', 'http_route': '/test?password=' + value,
                         'message': value, 'Authorization': 'Bearer ' + value, 'password': value,
                         'request_body': value, 'response_body': value, 'user_email': value, 'private_key': value,
                         'original': json.dumps({'value': value})})
        rows[0]['Authorization'] = 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJQMTBfSldUX1NFTlRJTkVMXzQ4MzkxMiJ9.invalid'
        rows[-1]['private_key'] = '-----BEGIN PRIVATE KEY-----\nP10_SIGNING_KEY_SENTINEL_483912\n-----END PRIVATE KEY-----'
        with (directory / 'events.log').open('x') as f:
            for row in rows:
                f.write(json.dumps(row) + '\n')
            f.flush(); os.fsync(f.fileno())
        # Source is the deliberately controlled raw input; never return sentinel payloads.
        result = {'count': len(rows), 'classes': list(sentinels), 'bytes': (directory/'events.log').stat().st_size}
    elif op == 'privacy-traces':
        statuses = []
        for i in range(801, 809):
            data = trace(i)
            span = data['resourceSpans'][0]['scopeSpans'][0]['spans'][0]
            for key in ['authorization','url.query','http.request.body','http.response.body','password','enduser.email','signing_key']:
                span['attributes'].append({'key': key, 'value': {'stringValue': 'P10_' + key.upper().replace('.','_') + '_SENTINEL_483912'}})
            span['events'] = [{'name':'P10_EVENT_SENTINEL_483912','timeUnixNano':span['startTimeUnixNano']}]
            statuses.append(request({'url':'http://collector:4318/v1/traces','method':'POST','body':data})['status'])
            time.sleep(.25)
        result = {'count': 8, 'statuses': dict(collections.Counter(statuses)), 'ids': list(range(801,809))}
    elif op == 'privacy-scan':
        import re
        checked = 0; matches = 0
        for p in Path('/queue').rglob('*'):
            if not p.is_file() or p.is_symlink():
                continue
            data = p.read_bytes(); checked += 1
            matches += len(re.findall(rb'P10_[A-Z_]+_SENTINEL_483912|eyJhbGciOiJub25lIn0|BEGIN PRIVATE KEY', data))
        result = {'persistedCollectorFilesScanned': checked, 'sentinelOccurrences': matches,
                  'controlledRawSourceExcluded': True, 'processMemoryNotDumped': True}
    elif op == 'source-retention':
        import re
        assert re.fullmatch(r'jp_obs_validation_\d{14}_[a-f0-9]{8}', x['run'])
        directory = Path('/source/retention-survey'); directory.mkdir()
        names = {'acknowledged.expired': 'p10-event-000001', 'unacknowledged.expired': 'p10-event-009999', 'unrelated.keep': None}
        for name, event in names.items():
            p = directory / name
            p.write_text(json.dumps({'owner': x['run'] if event else 'unrelated', 'event_id': event}))
            os.utime(p, (time.time()-31*86400, time.time()-31*86400))
        removed = []
        for name in ['acknowledged.expired','unacknowledged.expired']:
            p = directory/name
            if p.is_symlink() or p.resolve().parent != directory.resolve():
                raise ValueError('Retention path escape')
            data = json.loads(p.read_text())
            if data['owner'] != x['run'] or time.time()-p.stat().st_mtime < 30*86400:
                continue
            q = request({'url':'https://restore:9200/p10-events/_doc/'+data['event_id']})
            if q['status'] == 200 and q['data'].get('found'):
                p.unlink(); removed.append(name)
        result = {'removed':removed, 'retained':sorted(p.name for p in directory.iterdir()),
                  'scope':'Owned pre-expired synthetic source files only; do not deploy a source retention policy from this fixture'}
    elif op == 'pressure':
        if x.get('clear'):
            Path('/queue/padding').unlink(missing_ok=True)
            result = {'cleared': True}
        else:
            written = 0
            try:
                with open('/queue/padding', 'wb', buffering=0) as f:
                    while written < 8388608:
                        written += f.write(b'x' * 4096)
            except OSError as e:
                if e.errno != errno.ENOSPC:
                    raise
            result = {'bytes': written, 'freeBytes': os.statvfs('/queue').f_bavail * os.statvfs('/queue').f_frsize}
    elif op == 'filesystem':
        result = {p: {'bytes': os.statvfs(p).f_blocks * os.statvfs(p).f_frsize, 'used': (os.statvfs(p).f_blocks-os.statvfs(p).f_bfree)*os.statvfs(p).f_frsize} for p in ['/queue', '/source']}
    else:
        raise ValueError('unknown operation')
    print(json.dumps(result))
if __name__ == '__main__':
    main()
