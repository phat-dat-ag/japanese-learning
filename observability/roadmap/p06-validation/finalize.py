"""Record P06 source hashes and result metadata; never stages or changes runtime."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE / 'evidence'


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(ROOT / repo), *args], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.rstrip('\n')


def read(path):
    data = path.read_bytes()
    text = data.decode('utf-16') if data.startswith((b'\xff\xfe', b'\xfe\xff')) else data.decode('utf-8-sig')
    return text.replace('\r\n', '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def java_result(path):
    text = read(path)
    totals = re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)\s*$',
                        text, re.MULTILINE)
    assert totals, 'Missing Java aggregate results: ' + str(path)
    total, failed, errors, skipped = map(int, totals[-1])
    return {'status': 'PASS' if 'BUILD SUCCESS' in text and failed == errors == 0 else 'FAIL',
            'total': total, 'failed': failed, 'errors': errors, 'skipped': skipped,
            'artifact': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(path)}


def finalize():
    before = json.loads(read(EVIDENCE / 'preflight.json'))
    preservation = {}
    for repo, initial in before['repositories'].items():
        current = {'head': git(repo, 'rev-parse', 'HEAD'),
                   'branch': git(repo, 'branch', '--show-current'),
                   'index': git(repo, 'ls-files', '--stage').splitlines()}
        assert current['head'] == initial['head'] and current['branch'] == initial['branch']
        assert current['index'] == initial['index'], 'Index changed: ' + repo
        preservation[repo] = {'head': current['head'], 'branch': current['branch'], 'index_unchanged': True}
    program = ROOT / 'dotnet/src/JapaneseLearning.User.Api/Program.cs'
    reconstructed = read(program).replace('    builder.Services.AddServiceTracing(builder.Configuration);\n', '')
    reconstructed = reconstructed.replace('    //if (app.Environment.IsDevelopment())',
                                          '    if (app.Environment.IsDevelopment())')
    assert reconstructed.rstrip('\n') == git('dotnet', 'show', 'HEAD:src/JapaneseLearning.User.Api/Program.cs')
    for repo in ('angular', 'springboot-jwks-api'):
        assert not git(repo, 'status', '--porcelain')
    for repo in ('.', 'dotnet', 'quarkus'):
        git(repo, 'diff', '--check')
    prior_manifests = [ROOT / 'observability/roadmap/p02-evidence/change-manifest.json']
    prior_manifests += [ROOT / f'observability/roadmap/p0{phase}-validation/evidence/change-manifest.json'
                        for phase in (3, 4, 5)]
    preserved = {'repositories': preservation, 'preexisting_program_edit_preserved': True,
                 'shared_jwks_and_angular_clean': True,
                 'prior_manifest_hashes': {str(p.relative_to(ROOT)): sha(p) for p in prior_manifests},
                 'docker': 'See late-baseline/final selective snapshots; no lifecycle operations',
                 'inaccessible_p03_directories': 'Unresolved; inventory incomplete'}
    (EVIDENCE / 'preservation.json').write_text(json.dumps(preserved, indent=2) + '\n')
    trx = ROOT / 'dotnet/tests/JapaneseLearning.User.UnitTests/TestResults/p06-regression.trx'
    counters = ET.fromstring(trx.read_bytes()).find('.//{*}Counters').attrib
    dotnet = {'status': 'PASS' if counters['failed'] == '0' else 'FAIL',
              'counters': counters, 'artifact': str(trx.relative_to(ROOT)), 'sha256': sha(trx)}
    java = java_result(ROOT / '.local/p06-quarkus-offline-final.log')
    assert dotnet['status'] == java['status'] == 'PASS'
    summary = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'dotnet': dotnet,
               'quarkus_offline': java, 'quarkus_focused': java_result(ROOT / '.local/p06-quarkus-tests.log'),
               'quarkus_db_tests': 'BLOCKED; no dedicated test DB. Default discovery fails before opt-in condition',
               'prior_offline_attempt': {'total': 372, 'failed': 5,
                    'reason': 'Existing P02 privacy expectations corrected in three test files'},
               'runtime_acceptance': 'BLOCKED; no deployment authorized'}
    (EVIDENCE / 'test-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    files = []
    for repo in ('.', 'dotnet', 'quarkus'):
        changed = set(git(repo, 'diff', '--name-only').splitlines())
        untracked = set(git(repo, 'ls-files', '--others', '--exclude-standard').splitlines())
        for name in sorted(changed | untracked):
            path = ROOT / repo / name
            if not path.is_file() or path == EVIDENCE / 'change-manifest.json':
                continue
            if repo == '.':
                assert name in ('.env.example', 'deployment/production.env.example', 'docker-compose.yml') \
                    or name.startswith(('observability/p06/', 'observability/roadmap/p06-'))
            files.append({'repository': repo, 'path': name,
                          'kind': 'new' if name in untracked else 'modified', 'sha256': sha(path)})
    manifest = {'phase': 'P06', 'created_utc': datetime.now(timezone.utc).isoformat(),
                'source_status': 'Implemented candidate; review required', 'runtime_status': 'BLOCKED',
                'root_head': git('.', 'rev-parse', 'HEAD'), 'files': files,
                'self_hash': 'Excluded to avoid recursion',
                'generated_not_source': ['.local/p06-* validator archives/binary and synthetic test logs',
                                         'dotnet bin/obj/TestResults', 'quarkus target/test output'],
                'shared_jwks': 'Source/index/HEAD/gitlink unchanged',
                'commit_push_deploy': False, 'p07_started': False}
    (EVIDENCE / 'change-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'source_files': len(files), 'dotnet_passed': counters['passed'],
                      'quarkus_offline': java['total'], 'preservation': 'PASS'}))


if __name__ == '__main__':
    finalize()
