#!/usr/bin/env bash
# Run with sudo from the repository root. Never overwrites existing key material.
set -euo pipefail
umask 077
command -v openssl >/dev/null
[ "$(id -u)" = 0 ] || { echo 'Run with sudo to set container group permissions.' >&2; exit 1; }
[ -f docker-compose.yml ] || { echo 'Run from the repository root.' >&2; exit 1; }
[ ! -L secrets ] || { echo 'Refusing a symlinked secrets directory.' >&2; exit 1; }
if [ ! -d secrets ]; then
    mkdir -m 0711 secrets
fi
# Public keys must be readable by the independent JWKS UID (10001); private
# material remains restricted to the .NET UID/GID (1654).
for directory in secrets/private secrets/public; do
    [ ! -L "$directory" ] || { echo 'Refusing a symlinked key directory.' >&2; exit 1; }
done
mkdir -p secrets/private secrets/public
chmod 0711 secrets
chgrp 1654 secrets/private
chmod 0750 secrets/private
chmod 0755 secrets/public
[ ! -e secrets/public/user-api-public.pem ] && [ ! -L secrets/public/user-api-public.pem ] \
    || { echo 'Public key already exists; refusing to overwrite.' >&2; exit 1; }
# Atomic refusal if the service directory exists, including a symlink.
mkdir -m 0750 secrets/private/user-api
chgrp 1654 secrets/private/user-api
set -o noclobber
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 > secrets/private/user-api/private.pem 2>/dev/null
openssl pkey -in secrets/private/user-api/private.pem -pubout > secrets/public/user-api-public.pem 2>/dev/null
chgrp 1654 secrets/private/user-api/private.pem
chmod 0640 secrets/private/user-api/private.pem
chmod 0644 secrets/public/user-api-public.pem
echo 'RSA pair created; private material was not printed. Verify parent-directory traversal for container UID/GID 1654.'
