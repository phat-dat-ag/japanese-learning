"""Isolated P08 native client and local-only alert sink. No live service addresses."""
import base64
import hashlib
import json
import os
from pathlib import Path
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PRIVATE = Path('/private')
RECOVERED = Path('/recovered')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def request(url, method='GET', body=None, who='admin', ndjson=False):
    if not url.startswith(('https://restore:9200/', 'http://prometheus:9090/', 'http://tempo:3200/', 'http://tempo:4318/', 'http://grafana:3000/', 'http://agent:9105/')):
        raise ValueError('Non-fixture endpoint rejected')
    context = None
    headers = {}
    credentials = json.loads((PRIVATE / 'credentials.json').read_text())
    if url.startswith('https:'):
        context = ssl.create_default_context(cafile=str(PRIVATE / 'ca.pem'))
        if who == 'admin':
            context.load_cert_chain(str(PRIVATE / 'admin.pem'), str(PRIVATE / 'admin.key'))
        elif who in ('reader', 'writer'):
            headers['Authorization'] = 'Basic ' + base64.b64encode((who + ':' + credentials[who]).encode()).decode()
        elif who == 'invalid':
            headers['Authorization'] = 'Basic ' + base64.b64encode(b'invalid:invalid').decode()
    elif url.startswith('http://grafana:') and who != 'none':
        headers['Authorization'] = 'Basic ' + base64.b64encode(('p08-admin:' + credentials['grafana']).encode()).decode()
    elif url.startswith('http://agent:') and who != 'none':
        headers['Authorization'] = 'Bearer ' + credentials['sink']
    if body is not None:
        headers['Content-Type'] = 'application/x-ndjson' if ndjson else 'application/json'
        body = body.encode() if ndjson else json.dumps(body).encode()
    query = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(query, context=context, timeout=30) as response:
            raw = response.read()
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                data = None
            return {'status': response.status, 'data': data}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'data': None}


def require(url, **options):
    result = request(url, **options)
    if not 200 <= result['status'] < 300:
        raise ValueError('Fixture native operation failed: ' + str(result['status']))
    return result['data']


def load_logs():
    result = []
    for file in sorted((RECOVERED / 'logs').glob('*.json')):
        value = json.loads(file.read_text())
        name = value['name']
        require('https://restore:9200/' + name, method='PUT', body={'settings': value['settings'], 'mappings': value['mappings']})
        docs = value['docs']
        for start in range(0, len(docs), 250):
            bulk = ''
            for doc in docs[start:start + 250]:
                bulk += json.dumps({'index': {'_index': name, '_id': doc['id']}}) + '\n' + json.dumps(doc['source']) + '\n'
            response = require('https://restore:9200/_bulk', method='POST', body=bulk, ndjson=True)
            if response['errors']:
                raise ValueError('Native bulk errors')
        require('https://restore:9200/' + name + '/_refresh', method='POST')
        read = require('https://restore:9200/' + name + '/_search?scroll=1m', method='POST', body={'size': 500, 'sort': ['_doc'], 'track_total_hits': True})
        restored = []
        while True:
            restored.extend({'id': hit['_id'], 'source': hit['_source']} for hit in read['hits']['hits'])
            if not read['hits']['hits']:
                break
            read = require('https://restore:9200/_search/scroll', method='POST', body={'scroll': '1m', 'scroll_id': read['_scroll_id']})
        restored.sort(key=lambda doc: doc['id'])
        if digest(restored) != value['sha256'] or len(restored) != len(docs):
            raise ValueError('Restored document integrity mismatch')
        mappings = require('https://restore:9200/' + name + '/_mapping')[name]['mappings']
        settings = require('https://restore:9200/' + name + '/_settings')[name]['settings']['index']
        if mappings != value['mappings'] or any(settings.get(k) != v for k, v in value['settings'].items()):
            raise ValueError('Mapping/settings mismatch')
        result.append({'index': name, 'count': len(restored), 'sha256': digest(restored), 'mapping': True, 'settings': True})
    return result


STATE = {'active': False, 'firing': 0, 'resolved': 0}
LOCK = threading.Lock()


class Sink(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, value, content='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', content)
        self.end_headers()
        self.wfile.write(value.encode())

    def do_GET(self):
        if self.path == '/metrics':
            with LOCK:
                value = STATE['active']
            return self.reply(200, 'p07_notification_test ' + str(int(value)) + '\n', 'text/plain; version=0.0.4')
        if self.path == '/state':
            with LOCK:
                return self.reply(200, json.dumps(STATE))
        if self.path == '/api/v2/alerts':
            return self.reply(200, '[]')
        self.reply(200 if self.path == '/health' else 404, '{}')

    def do_POST(self):
        if self.headers.get('Authorization') != 'Bearer ' + json.loads((PRIVATE / 'credentials.json').read_text())['sink']:
            return self.reply(401, '{}')
        length = int(self.headers.get('Content-Length', 0))
        if not 0 <= length <= 65536:
            return self.reply(413, '{}')
        value = json.loads(self.rfile.read(length) or '{}')
        with LOCK:
            if self.path == '/test':
                STATE['active'] = value['active']
            elif self.path == '/api/v2/alerts':
                from datetime import datetime
                for alert in value:
                    if alert.get('labels', {}).get('alertname') == 'P07AcceptanceNotification':
                        end = datetime.fromisoformat(alert['endsAt'].replace('Z', '+00:00')).timestamp()
                        STATE['firing' if end > time.time() + 3 else 'resolved'] += 1
            else:
                return self.reply(404, '{}')
        self.reply(200, '{}')


if __name__ == '__main__':
    if sys.argv[1] == 'serve':
        ThreadingHTTPServer(('0.0.0.0', 9105), Sink).serve_forever()
    elif sys.argv[1] == 'load-logs':
        print(json.dumps(load_logs()))
    elif sys.argv[1] == 'request':
        print(json.dumps(request(**json.load(sys.stdin))))
    elif sys.argv[1] == 'sqlite':
        import sqlite3
        result = {}
        for file in sorted((RECOVERED / 'offsets').glob('*.db')):
            with sqlite3.connect(file.resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as db:
                if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise ValueError('Native restored offset integrity failure')
                result[file.name] = db.execute('SELECT count(*) FROM in_tail_files').fetchone()[0]
        print(json.dumps(result))
