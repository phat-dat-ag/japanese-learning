"""Finalize source evidence without staging, lifecycle actions or historical rewrites."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
E = HERE / 'evidence'


def read(path):
    data = path.read_bytes()
    return data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(ROOT / repo), *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip().splitlines()


def write(name, value):
    (E / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def main():
    before = json.loads(read(E / 'preflight.json'))
    repositories = {}
    for repo, old in before['repositories'].items():
        current = {'head': git(repo, 'rev-parse', 'HEAD')[0],
                   'branch': git(repo, 'branch', '--show-current')[0],
                   'index': git(repo, 'ls-files', '--stage'),
                   'status': git(repo, 'status', '--porcelain', '--untracked-files=all')}
        for key in ('head', 'branch', 'index'):
            assert current[key] == old[key], (repo, key)
        assert set(git(repo, 'diff', '--name-only')) <= ({'docker-compose.yml'} if repo == '.' else set()), repo
        assert not git(repo, 'diff', '--cached', '--name-only'), repo
        git(repo, 'diff', '--check')
        if repo != '.':
            assert current['status'] == old['status'], repo
        repositories[repo] = current
    changed_protected = [name for name, digest in before['protected_hashes'].items()
                         if sha(ROOT / name) != digest]
    assert changed_protected == ['docker-compose.yml'], changed_protected
    baseline = json.loads(read(E / 'runtime-baseline.json'))['containers']
    final = json.loads(read(E / 'runtime-final.json'))['containers']
    differences = []
    for name in sorted(set(baseline) | set(final)):
        if name not in baseline or name not in final:
            differences.append({'container': name, 'field': 'presence'})
            continue
        for key in baseline[name]:
            a, b = baseline[name][key], final[name][key]
            if key in ('mounts', 'networks'):
                a, b = sorted(filter(None, a.split(';'))), sorted(filter(None, b.split(';')))
            if a != b:
                differences.append({'container': name, 'field': key, 'before': a, 'after': b})
    preservation = {'git_source_status': 'PASS', 'repositories': repositories,
                    'protected_files_unchanged': len(before['protected_hashes']) - len(changed_protected),
                    'authorized_source_changes': changed_protected,
                    'runtime_identity_status': 'FAIL: external drift observed' if differences else 'PASS',
                    'runtime_differences': differences,
                    'springboot_project_identity_unchanged': not any(
                        d['container'].startswith('springboot_project-') for d in differences),
                    'unattributed_untracked_file': 'Historical empty file0; current presence: ' + str((ROOT/'0').exists()) + '; no action performed by this continuation',
                    'inaccessible_directories': 'Eight existing P03 directories; no ACL/cleanup operations',
                    'lifecycle_commands_by_this_task': False}
    fresh_path = E/'acceptance-runtime-after.json'
    if not fresh_path.exists():
        fresh_path = E/'blockers-runtime-after.json'
    fresh = json.loads(read(fresh_path))
    assert fresh['metadata_equal_before'], 'Fresh Docker metadata drift; review before acceptance'
    preservation['historical_runtime_identity_status'] = preservation['runtime_identity_status']
    preservation['runtime_differences_scope'] = 'Historical earlier P07 comparison, retained without reinterpretation'
    preservation['runtime_identity_status'] = 'PASS: fresh before/after selective metadata only'
    preservation['current_runtime_metadata_evidence'] = 'acceptance-runtime-before.json / acceptance-runtime-after.json' if fresh_path.name.startswith('acceptance') else 'blockers-runtime-before.json / blockers-runtime-after.json'
    preservation['runtime_acceptance'] = 'BLOCKED; metadata equality does not certify data integrity'
    write('preservation.json', preservation)

    security = json.loads(read(E / 'security-tests.json'))
    assert security['tests'] == 16 and security['failures'] == security['errors'] == 0
    config = json.loads(read(E / 'config-validation.json'))
    assert all(x['status'] == 'PASS' for x in config['native_checks'])
    trx = ROOT / 'dotnet/tests/JapaneseLearning.User.UnitTests/TestResults/p07-regression.trx'
    counters = ET.parse(trx).find('.//{*}Counters').attrib
    assert counters['total'] == counters['passed'] == '151' and counters['failed'] == '0'
    java = ROOT / '.local/p07-quarkus-regression.log'
    assert 'Tests run: 372, Failures: 0, Errors: 0, Skipped: 0' in read(java)
    assert 'BUILD SUCCESS' in read(java)
    prom = ROOT / '.local/p07-promtool-scenarios.log'
    assert 'SUCCESS' in read(prom)
    fixture = json.loads(read(ROOT / 'observability/roadmap/p05-validation/promtool.tests.yml'))
    assert len(fixture['tests']) == 42
    lua = json.loads(read(E / 'p03-lua-execution.json'))
    assert '229 Lua assertions' in str(lua)
    backlog = json.loads(read(E/'backlog-tests.json'))
    assert backlog['tests'] == 9 and backlog['failures'] == backlog['errors'] == 0
    collector = json.loads(read(E/'collector-native-pipeline.json'))
    prometheus = json.loads(read(E/'prometheus-native-pipeline.json'))
    assert collector['status'] == prometheus['status'] == 'PASS'
    assert collector['production_config_sha256'] == sha(ROOT/'observability/p07/collector.yml')
    assert prometheus['source_sha256'] == sha(ROOT/'observability/p07/prometheus/prometheus.yml')
    summary = {'captured_utc': datetime.now(timezone.utc).isoformat(),
               'backlog_handoff_fixtures':backlog,'native_collector_pipeline':collector,
               'native_prometheus_pipeline':prometheus,
               'security_fixtures': security, 'p03_actual_lua_assertions': 229,
               'application_regressions_scope': 'Previously executed P07 regression evidence; not rerun for Compose-only integration',
               'dotnet': {'passed': 151, 'trx_sha256': sha(trx)},
               'quarkus': {'passed': 372, 'mysql_fixtures': 'excluded', 'log_sha256': sha(java)},
               'promtool_scenarios': {'passed': 42, 'log_sha256': sha(prom)},
               'native_configuration': config,
               'current_runtime_evidence': ['active-runtime-audit.json','active-acceptance-checks.json','live-trace-probes.json','historical-original-sample.json','current-acceptance-status.json'],
               'runtime_acceptance': 'BLOCKED; P07 active, .NET stored trace/log check PASS; Quarkus401 trace404, historical privacy/retention/quota/recovery gates remain open',
               'runtime_preservation': preservation['runtime_identity_status'],
               'runtime_preservation_scope': 'Fresh selective38-container comparison PASS; earlier failed historical comparison retained separately; no data-integrity/runtime acceptance',
               'simulation_scope': 'Queue overflow and OpenSearch document shape are offline models only'}
    write('test-summary.json', summary)
    files = sorted([ROOT/'docker-compose.yml'] + [p for p in (ROOT / 'observability/p07').rglob('*') if p.is_file()] +
                   [p for p in (ROOT / 'observability/roadmap').glob('p07-*.md')] +
                   [p for p in HERE.rglob('*') if p.is_file() and p.name != 'change-manifest.json'])
    assert not any('__pycache__' in p.parts for p in files)
    prior = json.loads(read(E/'blockers-source-baseline.json'))['previous_file_sha256']
    continuation = {'modified': [p.relative_to(ROOT).as_posix() for p in files if p.relative_to(ROOT).as_posix() in prior and sha(p) != prior[p.relative_to(ROOT).as_posix()]],
                    'added': [p.relative_to(ROOT).as_posix() for p in files if p.relative_to(ROOT).as_posix() not in prior],
                    'root_compose_changed_this_continuation': sha(ROOT/'docker-compose.yml') != prior['docker-compose.yml']}
    assert not continuation['root_compose_changed_this_continuation']
    write('change-manifest.json', {
        'phase': 'P07', 'ready_for_controlled_deployment': False,
        'continuation_changes': continuation, 'status': 'P07 active configs verified; partial runtime acceptance; BLOCKED',
        'all_entries': 'P07 additions plus authorized docker-compose.yml modification; redundant Compose candidate removed',
        'files': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p), 'action': 'modified' if p.name == 'docker-compose.yml' else 'added'} for p in files],
        'removed_files': ['observability/p07/compose.candidate.yml'],
        'removed_proposal': 'p07_fluent_bit_state: never created; original fluent_bit_state remains mounted',
        'self_hash': 'excluded to avoid circular digest',
        'external_ignored_artifacts': 'Local validators, dependency runtimes and regression outputs; no binary committed',
        'unrelated_untracked': ['0 (empty, retained)'] if (ROOT/'0').exists() else [],
        'shared_jwks': 'source/index/HEAD/gitlink unchanged',
        'runtime_preservation': preservation['runtime_identity_status'],
               'runtime_preservation_scope': 'Fresh selective38-container comparison PASS; earlier failed historical comparison retained separately; no data-integrity/runtime acceptance',
        'deployment_commit_push_p08': False,
        'action_scope': 'This agent performed no deployment/commit/push/P08; externally activated P07 independently observed',
        'current_acceptance_status': 'current-acceptance-status.json'})
    print(json.dumps({'files': len(files), 'git': 'PASS', 'runtime': preservation['runtime_identity_status'],
                      'tests': '9 backlog +16 security +229 Lua +native Collector/Prometheus/Tempo; application suites historical'}))


if __name__ == '__main__':
    main()
