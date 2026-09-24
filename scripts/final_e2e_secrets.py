"""Secret/startup checks for the isolated final E2E environment."""
import copy
import json
import os
import subprocess
import tarfile


class PrefixStream:
    def __init__(self, prefix, stream):
        self.prefix, self.stream = prefix, stream

    def read(self, size):
        prefix = self.prefix[:size]
        self.prefix = self.prefix[size:]
        return prefix + self.stream.read(size - len(prefix))


def image_contents(e):
    needles = [value.encode() for value in e.sensitive if len(value) >= 16]
    overlap = max(map(len, needles))
    def scan(stream):
        tail = b''
        while True:
            block = stream.read(128 * 1024)
            if not block:
                return
            content = tail + block
            assert not any(value in content for value in needles), 'Generated secret found in an image layer'
            tail = content[-overlap:]
    for name in ('frontend', 'user-api', 'vocabulary-api'):
        process = subprocess.Popen(['docker', 'image', 'save', e.config['services'][name]['image']], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
                for member in archive:
                    if not member.isfile():
                        continue
                    stream = archive.extractfile(member)
                    first = stream.read(512)
                    prefixed = PrefixStream(first, stream)
                    if first.startswith(b'\x1f\x8b') or first[257:262] == b'ustar':
                        with tarfile.open(fileobj=prefixed, mode='r|*') as layer:
                            for file in layer:
                                if file.isfile():
                                    scan(layer.extractfile(file))
                    else:
                        scan(prefixed)
            assert process.wait(timeout=30) == 0, 'Image export failed'
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=30)
            process.stdout.close()
            process.stderr.close()
    e.passed('all application image layers/metadata scanned: generated credentials and private-key material absent')


def invalid_startup(e):
    invalid = subprocess.run(e.cmd + ['config', '--quiet'], env=dict(os.environ, MYSQL_PASSWORD=''), capture_output=True, text=True, encoding='utf-8')
    assert invalid.returncode != 0 and 'MYSQL_PASSWORD' in invalid.stderr
    assert not any(value in invalid.stdout + invalid.stderr for value in e.sensitive if len(value) >= 8)
    cases = [
        ('mysql', {'MYSQL_PASSWORD': "rejected-secret'"}, 'Invalid MYSQL_PASSWORD'),
        ('mysql', {'MYSQL_DATABASE': 'rejected-secret;bad'}, 'Invalid MYSQL_DATABASE'),
        ('user-api', {'Database__Password': ''}, 'Database configuration'),
        ('user-api', {'Jwt__AccessTokenExpirationMinutes': 'rejected-secret'}, 'Jwt configuration'),
        ('user-api', {'Jwt__KeyId': 'rejected-secret!'}, 'JWT key ID'),
        ('user-api', {'Jwt__PrivateKeyPath': '/dev/null'}, 'JWT private key file'),
        ('vocabulary-api', {'DB_PASSWORD': ''}, 'Invalid required configuration'),
        ('vocabulary-api', {'DB_REACTIVE_URL': 'mysql://user:rejected-secret@mysql/test'}, 'Invalid required configuration'),
        ('vocabulary-api', {'AUTH_SERVER_URL': 'http://user:rejected-secret@user-api:8080'}, 'Invalid required configuration'),
    ]
    e.sensitive.append('rejected-secret')
    for index, (name, changes, expected) in enumerate(cases):
        service = copy.deepcopy(e.config['services'][name])
        for field in ('build', 'depends_on', 'networks', 'ports', 'restart', 'healthcheck'):
            service.pop(field, None)
        service['network_mode'] = 'none'
        service['environment'].update(changes)
        if name == 'mysql':
            service.pop('volumes', None)
            service['tmpfs'].append('/var/lib/mysql:rw,nosuid,nodev,size=128m,uid=999,gid=999,mode=0750')
        project = e.project + '-invalid-' + str(index)
        config = json.dumps({'name': project, 'services': {name: service}})
        command = ['docker', 'compose', '-p', project, '-f', '-']
        try:
            result = subprocess.run(command + ['run', '--rm', '--no-deps', '-T', name], input=config,
                                    capture_output=True, text=True, encoding='utf-8', timeout=90)
        finally:
            cleanup = subprocess.run(command + ['down', '--timeout', '10'], input=config,
                                     capture_output=True, text=True, encoding='utf-8')
            assert cleanup.returncode == 0, 'Could not stop an isolated configuration probe'
        output = result.stdout + result.stderr
        assert result.returncode != 0 and expected in output, 'Invalid startup check failed: ' + name + '/' + str(index)
        assert not any(value in output for value in e.sensitive if len(value) >= 8), 'Rejected startup value entered diagnostics'
    e.passed('nine invalid/missing configuration startup cases rejected safely in network-isolated containers')
