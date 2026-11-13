"""Read-only preservation comparisons and P03-only evidence/document audit."""
import hashlib
import json
from pathlib import Path
import re
import ast
import subprocess
import sys
from datetime import datetime, timezone

from snapshot import ROOT, capture

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / 'evidence'


def save(name, value):
    (EVIDENCE/name).write_text(json.dumps(value, indent=2)+'\n', encoding='utf-8')


before = json.loads((EVIDENCE/'preflight.json').read_text())
after = capture()
save('final.json', after)
checks = {}
for repo, initial in before['repositories'].items():
    final = after['repositories'][repo]
    for field in ('head', 'branch', 'index_sha256', 'diff_sha256'):
        checks[f'{repo}:{field}'] = initial[field] == final[field]
    if repo != '.':
        checks[f'{repo}:status'] = initial['status'] == final['status']
checks['gitlinks'] = before['gitlinks'] == after['gitlinks']
checks['protected_source_hashes'] = before['protected_source_sha256'] == after['protected_source_sha256']
save('preservation.json', {'utc':datetime.now(timezone.utc).isoformat(), 'checks':checks,
     'docker_resource_preservation':'NOT VERIFIED: inspection denied',
     'springboot_project':'No write/action; no independent before/after snapshot',
     'no_commit_push_lifecycle_migration_or_key_operations':'command audit; none issued'})

old_manifest = json.loads((ROOT/'observability/roadmap/p02-evidence/change-manifest.json').read_text())
entries = []
for repo, files in old_manifest.items():
    if not isinstance(files, list):
        continue
    for item in files:
        path = ROOT/repo/item['path']
        content = path.read_bytes()
        entries.append({'path':str(path.relative_to(ROOT)).replace('\\','/'),
                        'expected_sha256':item['sha256'],
                        'current_sha256':hashlib.sha256(content).hexdigest(),
                        'matches':hashlib.sha256(content).hexdigest() == item['sha256']})
save('p02-manifest-audit.json', {'entries':entries, 'total':len(entries),
     'byte_hash_drift':sum(not e['matches'] for e in entries),
     'note':'Historical artifact drift, not P03 edits; hashes also differ after LF normalization'})

workspace_leftovers = sorted(p.name for p in HERE.glob('jp_p03_synthetic_*') if p.is_dir())
save('cleanup.json', {
    'docker_resources_created':[], 'successful_run_directories_remaining':sorted(p.name for p in HERE.glob('run-*')),
    'workspace_parent':'observability/roadmap/p03-validation',
    'workspace_failed_temp_directories':workspace_leftovers,
    'os_temp_failed_directories':['jp_p03_synthetic_67_veez_', 'jp_p03_synthetic_86fvzdag',
        'jp_p03_synthetic_a0ctfkb0', 'jp_p03_synthetic_pfom3_h7', 'jp_p03_synthetic_qshv3bn2',
        'jp_p03_synthetic_qwxskji3', 'jp_p03_synthetic_rpohs89b', 'jp_p03_synthetic__u9j6lsv'],
    'status':'BLOCKED cleanup: normal access denied; no escalation or permissions changed',
    'contents':'No successful fixture write into failed temp directories; not independently readable',
})

docs = sorted((ROOT/'observability/roadmap').glob('p03-*.md'))
assert len(docs) == 7
links = 0
for document in [*docs, HERE/'README.md']:
    for target in re.findall(r'\]\(([^)]+)\)', document.read_text()):
        if target.startswith(('http:', 'https:', '#')):
            continue
        target = target.split('#')[0]
        # Manifest generated below; check afterwards.
        if target.endswith('evidence/change-manifest.json'):
            continue
        assert (document.parent/target).exists(), (document, target)
        links += 1
save('documentation-check.json', {'reports':len(docs), 'local_links_checked':links,
     'result':'PASS target existence only; anchors/semantic claims manually reviewed',
     'python':sys.version.split()[0]})

files = [*docs, *[p for p in HERE.iterdir() if p.is_file()],
         *[p for p in EVIDENCE.iterdir() if p.is_file() and p.name != 'change-manifest.json']]
for path in files:
    if path.suffix == '.py':
        ast.parse(path.read_text(encoding='utf-8'))
    diff = subprocess.run(['git', 'diff', '--no-index', '--check', '--', '/dev/null', str(path)],
                          capture_output=True, text=True)
    assert diff.returncode in (0, 1) and not diff.stdout.strip(), (path, diff.stdout, diff.stderr)
save('change-manifest.json', {'scope':'New P03 files only; manifest excludes itself',
     'files':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),
               'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]})
print(json.dumps({'preservation':all(checks.values()), 'checks':len(checks),
                  'reports':len(docs), 'local_links':links, 'new_files_excluding_manifest':len(files),
                  'p02_manifest_drift':sum(not e['matches'] for e in entries)}))
assert all(checks.values()), 'Preservation mismatch requires review'
