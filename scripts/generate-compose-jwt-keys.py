"""Generate the three key pairs required by default Compose templates, once.

For NEW local deployments only. Existing keys/configuration are never overwritten.
Restoring another machine's deployment requires its original matching keys instead.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def generate(root=ROOT):
    executable = shutil.which('openssl') or 'C:/Program Files/Git/usr/bin/openssl.exe'
    if not Path(executable).is_file():
        raise RuntimeError('Install OpenSSL (included with Git for Windows) first.')
    pairs = [(root / f'secrets/private/user-api/user-privatekey-{n}.pem',
              root / f'secrets/public/user-publickey-{n}.pem') for n in (1, 2, 3)]
    if any(p.exists() for pair in pairs for p in pair):
        raise RuntimeError('Existing key path found; refusing generation. Restore matching keys instead.')
    for private, public in pairs:
        private.parent.mkdir(parents=True, exist_ok=True)
        public.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents accidental replacement, including on retries.
        fd = os.open(private, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(fd, 'wb') as output:
            result = subprocess.run([executable, 'genpkey', '-algorithm', 'RSA',
                                     '-pkeyopt', 'rsa_keygen_bits:2048'], stdout=output,
                                    stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Key generation failed; partial files preserved for review.')
        with public.open('xb') as output:
            result = subprocess.run([executable, 'pkey', '-in', str(private), '-pubout'],
                                    stdout=output, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Public-key export failed; partial files preserved for review.')
        os.chmod(public, 0o644)
        if os.name == 'posix':
            # Match the .NET container group without world-readable private keys.
            os.chown(private.parent, -1, 1654)
            os.chmod(private.parent, 0o750)
            os.chown(private, -1, 1654)
    print('Created three matching Compose key pairs; key IDs and active selection unchanged.')
    print('Use only with the default indexed templates and paths; custom deployments need their own mapping.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--new-local-deployment', action='store_true', required=True)
    parser.parse_args()
    generate()
