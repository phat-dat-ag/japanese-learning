"""Validate the single root Compose source with native tools and synthetic interpolation."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def run(command, **kwargs):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def check():
    before = (ROOT / 'docker-compose.yml').read_text()
    assert not list((ROOT/'observability/p07').rglob('*compose*.yml'))
    assert 'p07_fluent_bit_state' not in before
    baseline_head = json.loads((HERE/'evidence/preflight.json').read_text())['repositories']['.']['head']
    baseline = run(['git','show',baseline_head+':docker-compose.yml'])
    env = os.environ.copy()
    for key in set(re.findall(r'\$\{([A-Z_][A-Z0-9_]*)', before + baseline)) | {
            'COMPOSE_FILE','COMPOSE_PROFILES','COMPOSE_PROJECT_NAME','COMPOSE_ENV_FILES'}:
        env.pop(key, None)
    fixture = {'MYSQL_DATABASE':'p07_fixture','MYSQL_USER':'synthetic',
        'MYSQL_ROOT_PASSWORD':'Synthetic-P07-Only','MYSQL_PASSWORD':'Synthetic-P07-Only',
        'MSSQL_DATABASE':'p07_fixture','MSSQL_SA_PASSWORD':'Synthetic-P07-Only',
        'JWT_ISSUER':'p07-fixture','JWT_AUDIENCE':'p07-fixture',
        'GRAFANA_ADMIN_USER':'p07-synthetic','GRAFANA_ADMIN_PASSWORD':'Synthetic-P07-Only'}
    env.update(fixture)
    fixture_path = HERE / 'compose-fixture.env'
    fixture_path.write_text('\n'.join(k + '=' + v for k, v in fixture.items()) + '\n')
    common = ['docker','compose','--env-file',str(fixture_path),'--project-directory',str(ROOT),
              '-p','jp_dev','-f',str(ROOT/'docker-compose.yml')]
    args = ['config','--no-env-resolution','--format','json']
    baseline_common = common[:-1] + ['-']
    old = json.loads(run(baseline_common + args, env=env, input=baseline))
    new = json.loads(run(common + args, env=env))
    run(common + ['config','--quiet','--no-env-resolution'], env=env)
    # Full resolved model contains synthetic interpolation and env-file paths only, never secret contents.
    (HERE/'evidence/resolved-compose.json').write_text(json.dumps(new,indent=2)+'\n')
    assert set(old['services']) == set(new['services'])
    assert old['networks'] == new['networks']
    assert old['volumes'] == new['volumes']
    changes = {}
    for name, original in old['services'].items():
        value = new['services'][name]
        changed = {key for key in set(value) | set(original) if value.get(key) != original.get(key)}
        allowed = {
            'fluent-bit': {'build'}, 'prometheus': {'command','volumes'},
            'grafana': {'environment','volumes'}, 'otel-collector': {'volumes'}, 'tempo': {'volumes'},
            'user-api': {'logging'}, 'vocabulary-api': {'logging'}, 'gateway': {'logging'},
            'frontend': {'logging'}}.get(name, set())
        assert changed == allowed, (name, changed, allowed)
        if changed:
            changes[name] = sorted(changed)
        for key in ('networks','ports','mem_limit','memswap_limit','cpus','pids_limit','user',
                    'read_only','cap_drop','security_opt','healthcheck'):
            assert value.get(key) == original.get(key), (name, key)
        if name == 'grafana':
            for key, entry in original['environment'].items():
                assert value['environment'][key] == entry
            assert set(value['environment']) - set(original['environment']) == {
                'GF_USERS_AUTO_ASSIGN_ORG_ROLE','GF_SECURITY_ALLOW_EMBEDDING',
                'GF_SECURITY_COOKIE_SAMESITE','GF_SECURITY_DISABLE_GRAVATAR',
                'GF_AUTH_LOGIN_MAXIMUM_INACTIVE_LIFETIME_DURATION','GF_AUTH_LOGIN_MAXIMUM_LIFETIME_DURATION'}
        elif 'environment' in original:
            assert value['environment'] == original['environment'], name
        if name == 'prometheus':
            assert value['command'] == original['command'] + [
                '--query.timeout=15s','--query.max-concurrency=4','--query.max-samples=5000000',
                '--rules.max-concurrent-evals=2']
        if 'volumes' in changed:
            substitutions = {'prometheus': ('observability/p05-candidate/prometheus','observability/p07/prometheus'),
                'grafana': ('observability/p06/grafana/provisioning','observability/p07/grafana/provisioning'),
                'otel-collector': ('observability/p06/collector.yml','observability/p07/collector.yml'),
                'tempo': ('observability/p06/tempo.yml','observability/p07/tempo.yml')}
            source, target = substitutions[name]
            expected = json.loads(json.dumps(original['volumes']))
            for mount in expected:
                mount['source'] = mount['source'].replace(source.replace('/', '\\'), target.replace('/', '\\')).replace(source, target)
            assert value['volumes'] == expected, name
        if name in ('user-api','vocabulary-api','gateway','frontend'):
            assert value['logging']['driver'] == 'local'
            assert value['logging']['options'] == {'max-size':'10m','max-file':'3'}
    assert new['services']['fluent-bit']['build']['context'] == str(ROOT/'observability/p07/fluent-bit')
    assert new['services']['fluent-bit']['build']['dockerfile'] == 'Dockerfile'
    mounts = new['services']['fluent-bit']['volumes']
    assert next(m for m in mounts if m['target'] == '/state')['source'] == 'fluent_bit_state'
    assert mounts == old['services']['fluent-bit']['volumes']
    assert new['services']['jwks-api'] == old['services']['jwks-api']
    for mount in mounts:
        if mount['target'].startswith('/logs/'):
            assert mount['read_only']
    for service in new['services'].values():
        for port in service.get('ports', []):
            assert port.get('host_ip') == '127.0.0.1'
    files = [str(path.relative_to(ROOT)) for path in (ROOT/'observability/p07').rglob('*.yml')]
    script = """const fs=require('fs'),p=require('./angular/node_modules/prettier');
    (async()=>{for(const f of JSON.parse(process.argv[1]))await p.format(fs.readFileSync(f,'utf8'),{parser:'yaml'});
    console.log('PASS YAML syntax');})().catch(e=>{console.error(e.message);process.exit(1)});"""
    run(['node','-e',script,json.dumps(files)])
    commands = [
        ['.local/p06-tools/otelcol-contrib.exe','validate','--config=observability/p07/collector.yml'],
        ['.local/p07-native/promtool.exe','check','config','observability/p07/prometheus/prometheus.yml'],
        ['.local/p07-native/promtool.exe','check','rules','observability/p07/prometheus/rules/p05.rules.yml']]
    tempo = ROOT/'.local/p07-native/tempo.exe'
    if tempo.exists():
        commands.append(['.local/p07-native/tempo.exe','-config.file=observability/p07/tempo.yml','-config.verify=true'])
    tools = []
    for command in commands:
        stdout = run(command)
        tools.append({'command': command, 'status': 'PASS', 'output': stdout,
                      'binary_sha256': hashlib.sha256((ROOT/command[0]).read_bytes()).hexdigest()})
    report = {'captured_utc':datetime.now(timezone.utc).isoformat(),
        'compose':'PASS; single root config --quiet and full resolved model reviewed; no lifecycle command',
        'baseline_head':baseline_head,'service_changes':changes,'resolved_model':'resolved-compose.json',
        'services_preserved':len(old['services']),'networks_ports_limits_users_preserved':True,
        'existing_volumes_preserved':'All declarations and named mounts unchanged, including fluent_bit_state:/state',
        'new_volume':None,
        'shared_jwks_model':'unchanged','root_compose':'single authoritative Compose source; nine services hardened','yaml_files':files,
        'native_checks':tools,'tempo_native_validation':'PASS pinned2.10.3 Windows config verification only; Linux image behavior UNVERIFIED' if tempo.exists() else 'UNVERIFIED; no native validator',
        'fluent_bit_native_validation':'NOT VERIFIED; actual LuaJIT fixtures, not Fluent Bit embedding'}
    (HERE/'evidence/config-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'compose':'PASS','services':len(old['services']),'native_checks':len(tools),
                      'tempo_native':'PASS Windows config verify' if tempo.exists() else 'UNVERIFIED','fluent_bit_native':'NOT VERIFIED'}))


if __name__ == '__main__':
    check()
