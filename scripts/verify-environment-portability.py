"""Test template-only initialization and Compose parsing; no daemon mutations.

Only safe templates enter the simulation. Synthetic required interpolation values
are held in memory and are never written as deployment credentials.
"""
import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('initializer', ROOT / 'scripts/initialize-environment.py')
initializer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(initializer)


def main():
    # Keep safe evidence under ignored workspace storage. No recursive deletion.
    destination = ROOT / '.local' / ('env-portability-' + uuid.uuid4().hex)
    destination.mkdir(parents=True)
    for example in initializer.PAIRS.values():
        target = destination / example
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / example, target)
    for source in ROOT.glob('*compose*.yml'):
        shutil.copyfile(source, destination / source.name)
    with contextlib.redirect_stdout(io.StringIO()):
        initializer.initialize(destination)
    with (destination / '.env').open('a') as output:
        output.write('\nAUDIT_LOCAL_ONLY=preserve-this-value\n')
    before = {name: hashlib.sha256((destination / name).read_bytes()).digest()
              for name in initializer.PAIRS}
    with contextlib.redirect_stdout(io.StringIO()):
        initializer.initialize(destination)
    assert all(hashlib.sha256((destination / name).read_bytes()).digest() == digest
               for name, digest in before.items()), 'Existing input bytes changed'
    print('PASS: template-only initialization and repeat-run preservation, including local extras')

    names, required = set(), set()
    for source in ROOT.glob('*compose*.yml'):
        text = source.read_text()
        names.update(re.findall(r'\$\{([A-Z][A-Z0-9_]*)', text))
        required.update(re.findall(r'\$\{([A-Z][A-Z0-9_]*):\?', text))
    # Prevent the operator shell from supplying real credentials or path overrides.
    env = {key: value for key, value in os.environ.items()
           if key not in names and not key.startswith('COMPOSE_')}
    env.update({name: 'SYNTHETIC_CONFIG_ONLY' for name in required})
    env.update(MSSQL_PID='Express', RELEASE_TAG='config-audit-only')
    matrix = {
        'standard DEV': ['-p', 'jp_dev'],
        'documented DEV': ['--env-file', '.env', '-f', 'docker-compose.yml'],
        'local production-like': ['--env-file', '.env', '--env-file', '.env.db.production',
                                  '-f', 'docker-compose.yml', '-f', 'compose.local-production.yml'],
        'shared provider': ['-f', 'docker-compose.yml', '-f', 'compose.shared-provider.yml'],
        'shared consumer': ['--env-file', '.env', '--env-file', '.env.db.production',
                            '-f', 'docker-compose.yml', '-f', 'compose.local-production.yml',
                            '-f', 'compose.shared-consumer.yml'],
        'Linux release': ['--env-file', '.env.production', '-f', 'docker-compose.yml',
                          '-f', 'compose.production.yml'],
        'Linux release monitoring': ['--env-file', '.env.production', '-f', 'docker-compose.yml',
                                     '-f', 'compose.production.yml', '-f', 'compose.observability.yml',
                                     '-f', 'compose.production-observability.yml'],
    }
    failed = False
    for label, args in matrix.items():
        result = subprocess.run(['docker', 'compose', *args, 'config', '--quiet'],
                                cwd=destination, env=env, capture_output=True, text=True)
        print(('PASS: ' if result.returncode == 0 else 'FAIL: ') + label + ' template-only parsing')
        # Diagnostics are from safe template copies only, never current real inputs.
        if result.returncode:
            print(result.stderr.strip())
        failed |= result.returncode != 0
    print('Parsing only: required credentials and secure mounts still need provisioning.')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
