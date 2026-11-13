"""Read-only Git/source metadata. Never serializes diff contents or environment files."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


def capture():
    result = {'utc': datetime.now(timezone.utc).isoformat(), 'repositories': {}}
    for name in ('.', 'angular', 'dotnet', 'quarkus', 'springboot-jwks-api'):
        repo = ROOT / name
        result['repositories'][name] = {
            'head': git(repo, 'rev-parse', 'HEAD').decode().strip(),
            'branch': git(repo, 'branch', '--show-current').decode().strip(),
            'status': git(repo, 'status', '--porcelain=v1').decode().splitlines(),
            'index_sha256': hashlib.sha256(git(repo, 'ls-files', '--stage')).hexdigest(),
            'diff_sha256': hashlib.sha256(git(repo, 'diff', '--binary')).hexdigest(),
        }
    result['gitlinks'] = git(ROOT, 'ls-files', '--stage', 'angular', 'dotnet',
                            'quarkus', 'springboot-jwks-api').decode().splitlines()
    result['protected_source_sha256'] = {
        str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [ROOT / 'gateway/nginx.conf', ROOT / 'gateway/nginx.p02.conf',
                  *sorted((ROOT / 'observability/logging').glob('*'))]
        if p.is_file()
    }
    return result


if __name__ == '__main__':
    destination = Path(sys.argv[1]).resolve()
    if destination.parent != Path(__file__).resolve().parent / 'evidence':
        raise SystemExit('Evidence destination must be the dedicated evidence directory')
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(capture(), indent=2) + '\n', encoding='utf-8')
