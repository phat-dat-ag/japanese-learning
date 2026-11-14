#!/bin/sh
set -eu
# Fail before starting the health endpoint when a missing file became a bind directory.
if [ ! -f /etc/nginx/logs.htpasswd ] || [ ! -s /etc/nginx/logs.htpasswd ] || [ ! -r /etc/nginx/logs.htpasswd ]; then
    printf '%s\n' 'Logs auth source must be a nonempty readable regular file; provision/validate existing credentials first.' >&2
    exit 78
fi
exec nginx -g 'daemon off;'
