"""Native Compose config validation ONLY, with isolated synthetic interpolation.

Never invokes up/down/start/stop/exec/build; never resolves service env files or prints
environment values. Explicit fixture env file bypasses implicit .env loading.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE/'evidence'


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def model():
    fixture = {
        'MYSQL_DATABASE':'jp_p05_fixture','MYSQL_USER':'synthetic',
        'MYSQL_ROOT_PASSWORD':'P05-Synthetic-Only-NotASecret-2026',
        'MYSQL_PASSWORD':'P05-Synthetic-Only-NotASecret-2026',
        'MSSQL_DATABASE':'jp_p05_fixture','MSSQL_SA_PASSWORD':'P05-Synthetic-Only-NotASecret-2026',
        'JWT_ISSUER':'p05-fixture','JWT_AUDIENCE':'p05-fixture',
        'GRAFANA_ADMIN_USER':'jp-p05-synthetic','GRAFANA_ADMIN_PASSWORD':'P05-Synthetic-Only-NotASecret-2026'}
    source = (ROOT/'docker-compose.yml').read_text()
    environment = os.environ.copy()
    for name in set(re.findall(r'\$\{([A-Z_][A-Z0-9_]*)',source)) | {
            'COMPOSE_FILE','COMPOSE_PROFILES','COMPOSE_PROJECT_NAME','COMPOSE_ENV_FILES'}:
        environment.pop(name,None)
    environment.update(fixture)
    fixture_path = HERE/'compose-fixture.env'
    fixture_path.write_text('# Synthetic interpolation only; not deployment credentials.\n'+
        '\n'.join(name+'='+value for name,value in fixture.items())+'\n')
    command = ['docker','compose','--env-file',str(fixture_path),'-p','jp_dev',
               '-f',str(ROOT/'docker-compose.yml'),'config','--no-env-resolution','--format','json']
    process = subprocess.run(command,cwd=ROOT,env=environment,text=True,capture_output=True)
    if process.returncode:
        raise RuntimeError('Read-only synthetic Compose validation failed: '+process.stderr)
    return json.loads(process.stdout)


def summary(data):
    return {'name':data['name'],
        'services':{name:digest(service) for name,service in data['services'].items()},
        'networks':data['networks'],'volumes':data['volumes']}


def validate_p05(data):
    assert data['name'] == 'jp_dev'
    for service, port, target, user in [('prometheus',9091,9090,'65534:65534'),
                                      ('grafana',3001,3000,'472:472')]:
        value = data['services'][service]
        assert value['user'] == user and value['read_only']
        assert 'profiles' not in value
        assert int(value['mem_limit']) == int(value['memswap_limit']) == 536870912
        assert value['pids_limit'] == 128 and float(value['cpus']) == 1
        assert 'ALL' in value['cap_drop'] and 'no-new-privileges:true' in value['security_opt']
        assert len(value['ports']) == 1
        binding = value['ports'][0]
        assert binding['host_ip'] == '127.0.0.1' and int(binding['published']) == port
        assert int(binding['target']) == target
        assert value['healthcheck']['timeout'] == '5s'
        for mount in value['volumes']:
            if mount['type'] == 'bind':
                assert mount['read_only'] and not mount['bind']['create_host_path']
                assert Path(mount['source']).resolve().is_relative_to(ROOT/'observability/p05-candidate')
            else:
                assert mount['source'] == ('prometheus_data' if service == 'prometheus' else 'grafana_data')
    assert set(data['services']['prometheus']['networks']) == {'default','p05-monitoring'}
    assert set(data['services']['grafana']['networks']) == {'default','p05-monitoring'}
    assert data['networks']['p05-monitoring']['internal']
    assert not any(value.get('external') for value in data['networks'].values())
    assert data['volumes']['prometheus_data']['name'] == 'jp_dev_prometheus_data'
    assert data['volumes']['grafana_data']['name'] == 'jp_dev_grafana_data'


if __name__ == '__main__':
    data = model()
    current = summary(data)
    if sys.argv[1:] == ['baseline']:
        destination = EVIDENCE/'compose-before.json'
        if destination.exists():
            raise SystemExit('Refuse to overwrite the initial Compose baseline')
        destination.write_text(json.dumps(current,indent=2)+'\n')
        print('PASS read-only baseline: '+str(len(data['services']))+' services; service env files not resolved')
    else:
        initial = json.loads((EVIDENCE/'compose-before.json').read_text())
        assert set(current['services']) == set(initial['services']) | {'prometheus','grafana'}
        assert all(current['services'][name] == value for name,value in initial['services'].items())
        for kind in ('networks','volumes'):
            assert all(current[kind][name] == value for name,value in initial[kind].items())
        validate_p05(data)
        report = {'result':'PASS native Compose configuration validation; no engine/lifecycle command',
            'project':'jp_dev','existing_services_preserved':len(initial['services']),
            'new_services':['prometheus','grafana'],'ports':{'prometheus':9091,'grafana':3001},
            'original_networks_volumes_preserved':True,'service_env_resolution':False,
            'credentials':'synthetic interpolation only; real .env not loaded',
            'runtime_network_ownership_port_exclusivity':'NOT VERIFIED; Docker denied; snapshot only'}
        (EVIDENCE/'compose-validation.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))
