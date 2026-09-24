#!/usr/bin/env bash
# Run with sudo from the repository root. Never overwrites existing key material.
set -euo pipefail
umask 077
command -v openssl >/dev/null
[ "$(id -u)" = 0 ] || { echo 'Run with sudo to set container group permissions.' >&2; exit 1; }
[ -f docker-compose.yml ] || { echo 'Run from the repository root.' >&2; exit 1; }
[ ! -L secrets ] || { echo 'Refusing a symlinked secrets directory.' >&2; exit 1; }
if [ ! -d secrets ]; then
    mkdir -m 0750 secrets
    chgrp 1654 secrets
fi
# Atomic refusal if the destination already exists, including a symlink.
mkdir -m 0750 secrets/jwt
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out secrets/jwt/private.pem 2>/dev/null
openssl pkey -in secrets/jwt/private.pem -pubout -out secrets/jwt/public.pem 2>/dev/null
chgrp 1654 secrets/jwt secrets/jwt/private.pem secrets/jwt/public.pem
chmod 0750 secrets/jwt
chmod 0640 secrets/jwt/private.pem secrets/jwt/public.pem
echo 'RSA pair created; private material was not printed. Verify parent-directory traversal for container UID/GID 1654.'
