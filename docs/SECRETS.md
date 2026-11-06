# Local key storage

```text
secrets/
  public/
    user-publickey-{1,2,3}.pem
    archive/<E2E-project>/user-api-public.pem
  private/
    user-api/
      user-privatekey-{1,2,3}.pem
      archive/<E2E-project>/private.pem
```

Keep public keys in `public`, with a service-prefixed filename. Keep private
keys in `private/<compose-service-name>`; future services get their own service
directory. Add version suffixes for rotation, for example
`public/user-api-public-v2.pem` and `private/user-api/private-v2.pem`.
Key IDs remain an explicit environment setting and are not inferred from names.
Archives are retained fixtures, not keys to activate or publish automatically.

Public-key configuration has `KID`, canonical `PUBLICKEYPATH`, and required `OWNER=USER`; every configured
public key is published. There is no public `ACTIVE` flag. Private signing-key
configuration still requires exactly one `ACTIVE=true` entry to choose the
issuer's signer. Keep retired signers' public keys while their tokens remain
valid; removing a public key takes effect after verifier caches refresh.

Everything under `secrets/` remains ignored by Git, including public keys, because
these files are specific to this deployment. Environment examples contain paths
and IDs only. Actual `.env*` files, private keys and `.local/` artifacts remain
untracked. Do not upload private material in application images or copy it into
the public tree.

.NET now requires the indexed signing list and mounts only its private directory.
The legacy single-key fallback, its local public-key settings and its public
mount have been removed. `secrets/public` remains required by Spring JWKS.

## Docker mapping

| Host setting | Default | Container mount |
| --- | --- | --- |
| `USER_API_SIGNING_KEYS_HOST_PATH` | `./secrets/private/user-api` | .NET `/run/keys/jwt:ro` |
| `JWKS_API_PUBLIC_KEYS_HOST_PATH` | `./secrets/public` | JWKS three individual `/run/keys/jwks/user-publickey-N.pem:ro` binds |

`.env.user-api` keeps its existing indexed `/run/keys/jwt/user-privatekey-N.pem` paths. The JWKS
configuration uses `/run/keys/jwks/user-publickey-N.pem` (N=1,2,3). .NET has no public-key
mount and requires an indexed private-key signing list. Native Development must
supply that list explicitly with host private-key paths.
Quarkus and browser/Gateway services receive no private-key mounts.

For production, the key generator creates private files as 0640 in a 0750 service
directory, group 1654, matching .NET. Public directories are 0755 and public files
0644, allowing JWKS UID 10001 to read them. Check host/parent-directory traversal,
Windows ACLs or container UID mappings for your deployment. The shell generator
uses exclusive output creation and refuses existing service directories/public
files; it must never be run as part of routine updates or this reorganization.

## Historical reorganization performed on 2026-11-04

| Previous location | Result |
| --- | --- |
| `secrets/jwt/private.pem` | Moved unchanged to `secrets/private/user-api/private.pem` |
| `secrets/jwt/public.pem` | Moved unchanged to `secrets/public/user-api-public.pem` |
| `secrets/jwks/public.pem` | Removed after confirming it was byte-identical to the retained public key |
| `secrets/jwk` | Removed; empty directory left by the old path typo |
| `secrets/jwt`, `secrets/jwks` | Removed after moving their contents |
| `secrets/final-e2e/<project>/secrets/jwt/private.pem` | Preserved under `secrets/private/user-api/archive/<project>/private.pem` |
| `secrets/final-e2e/<project>/secrets/jwt/public.pem` | Preserved under `secrets/public/archive/<project>/user-api-public.pem` |
| Remaining `secrets/final-e2e` metadata | Moved intact to `.local/verification/final-e2e` |
| `secrets/jwks-containers-before.txt`, `jwks-volumes-before.txt` | Removed obsolete migration snapshots |

Eight archived E2E key pairs were retained because their test volumes also remain;
they are not assumed redundant. The final store has 18 PEM files: one active pair
and eight archived pairs. All key bytes were verified against a pre-move SHA-256
inventory, accounting for the one duplicate public copy removed. The local audit
inventory is `.local/verification/secrets-reorganization.json`; it contains paths
and hashes, not key contents. Historical reports/configs remain evidence of their
original runs; review configuration before attempting to recover an archived run.

Updated root files: `docker-compose.yml`, `.gitignore`, `.env.example`,
`.env.jwks-api.example`, `.env.user-api.example`, `README.md`, `docs/JWKS.md`,
this document, `deployment/production.env.example`, `deployment/README.md`,
`scripts/generate-jwt-keys.ps1`, `scripts/generate-production-keys.sh`,
`scripts/verify-configuration.py`, `scripts/verify-final-e2e.py`, and
`scripts/final_e2e_checks.py`.

Updated local ignored configuration: `.env` host directory values and
`.env.jwks-api` container public-key filename. The signing path in `.env.user-api`
continues to work unchanged because its container mount target is stable.
Credentials, key IDs and signing algorithms were preserved.

Updated .NET submodule files: `README.md` and
`src/JapaneseLearning.User.Api/appsettings.Development.json`. No authentication
logic or JWT contract changed. Quarkus, Spring JWKS, Angular and Gateway source
were not modified.

## Validation

- Base, production, observability and combined Compose syntax passed. Optional
  monitoring validation used a temporary Grafana password placeholder.
- .NET and JWKS were recreated using only `--no-deps`; all seven running
  development services are healthy. Database containers/volumes were not removed
  or restarted. Other-root services were untouched.
- Live registration/login, public-key signature/kid matching, protected .NET and
  Quarkus requests, role restrictions, invalid-signature rejection, refresh and
  logout passed. The live checker retains its uniquely named test account.
- Final mount inspection confirms all key mounts are read-only and Spring JWKS
  has no private-directory mount. The public tree contains no private PEM blocks.
- .NET Docker image built with zero warnings/errors. Five production-operation
  unit tests passed; Python/PowerShell syntax and Git whitespace checks passed.
- The Linux generator was exercised in a disposable, network-isolated container
  with temporary storage only: new paths, ownership/modes and overwrite refusal
  passed. No deployment key was generated, replaced or rotated.
- Full isolated production/E2E suites were not run; their paths/isolation setup
  were updated and checked statically. No production rollout was performed.

After removing legacy signing, all **104 .NET tests passed**, including rejection
of missing and legacy-only signing configuration. The rebuilt live .NET container
has no public-key mount or legacy signing environment variables. Full login,
protected requests to both APIs, authorization, refresh/logout and invalid-signature
checks passed. All seven development services remain healthy. Compose rejects a
missing signing env file, and five production-operation tests still pass.
