"""Isolated setup regression checks; no Docker calls or live key/config changes."""
import contextlib
import hashlib
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    destination = ROOT / '.local' / ('clone-setup-test-' + uuid.uuid4().hex)
    destination.mkdir(parents=True)
    init = module('initializer', 'initialize-environment.py')
    keys = module('keys', 'generate-compose-jwt-keys.py')
    preflight = module('preflight', 'preflight-compose.py')
    p07 = module('p07', 'provision-p07-local.py')
    for template in init.PAIRS.values():
        target = destination / template
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / template, target)
    with contextlib.redirect_stdout(io.StringIO()):
        init.initialize(destination)
    # A local value and an extra variable must survive repeat initialization.
    with (destination / '.env').open('a') as output:
        output.write('\nLOCAL_EXTRA=keep-me\n')
    before = {name: hashlib.sha256((destination / name).read_bytes()).digest() for name in init.PAIRS}
    with contextlib.redirect_stdout(io.StringIO()):
        init.initialize(destination)
    assert all(hashlib.sha256((destination / name).read_bytes()).digest() == value
               for name, value in before.items())
    keys.generate(destination)
    executable = shutil.which('openssl') or 'C:/Program Files/Git/usr/bin/openssl.exe'
    for n in (1, 2, 3):
        private = destination / f'secrets/private/user-api/user-privatekey-{n}.pem'
        public = destination / f'secrets/public/user-publickey-{n}.pem'
        result = subprocess.run([executable, 'pkey', '-in', str(private), '-pubout'], capture_output=True)
        assert result.returncode == 0 and result.stdout == public.read_bytes()
    try:
        keys.generate(destination)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Existing application keys were not refused')
    p07.ROOT = destination
    p07.DIRECTORY = destination / 'secrets/p07'
    p07.provision()
    assert all((p07.DIRECTORY / name).is_file() for name in p07.FILES)
    try:
        p07.provision()
    except RuntimeError:
        pass
    else:
        raise AssertionError('Existing P07 material was not refused')
    good = destination / 'good.yml'
    good.write_text('valid: true\n')
    bad = destination / 'bad.yml'
    bad.mkdir()
    empty = destination / 'empty.yml'
    empty.touch()
    missing = destination / 'missing.yml'
    for source, fails in ((good, False), (bad, True), (empty, True), (missing, True)):
        config = {'services': {'fixture': {'volumes': [
            {'type': 'bind', 'source': str(source), 'target': '/etc/fixture.yml'}]}}}
        assert bool(preflight.audit(config)) == fails
    assert not missing.exists() and bad.is_dir()
    assert preflight.audit({'services': {'fluent-bit': {'environment': {'P07_WRITER_PASSWORD': ''}}}})
    print('PASS: fresh template initialization, repeat preservation, matching indexed RSA pairs,')
    print('P07 provisioning, overwrite refusal, missing/empty/directory mount rejection and blank credentials.')
    print('Only isolated ignored files were created; no Docker calls or live keys changed.')


if __name__ == '__main__':
    main()
