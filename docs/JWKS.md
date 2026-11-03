# JWKS deployment and JWT verification

`jwks-api` builds `springboot-jwks-api/Dockerfile` using Java 17 and its Maven
wrapper. It has no service dependencies. .NET remains the issuer; .NET and
Quarkus now retrieve verification keys from this service. This document describes this root deployment; the
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

The production overlay places JWKS on the existing internal `api` network,
removes its host port, and tags its image with `RELEASE_TAG`. Production tooling
builds and checks the JWKS release image, starts it before consumers, and includes
its health in verification. No production deployment was executed. Observability,
Gateway and Angular configuration are unchanged.

## Infrastructure-phase validation (2026-11-03, before consumer migration)

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

## Consumer migration (2026-11-03)

Previously .NET issued RS256 JWTs and verified them with the local public key.
It never consumed its own JWKS endpoint. Quarkus used OIDC bearer verification
against that .NET endpoint. Now both services retrieve keys from Spring JWKS,
while .NET issuance, claims, refresh/logout, role policies and the legacy endpoint
are preserved. No new package, discovery document, JWT algorithm or production
endpoint is introduced. A small .NET `IConfigurationRetriever` adapts the raw JWK
Set to IdentityModel's existing configuration manager; framework code performs
signature verification, caching and refresh.

| Root `.env` variable | Default | Consumer |
| --- | --- | --- |
| `JWT_JWKS_URL` | `http://jwks-api:8080/.well-known/jwks.json` | .NET `Jwt__JwksUrl`, Quarkus `AUTH_JWKS_URL` |
| `JWT_JWKS_REQUIRE_HTTPS` | `false` | .NET `Jwt__RequireHttpsMetadata`; HTTP only on trusted internal/local network |
| `JWKS_API_INTERNAL_URL` | `http://jwks-api:8080` | Quarkus `AUTH_SERVER_URL` (base URL, not JWT issuer) |
| `AUTH_JWKS_CACHE_TTL` | `10M` | Quarkus lazy per-key cache TTL |

Native local .NET development defaults to `http://localhost:8083/.well-known/jwks.json`;
other environments must supply `Jwt__JwksUrl`. HTTPS is required by default outside
the explicit local/internal overrides. Native Quarkus uses `AUTH_SERVER_URL` and
`AUTH_JWKS_URL`, defaulting to the independent service on localhost port 8083.
Existing Quarkus local `.env` files may override defaults: update old .NET URLs
when running outside Docker. Issuer/audience remain the .NET token contract,
not the JWKS URL. The production environment example documents the same inputs.

Both frameworks fetch keys lazily; no new Compose `depends_on` is introduced.
.NET uses a five-second HTTP timeout, a 15-minute automatic configuration refresh
interval and a one-minute requested-refresh interval. Automatic refresh is
on demand, not a polling timer. Superseded last-known-good configuration fallback
is disabled; cached current keys may continue working during outages. Quarkus
caches keys for 10 minutes by default and retrieves uncached key IDs from JWKS.
Neither verifier bypasses signature/issuer/audience/expiry checks during outages,
nor falls back to local or .NET JWKS keys. A cold verifier or unknown key cannot
authenticate when required retrieval fails. .NET login remains available with
its local signing key even if JWKS is unavailable; protected endpoints may reject
new tokens until the public key can be fetched.

For rotation, publish old and new public keys with distinct IDs in Spring, keeping
exactly one active entry. Recreate JWKS, allow verifier caches to refresh, then
change the .NET signing pair and `JWT_KEY_ID` together. Retain the old public key
until all old access tokens expire plus cache/rollout time. Spring's active flag
does not configure the .NET signer. Do not expect key removal to revoke cached
tokens immediately. Protect the JWKS directory and endpoint as security-critical
configuration; use HTTPS for remote networks. No keys were generated or replaced
by this migration. Disposable RSA keys in automated fixtures are test-only.

### Verification results

- Before edits, live .NET and Spring JWKS matched `kid`, `kty`, `alg`, `n`, `e`.
  The ID is `japanese-learning-local-1`. .NET's unchanged startup loader also
  enforces matching private/public keys of at least 2048 bits.
- Full .NET suite: **91 passed**, including issuance/claim mapping, issuer,
  audience, required expiry, invalid signature/algorithm, unknown kid, cached vs
  cold outage behavior, remote-key authority, and refresh after rotation.
- Focused Quarkus suite: **43 passed** across JwtSecurityTest (21),
  SafeConfigurationTest (11), OpenApiSecurityTest (5), HealthResponseFilterTest (2),
  and CorrelationIdTest (4). Security tests include signatures, unknown keys,
  issuer/audience/expiry/nbf, case-sensitive roles, caching, rotation overlap and
  cached/uncached behavior during a simulated JWKS outage.
- Full Quarkus suite attempted but **blocked during discovery** by the existing
  MySQL test profile requiring a dedicated `vocabulary_import_test` database.
  Application databases were not used for those tests.
- Both Docker images built; only `jp_dev` .NET and Quarkus containers were
  recreated with `--no-deps`. All three JWT-related services are healthy with
  zero restarts. No databases, Gateway, Angular, or other-root services restarted.
- `python scripts/verify-jwks-migration.py`: **passed** real registration/login,
  public-key signature and kid verification, `/api/auth/me` and
  `/api/v1/jlpt-levels` with the same token, User/Admin restrictions,
  missing-token/invalid-signature rejection, refresh and logout/revoked refresh.
  The initial attempt sent JSON to a multipart endpoint and got 415; the harness
  was corrected to send multipart and the complete run passed. Unique development
  test accounts are retained; tokens/credentials are never printed or committed.
