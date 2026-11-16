"""Initialize missing static environment files without replacing existing files.

Run from any directory. Credentials and secure generated artifacts are never
created here; required blank values must be provisioned before startup.
"""
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAIRS = {
    **{name: name + '.example' for name in (
        '.env', '.env.db.production', '.env.user-api', '.env.jwks-api',
        '.env.vocabulary-api', '.env.user-api.production', '.env.p07',
        'angular/.env', 'dotnet/.env', 'quarkus/.env',
        'springboot-jwks-api/.env', 'quarkus/.env.docker',
        'secrets/p07/admin.env', 'secrets/p07/writer.env',
        'secrets/p07/dashboards.env', 'secrets/p07/monitor.env')},
    '.env.production': 'deployment/production.env.example',
}


def initialize(root=ROOT):
    for local, example in PAIRS.items():
        target = root / local
        template = (root / example).read_bytes()
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            # Exclusive creation also preserves local-only variables and comments.
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                                 | getattr(os, 'O_BINARY', 0), 0o600)
        except FileExistsError:
            print('Preserved ' + local)
        else:
            with os.fdopen(descriptor, 'wb') as output:
                output.write(template)
            print('Created ' + local)
        blanks = re.findall(r'^([A-Za-z_][A-Za-z0-9_.]*)=[ \t]*(?:\r?$)',
                            target.read_text(encoding='utf-8-sig'), re.M)
        if blanks:
            print('Review blank settings in ' + local + ': ' + ', '.join(blanks))
    print('Blank optional settings may be valid; required credentials must be supplied.')
    print('Not provisioned: accounts, keys, TLS, monitor.token or paired .env.logging/htpasswd.')
    for name in ('ca.pem', 'node.pem', 'node.key', 'admin.pem', 'admin.key',
                 'dashboards.pem', 'dashboards.key', 'internal_users.yml', 'monitor.token'):
        relative = 'secrets/p07/' + name
        if not (root / relative).is_file():
            print('Runtime blocker: missing regular file ' + relative)


if __name__ == '__main__':
    initialize()
