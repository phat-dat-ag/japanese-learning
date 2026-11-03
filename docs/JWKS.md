# Independent development JWKS service

`jwks-api` builds `springboot-jwks-api/Dockerfile` using Java 17 and its Maven
wrapper. It has no service dependencies and does not change authentication in
any existing application. This document describes this root deployment; the
submodule README's other-root `./key` mount and port 8783 do not apply here.
There is no submodule `docs/INTEGRATION.md` in the current checkout.

## Setup (PowerShell, from the repository root)

```powershell
if (!(Test-Path .env.jwks-api)) { Copy-Item .env.jwks-api.example .env.jwks-api }
if (!(Test-Path secrets/jwks)) { New-Item -ItemType Directory secrets/jwks | Out-Null }
# Intentionally reuse this project's existing development PUBLIC key only.
# Do not overwrite an existing JWKS key or copy the private key.
if (!(Test-Path secrets/jwks/public.pem)) { Copy-Item secrets/jwt/public.pem secrets/jwks/public.pem }
```

If `secrets/jwt/public.pem` is missing, obtain the intended RSA public key from
the signing-key owner and save it as `secrets/jwks/public.pem`. The required format
is X.509 SubjectPublicKeyInfo PEM (`-----BEGIN PUBLIC KEY-----`), containing RSA
key material. No key generation is needed by this service. Do not use a certificate,
PKCS#1 `RSA PUBLIC KEY` file, or a private key. The directory must contain public
files only, readable by container UID/GID 10001 (Linux: directory mode 755,
public files mode 644). Local env and key files are ignored by Git.

The initial local setup copies the existing public key without changing it. This
copy is independent: replacing the original does not update JWKS automatically.
The example key ID is a development label; set it to the intended key ID before
using a different key. Publishing a key does not configure any consumers.

## Configuration

Root `.env` inputs (defaults also work without adding them to an existing `.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWKS_API_HOST_PORT` | `8083` | Loopback host port; container port stays 8080 |
| `JWKS_API_PUBLIC_KEYS_HOST_PATH` | `./secrets/jwks` | Host public-only directory, relative to root Compose file |
| `JWKS_API_SPRING_PROFILES_ACTIVE` | `default` | Spring active profiles; no profile-specific files currently shipped |
| `JWKS_API_LOG_LEVEL` | `INFO` | Container `LOG_LEVEL` |

`.env.jwks-api` is a container `env_file`, not a replacement for the root `.env`:

| Variable | Example | Purpose |
| --- | --- | --- |
| `APP_SECURITY_JWKS_KEYS_0_KID` | `japanese-learning-local-1` | Nonblank unique public key identifier |
| `APP_SECURITY_JWKS_KEYS_0_PUBLIC_KEY_PATH` | `/run/keys/jwks/public.pem` | Absolute container file path under the public-only mount |
| `APP_SECURITY_JWKS_KEYS_0_ACTIVE` | `true` | Exactly one configured key must be active |

For rotation, add all three variables for indices 1, 2, ... in `.env.jwks-api`,
with unique IDs and corresponding public files in the host directory. All keys,
including inactive keys, appear in JWKS. Blank entries, duplicate IDs, invalid or
unreadable files, and zero/multiple active entries fail startup. Keys are loaded
at startup; recreate the service after changing files or environment:
`docker compose up -d --no-deps --force-recreate jwks-api`.

Optional settings in the dedicated env file are `SPRING_APPLICATION_NAME`
(default `jwks-service`), `APP_NAME` (log basename, default `jwks-api`),
`LOGGING_LEVEL_COM_JAPANESELEARNING_JWKS` (application log-level override), and
`SERVER_FORWARD_HEADERS_STRATEGY` (default `none`; retain unless proxy trust is configured).
Compose fixes `SERVER_ADDRESS=0.0.0.0`, `SERVER_PORT=8080`,
`APP_LOG_DIR=/app/data/logs`, `MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health`,
and `MANAGEMENT_ENDPOINT_HEALTH_PROBES_ENABLED=true` for its listener and healthcheck.
Compose's explicit environment takes precedence over the dedicated env file.

## Build and verify

The root stack's existing required database variables must still be present in
the root `.env` because Compose interpolates the whole file, even when selecting
one service. This does not start or connect JWKS to those databases.

```powershell
docker compose config --quiet
docker compose build jwks-api
docker compose up -d --no-deps --wait --wait-timeout 180 jwks-api
docker compose ps jwks-api
docker compose logs --tail 100 jwks-api
curl.exe --fail --silent --show-error http://127.0.0.1:8083/actuator/health/readiness
curl.exe --fail --silent --show-error http://127.0.0.1:8083/.well-known/jwks.json
```

Use the configured host port if overridden. Readiness returns `{"status":"UP"}`;
JWKS returns a raw `{"keys":[...]}` with `kty=RSA`, `use=sig`, `alg=RS256`,
the configured `kid`, and public modulus/exponent `n`/`e`. Private parameters must
be absent. The public response is cached for 300 seconds.

The service joins the existing implicit Compose `default` network and publishes
only `127.0.0.1:8083 -> 8080`. It mounts the public directory read-only at
`/run/keys/jwks`, creates only its own `jwks_api_logs` named volume at
`/app/data/logs`, and uses bounded temporary storage at `/tmp` with a read-only
root filesystem. Structured JSON logs go to stdout and rolling files (100 MB per
file, 30-day history, 2 GB archive cap). Restart policy is `unless-stopped`.
Healthcheck uses curl supplied by the submodule image, every 10 seconds, with a
6-second timeout, 12 retries and 30-second start period.

No production, observability, gateway, or consumer configuration is changed.
Production deployment and network isolation require a separate review; this
development integration is inherited if overlays are combined with the base file.

## Validation performed (2026-11-03)

- Base Compose syntax and resolved JWKS environment: passed.
- Observability overlay: passed with a temporary validation-only Grafana password;
  the existing local `.env` has no Grafana password, so validation without it fails
  on the overlay's pre-existing required variable. No `.env` values were changed.
- Docker image build: passed. Maven reported an optional Apache snapshots metadata
  connection warning but completed successfully. The Dockerfile skips unit tests.
- Started only `jwks-api` with `--no-deps --wait`: healthy on loopback port 8083.
- Readiness curl: HTTP 200, `UP`. JWKS curl: HTTP 200 with one configured key.
- Published modulus/exponent match the mounted public file; ID is
  `japanese-learning-local-1`; private RSA parameters are absent.
- Logs confirm `key_count=1`, `active_count=1`; no configuration/key-loading errors.
- Existing resolved service and volume definitions match Git HEAD. Existing
  container IDs, start times, mounts and volume metadata match the pre-start
  baseline. No database content checks were run; no existing services were started,
  restarted or removed, and no existing data volumes were mounted by JWKS.
- Submodule working tree is unchanged; `git diff --check` passed. Production
  deployment was not started or changed.