- Running container configuration points both verifiers at Spring. Spring logs
  show key requests from the two API containers. The .NET legacy JWKS endpoint
  received **zero requests since consumer recreation**.
- Base, production, observability, and combined production/observability Compose
  syntax passed. Monitoring validation needed a temporary Grafana password
  placeholder because the existing root `.env` leaves it unset. Production JWKS
  has only the internal `api` network and no published port. No production rollout
  or full production integration suite was run.
- Production operation tests pass; all three repositories pass `git diff --check`.
- Postman CLI verification/simulation unavailable: managed Private Cloud manifest
  could not be read. Existing real-HTTP loopback fixtures exercise remote failures
  instead. No Postman workspace or external service was changed.

### Changed files

Root repository:
`docker-compose.yml`, `compose.production.yml`, `.env.example`, `README.md`,
`deployment/production.env.example`, `deployment/README.md`, `docs/JWKS.md`,
`scripts/production.py`, `scripts/test-production.py`,
`scripts/verify-jwks-migration.py` (new).

.NET submodule:
`src/JapaneseLearning.User.Api/Authentication/AuthenticationExtensions.cs`,
`src/JapaneseLearning.User.Api/Authentication/JwksConfigurationRetriever.cs` (new),
`src/JapaneseLearning.User.Api/appsettings.json`,
`src/JapaneseLearning.User.Api/appsettings.Development.json`,
`src/JapaneseLearning.User.Infrastructure/Configuration/JwtOptions.cs`,
`src/JapaneseLearning.User.Infrastructure/DependencyInjection.cs`, `README.md`,
`tests/JapaneseLearning.User.UnitTests/Security/{JwtContractTests,JwtRsaStartupTests,JwksEndpointTests,RsaKeyFixture}.cs`,
`tests/JapaneseLearning.User.UnitTests/Health/HealthEndpointTests.cs`,
`tests/JapaneseLearning.User.UnitTests/Logging/CorrelationIdTests.cs`.
The pre-existing `Program.cs` edit was preserved without further changes.

Quarkus submodule:
`src/main/resources/application.properties`, `README.md`,
`src/test/java/com/japaneselearning/security/JwksTestResource.java`,
`src/test/java/com/japaneselearning/security/JwtSecurityTest.java`.
Spring JWKS, Angular and Gateway working trees are unchanged.

### Legacy endpoint and rollout prerequisites

The former .NET `/.well-known/jwks.json` endpoint was removed in the follow-up
cleanup authorized after this migration. Only Spring JWKS publishes keys now.
The root checks in `scripts/final_e2e_checks.py` and `scripts/verify-production.py`
now fetch keys from `jwks-api`. The .NET endpoint contract tests were replaced
by a regression test that checks 404 for anonymous/authenticated requests, absence
from Swagger and successful remote-JWKS bearer validation. External consumers of
the retired .NET URL must use the independent endpoint.
Historical isolated production/E2E provisioning scripts were not fully migrated or run;
their custom issuer keys/kid must also be provisioned into independent JWKS
before those old harnesses can establish a migrated full-stack result.

Before another environment rolls out, provision `.env.jwks-api` and public files
that match that environment's actual issuer signing key and `JWT_KEY_ID`. This
development copy is not an automatically synchronized key store. The production
launcher now includes JWKS among release images; build every image with a fresh
`RELEASE_TAG` and review the public-only mount before deployment. Repository-local
submodule changes must be committed in their own repositories and their pointers
recorded by the root before a clean clone can reproduce the migration; no commits,
staging or pushes were performed here.

### Legacy cleanup

Removed .NET `Controllers/JwksController.cs`, `JwtRsaKeys.GetPublicJsonWebKey`,
the retained local `ValidationKey` copy, and the endpoint-specific metrics label.
The signing pair is still loaded and checked for matching RSA parameters and
minimum size at startup. Issuance and remote JWKS validation remain unchanged.
The test fixture now builds public-only JWK responses from its disposable RSA
test key, with no production publication helper.

The full .NET suite passes **90 tests** after replacing the two legacy endpoint
tests with one retired-route regression test. The .NET Docker image builds with
zero warnings/errors. Only the .NET development container was recreated. The live
verification script additionally checks the retired URL and Swagger document,
then exercises login, both protected services, authorization, invalid signatures,
refresh and logout against independent JWKS.

The cleaned live flow passed, including anonymous and authenticated 404 checks
for the retired endpoint and absence from the .NET Swagger document. All seven
running development services are healthy; .NET, Quarkus and Spring JWKS each
have zero restarts. Frontend page/health and Gateway health return 200, and
unauthenticated protected routes through Gateway correctly return 401. Database
containers/volumes and Gateway/Angular configuration were not changed by cleanup.

Cleanup files: .NET `JwtRsaKeys.cs`, `ApplicationMetrics.cs`, `RsaKeyFixture.cs`,
`README.md`, deleted `JwksController.cs` and `JwksEndpointTests.cs`, new
`RetiredJwksEndpointTests.cs`; root `scripts/final_e2e_checks.py`,
`scripts/verify-production.py`, `scripts/verify-jwks-migration.py`, `README.md`
and this document. Earlier migration verification above remains historical evidence.
