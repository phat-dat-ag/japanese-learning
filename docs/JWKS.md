# Owner-specific JWKS deployment

This project uses User-issued RS256 tokens only. Both .NET and Quarkus trust
`http://jwks-api:8080/api/v1/jwks/user` on the Compose network. Native development
uses `http://localhost:8083/api/v1/jwks/user`. Issuer remains `JapaneseLearning.User`
and audience remains `JapaneseLearning`; a JWKS response does not establish issuer
ownership. Gateway is nginx and does not validate JWTs; Angular sends tokens to APIs.
There is no Learning Internal JWT consumer. Leave Learning unconfigured: its endpoint
returns an empty key set, with no fallback to User keys. Unknown owners return 404.
The former `/.well-known/jwks.json` endpoint is retired; remaining negative tests
intentionally verify that retired endpoint is unavailable.

## Dependency and migration

The root previously pinned `d23f6fdd17234f9383ead865af9327966579765a`.
The clean dependency checkout already held merged upstream develop commit
`53d50ba151d04d7ee7d4f7ea01beba524262c3d9` (PR #12, implementation `fa345c0`).
Fetch verified it is published on origin/develop. No JWKS source modification or
new dependency commit is needed. Commit service changes first, then root pointers.

For every deployment, update JWKS configuration before restarting its consumers.
No issuer, audience, kid, signing selection or existing key material needs changing.
Do not copy keys from another project or generate keys for unused owners.

## Environment wiring

Root `.env` supplies Compose interpolation; it is not automatically passed to Java.
Compose explicitly maps `JWT_JWKS_URL` to .NET `Jwt__JwksUrl` and Quarkus
`AUTH_JWKS_URL`. Both default to the User endpoint above. `JWKS_API_INTERNAL_URL`
remains the server base URL; it is independent of the trusted JWT issuer.
Quarkus standalone `.env` uses host URLs; container values use Docker DNS.
Standalone Java must receive variables through its launcher/environment; arbitrary
dotenv files are not automatically loaded by Java.

Compose loads `.env.jwks-api` through `JWKS_API_ENV_FILE`. For contiguous indices
0, 1, 2, configure each existing public key with:

- `APP_SECURITY_JWKS_KEYS_<n>_KID`: preserve the matching signing kid.
- `APP_SECURITY_JWKS_KEYS_<n>_PUBLICKEYPATH`: canonical Spring indexed binding,
  replacing the former `_PUBLIC_KEY_PATH` spelling.
- `APP_SECURITY_JWKS_KEYS_<n>_OWNER=USER`: required explicit ownership.

The current files are `user-publickey-1.pem` through `user-publickey-3.pem`, with
kids `jp-user-1` through `jp-user-3`, at `/run/keys/jwks/` inside JWKS.
No public ACTIVE flag exists. Missing/invalid owners, duplicate IDs, unreadable
files and invalid RSA keys fail startup. Multiple keys per owner are supported.

`.env.user-api` and private signing selection remain unchanged. Root `.env`,
`.env.jwks-api` and `quarkus/.env` are local ignored configuration, never staged.
Examples updated: root `.env.example`, `.env.jwks-api.example`, deployment
`production.env.example`, .NET `.env.example` and Quarkus `.env.example`.

## Mounts and rotation

`JWKS_API_PUBLIC_KEYS_HOST_PATH` is the host parent directory, default
`./secrets/public`. Compose binds only the three individual public files read-only
at matching `/run/keys/jwks/user-publickey-N.pem` paths, with `create_host_path: false`.
Archives and private directories are not mounted into JWKS. Runtime UID/GID 10001
must be able to read each public file (Linux public files 0644). .NET alone mounts
`secrets/private/user-api` at `/run/keys/jwt:ro`; its existing indexed private
paths and active key remain unchanged. No keys are regenerated or moved.

Other deployments must provision their own corresponding public filenames or
adjust the individual file mounts and indexed paths together. Changing a host
directory alone does not change the three expected filenames. The isolated E2E
runner overrides both mounts and indexed bindings with its own existing fixture.

Keys load at JWKS startup. Publish the new public key before activating its signer;
add an individual read-only mount and indexed USER entry for each additional key.
Recreate JWKS and then the issuer when changing signing selection. Keep overlapping
public keys until all old tokens expire and verifier caches refresh. HTTP JWKS
responses retain `Cache-Control: max-age=300, public`; Quarkus retains its `10M`
per-key TTL, and .NET retains 15-minute automatic/one-minute throttled refresh.
Unknown kids can trigger refresh. A required fetch fails closed during an outage;
previously cached keys may continue working under existing cache policy.

## Verification commands (Windows CMD)

```bat
docker compose -p jp_dev config --quiet
docker compose -p jp_dev build jwks-api user-api vocabulary-api
docker compose -p jp_dev up -d --no-deps --wait --wait-timeout 180 jwks-api user-api vocabulary-api
curl.exe --fail --silent http://127.0.0.1:8083/api/v1/jwks/user
```

Inspect resolved configuration and mounts privately; never print full container
configuration, credentials, private PEM contents or access tokens. Recreate only
affected services and preserve databases/volumes. Full production and account-based
checks require their deployment configuration and existing account credentials.

## Verification on 2026-11-06

- Spring Maven 3.10.0 / Java 17 / Boot 4.1.2: `mvnw.cmd -B -ntp verify`,
  52 tests passed and packaged successfully (rerun with Maven cache access).
- Quarkus Maven 3.9.16 / Java 17 / Quarkus 3.38.2 OIDC: focused
  `verify -Dtest=JwtSecurityTest,SafeConfigurationTest -Dquarkus.http.test-port=0`,
  32 tests passed and packaged successfully. Integration-test phase is skipped.
- .NET 9, JwtBearer 9.0.8: `dotnet test JapaneseLearning.User.sln --no-restore`,
  113 tests passed with cache access. Initial restore attempt did not finish.
- All four base/production/observability/combined Compose variants resolved.
  Validation used process-only RELEASE_TAG, MSSQL_PID and Grafana test inputs;
  no deployment environment or credential was replaced.
- Docker rebuilt/recreated only jp_dev jwks-api, user-api and vocabulary-api.
  All three healthy. Separate springboot_project services were untouched.
- `node scripts/verify-owner-jwks.mjs`: passed against real containers, including
  three original kids and matching public n/e, caching, public-file-only mounts,
  empty Learning, unknown-owner 404 and retired-route rejection (401).
  All three existing signers authenticated User/Admin on both APIs; incorrect
  issuer/audience, expiration, foreign signatures and foreign kids returned 401.
  The foreign key is an ephemeral in-memory negative-test fixture, never deployed.
- No accounts or persistent fixtures created, no databases/volumes removed.
  Login/refresh/logout were not exercised: existing account credentials were not
  available. Signed-token checks establish real verification, not login success.
- Production-tooling unit tests: 3 passed, 2 failed in unchanged existing tests
  (logging init jobs added to migration list and logging image/start expectations).
  Full production deployment and isolated E2E runner were not executed.
- Existing unrelated Quarkus Swagger UI edit was preserved; the local image
  build includes that existing working-tree setting. Exclude its hunk at commit.

No custom diagnostic JWKS-fetching endpoint or additional JWT gateway exists here.
The custom .NET JwksConfigurationRetriever and named jwt-jwks HttpClient retain
their timeout, size bound, caching and validation policy. Test fixtures, isolated
Angular quiz runner and root operational fetch scripts use the User endpoint.
