"""Disposable SQLite HTTP adapter, RSA JWKS, application and probe. No real data."""
import base64
import hashlib
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

role = sys.argv[1]
ports = {'database': 8002, 'jwks': 8001, 'app': 8003}
availability = {'database': 1, 'jwks': 1}
def get(url, timeout=.4, headers=None):
    if not url.startswith(('http://database:8002/', 'http://jwks:8001/', 'http://app:8003/', 'http://gateway:8080/', 'http://prometheus:9090/')):
        raise ValueError('Fixture endpoint rejected')
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=timeout) as r:
            raw = r.read()
            try:
                data = json.loads(raw)
            except ValueError:
                data = raw.decode()
            return r.status, data
    except urllib.error.HTTPError as e:
        return e.code, None
    except (OSError, TimeoutError):
        return 0, None
def decode(x):
    return base64.urlsafe_b64decode(x + '=' * (-len(x) % 4))
def verify(token):
    try:
        a,b,c = token.split('.')
        header, payload = json.loads(decode(a)), json.loads(decode(b))
        if header.get('alg') != 'RS256' or payload.get('iss') != 'p10-only' or payload.get('aud') != 'p10-only' or payload.get('exp', 0) <= time.time():
            return False
        code, jwks = get('http://jwks:8001/.well-known/jwks.json')
        availability['jwks'] = int(code == 200)
        if code != 200:
            raise ConnectionError('jwks unavailable')
        key = next(k for k in jwks['keys'] if k['kid'] == header.get('kid'))
        n,e = int.from_bytes(decode(key['n']), 'big'), int.from_bytes(decode(key['e']), 'big')
        size = (n.bit_length() + 7)//8
        signature = decode(c)
        if len(signature) != size or int.from_bytes(signature, 'big') >= n:
            return False
        recovered = pow(int.from_bytes(signature,'big'),e,n).to_bytes(size,'big')
        digest = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256((a+'.'+b).encode()).digest()
        expected = b'\x00\x01' + b'\xff'*(size-len(digest)-3) + b'\x00' + digest
        return recovered == expected
    except ConnectionError:
        raise
    except (ValueError, KeyError, StopIteration):
        return False
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):
        pass
    def send(self,code,value,content='application/json'):
        data = value.encode() if isinstance(value,str) else json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type',content)
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.path == '/metrics':
            return self.send(200, '\n'.join(f'p10_dependency_available{{dependency="{k}"}} {v}' for k,v in availability.items())+'\n', 'text/plain; version=0.0.4')
        if role == 'jwks':
            return self.send(200, json.loads(Path('/public/jwks.json').read_text()))
        if role == 'database':
            try:
                with sqlite3.connect('/data/synthetic.db', timeout=.2) as db:
                    value = db.execute('SELECT value FROM synthetic WHERE id=1').fetchone()[0]
                return self.send(200, {'value': value})
            except sqlite3.Error:
                return self.send(503, {'error':'database_unavailable'})
        if role == 'app':
            try:
                if not verify(self.headers.get('Authorization','').removeprefix('Bearer ')):
                    return self.send(401, {'error':'invalid_token'})
            except ConnectionError:
                return self.send(503, {'error':'jwks_unavailable'})
            code, value = get('http://database:8002/query')
            availability['database'] = int(code == 200)
            return self.send(200 if code == 200 else 503, {'outcome':'ok' if code == 200 else 'database_unavailable'})
        return self.send(404,{})
if role == 'probe':
    x = json.load(sys.stdin)
    token = json.loads(Path('/tokens.json').read_text()).get(x.get('token','invalid'),'invalid')
    start = time.monotonic()
    headers = {'Authorization':'Bearer '+token} if x['url'].startswith('http://gateway:8080/') and not x['url'].endswith('/metrics') else {}
    status, data = get(x['url'], timeout=1.5, headers=headers)
    print(json.dumps({'status':status,'data':data,'seconds':time.monotonic()-start}))
elif role == 'lock':
    with sqlite3.connect('/data/synthetic.db') as db:
        db.execute('BEGIN EXCLUSIVE')
        print('LOCKED',flush=True)
        time.sleep(5)
else:
    if role == 'database':
        with sqlite3.connect('/data/synthetic.db') as db:
            db.execute('CREATE TABLE IF NOT EXISTS synthetic(id INTEGER PRIMARY KEY, value TEXT)')
            db.execute("INSERT OR IGNORE INTO synthetic VALUES(1,'p10-synthetic')")
    ThreadingHTTPServer(('0.0.0.0', ports[role]), Handler).serve_forever()
