"""Read-only config validation; synthetic interpolation; never runs containers."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE / 'evidence'


def run(command, **kwargs):
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def verify():
    before = run(['git', 'show', 'HEAD:docker-compose.yml'])
    after = (ROOT / 'docker-compose.yml').read_text()
    fixture = {
        'MYSQL_DATABASE': 'jp_p06_fixture', 'MYSQL_USER': 'synthetic',
        'MYSQL_ROOT_PASSWORD': 'Synthetic-P06-Only-2026',
        'MYSQL_PASSWORD': 'Synthetic-P06-Only-2026',
        'MSSQL_DATABASE': 'jp_p06_fixture', 'MSSQL_SA_PASSWORD': 'Synthetic-P06-Only-2026',
        'JWT_ISSUER': 'p06-fixture', 'JWT_AUDIENCE': 'p06-fixture',
        'GRAFANA_ADMIN_USER': 'p06-synthetic', 'GRAFANA_ADMIN_PASSWORD': 'Synthetic-P06-Only-2026'
    }
    env = os.environ.copy()
    for name in set(re.findall(r'\$\{([A-Z_][A-Z0-9_]*)', before + after)) | {
            'COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_ENV_FILES'}:
        env.pop(name, None)
    env.update(fixture)
    fixture_path = HERE / 'compose-fixture.env'
    fixture_path.write_text('\n'.join(k + '=' + v for k, v in fixture.items()) + '\n')
    command = ['docker', 'compose', '--env-file', str(fixture_path),
               '--project-directory', str(ROOT), '-p', 'jp_dev', '-f', '-',
               'config', '--no-env-resolution', '--format', 'json']
    old = json.loads(run(command, input=before, env=env))
    new = json.loads(run(command, input=after, env=env))
    assert set(new['services']) == set(old['services']) | {'otel-collector', 'tempo'}
    for name, service in old['services'].items():
        value = json.loads(json.dumps(new['services'][name]))
        if name in ('user-api', 'vocabulary-api'):
            additions = set(value['environment']) - set(service['environment'])
            expected = {'Tracing__ExportEnabled', 'Tracing__SampleRatio',
                        'Tracing__MaxRootsPerSecond', 'Tracing__Environment', 'Tracing__Endpoint'} \
                if name == 'user-api' else {'APP_OTEL_EXPORT_ENABLED', 'APP_OTEL_SAMPLE_RATIO',
                        'APP_OTEL_MAX_ROOTS_PER_SECOND', 'APP_OTEL_ENDPOINT', 'APP_ENVIRONMENT'}
            assert additions == expected
            for key in additions:
                del value['environment'][key]
        if name == 'grafana':
            assert set(value['networks']) == set(service['networks']) | {'p06-tracing'}
            del value['networks']['p06-tracing']
            mounts = value['volumes']
            current = next(m for m in mounts if m['target'] == '/etc/grafana/provisioning')
            previous = next(m for m in service['volumes'] if m['target'] == current['target'])
            assert Path(current['source']) == ROOT / 'observability/p06/grafana/provisioning'
            current['source'] = previous['source']
        assert value == service, 'Unexpected Compose change: ' + name
    for kind in ('networks', 'volumes'):
        assert all(new[kind][name] == value for name, value in old[kind].items())
    assert new['networks']['p06-tracing']['internal']
    assert new['volumes']['tempo_data']['name'] == 'jp_dev_tempo_data'
    for name in ('otel-collector', 'tempo'):
        value = new['services'][name]
        assert not value.get('ports') and value['read_only']
        assert int(value['mem_limit']) == int(value['memswap_limit'])
        assert value['labels']['jp.observability.phase'] == 'P06'
        assert value['labels']['jp.observability.owner'] == 'japanese-learning'
        assert not any(m.get('source', '').startswith('springboot') for m in value['volumes'])
    for folder, name in [('datasources', 'prometheus.yml'), ('dashboards', 'health.yml')]:
        source = ROOT / 'observability/p05-candidate/grafana/provisioning' / folder / name
        target = ROOT / 'observability/p06/grafana/provisioning' / folder / name
        assert source.read_bytes() == target.read_bytes()
    yaml_files = [str(p.relative_to(ROOT)) for p in (ROOT / 'observability/p06').rglob('*.yml')]
    node_script = """const p=require('./angular/node_modules/prettier');
    const fs=require('fs');(async()=>{for(const f of JSON.parse(process.argv[1])){
    await p.format(fs.readFileSync(f,'utf8'),{parser:'yaml'});} console.log('PASS YAML syntax');
    })().catch(e=>{console.error(e.message);process.exit(1)});"""
    run(['node', '-e', node_script, json.dumps(yaml_files)])
    binary = ROOT / '.local/p06-tools/otelcol-contrib.exe'
    collector = {'status': 'NOT VERIFIED', 'reason': 'Validator not available'}
    if binary.exists():
        version = run([str(binary), '--version']).strip()
        run([str(binary), 'validate', '--config=observability/p06/collector.yml'])
        collector = {'status': 'PASS', 'version': version,
                     'scope': 'Native config/OTTL validation only; no pipeline started',
                     'sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
    report = {'compose': 'PASS', 'project': 'jp_dev', 'original_services': len(old['services']),
              'changes': ['API tracing environment only', 'Grafana provisioning/network',
                          'two trace services', 'one private network', 'dedicated Tempo volume'],
              'original_networks_volumes': 'preserved', 'yaml_files': yaml_files,
              'yaml_syntax': 'PASS', 'prometheus_datasource_and_dashboard_provider': 'byte-identical',
              'collector': collector, 'tempo_native_validation': 'NOT VERIFIED',
              'runtime_acceptance': 'BLOCKED: no deployment authorized'}
    (EVIDENCE / 'config-validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    verify()
