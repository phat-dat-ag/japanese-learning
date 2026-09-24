"""Step 8.10: fresh source builds and isolated production E2E checks.
Only test-project containers are mutated; all volumes are retained. Never prints secrets.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import threading
import uuid

ROOT = Path(__file__).resolve().parents[1]
SDK = 'mcr.microsoft.com/dotnet/sdk:9.0@sha256:01fabc4758d1d74e39eda700c8463dae6241a61481f973683692ddcb59a5eeb7'


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


operations = module('production', 'production.py')
hardening = module('hardening', 'verify-container-hardening.py')


def command(args, *, input=None, env=None, binary=False):
    result = subprocess.run(args, cwd=ROOT, input=input, env=env, capture_output=True,
                            text=not binary, encoding=None if binary else 'utf-8')
    if result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:2]) + ' (diagnostics withheld)')
    return result.stdout


def baseline():
    names = command(['docker', 'volume', 'ls', '-q']).split()
    volumes = json.loads(command(['docker', 'volume', 'inspect', *names])) if names else []
    ids = command(['docker', 'ps', '-aq']).split()
    containers = json.loads(command(['docker', 'inspect', *ids])) if ids else []
    return {'volumes': {v['Name']: {k: v.get(k) for k in ('Name', 'Driver', 'CreatedAt', 'Mountpoint')} for v in volumes},
            'containers': {c['Id']: {'name': c['Name'], 'image': c['Image'],
                'volumes': sorted(m['Name'] for m in c['Mounts'] if m['Type'] == 'volume')} for c in containers},
            'development_data': hardening.persistence_snapshot()}


def protect_existing(before):
    after = baseline()
    for kind in ('volumes', 'containers'):
        for key, value in before[kind].items():
            assert after[kind].get(key) == value, 'Pre-existing Docker resource changed: ' + kind
    assert after['development_data'] == before['development_data'], 'Development database fingerprints changed'
    print('VERIFIED: pre-existing volumes/containers and development database fingerprints unchanged.', flush=True)


class Environment:
    def __init__(self, directory):
        self.directory = directory
        self.project = directory.name
        self.env_file = directory / '.env.production'
        self.cmd = operations.compose_args(self.env_file, self.project, True)
        self.config = json.loads(command(self.cmd + ['config', '--format', 'json']))
        operations.validate(self.config)
        self.sensitive = [str(v) for s in self.config['services'].values() for k, v in s.get('environment', {}).items() if 'PASSWORD' in k.upper()]
        self.private = directory / 'secrets/jwt/private.pem'
        self.sensitive.extend(self.private.read_text().strip().splitlines()[1:-1])
        for name, service in self.config['services'].items():
            service['ulimits']['core'] = 0
            if name in ('frontend', 'grafana'):
                target = 8080 if name == 'frontend' else 3000
                service['ports'] = [f'127.0.0.1::{target}']
            if name == 'user-api':
                for mount in service['volumes']:
                    mount['source'] = str(directory / 'secrets/jwt' / Path(mount['source']).name)
            service['environment'] = {k: v.replace('$', '$$') if isinstance(v, str) else v for k, v in service.get('environment', {}).items()}
        self.encoded = json.dumps(self.config)
        self.stdin_cmd = ['docker', 'compose', '-p', self.project, '-f', '-']
        self.state = {}
        self.checks = []
        self.events = []
        self.event_process = None

    def record_events(self):
        self.event_process = subprocess.Popen(['docker', 'events', '--filter',
            'label=com.docker.compose.project=' + self.project, '--format', '{{json .}}'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        def collect():
            for line in self.event_process.stdout:
                self.events.append(json.loads(line))
        self.event_thread = threading.Thread(target=collect, daemon=True)
        self.event_thread.start()
        time.sleep(0.5)

    def stop_events(self):
        if self.event_process is not None:
            self.event_process.terminate()
            self.event_process.wait(timeout=10)
            self.event_thread.join(timeout=10)
            self.event_process.stdout.close()
            self.event_process.stderr.close()
            self.event_process = None

    def compose(self, *args):
        return command(self.stdin_cmd + list(args), input=self.encoded)

    def refresh(self):
        self.state = operations.states(self.project)
        self.port = int(self.state['frontend']['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'])

    def execute(self, name, *args, input=None):
        item = self.state[name]
        assert item['Config']['Labels']['com.docker.compose.project'] == self.project
        return command(['docker', 'exec', '-i', item['Id'], *args], input=input)

    def sql(self, query):
        return self.execute('sqlserver', 'sh', '-c', 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -d JapaneseLearningUser', input=query + '\nGO\n')

    def mysql(self, query):
        return self.execute('mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h localhost -u "$MYSQL_USER" "$MYSQL_DATABASE" -N -B', input=query)

    def deploy(self):
        original = operations.run
        def run(args, **kwargs):
            if args[:2] == ['docker', 'compose']:
                return command(args, input=self.encoded)
            return original(args, **kwargs)
        operations.run = run
        try:
            operations.deploy(self.stdin_cmd, self.config, self.project, True)
        finally:
            operations.run = original
        self.refresh()

    def sign(self, header, payload):
        encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        data = encode(header) + b'.' + encode(payload)
        signature = command(['docker', 'run', '--rm', '-i', '--network', 'none', '--read-only',
            '--label', 'jp.final-e2e.run=' + self.project, '--mount', 'type=bind,source=' + str(self.private.parent) + ',target=/keys,readonly',
            SDK, 'openssl', 'dgst', '-sha256', '-sign', '/keys/private.pem'], input=data, binary=True)
        token = (data + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()
        self.sensitive.append(token)
        return token

    def passed(self, name):
        self.checks.append(name)
        print('VERIFIED: ' + name, flush=True)


def prepare():
    project = 'jp-final-e2e-' + uuid.uuid4().hex[:12]
    directory = ROOT / 'secrets/final-e2e' / project
    directory.mkdir(mode=0o700)
    if os.name == 'nt':
        owner = command(['whoami']).strip()
        command(['icacls', str(directory), '/inheritance:r', '/grant:r', owner + ':(OI)(CI)F'])
    template = (ROOT / 'deployment/production.env.example').read_text()
    values = {'MYSQL_ROOT_PASSWORD': secrets.token_hex(24), 'MYSQL_PASSWORD': secrets.token_hex(24),
              'MSSQL_SA_PASSWORD': 'Aa1!' + secrets.token_hex(24), 'GRAFANA_ADMIN_PASSWORD': secrets.token_hex(24),
              'MSSQL_PID': 'Express', 'RELEASE_TAG': project, 'JWT_ISSUER': project, 'JWT_AUDIENCE': project, 'JWT_KEY_ID': project}
    lines = []
    for line in template.splitlines():
        key = line.split('=', 1)[0]
        lines.append(key + '=' + values[key] if key in values else line)
    env_file = directory / '.env.production'
    with env_file.open('x', encoding='utf-8') as file:
        file.write('\n'.join(lines) + '\n')
    env_file.chmod(0o600)
    (directory / 'docker-compose.yml').write_text('# key-generator working-directory marker\n')
    command(['docker', 'run', '--rm', '--network', 'none', '--label', 'jp.final-e2e.run=' + project,
             '--mount', 'type=bind,source=' + str(directory) + ',target=/work', '--workdir', '/work',
             '--mount', 'type=bind,source=' + str(ROOT / 'scripts/generate-production-keys.sh') + ',target=/keygen.sh,readonly',
             SDK, 'bash', '/keygen.sh'])
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    baseline_file = ROOT / 'secrets/final-e2e/baseline.json'
    baseline_file.parent.mkdir(parents=True, exist_ok=True)
    if not baseline_file.exists():
        with baseline_file.open('x', encoding='utf-8') as output:
            json.dump(baseline(), output)
    before = json.loads(baseline_file.read_text())
    protect_existing(before)
    directory = prepare()
    assert directory.parent == (ROOT / 'secrets/final-e2e').resolve() and directory.name.startswith('jp-final-e2e-')
    e = Environment(directory)
    print('Isolated project: ' + e.project, flush=True)
    manifest = directory / 'build.json'
    try:
        command(e.cmd + ['config', '--quiet'])
        e.passed('production Compose validation with independently provisioned credentials and RSA pair')
        assert not operations.states(e.project), 'Fresh project already has containers'
        existing = command(['docker', 'volume', 'ls', '-q']).split()
        assert not any(name.startswith(e.project + '_') for name in existing), 'Fresh project already has volumes'
        print('Building all application images from source with --no-cache; output captured privately.', flush=True)
        command(e.cmd + ['build', '--no-cache', 'frontend', 'user-api', 'vocabulary-api'])
        images = {name: json.loads(command(['docker', 'image', 'inspect', e.config['services'][name]['image']]))[0]['Id']
                  for name in ('frontend', 'user-api', 'vocabulary-api')}
        manifest.write_text(json.dumps(images), encoding='utf-8')
        e.passed('Angular/.NET/Quarkus fresh source image builds (unique tags, no cached build steps)')
        e.record_events()
        e.deploy()
        checks = module('final_checks', 'final_e2e_checks.py')
        checks.run(e)
        (directory / 'result.json').write_text(json.dumps({'project': e.project, 'status': 'PASS', 'checks': e.checks}, indent=2))
        print('PASS: final isolated E2E checks completed.', flush=True)
    finally:
        e.stop_events()
        if operations.states(e.project):
            e.compose('down', '--timeout', '75')
        protect_existing(before)
        print('Only this run\'s containers/networks stopped; test volumes and protected fixtures retained: ' + e.project, flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAILED: ' + (str(error) if isinstance(error, (AssertionError, RuntimeError)) else type(error).__name__), flush=True)
        sys.exit(1)
