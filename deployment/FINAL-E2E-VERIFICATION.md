# Step 8.10 - Final fresh end-to-end verification

Date: 2026-09-24. Acceptance status: **PASS** after removing the invalid
lesson-seeding migration and rerunning with fresh volumes.
Host-specific production acceptance remains outstanding as listed below.

## Environment and reproducibility

Windows host, Docker Desktop Linux engine 29.5.2, Compose 5.1.3. Final isolated
project: `jp-final-e2e-3b6e1f62ca4a`. Root starting commit `a95da64`, branch
`test/final-fresh-e2e`; Angular starting commit `0c2970c`; Quarkus fixes are
uncommitted on `fix/final-e2e-import-validation`. Nothing committed or pushed.
The Angular gitlink difference existed before this work; its checked-out tree is
identical to the root-pinned revision's tree. This verifies the working tree with
the reported fixes, not an already published release containing those fixes.

`python -X utf8 -B scripts/verify-final-e2e.py` creates unique image tags and runs
`docker compose ... build --no-cache frontend user-api vocabulary-api` before
bootstrapping new named volumes. Pinned vendor/base images can use the local image
cache; application build steps do not. No prebuilt host application artifacts,
existing databases, migration state, development services or Angular development
server supply the test application.

The runner reuses the production Compose overlays and operator implementation.
Only ephemeral loopback frontend/Grafana ports, independently generated test key
mount paths and equivalent Compose JSON serialization differ. Production networks,
health ordering, restart/resource policies, images and hardening stay intact.
The private configuration is held in memory or ignored protected test fixtures;
resolved configuration and application diagnostics are never printed.

Architecture tested: HTTP loopback -> Angular production NGINX -> internal NGINX
Gateway -> .NET / Quarkus -> SQL Server / MySQL. Quarkus fetches public JWKS from
.NET internally. Prometheus and Grafana are enabled on internal monitoring networks;
Grafana alone has a loopback test port. Actual public TLS terminates upstream of
this boundary and is not part of the local runtime test.

## Runtime acceptance

The final runner completed all runtime checks and wrote its ignored PASS
`result.json` for project `jp-final-e2e-c65e736e4e6d`. All acceptance areas in the table below are **VERIFIED** within
the stated environment; host-specific limitations are listed separately.

| Area | Checks |
| --- | --- |
| Configuration/build | Production Compose validation; uncached Angular/.NET/Quarkus builds with unique tags; both NGINX configurations valid |
| Fresh databases | SQL initialization exits 0; SQL Flyway V1-V4 and MySQL V1-V5 successful; five JLPT levels, eleven parts of speech, and initially no lessons/users/vocabulary |
| Startup | Recorded Docker events prove DB health before jobs, successful migrations before APIs, backend readiness before Gateway, Gateway health before frontend |
| Frontend | Compiled assets, SPA deep links, same-origin API proxy path, security headers; private infrastructure paths and metrics return 404 |
| Authentication | Register 201, duplicate 409, login/me, User/Admin authorization, missing/malformed tokens 401; refresh rotation, replay rejection and logout revocation |
| JWT/JWKS | Independently verify .NET RS256 signature with public JWKS; Quarkus accepts it; wrong issuer/audience, expired and invalid signatures rejected by both services; private key mounted only in .NET |
| Application | User import 403; Admin imports two isolated records; missing-file validation 400; JLPT/lessons/flashcard detail/filter/pagination/empty/not-found responses |
| Health/errors | Both liveness/readiness probes 200; each isolated DB stopped safely, liveness stays 200 and readiness becomes 503; recovery succeeds; dependency error response contains no internal details |
| Correlation/logs | Generated/preserved correlation IDs, invalid/oversized/duplicate handling, proxy/backend context; captured logs contain no generated passwords, JWTs, refresh tokens or private-key body |
| Gateway | Methods/body limit, bounded auth/general/import rate rejection and recovery, 429 headers/correlation, health exemption; separate isolated fixtures verify forwarding-header sanitation, framing/timeouts and concurrency limits |
| Hardening | Runtime non-root UID, NoNewPrivs and capability masks; read-only roots, bounded tmpfs, CPU/memory/PID limits, init/restart policy; only frontend/Grafana loopback ports published |
| Secrets | Missing Compose secret rejected; nine invalid startup configurations fail safely; generated secrets absent from application image layers, frontend assets, inspected logs and metrics; private files ignored |
| Observability | Internal HTTP/runtime/process metrics; arbitrary method/path/identity/correlation values absent from labels; two Prometheus targets UP; Grafana authentication, provisioned dashboard and every panel query succeed |
| Operations/persistence | Actual production status/logs/verify/restart/deploy paths; DB/API recreation with same volume identities and unchanged data fingerprints; saved user/import still available; one-shot migrations rerun safely |

No browser automation was used: serving, assets, routing and API flow are HTTP
runtime checks, not proof of rendered browser interactions. JWT logout revokes the
refresh token; existing access tokens retain their designed expiry behavior.

## Automated verification and earlier failures

