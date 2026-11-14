"""Synthetic P09 incident fixture; no connections to protected services or data."""
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

state = {'fault': 0, 'firing': 0, 'resolved': 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        body = (f'p07_telemetry_storage_measurement_error{{store="tempo"}} {state["fault"]}\n'
                if self.path == '/metrics' else json.dumps(state)).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; version=0.0.4' if self.path == '/metrics' else 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        if length > 32768:
            self.send_error(413)
            return
        data = json.loads(self.rfile.read(length) or '{}')
        if self.path == '/fault':
            state['fault'] = int(bool(data.get('fault')))
        elif self.path == '/api/v2/alerts':
            for alert in data:
                # Prometheus uses an end time in the future for active alerts.
                import datetime
                end = datetime.datetime.fromisoformat(alert['endsAt'].replace('Z', '+00:00')).timestamp()
                state['resolved' if end <= time.time() else 'firing'] += 1
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{}')


HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
