"""Apply local P07 accounts/roles using its admin certificate; never print secrets."""
import argparse
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CERT = '/usr/share/opensearch/config/p07/'


def main(project):
    credentials = json.loads((ROOT / 'secrets/p07/credentials.json').read_text())
    result = subprocess.run(['docker', 'compose', '-p', project, 'ps', '-q', 'opensearch'],
                            cwd=ROOT, capture_output=True, text=True)
    container = result.stdout.strip()
    if result.returncode or not container or '\n' in container:
        raise RuntimeError('Expected exactly one running OpenSearch in selected project.')

    def request(route, method='GET', body=None, account=None):
        config = 'silent\nshow-error\ncacert = "' + CERT + 'ca.pem"\n'
        if account:
            config += 'user = "' + account + ':' + credentials[account] + '"\n'
        else:
            config += 'cert = "' + CERT + 'admin.pem"\nkey = "' + CERT + 'admin.key"\n'
        # Credentials are stdin-only; never command-line arguments or diagnostics.
        args = ['docker', 'exec', '-i', container, 'curl', '--config', '-', '--max-time', '10',
                '-w', '\n%{http_code}', '-X', method]
        if body is not None:
            # JSON password payload also travels through the curl stdin config.
            config += 'header = "Content-Type: application/json"\n'
            config += 'data = ' + json.dumps(json.dumps(body)) + '\n'
        args += ['https://opensearch:9200' + route]
        # Binary stdin keeps LF intact when Windows talks to Linux curl.
        response = subprocess.run(args, input=config.encode('utf-8'), capture_output=True)
        content, _, code = response.stdout.decode('utf-8').rpartition('\n')
        if response.returncode or not code.isdigit():
            return 0, None
        try:
            data = json.loads(content)
        except ValueError:
            data = None
        return int(code), data

    for attempt in range(30):
        status, _ = request('/')
        if status in (200, 503):
            break
        time.sleep(2)
    else:
        raise RuntimeError('OpenSearch TLS/admin-certificate connection not ready.')
    security_status, security_data = request('/_plugins/_security/api/internalusers/administrator')
    uninitialized = (security_status == 500 and isinstance(security_data, dict)
                     and security_data.get('message') == 'Security index not initialized')
    if status == 503 or uninitialized:
        command = ['docker', 'exec', '-e', 'JAVA_OPTS=-Xms16m -Xmx128m', container,
                   'bash', '/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh',
                   '-cd', '/usr/share/opensearch/config/opensearch-security', '-h', 'opensearch',
                   '-p', '9200', '-icl', '-cacert', CERT + 'ca.pem', '-cert', CERT + 'admin.pem',
                   '-key', CERT + 'admin.key']
        response = subprocess.run(command, capture_output=True, timeout=180)
        if response.returncode:
            raise RuntimeError('Initial OpenSearch security bootstrap failed; diagnostics withheld.')

    def apply(route, body):
        status, _ = request('/_plugins/_security/api/' + route, 'PUT', body)
        if status not in (200, 201):
            raise RuntimeError('P07 security operation failed: ' + route + ' HTTP ' + str(status))

    for account, password in credentials.items():
        apply('internalusers/' + account, {'password': password})
    roles = {
        'p07_writer': {'cluster_permissions': ['indices:data/write/bulk'], 'index_permissions': [
            {'index_patterns': ['application-logs-*'], 'allowed_actions': ['write', 'create_index']}]},
        'p07_reader': {'cluster_permissions': ['cluster_composite_ops_ro'], 'index_permissions': [
            {'index_patterns': ['application-logs-*'], 'allowed_actions': ['read']},
            {'index_patterns': ['.kibana', '.kibana_1'], 'allowed_actions': ['read']}],
            'tenant_permissions': [{'tenant_patterns': ['global_tenant'], 'allowed_actions': ['kibana_all_read']}]},
    }
    for name, role in roles.items():
        apply('roles/' + name, role)
    for role, accounts in {'all_access': ['administrator'], 'security_rest_api_access': ['administrator'],
                           'p07_writer': ['ingestion_writer'], 'p07_reader': ['dashboard_reader'],
                           'kibana_server': ['kibanaserver']}.items():
        status, data = request('/_plugins/_security/api/rolesmapping/' + role)
        if status not in (200, 404):
            raise RuntimeError('Unable to inspect existing role mapping: ' + role)
        existing = (data or {}).get(role, {})
        mapping = {key: existing[key] for key in ('backend_roles', 'hosts', 'users', 'and_backend_roles')
                   if key in existing}
        mapping['users'] = sorted(set(mapping.get('users', [])) | set(accounts))
        apply('rolesmapping/' + role, mapping)
    for account, route in [('administrator', '/_cluster/health'), ('kibanaserver', '/')]:
        status, _ = request(route, account=account)
        if status != 200:
            raise RuntimeError('Account authentication failed: ' + account + ' HTTP ' + str(status))
    print('PASS: P07 accounts/roles configured; administrator and kibanaserver authenticate over verified TLS.')
    print('Existing unrelated role-mapping members preserved; no credentials printed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    main(args.project)
