"""Selective Docker metadata and allowlisted loopback status; never reads telemetry bodies."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.error

HERE = Path(__file__).resolve().parent


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Read-only Docker metadata unavailable')
    return result.stdout.strip()


def capture():
    names = [x for x in run(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
             if x.startswith(('jp_dev-', 'springboot_project-'))]
    report = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'containers': {},
              'scope': 'Names/IDs/start times/networks/mount identities/port bindings only; no env or data reads'}
    template = ('{{.Id}}|{{.State.StartedAt}}|{{.State.Status}}|'
                '{{range .Mounts}}{{.Type}}:{{.Source}}:{{.Destination}}:{{.RW}};{{end}}|'
                '{{range $name,$network := .NetworkSettings.Networks}}{{$name}}:{{$network.NetworkID}};{{end}}|'
                '{{json .HostConfig.PortBindings}}')
    for name in sorted(names):
        values = run(['docker', 'inspect', '--format', template, name]).split('|')
        item = dict(zip(('id', 'started', 'state', 'mounts', 'networks', 'published_ports'), values))
        for field in ('mounts', 'networks'):
            item[field] = sorted(filter(None, item[field].split(';')))
        item['published_ports'] = json.loads(item['published_ports'])
        report['containers'][name] = item
    # Restrict requests to loopback and do not follow redirects to any other origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    report['loopback'] = {}
    for name, url in [('prometheus_flags', 'http://127.0.0.1:9091/api/v1/status/flags'),
                      ('grafana_health', 'http://127.0.0.1:3001/api/health'),
                      ('grafana_unauth_datasources', 'http://127.0.0.1:3001/api/datasources')]:
        try:
            with opener.open(url, timeout=5) as response:
                data = json.load(response)
                if name == 'prometheus_flags':
                    report['loopback'][name] = {k: data['data'].get(k) for k in (
                        'storage.tsdb.retention.time', 'storage.tsdb.retention.size',
                        'web.listen-address', 'web.enable-admin-api', 'web.enable-lifecycle')}
                elif name == 'grafana_health':
                    report['loopback'][name] = {'database': data.get('database'), 'version': data.get('version')}
                else:
                    report['loopback'][name] = {'status': response.status, 'body_retained': False}
        except urllib.error.HTTPError as error:
            report['loopback'][name] = {'status': error.code, 'body_retained': False}
        except (OSError, ValueError):
            report['loopback'][name] = {'status': 'UNVERIFIED: endpoint unavailable'}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=('before', 'after'))
    stage = parser.parse_args().stage
    report = capture()
    if stage == 'after':
        before = json.loads((HERE / 'evidence/blockers-runtime-before.json').read_text())
        report['metadata_equal_before'] = before['containers'] == report['containers']
    (HERE / ('evidence/blockers-runtime-' + stage + '.json')).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'stage': stage, 'containers': len(report['containers']),
                      'metadata_preserved': report.get('metadata_equal_before', 'pending'),
                      'loopback': report['loopback']}))
