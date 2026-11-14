"""Synthetic native Prometheus scrape/relabel/storage on loopback, never Docker/live TSDB."""
import contextlib
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]


def main():
    source = ROOT / 'observability/p07/prometheus/prometheus.yml'
    config = json.loads(source.read_text())
    labels = sorted({label for job in config['scrape_configs'] for rule in job.get('metric_relabel_configs', [])
                     for label in rule['source_labels']})
    sentinel = 'P07_SYNTHETIC_PRIVATE'
    body = ('p07_safe_total{route_family="auth",status="200"} 7\n' + ''.join(
        'p07_private_total{' + label + '="' + sentinel + '"} 1\n' for label in labels)).encode()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    for job in config['scrape_configs']:
        job['static_configs'] = [{'targets': ['127.0.0.1:' + str(server.server_port)]}]
    config['global']['scrape_interval'] = '1s'
    config['global']['scrape_timeout'] = '500ms'
    config['rule_files'] = [str((source.parent / p).resolve()) for p in config['rule_files']]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def query(expression):
        with opener.open(f'http://127.0.0.1:{port}/api/v1/query?' + urllib.parse.urlencode({'query': expression}), timeout=2) as response:
            return json.load(response)['data']['result']
    process = None
    temporary = tempfile.TemporaryDirectory(prefix='p07_prom_native_')
    try:
        with contextlib.nullcontext(temporary.name) as folder:
            path = Path(folder)
            (path / 'prom.json').write_text(json.dumps(config))
            command = [str(ROOT/'.local/p07-native/prometheus.exe'), '--config.file='+str(path/'prom.json'),
                '--storage.tsdb.path='+str(path/'synthetic-tsdb'), '--web.listen-address=127.0.0.1:'+str(port),
                '--storage.tsdb.retention.time=2d','--storage.tsdb.retention.size=512MB',
                '--query.timeout=15s','--query.max-concurrency=4','--query.max-samples=5000000',
                '--rules.max-concurrent-evals=2','--log.level=error']
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic() + 20
            while True:
                try:
                    safe = query('p07_safe_total')
                    if len(safe) == len(config['scrape_configs']):
                        break
                except (OSError, ValueError, KeyError):
                    pass
                assert process.poll() is None, 'Synthetic Prometheus exited'
                if time.monotonic() >= deadline:
                    raise AssertionError('Synthetic scrape did not complete')
                time.sleep(0.2)
            assert query('p07_private_total') == []
            for item in safe:
                assert item['metric']['route_family'] == 'auth' and item['metric']['status'] == '200'
                assert item['value'][1] == '7'
            all_series = query('{__name__=~"p07_.*"}')
            assert sentinel not in json.dumps(all_series)
            process.terminate()
            stdout, stderr = process.communicate(timeout=10)
            process = None
            assert sentinel not in stdout + stderr
        report = {'status': 'PASS', 'scope': 'Native Windows3.14.0 synthetic scrape/relabel/isolated temporary TSDB; '
            'not Docker, existing samples, retention expiry or pressure validation',
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'private_label_names_exercised': labels, 'safe_series_preserved': len(safe),
            'private_series_exported': 0,
            'temporary_changes': 'Loopback targets/listener,1s scrape/500ms timeout,absolute rule paths and temporary synthetic TSDB; relabel rules unchanged'}
        (Path(__file__).parent/'evidence/prometheus-native-pipeline.json').write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report))
    finally:
        if process:
            process.terminate()
            process.communicate(timeout=10)
        server.shutdown()
        server.server_close()
        temporary.cleanup()


if __name__ == '__main__':
    main()
