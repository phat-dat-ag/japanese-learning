# Environment-file audit — 2026-11-16 rerun

## Clone onboarding review

The root Getting started section now contains the ordered Windows first-clone
procedure: pinned submodules, exclusive dotenv initialization, required database/
Grafana passwords and machine-specific Docker disk path, three indexed JWT pairs,
separate P07 TLS/accounts, paired logging receipt, read-only preflight, OpenSearch
bootstrap, then full Compose startup. All four child READMEs link to that sequence
while retaining their native setup instructions. The single-pair legacy key helper
is no longer recommended for unmodified Compose templates. Production-like and
release workflows remain distinct, and restoring an existing deployment requires
its original secrets and data rather than fresh generators.

Verification: all seven template-only Compose combinations passed; isolated
`test-clone-setup.py` passed dotenv preservation, matching indexed RSA pairs, P07
provisioning, existing-key refusal, invalid/missing/empty mount rejection and blank
credential detection. `preflight-compose.py --project jp_dev` passed against the
actual current deployment with elevated file access. Documented script paths and
whitespace checks passed in all five repositories. Root env/JWT hashes remained
unchanged. This review did not start/recreate containers or regenerate live keys.
It does not constitute an uncached image build or cold runtime test on a second
Windows machine; host resources, port availability, Docker permissions and supplied
credentials can still prevent startup and must be checked as documented.

## Subsequent authorized local runtime repair

