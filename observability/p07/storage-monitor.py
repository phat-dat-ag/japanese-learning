"""Bounded local storage metrics and notification sink; no Docker socket or deletions."""
import json
import os
import shutil
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
STATE = {'test_until': 0, 'notifications': 0, 'test_notifications': 0, 'last_received': 0}
BUDGETS = {'opensearch': 24, 'prometheus': 2, 'tempo': 4, 'grafana': 1, 'fluent-bit': .0625}


def usage(path):
    total = 0
    def failed(error):
        raise error
    for root, dirs, files in os.walk(path, onerror=failed):
        for name in files:
            try:
                total += os.stat(os.path.join(root, name)).st_blocks * 512
            except FileNotFoundError:
                pass
    return total


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body, content='application/json'):
        data = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', content)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, '{}')
        if self.path == '/notifications':
            with LOCK:
                return self.reply(200, json.dumps(STATE))
        if self.path != '/metrics':
            return self.reply(404, '{}')
        disk = shutil.disk_usage('/host-docker-data')
        lines = [f'p07_backing_disk_available_bytes {disk.free}',
                 f'p07_backing_disk_capacity_bytes {disk.total}']
        for store, budget in BUDGETS.items():
            try:
                size = usage('/stores/' + store)
                lines += [f'p07_telemetry_storage_used_bytes{{store="{store}"}} {size}',
                          f'p07_telemetry_storage_budget_bytes{{store="{store}"}} {int(budget * 2**30)}']
            except OSError:
                lines.append(f'p07_telemetry_storage_measurement_error{{store="{store}"}} 1')
        with LOCK:
            lines += [f'p07_notification_test {int(time.time() < STATE["test_until"])}',
                      f'p07_notifications_received_total {STATE["notifications"]}',
                      f'p07_test_notifications_received_total {STATE["test_notifications"]}']
        self.reply(200, '\n'.join(lines) + '\n', 'text/plain; version=0.0.4')

    def do_POST(self):
        if self.headers.get('Authorization') != 'Bearer ' + os.environ['P07_MONITOR_TOKEN']:
            return self.reply(401, '{}')
        length = int(self.headers.get('Content-Length', '0'))
        if length > 65536:
            return self.reply(413, '{}')
        if self.path == '/test-alert':
            with LOCK:
                STATE['test_until'] = time.time() + 90
            return self.reply(200, '{}')
        if self.path != '/api/v2/alerts':
            return self.reply(404, '{}')
        try:
            alerts = json.loads(self.rfile.read(length))
            if not isinstance(alerts, list) or len(alerts) > 100:
                raise ValueError()
            with LOCK:
                STATE['notifications'] += len(alerts)
                STATE['test_notifications'] += sum(a.get('labels', {}).get('alertname') == 'P07AcceptanceNotification' for a in alerts)
                STATE['last_received'] = time.time()
            self.reply(200, '{}')
        except (ValueError, TypeError, AttributeError):
            self.reply(400, '{}')


ThreadingHTTPServer(('0.0.0.0', 9105), Handler).serve_forever()