| Command | Result |
| --- | --- |
| Angular: `npm.cmd test -- --watch=false` | VERIFIED: 213 tests, 18 files passed |
| .NET: `dotnet test JapaneseLearning.User.sln --configuration Release --logger 'console;verbosity=minimal'` | VERIFIED: 74 tests passed |
| Quarkus: `./mvnw.cmd -B -ntp verify -Dquarkus.http.test-port=0` | VERIFIED: 80 tests, zero failures/errors/skips; packaging succeeded |
| ROOT: `python -X utf8 -B scripts/test-production.py` | VERIFIED: 4 tests passed |
| ROOT: `python -X utf8 -B scripts/verify-gateway-security.py` | VERIFIED: isolated gateway security fixtures passed; no `--live` development writes |
| ROOT: `python -X utf8 -B scripts/verify-gateway-rate-limits.py` | VERIFIED: isolated rate/recovery, spoofing, health/options and concurrency fixtures passed |
| ROOT: `python -X utf8 -B scripts/verify-configuration.py` | VERIFIED: 385 source files audited; ignored paths/placeholders and local-secret exclusion passed |
| ROOT/ANGULAR/.NET/QUARKUS: `git diff --check` | VERIFIED: all passed |
| All tracked/nonignored source files, including new files | VERIFIED: 386 files scanned; generated passwords/private-key body absent; nothing staged |

Initial Quarkus tests could not bind default port 8081 because the protected
existing development API owns it; rerunning with an ephemeral test port resolved
that environmental conflict without stopping development. The full suite then
exposed one real missing-upload validation bug and two pre-existing stale fixture
failures. All three now pass with the changes below.

Earlier isolated E2E attempts were not accepted as a fresh PASS: one verifier
payload omitted required examples; inspection also found missing fresh lesson
reference data. Other attempts exposed verifier assumptions about Docker's limited
historical event buffer and startup diagnostic text. The verifier now records live
events and matches the safe diagnostic. An exploratory repeat passed all runtime
flows, but final acceptance uses another entirely new project and uncached builds.
No earlier attempt modified a development database or deleted any volume.

## Bugs and source changes

ROOT:
- `scripts/verify-final-e2e.py`: protected-resource baseline, unique provisioning,
  uncached builds, isolated production lifecycle and safe failure handling.
- `scripts/final_e2e_checks.py`: functional/security/operations/persistence checks.
- `scripts/final_e2e_secrets.py`: image-layer secret scan and isolated invalid-startup probes.
- `README.md`, `deployment/README.md`, this report: procedure, results and limitations.

QUARKUS (branch created before edits):
- `VocabularyResource.java`: replace JetBrains nullability annotation with Jakarta
  Bean Validation. Existing regression test now returns 400 instead of 500 for a
  missing multipart file after authorization.
- No lesson-seeding migration remains. The isolated E2E setup provisions its own
  N5 Lesson 1 fixture explicitly after migration, because lessons are domain data.
- `VocabularyFileReaderTest.java` and dedicated `reader-fixture.json`: decouple
  fixed reader expectations from the changing production vocabulary example.
- `VocabularyImportValidatorTest.java`: valid fixture includes the required lesson.
- `README.md`: replace obsolete known-failure results with current validation.

ANGULAR and .NET: no source changes. Nothing staged, committed or pushed.

## Data safety and retained resources

Before any mutations, recorded all 19 existing volume identities, all 17 existing
container identities/images/volume attachments and aggregate development database
fingerprints. Only read-only aggregate SQL/CHECKSUM queries touched development.
Comparisons passed after each test run, including final teardown. Fingerprints cover SQL Users and
RefreshTokens and MySQL vocabulary, JLPT levels, lessons and lesson assignments;
they are not a byte-for-byte database snapshot or backup.

Every mutation targeted only the unique test project or its isolated configuration
probes. No volume deletion/prune/reset command was used. Test teardown stops/removes
only test containers and networks; all database/monitoring volumes and protected
fixtures are retained. This consumes disk and requires deliberate later inventory.
No real credentials or generated private material were added to source control.

## Inspected only / not verified / remaining risks

INSPECTED ONLY: the runbook's image/configuration rollback and native backup guidance
match the maintenance-window deployment and migration constraints. Old application
images/configuration require compatible schemas; otherwise use a forward fix or a
coordinated, tested restoration of both databases. Docker volumes are not backups.

NOT VERIFIED: actual backup/restore, rollback to an older application release, real
DNS/TLS termination/certificate renewal, browser rendering, a fresh physical Linux
host's ownership/SELinux/firewall/reboot behavior, production load/capacity and
licensed non-Express SQL Server deployment. Docker Desktop runs Linux containers
but does not prove those host-specific controls. No zero-downtime or HA claim.

Remaining deployment concerns: configure real edge HTTPS and backups, size the
single host, review dependency patching, and retain compatible release images and
configuration. Existing shared frontend-to-Gateway IP rate budgets can throttle
multiple users together, and the User service's existing SQL SA principal remains
a least-privilege improvement outside this verification step. Publish the reviewed
root/submodule fixes through the normal release workflow before expecting a fresh
clone of an older published revision to include them.