After this audit, the operator explicitly authorized fresh local P07 provisioning
because no verified original backup was available. The empty placeholder
directories were preserved under
`.local/p07-provision-7224d8de0c734b5ab0ffc868c00c7be3/placeholder-directories`.
Matching P07-only certificates, accounts and notification token were generated;
the four previously blank P07 dotenv settings were populated, with original bytes
backed up. Existing root environment settings, application JWT keys and databases
were preserved. New helpers `provision-p07-local.py --apply` and
`bootstrap-p07-local.py --project jp_dev` document the explicit fresh-setup path;
see [the provisioning procedure](SECRETS.md#fresh-local-p07-provisioning).

The current project is **jp_dev**, with **16 running services** and **five successful
setup/migration jobs**. All services with health checks were healthy. Frontend HTTP
200 was verified at `http://127.0.0.1:8099`; Logs UI returned anonymous 401 and
existing-viewer 200 at `http://127.0.0.1:5661`. The existing logging htpasswd was
verified with elevated access and left unchanged; the earlier sandbox-only
missing-file diagnosis was incorrect. Neither database was restarted, no volume
was deleted, and all 39 protected root environment/template/JWT files retained
their hashes. No other project's containers were changed.

Use `docker compose -p jp_dev up -d` for this workstation's existing deployment;
using another project name selects different resources. Linux release inputs
remain separate and still need their own required credentials. The remainder of
this report records the earlier audit state before the authorized runtime repair.

This report describes the working tree after the requested revert and fresh
inspection, not the first audit's counts. The sweep inspected 1,730 Git-tracked
paths across the root and four initialized submodule working trees, including all
Compose overlays, Dockerfiles, entrypoints, application/infrastructure settings,
scripts, P00–P11 observability, maintenance/backup code, ignore rules and setup
documentation. It reviewed 522 matching candidate source lines. These include
repeated documentation and environment object accesses, so they are not 522
distinct environment-file dependencies. No tracked file was excluded for size.

The inventory contains **21 concrete referenced input paths** and **two generated
E2E path families**. One additional existing local dotenv artifact has no tracked
consumer. Of the concrete inputs plus that artifact, **22 real files existed at
the start**, and all remain unchanged. **17 templates existed**, but five required
examples were ignored and therefore absent from a fresh clone. One template was
missing on disk. There are now **18 committable templates**: 12 previously tracked,
five recovered through exact ignore exceptions, and one newly created.

**No real environment file was missing on this rerun; none was created or changed.**
All 17 static local pairs were preserved. The initializer demonstrated creation of
all 17 in a separate template-only simulation and preserved them on a second run,
including a local-only assignment. Existing templates were preserved byte for byte.

The [detailed inventory](environment-file-inventory.json) records owning repositories,
loading mechanisms, mandatory/optional conditions, workflows, every template
variable name, supported nonblank default names, blank names needing review and
local omissions. Default values remain in their original linked templates;
actual local values are excluded. Required settings may have supported defaults;
blanks marked for review are not all mandatory (for example a browser channel or
an optional connection-string override).

| Environment file | Template | Status | Action |
| --- | --- | --- | --- |
| `.env` | `.env.example` | Existing; automatic Compose interpolation, DEV/base for local production-like | Preserved |
| `.env.db.production` | `.env.db.production.example` | Existing; explicit second CLI file for local production-like | Preserved |
| `.env.user-api` | `.env.user-api.example` | Existing; user-api service input | Preserved |
| `.env.jwks-api` | `.env.jwks-api.example` | Existing; jwks-api service input | Preserved |
| `.env.vocabulary-api` | `.env.vocabulary-api.example` | Existing; vocabulary-api service input | Preserved |
| `.env.user-api.production` | `.env.user-api.production.example` | Existing; release template selects this transitively; example ignored | Unignored example only |
| `.env.production` | `deployment/production.env.example` | Existing; optional Linux release workflow | Preserved |
| `.env.p07` | `.env.p07.example` | Existing optional reference, not loaded by Compose | Preserved |
| `angular/.env` | `angular/.env.example` | Existing; optional test settings, explicit export | Preserved |
| `dotnet/.env` | `dotnet/.env.example` | Existing; native API, explicit export/IDE | Preserved |
| `quarkus/.env` | `quarkus/.env.example` | Existing; SmallRye automatic working-directory loading | Preserved |
| `springboot-jwks-api/.env` | `springboot-jwks-api/.env.example` | Existing; native Spring, explicit export/IDE | Preserved |
| `quarkus/.env.docker` | `quarkus/.env.docker.example` | Local exists; documented standalone Docker input lacked a template | Created safe template only |
| `secrets/p07/admin.env` | `secrets/p07/admin.env.example` | Both exist; example ignored; required password blank | Unignored example only |
| `secrets/p07/writer.env` | `secrets/p07/writer.env.example` | Both exist; example ignored; required password blank | Unignored example only |
| `secrets/p07/dashboards.env` | `secrets/p07/dashboards.env.example` | Both exist; example ignored; required password blank | Unignored example only |
| `secrets/p07/monitor.env` | `secrets/p07/monitor.env.example` | Both exist; example ignored; required token blank | Unignored example only |
| `.env.logging` | `.env.logging.example` | Existing generated receipt; elevated follow-up verified matching htpasswd | Preserved both |
| `observability/roadmap/p05-validation/compose-fixture.env` | None needed: tracked synthetic fixture | Explicit historical validation input | Preserved |
| `observability/roadmap/p06-validation/compose-fixture.env` | None needed: tracked synthetic fixture | Explicit historical validation input | Preserved |
| `observability/roadmap/p07-validation/compose-fixture.env` | None needed: tracked synthetic fixture | Explicit historical validation input | Preserved |
| `observability/p07/.env.vocabulary-api` | None; no tracked consumer found | Existing ignored artifact; not the root service input | Preserved |
| `.local/verification/final-e2e/<project>/.env.production` | `deployment/production.env.example` | Dynamically generated only for opt-in E2E | Preserve existing generation mechanism |
| `.local/verification/final-e2e/<project>/.env.user-api` | Generated indexed signing contract | Dynamically generated with isolated signing identity | Preserve existing generation mechanism |

## Consumers and required manual inputs

`docker-compose.yml:571` explicitly injects `secrets/p07/dashboards.env` into
**opensearch-dashboards**. Its single required variable is
`P07_DASHBOARDS_PASSWORD`: `observability/p07/opensearch/dashboards.yml` uses it
to authenticate as `kibanaserver`, and the service health check uses the same
account/password. `observability/p07/dashboards.env` is not the referenced path
and does not exist on this rerun. The service and its env_file were retained.

The other P07 contracts are:

- `admin.env`: `P07_ADMIN_PASSWORD` for `administrator`, consumed by logging-init
  and logging-ui-init through `observability/logging/bootstrap.py`.
- `writer.env`: `P07_WRITER_PASSWORD` for `ingestion_writer`, consumed by Fluent Bit.
- `monitor.env`: `P07_MONITOR_TOKEN` for storage-monitor notification authorization;
  Prometheus needs the same value in securely provisioned `monitor.token`.

These have no safe credential defaults. Their files are mandatory during Compose
parsing in DEV and production variants, even when local production-like profiles
exclude the heavy services from startup. All four credential/token values are
currently blank. `.env.p07` neither substitutes for nor injects these files.

Root/native/template defaults remain unchanged. Compose explicitly maps database
and runtime values over service env_file values, so a blank database password in
the vocabulary template does not by itself mean the resolved Compose password is
blank. Native execution still requires its own database password and reachable
database/JWKS endpoints. Standalone Quarkus Docker requires manual container-network
database/Auth/JWKS URLs; the new template leaves those unknown endpoints blank.
Native .NET also needs its indexed signing-key path; native Spring needs configured
public-key paths. Key IDs, owners, paths and active-signing selection must match the
deployment. No JWT/JWKS relationship, key or account was changed.

The Linux release inputs still need database passwords, immutable `RELEASE_TAG`,
permitted `MSSQL_PID`, `JWT_ISSUER`, `JWT_AUDIENCE`, Grafana password and matching
signing/public-key files. Provision deployment-specific credentials and keys;
do not copy DEV secrets into production. Local production-like uses the existing
two-file override procedure and is distinct from this Linux release workflow.

## Repeatable initialization and generated exceptions

The Windows/DEV/production-like setup remains in the
[root environment guide](../README.md#environment-configuration); Linux release
setup remains in the [release runbook](../deployment/README.md).
`python scripts/initialize-environment.py` exclusively creates absent static files
from their examples. It preserves existing bytes, comments, credentials, ports,
paths and local-only variables, and reports blank setting names without values.
It never initializes `.env.logging` from an example or generates secure material.

Fresh deployments must provision matching P07 CA/service certificates, keys,
OpenSearch users/roles and monitor token through a secure deployment procedure.
Existing deployments must recover matching material. The historical
`setup-p07-security.cjs` writes credential files unconditionally and can regenerate
CA material; it was not run and is not an automatic missing-file repair.
The notification configuration script writes both a token file and tracked
Prometheus configuration; it was not run against this working tree.

For a genuinely new logging identity, the existing `scripts/setup-log-access.py`
generates `.env.logging` and htpasswd together and refuses overwrite. If the receipt
already exists but its hash is missing, `scripts/log-access.cjs recover --auth-file
<new-unused-path>` can recover a hash from the existing identity without resetting
its password; its parent directory must exist. Review and select that path with
`LOGS_AUTH_FILE` separately. No recovery helper or container was run in this audit.

Opt-in `verify-final-e2e.py` creates its two dotenv files exclusively in isolated
project directories. It creates fresh test identities, keys and infrastructure;
those files are intentionally dynamic and must not be initialized from live files.
Historical P05–P07 fixtures are already committed synthetic inputs. P00–P11 scans
found no additional static missing env-file template contract. Ignore-only names
such as `.env.sample` and environment-object property accesses are not file inputs.

## Validation and remaining blockers

- All 17 static local files are Git-ignored and untracked. All 18 examples are
  committable. Exact exceptions expose only the four P07 examples; other secret
  directories, credential JSON, token files, public/private keys remain ignored.
  Root and all four child ignore rules were inspected.
- Hashes confirmed all 36 pre-existing environment files/templates unchanged.
  Existing P07 security paths are directories, not regular files; they were left
  untouched. No local environment values were added, removed or reset.
- Current `docker compose -p jp_dev config --quiet`, documented DEV, local
  production-like, shared-provider and shared-consumer configurations passed.
- Current Linux release and release-with-monitoring configurations reject blank
  required passwords; observed errors name `MSSQL_SA_PASSWORD`. Blank release
  configuration was preserved. Error order may vary with Compose interpolation.
- `python scripts/verify-environment-portability.py` passed all seven configurations
  from template copies only, with required CLI interpolation supplied synthetically
  in memory. Initialization and repeat-run preservation also passed. No real dotenv
  file was copied into the simulation, and no daemon mutation occurred.
- The release monitoring simulation exposed duplicate `security_opt` entries
  merged from base and overlay. One `!override` tag fixes parsing while retaining
  the existing security option. No service was disabled or removed.
- Independent Compose dotenv syntax checks passed for all **40 files**: 22 real
  inputs/artifacts and 18 examples. Root and Quarkus whitespace checks passed.
  Staging is left untouched.

**At audit completion, this checkout was not runtime-ready.** All four P07 required credentials were
blank. These nine `secrets/p07` paths are directories where regular secure files
are needed: `ca.pem`, `node.pem`, `node.key`, `admin.pem`, `admin.key`,
`dashboards.pem`, `dashboards.key`, `internal_users.yml`, and `monitor.token`.
The sandbox-only check also reported `secrets/logging/htpasswd` missing, but elevated
follow-up confirmed it was a valid existing hash and verified its password. The
directory blockers were subsequently resolved by the authorized runtime repair
described above; they were not changed during the original environment-file audit.

The fresh-checkout simulation is an equivalent static reconstruction, not a network
clone, image build or startup. New/recovered examples must be committed in their
owning repositories, then the child commit pinned in the root, before another clone
can reproduce them. Compose parsing does not validate credentials, secure-file
contents, Docker daemon availability, host disk paths or database readiness.
Custom `USER_API_SIGNING_ENV_FILE`, `JWKS_API_ENV_FILE`, `VOCABULARY_API_ENV_FILE`
and `--env-file` paths remain explicit operator-provisioned contracts.
Build/dependency caches and ignored generated history are outside the source sweep;
eight untracked historical P03 synthetic directories were unreadable under the
sandbox. No actual secret values were printed, introduced into source, or copied
between environments. No whole-history secret-free certification is claimed.
