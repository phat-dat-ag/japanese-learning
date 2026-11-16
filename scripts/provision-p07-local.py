"""Provision fresh local P07 security after explicit operator authorization.

Refuses existing key/certificate files and nonempty placeholder directories.
Preserves existing nonblank service passwords. Does not call Docker or touch JWT
keys, application databases, volumes or the separate logging viewer identity.
"""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'secrets/p07'
FILES = ('ca.pem', 'ca.key', 'node.pem', 'node.key', 'admin.pem', 'admin.key',
         'dashboards.pem', 'dashboards.key', 'internal_users.yml', 'monitor.token',
         'credentials.json')
ACCOUNTS = (
    ('admin.env', 'P07_ADMIN_PASSWORD', 'administrator'),
    ('writer.env', 'P07_WRITER_PASSWORD', 'ingestion_writer'),
    ('dashboards.env', 'P07_DASHBOARDS_PASSWORD', 'kibanaserver'),
    ('monitor.env', 'P07_MONITOR_TOKEN', 'monitor'),
)


def parse_value(content, key):
    matches = re.findall(r'^' + re.escape(key) + r'=(.*)$', content, re.M)
    if len(matches) > 1:
        raise RuntimeError('Duplicate setting: ' + key)
    value = matches[0].strip() if matches else ''
    if value[:1] in ('"', "'") and value[-1:] == value[:1]:
        value = value[1:-1]
    if value and not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise RuntimeError('Existing credential needs manual review: ' + key)
    return value


def provision():
    executable = shutil.which('openssl') or 'C:/Program Files/Git/usr/bin/openssl.exe'
    if not Path(executable).is_file():
        raise RuntimeError('OpenSSL is required; no changes made.')
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = DIRECTORY / name
        if target.is_symlink() or (target.exists() and
                                 (not target.is_dir() or any(target.iterdir()))):
            raise RuntimeError('Refusing to replace existing security material: ' + name)
    contents, credentials = {}, {}
    for filename, key, account in ACCOUNTS:
        target = DIRECTORY / filename
        content = target.read_bytes().decode('utf-8-sig') if target.is_file() else '# Local P07 credential.\n'
        contents[filename] = content
        credentials[account] = parse_value(content, key) or secrets.token_urlsafe(36)
    credentials['dashboard_reader'] = secrets.token_urlsafe(36)
    stage = ROOT / '.local' / ('p07-provision-' + uuid.uuid4().hex)
    stage.mkdir(parents=True)
    (stage / 'original-env').mkdir()
    for filename, _, _ in ACCOUNTS:
        target = DIRECTORY / filename
        if target.exists():
            shutil.copyfile(target, stage / 'original-env' / filename)

    def openssl(*args):
        result = subprocess.run([executable, *args], cwd=stage, capture_output=True)
        if result.returncode:
            raise RuntimeError('OpenSSL failed; no runtime files deployed. Diagnostics withheld.')

    openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072', '-out', 'ca.key')
    openssl('req', '-new', '-x509', '-key', 'ca.key', '-sha256', '-days', '365',
            '-subj', '/CN=jp-learning-development-CA', '-addext', 'basicConstraints=critical,CA:TRUE',
            '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'ca.pem')
    for name, common_name, san, usage in (
        ('node', 'opensearch', 'DNS:opensearch,DNS:localhost,IP:127.0.0.1', 'serverAuth,clientAuth'),
        ('admin', 'p07-dev-admin', None, 'clientAuth'),
        ('dashboards', 'opensearch-dashboards', 'DNS:opensearch-dashboards,DNS:localhost', 'serverAuth'),
    ):
        openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', name + '.key')
        openssl('req', '-new', '-key', name + '.key', '-subj', '/CN=' + common_name, '-out', name + '.csr')
        extension = ('basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n'
                     'extendedKeyUsage=' + usage + '\n')
        if san:
            extension += 'subjectAltName=' + san + '\n'
        (stage / (name + '.ext')).write_text(extension)
        openssl('x509', '-req', '-in', name + '.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key',
                '-CAcreateserial', '-days', '90', '-sha256', '-extfile', name + '.ext', '-out', name + '.pem')
        openssl('verify', '-CAfile', 'ca.pem', name + '.pem')
    (stage / 'internal_users.yml').write_text('_meta:\n  type: internalusers\n  config_version: 2\n')
    (stage / 'monitor.token').write_text(credentials['monitor'] + '\n')
    (stage / 'credentials.json').write_text(json.dumps(
        {key: value for key, value in credentials.items() if key != 'monitor'}, indent=2) + '\n')
    backup = stage / 'placeholder-directories'
    backup.mkdir()
    for name in FILES:
        target = DIRECTORY / name
        # Verify absolute move paths stay within this workspace; never delete.
        assert target.resolve().is_relative_to(ROOT) and (backup / name).resolve().is_relative_to(ROOT)
        if target.exists():
            if not target.is_dir() or any(target.iterdir()):
                raise RuntimeError('Target changed during provisioning: ' + name)
            target.rename(backup / name)
        with target.open('xb') as output:
            output.write((stage / name).read_bytes())
    for filename, key, account in ACCOUNTS:
        content = contents[filename]
        # Keep the file unchanged when a nonblank credential already exists.
        if parse_value(content, key):
            continue
        newline = '\r\n' if '\r\n' in content else '\n'
        replacement = key + '=' + credentials[account]
        pattern = r'^' + re.escape(key) + r'=[^\r\n]*'
        if re.search(pattern, content, re.M):
            content = re.sub(pattern, lambda match: replacement, content, flags=re.M)
        else:
            content += ('' if content.endswith('\n') else newline) + replacement + newline
        (DIRECTORY / filename).write_bytes(content.encode('utf-8'))
    for name in FILES:
        os.chmod(DIRECTORY / name, 0o600 if name in ('ca.key', 'credentials.json') else 0o644)
    print('Provisioned fresh local P07 security; existing nonblank values preserved; no secrets printed.')
    print('Empty directories and original env bytes preserved under ' + str(stage.relative_to(ROOT)))
    print('OpenSearch accounts still require initialization before dependent services start.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True,
                        help='Confirm fresh local P07 security provisioning; does not start Docker.')
    parser.parse_args()
    provision()
