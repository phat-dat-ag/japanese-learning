"""Generate private log-viewer credentials without printing passwords."""
import os
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HELPER = 'httpd:2.4.65-alpine@sha256:07b2fabb7029a0b8aeb2e0fd02651c28fe22c21c5b5a59d6ff5b022791fcd89e'


def main():
    target = ROOT / 'secrets' / 'logging'
    credentials = ROOT / '.env.logging'
    if target.exists() or credentials.exists():
        raise RuntimeError('Logging credentials already exist; refusing to overwrite them.')
    password = secrets.token_hex(32)
    result = subprocess.run(['docker', 'run', '--rm', '-i', '--network', 'none', '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--user', '1000:1000',
        '--entrypoint', 'htpasswd', HELPER, '-niB', '-C', '12', 'logs-admin'],
        input=password + '\n', text=True, capture_output=True)
    if result.returncode or not result.stdout.startswith('logs-admin:$2'):
        raise RuntimeError('Password hashing failed; Docker diagnostics withheld.')
    target.mkdir(parents=True, mode=0o700)
    with (target / 'htpasswd').open('x', encoding='utf-8', newline='\n') as file:
        file.write(result.stdout.strip() + '\n')
    os.chmod(target / 'htpasswd', 0o644)  # Hash only; parent private; NGINX UID 101 reads the bind.
    fd = os.open(credentials, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as file:
        file.write('# Local viewer credentials; not Compose inputs. Never commit or share.\n'
                   'LOGS_UI_USERNAME=logs-admin\nLOGS_UI_PASSWORD=' + password + '\n')
    print('Created secrets/logging/htpasswd and private .env.logging. Read credentials locally with your editor.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
