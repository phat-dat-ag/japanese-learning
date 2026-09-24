"""Single-server production operations. Output never includes resolved configuration.
Run from any directory; use --help. No operation deletes volumes or pulls source.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
JOBS = ('sqlserver-init', 'flyway-user', 'flyway-vocabulary')
APPS = ('user-api', 'vocabulary-api', 'gateway', 'frontend')


def run(args, *, input=None):
    result = subprocess.run(args, cwd=ROOT, input=input, text=True, encoding="utf-8", capture_output=True)
    if result.returncode:
        # Docker errors can contain resolved secrets. Do not echo argv or diagnostics.
        raise RuntimeError('Operation failed; diagnostics withheld to protect secrets.')
    return result.stdout


def compose_args(env_file, project, monitoring=False):
    args = ['docker', 'compose', '--env-file', str(env_file), '-p', project,
            '-f', 'docker-compose.yml', '-f', 'compose.production.yml']
    if monitoring:
        args += ['-f', 'compose.observability.yml', '-f', 'compose.production-observability.yml']
    return args


def validate(config):
    services = config['services']
    for name, service in services.items():
        ports = service.get('ports', [])
        if name in ('frontend', 'grafana'):
            if len(ports) != 1 or ports[0].get('host_ip') != '127.0.0.1':
                raise RuntimeError('Public exposure validation failed: ' + name)
        elif ports:
            raise RuntimeError('Unexpected published service: ' + name)
        if not service.get('read_only') or 'ALL' not in service.get('cap_drop', []):
            raise RuntimeError('Container hardening validation failed: ' + name)
        if service.get('container_name'):
            raise RuntimeError('Fixed container names are forbidden in production.')
    for name in ('frontend', 'api', 'mysql', 'sqlserver'):
        if not config['networks'][name].get('internal'):
            raise RuntimeError('Internal network validation failed: ' + name)
    edition = services['sqlserver']['environment']['MSSQL_PID']
    if edition not in ('Express', 'Standard', 'Enterprise', 'Web') and not re.fullmatch(r'(?:[A-Z0-9]{5}-){4}[A-Z0-9]{5}', edition):
        raise RuntimeError('MSSQL_PID must select a licensed production edition.')
    image = services['frontend']['image']
    tag = image.rsplit(':', 1)[-1]
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}', tag) or tag == 'latest':
        raise RuntimeError('RELEASE_TAG must be a unique release identifier, never latest.')
    for name in ('MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD'):
        value = services['mysql']['environment'][name]
        if len(value) < 24 or re.search(r'''[\x00-\x20'"\\]''', value):
            raise RuntimeError(name + ' needs at least 24 characters without whitespace, quotes or backslashes.')
    password = services['sqlserver']['environment']['MSSQL_SA_PASSWORD']
    if len(password) < 24 or sum(bool(re.search(pattern, password)) for pattern in ('[A-Z]', '[a-z]', '[0-9]', '[^A-Za-z0-9]')) < 3:
        raise RuntimeError('MSSQL_SA_PASSWORD needs at least 24 characters and three character classes.')
    if 'grafana' in services and len(services['grafana']['environment']['GF_SECURITY_ADMIN_PASSWORD']) < 24:
        raise RuntimeError('GRAFANA_ADMIN_PASSWORD needs at least 24 characters.')
    # Reuse Step 8.7 tracked-file/secret audit, without exposing values.
    spec = importlib.util.spec_from_file_location('configuration_audit', ROOT / 'scripts/verify-configuration.py')
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    audit.audit(config, check_compose=False)


def states(project):
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project]).split()
    items = json.loads(run(['docker', 'inspect', *ids])) if ids else []
    return {item['Config']['Labels']['com.docker.compose.service']: item for item in items}


def verify(project, monitoring=False):
    items = states(project)
    for name in ('mysql', 'sqlserver', *APPS, *(('prometheus', 'grafana') if monitoring else ())):
        item = items.get(name, {})
        if item.get('State', {}).get('Health', {}).get('Status') != 'healthy':
            raise RuntimeError('Service is not healthy: ' + name)
        host = item['HostConfig']
        allowed_caps = ['NET_BIND_SERVICE'] if name == 'sqlserver' else []
        caps = [cap.removeprefix('CAP_') for cap in (host.get('CapAdd') or [])]
        if (not host['ReadonlyRootfs'] or not host['Memory'] or host['MemorySwap'] != host['Memory']
                or not host['NanoCpus'] or not host['PidsLimit'] or not host['Init'] or host['Privileged']
                or 'ALL' not in [cap.upper() for cap in host['CapDrop']] or caps != allowed_caps
                or not any(opt.startswith('no-new-privileges') for opt in host['SecurityOpt'])
                or item['Config']['User'] in ('', '0', 'root', '0:0')):
            raise RuntimeError('Runtime hardening check failed: ' + name)
        for bindings in (host.get('PortBindings') or {}).values():
            if name not in ('frontend', 'grafana') or any(b['HostIp'] != '127.0.0.1' for b in bindings):
                raise RuntimeError('Runtime public exposure check failed: ' + name)
    for name in JOBS:
        state = items.get(name, {}).get('State', {})
        if state.get('Status') != 'exited' or state.get('ExitCode') != 0:
            raise RuntimeError('Migration/init job has not succeeded: ' + name)
    for name in ('gateway', 'frontend'):
        run(['docker', 'exec', items[name]['Id'], 'nginx', '-t'])
    print('PASS: services healthy, init/migrations exited 0, exposure restricted, both NGINX configurations valid.')


def deploy(cmd, config, project, monitoring=False):
    # Check all release images before entering the maintenance window.
    for name in ('frontend', 'user-api', 'vocabulary-api'):
        run(['docker', 'image', 'inspect', config['services'][name]['image']])
    print('Entering maintenance window; a failure leaves application traffic stopped.', flush=True)
    try:
        run(cmd + ['stop', 'frontend', 'gateway', 'vocabulary-api', 'user-api'])
        run(cmd + ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '240', 'mysql', 'sqlserver'])
        # Recreate completed jobs on EVERY deployment; never trust an old exit code.
        for name in JOBS:
            run(cmd + ['up', '--no-deps', '--force-recreate', '--abort-on-container-exit', '--exit-code-from', name, name])
        for name in APPS:
            run(cmd + ['up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '240', name])
        if monitoring:
            run(cmd + ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'prometheus', 'grafana'])
        verify(project, monitoring)
    except Exception:
        try:
            run(cmd + ['stop', 'frontend', 'gateway'])
        except RuntimeError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env.production')
    parser.add_argument('--project', default='japanese-learning-production')
    parser.add_argument('--monitoring', action='store_true')
    parser.add_argument('action', choices=('validate', 'build', 'deploy', 'verify', 'status', 'logs', 'stop', 'restart'))
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', args.project):
        raise RuntimeError('Invalid project name.')
    env_file = args.env_file.resolve()
    if not env_file.is_file():
        raise RuntimeError('Create the production environment file from deployment/production.env.example first.')
    if os.name == 'posix' and env_file.stat().st_mode & 0o077:
        raise RuntimeError('Production environment file must have owner-only permissions (chmod 600).')
    cmd = compose_args(env_file, args.project, args.monitoring)
    run(cmd + ['config', '--quiet'])
    config = json.loads(run(cmd + ['config', '--format', 'json']))
    validate(config)
    if args.action == 'validate':
        print('PASS: production Compose and configuration contract validated.')
    elif args.action == 'build':
        for name in ('frontend', 'user-api', 'vocabulary-api'):
            exists = subprocess.run(['docker', 'image', 'inspect', config['services'][name]['image']], capture_output=True)
            if exists.returncode == 0:
                raise RuntimeError('Release image tag already exists; choose a new RELEASE_TAG before building.')
        run(cmd + ['build', 'frontend', 'user-api', 'vocabulary-api'])
        print('PASS: all three release images built.')
    elif args.action == 'deploy':
        deploy(cmd, config, args.project, args.monitoring)
    elif args.action == 'verify':
        verify(args.project, args.monitoring)
    elif args.action == 'status':
        for name, item in sorted(states(args.project).items()):
            state = item['State']
            print(name + ': ' + state['Status'] + ', health=' + state.get('Health', {}).get('Status', 'n/a') + ', exit=' + str(state['ExitCode']))
    elif args.action == 'logs':
        # Deliberately only application/gateway logs; DB/job diagnostics can contain SQL.
        output = run(cmd + ['logs', '--no-color', '--tail', '100', *APPS])
        for service in config['services'].values():
            for key, value in service.get('environment', {}).items():
                if any(word in key.upper() for word in ('PASSWORD', 'SECRET', 'TOKEN', 'CONNECTIONSTRING')) and value:
                    output = output.replace(str(value), '[redacted]')
        output = re.sub(r'(?i)Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted]', output)
        print(output, end='')
    elif args.action == 'stop':
        run(cmd + ['stop'])
        print('Stopped; all database and monitoring volumes preserved.')
    else:
        # Restart existing containers only. Deploy applies source/config changes.
        for name in ('mysql', 'sqlserver', *APPS, *(('prometheus', 'grafana') if args.monitoring else ())):
            run(cmd + ['restart', '--no-deps', name])
            deadline = time.monotonic() + 240
            while states(args.project).get(name, {}).get('State', {}).get('Health', {}).get('Status') != 'healthy':
                if time.monotonic() >= deadline:
                    raise RuntimeError('Timed out waiting for service health: ' + name)
                time.sleep(2)
        verify(args.project, args.monitoring)


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print('FAIL: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (AssertionError, OSError, ValueError, KeyError):
        # Assertions in reused checks can mention paths, but never print captured output.
        print('FAIL: production operation did not complete. Check configuration, permissions and service status; diagnostics withheld.', file=sys.stderr)
        sys.exit(1)
