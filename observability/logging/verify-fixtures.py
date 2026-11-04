"""Synthetic records only, used inside an isolated verification project's seed container."""
import datetime
import json
import os
from pathlib import Path

marker = os.environ['MARKER']
timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
records = {
    'jwks': ('jwks-api.log', 10001, {'@timestamp': timestamp, 'level': 'INFO', 'event': 'http.request.completed',
        'message': 'JWKS fixture', 'correlationId': marker, 'httpMethod': 'GET', 'uri': '/.well-known/jwks.json',
        'status': '200', 'elapsed_ms': '3'}),
    'user': ('user-api-20261104.json', 1654, {'Timestamp': timestamp, 'Level': 'Information',
        'RenderedMessage': 'User fixture', 'Properties': {'CorrelationId': marker, 'StatusCode': 200,
            'ElapsedMilliseconds': 1.5, 'EventName': 'HttpRequestCompleted', 'IsSlow': False,
            'ClaimedCallerService': 'vocabulary-api'}}),
    'vocabulary': ('application.json.log', 185, {'@timestamp': timestamp, 'level': 'WARN',
        'message': 'Vocabulary fixture', 'event.name': 'http.request.completed', 'correlationId': marker,
        'http.response.status_code': 200, 'durationMs': 5, 'isSlow': 'true',
        'handler.method': 'quizConfiguration', 'security.authenticated': 'true'})}
for service, (name, owner, record) in records.items():
    directory = Path('/logs') / service
    os.chown(directory, owner, owner)
    directory.chmod(0o750)
    path = directory / name
    if os.environ.get('ROTATE') and path.exists():
        path.rename(directory / (name + '.rotated'))
    with path.open('a', encoding='utf-8') as file:
        file.write(json.dumps(record) + '\n')
    os.chown(path, owner, owner)
    path.chmod(0o640)
print('Seeded three synthetic service records.')
