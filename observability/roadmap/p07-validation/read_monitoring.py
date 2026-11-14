"""Read-only loopback GETs; no credentials, payload scans or configuration writes."""
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(path):
    with build_opener(NoRedirect).open(path, timeout=5) as response:
        return json.load(response)


def inspect():
    report = {'captured_utc':datetime.now(timezone.utc).isoformat(),
              'scope':'Read-only point-in-time metadata, not P07 deployment or capacity validation'}
    health = get('http://127.0.0.1:3001/api/health')
    report['grafana'] = {'version':health.get('version'),'database':health.get('database')}
    report['unauthenticated_grafana'] = {}
    for path in ('/api/datasources','/api/search'):
        try:
            with build_opener(NoRedirect).open('http://127.0.0.1:3001'+path, timeout=5) as response:
                code = response.status
        except HTTPError as error:
            code = error.code
        report['unauthenticated_grafana'][path] = code
    targets = get('http://127.0.0.1:9091/api/v1/targets?state=active')['data']['activeTargets']
    report['targets'] = [{'job':x['labels'].get('job'),'health':x['health'],
                          'error_present':bool(x['lastError'])} for x in targets]
    groups = get('http://127.0.0.1:9091/api/v1/rules')['data']['groups']
    report['rules'] = [{'name':x['name'],'count':len(x['rules']),
                       'health':sorted(set(r.get('health','unknown') for r in x['rules']))} for x in groups]
    report['prometheus_point_measurements'] = {}
    for name in ('prometheus_tsdb_head_series','prometheus_tsdb_storage_blocks_bytes',
                 'prometheus_tsdb_wal_storage_size_bytes'):
        data = get('http://127.0.0.1:9091/api/v1/query?'+urlencode({'query':name+'{job="prometheus"}'}))
        report['prometheus_point_measurements'][name] = [r['value'] for r in data['data']['result']]
    target = Path(__file__).resolve().parent / 'evidence/monitoring-readonly.json'
    target.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    inspect()
