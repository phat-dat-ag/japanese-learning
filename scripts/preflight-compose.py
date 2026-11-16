"""Read-only Compose preflight: required settings and bind-source types, no secrets printed."""
import argparse
import json
from pathlib import Path
import re
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def audit(config):
    errors = []
    seen = set()
    for service, settings in config['services'].items():
        for mount in settings.get('volumes', []):
            if mount['type'] != 'bind':
                continue
            source = Path(mount['source'])
            target = mount['target']
            expected_file = bool(Path(target).suffix) or target.endswith('htpasswd')
            key = (str(source), expected_file)
            if key in seen:
                continue
            seen.add(key)
            try:
                metadata = source.stat()
            except PermissionError:
                errors.append(service + ': access denied to bind source ' + str(source))
                continue
            except FileNotFoundError:
                errors.append(service + ': missing bind source ' + str(source))
                continue
            if expected_file and (not stat.S_ISREG(metadata.st_mode) or metadata.st_size == 0):
                errors.append(service + ': expected nonempty regular file ' + str(source))
            elif not expected_file and not stat.S_ISDIR(metadata.st_mode):
                errors.append(service + ': expected directory ' + str(source))
    requirements = {
        'mysql': ['MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD'],
        'sqlserver': ['MSSQL_SA_PASSWORD'],
        'grafana': ['GF_SECURITY_ADMIN_PASSWORD'],
        'logging-init': ['P07_ADMIN_PASSWORD'],
        'fluent-bit': ['P07_WRITER_PASSWORD'],
        'opensearch-dashboards': ['P07_DASHBOARDS_PASSWORD'],
        'storage-monitor': ['P07_MONITOR_TOKEN'],
    }
    for service, names in requirements.items():
        if service not in config['services']:
            continue
        settings = config['services'].get(service, {})
        if settings.get('profiles'):
            continue
        for name in names:
            if not settings.get('environment', {}).get(name):
                errors.append(service + ': blank required setting ' + name)
    user = config['services'].get('user-api', {})
    for name, value in user.get('environment', {}).items():
        if not name.startswith('APP_SECURITY_SIGNING_KEYS_') or not name.endswith('_PRIVATE_KEY_PATH'):
            continue
        found = False
        for mount in user.get('volumes', []):
            if mount['type'] == 'bind' and str(value).startswith(mount['target'] + '/'):
                key = Path(mount['source']) / str(value)[len(mount['target']) + 1:]
                found = key.is_file() and key.stat().st_size > 0
        if not found:
            errors.append('user-api: missing mounted signing file for ' + name)
    monitor = config['services'].get('storage-monitor', {})
    token = monitor.get('environment', {}).get('P07_MONITOR_TOKEN')
    if token and not monitor.get('profiles'):
        for mount in config['services'].get('prometheus', {}).get('volumes', []):
            if mount['type'] == 'bind' and mount['target'].endswith('/monitor.token'):
                source = Path(mount['source'])
                if source.is_file() and source.read_text().strip() != token:
                    errors.append('Prometheus monitor.token does not match storage-monitor token')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project')
    parser.add_argument('--local-production', action='store_true')
    args = parser.parse_args()
    command = ['docker', 'compose', '--env-file', '.env']
    if args.local_production:
        command += ['--env-file', '.env.db.production']
    if args.project:
        command += ['-p', args.project]
    command += ['-f', 'docker-compose.yml']
    if args.local_production:
        command += ['-f', 'compose.local-production.yml']
    result = subprocess.run(command + ['config', '--format', 'json'], cwd=ROOT,
                            capture_output=True, text=True)
    if result.returncode:
        names = sorted(set(re.findall(r'required variable ([A-Z][A-Z0-9_]*)', result.stderr)))
        print('FAIL: Compose resolution. Required names: ' + ', '.join(names))
        print('Check env-file existence/syntax; diagnostics withheld to protect values.')
        return 1
    errors = audit(json.loads(result.stdout))
    for error in errors:
        print('FAIL: ' + error)
    if not errors:
        print('PASS: Compose resolves; required settings populated; bind source types correct.')
        print('Not tested: credentials, certificate contents, image builds, ports or runtime readiness.')
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
