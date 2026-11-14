# P07 laptop runtime verification

## Final acceptance and closure - 2026-11-14

**P07 PASS for this laptop development environment, with an explicitly approved strict-quota exception. P07 is closed; P08 has not begun.** This current section supersedes the historical BLOCKED checkpoints below.

| Acceptance requirement | Final result | Evidence |
| --- | --- | --- |
| Strict persistent telemetry quota | **EXCEPTION APPROVED, never PASS** | User explicitly approved the development-only exception. Existing retention, rotation, bounds, watermarks, physical D: metrics and authenticated alerts remain safeguards; no hard total-disk ceiling is claimed. |
| Durable backup and restore | **PASS** | 12 synthetic documents; native snapshot SUCCESS on host D: files. Source and restore each survive their own container recreation. Restore uses an independent persistent volume and read-only snapshot repository. |
| Rollback | **PASS** | Mapping migration plus a 13th record changes the fixture; snapshot restore to a new rollback index returns exactly 12 baseline records and the original schema. Full canonical document/ID SHA-256 matches. Reader access succeeds; anonymous and reader writes are rejected. |
| Accelerated retention | **PASS** | Native ISM actually deletes the separate three-record synthetic expiry index. The snapshotted 12-record index remains unchanged. Live retention policy/indices were untouched. |
| Live continuity and runtime controls | **PASS** | Every original live container ID/start/restart/mount/network remains unchanged during recovery. Both APIs and gateway stay available. Post-test security, logs/privacy, metrics/rules, Grafana datasources, both sampled traces and a newly delivered authenticated notification pass. |

Baseline/restored/rollback canonical SHA-256: `59fb2385734d7cb7ea20e39459f3554f864e02d78aa297bd104d44575838b454`. The compatible migration has 13 records and a different hash; the rollback returns the original 12 and removes the added schema field.

Isolated fixture: `p07_recovery_916fd74a`, reusing the already installed OpenSearch image. Its two containers are stopped. Persistent test volumes and the snapshot directory `D:\japanese-learning\.local\p07_recovery_916fd74a\snapshots` remain retained; no live volume was mounted into the fixture and no volume was deleted. The repository files have a SHA-256/size inventory in recovery evidence. An initial fixture-only missing bulk permission was corrected; failed-attempt evidence remains preserved separately.

Quota approval: the user answered **“Approve development-only quota exception”**. This applies only to local development, not production. It does not turn an unenforced quota into a passing test. No infrastructure, Desktop storage setting or live persistent-volume layout was changed. Existing supported retention/resource limits remain active.

Scope limits: the durable test uses synthetic telemetry, same-host D: storage and the same engine version. It does not demonstrate off-host disaster recovery, application-database recovery, security-index restoration or power-failure survival. Native security/roles were independently initialized on the recovery target and checked after restore, rather than claimed to have been recovered from a global-state snapshot. Full production retention periods were not elapsed.

Live runtime remains **16 running, 13 Docker-healthchecked healthy**, with all five initialization jobs exited 0. The three services lacking Docker healthchecks have separate runtime evidence. No live service was restarted or recreated for closure. Existing source changes, gitlinks, Quarkus detached HEAD/local Dockerfile edit, JWKS and springboot_project were preserved. No commit, push or P08 action occurred.

Machine-readable evidence: [closure](p07-validation/evidence/closure.json), [durable recovery](p07-validation/evidence/closure-recovery.json), [post-test runtime](p07-validation/evidence/fresh-runtime.json), [acceptance](p07-validation/evidence/acceptance.json).


## Fresh environment deployment - 2026-11-14

**Current status: deployed; P07 BLOCKED for Final Acceptance (Prompt 2).** This section supersedes the missing-project preflight and the earlier assessment-only plan. Fresh initialization was explicitly approved after Docker Desktop reinstallation; no historical database or telemetry recovery is claimed.

Docker Desktop uses `D:\DockerData\DockerDesktopWSL\disk\docker_data.vhdx` (23.80 GiB file length). D: has 142.74 GiB free; C: 40.12 GiB. A read-only bind of the actual D: storage directory supplies backing-disk metrics; metric/free-space difference was under 1 GiB at the checkpoint. OpenSearch native watermarks observe the Linux virtual filesystem, not the physical Windows backing reserve; D: alerts supply the separate physical view.

Runtime: **16 running, 13 Docker-healthchecked healthy, five successful one-shot jobs**. Fluent Bit, Tempo and Collector have no Docker healthchecks; Fluent Bit health API, Tempo readiness/datasource access and real Collector-to-Tempo traces were verified separately. Both SQL Server and MySQL initialized fresh; sqlserver-init, both Flyway migrations, logging-init and logging-ui-init exited 0.

| P07 service | Deployment | Verification |
| --- | --- | --- |
| prometheus | Active P07 configuration plus storage rules and authenticated local notifications | Four targets UP; 54 healthy rules; promtool configuration/rule tests pass |
| tempo | Active P07 query/ingestion limits; fresh retained WAL/blocks volume | Ready; both API trace IDs retrieved |
| otel-collector | Active P07 filtering/limits | Both API traces reach Tempo; separate from a Docker healthcheck |
| grafana | Active P07 provisioning, cookies, session controls and Viewer default | Healthy; both authenticated datasource health checks pass; anonymous API denied |
| fluent-bit | Rebuilt with P07 baked config/Lua/parsers and verified HTTPS writer | Active hashes match; SQLite offsets exist; all three service inputs observed; no observed live errors/retry failures/drops |
| user-api | Fresh built image; bounded local Docker logs | Healthy; SQL migration completed; logs and sampled trace retrieved |
| vocabulary-api | Fresh built image with tracing build argument retained; bounded local logs | Healthy; MySQL migration completed; logs and sampled trace retrieved |
| gateway | Pinned NGINX image and existing configuration; bounded local logs | Healthy |
| frontend | Fresh built image; bounded local logs | Healthy |

Seven custom images were required because the fresh engine had zero images: JWKS, User API, Vocabulary API, frontend, OpenSearch, Dashboards and Fluent Bit. Fluent Bit and Dashboards then received small security-dependent rebuilds. No submodule source was edited. Dashboards was recreated once for its authenticated healthcheck; Prometheus was recreated once for the notification-token bind. The new storage-monitor service was restarted to load its final code. Databases were never reset after initialization.

### Native OpenSearch security

New development-only administrator, ingestion_writer, dashboard_reader and kibanaserver identities are separate. OpenSearch HTTP/transport TLS and native RBAC are enabled; Dashboards retains its native security plugin. Fluent Bit verifies the CA and hostname; Dashboards verifies the backend in full mode; Logs UI verifies its HTTPS Dashboards upstream. Existing Logs UI, Grafana, JWT and JWKS credentials/keys were not reused or replaced. Secrets reside in Git-ignored `secrets/p07`, with Windows ACL access restricted to the operator, execution account, SYSTEM and Administrators. The CA was not installed as a machine-wide trust anchor.

Native checks: administrator allowed, writer allowed only the application-log scope, reader allowed application-log reads, reader write/admin denied, writer read/out-of-scope write denied, anonymous/invalid credentials denied. Plaintext backend requests, wrong CA and wrong hostname rejected. Existing outer Logs UI valid authentication passes (then native Dashboards login); missing/invalid authentication returns 401. Loopback-only UI/Prometheus/Grafana HTTP endpoints remain development ingress, not production TLS claims.

Reader metadata verification also passes: four shared patterns read, saved-object writes return 403. The general kibana_user role is deliberately unmapped; p07_reader receives read only on the exact shared `.kibana` alias and `.kibana_1` index, plus global-tenant read permission. The installed tenant-header behavior differed from the generic documentation; provisioning uses the verified default shared alias. No private-tenant wildcard or metadata write permission was granted. Future metadata-index migrations require reviewing this exact-index grant.

The first new CA certificate lacked the key-usage extension required by Python 3.14 strict verification. It was reissued with the same newly generated CA private key and explicit critical CA/key-signing extensions; the initial certificate remains preserved locally. Verification was never disabled.

### Storage, alerts and limits

Measured planning budgets: OpenSearch 24 GiB, Prometheus 2 GiB, Tempo 4 GiB, Grafana 1 GiB, Fluent Bit state 64 MiB. Budget warning/critical alerts fire above 70%/85%; physical backing warning/critical below 20/10 GiB; missing-metric alert is configured. These are **monitored budgets, not hard persistent quotas**. Resource/memory limits, bounded Docker logs, Prometheus 2-day/512 MB block retention, Tempo 24-hour retention/query limits and OpenSearch 30-day ISM plus 10,000-bucket/1,000-result-window/64-field limits are active. Prometheus retention excludes some WAL/head/compaction overhead; native OpenSearch watermarks are not Windows D: enforcement.

Six new storage/acceptance alert rules load alongside the existing 48. Synthetic low-space tests passed without filling any disk. A generated, bounded acceptance metric traversed Prometheus evaluation and authenticated notification POST into the internal local receiver. Unauthenticated notification POST is rejected. No external paging destination is configured, and in-memory receiver counters are not a durable notification archive.

### Logs, privacy and loss accounting

Forty-eight controlled API probes produced 72 correlated documents in a latest-100 sample; no private sentinel or banned top-level field appeared. Both APIs produced retrieved, low-ratio sampled traces; this verifies positive sampled export, not a sampling-distribution claim. Read-only JWKS probes subsequently produced 6 ingested spool records.

At the final checkpoint, Fluent Bit output processed 174 records with errors/retries-failed/drops zero; live pending chunks were observed empty at runtime verification. Three fresh SQLite DBs contain source offsets. Inputs have 8M memory limits, retry limit 3, no filesystem record queue, and Read_from_Head Off. Startup file content predating collector attachment can be skipped and remains in source log volumes; no exact pre-attachment count or zero-loss guarantee is claimed. Fresh initialization means there were no legacy buffers/offsets to recover.

A disposable, no-network Fluent Bit fixture proved raw private fields are rejected by the actual baked Lua. A separate disposable fixture reached finite retry exhaustion (test limit 1; live limit remains 3). Only those fixture containers were stopped/removed; no live fault was injected or live data mounted. All newly created project volumes remain present.

### Remaining acceptance blockers

1. Persistent per-volume filesystem quotas are not enforced by the Docker Desktop local-volume driver. Alerts, retention and watermarks do not satisfy a hard total-disk ceiling. No volume-layout migration, Desktop setting change or disk-filling test was performed. An enforceable storage backend or an explicit development acceptance exception is still required.
2. Full 30-day OpenSearch/24-hour Tempo expiry and fresh durable restore/rollback are not demonstrated by this short fresh runtime. Previous isolated synthetic retention/recovery evidence remains scoped; it is not historical recovery or a durable project backup.

All performed runtime/security/native checks pass; these remaining storage/recovery requirements prevent a claim of completed P07 acceptance. No P08, commit, push, protected JWKS implementation change, submodule/gitlink change or springboot_project action occurred. Quarkus remains detached at the pinned 815b637a with its previous Dockerfile edit; Swagger drift remains recorded and unchanged.

### First initialization and verification commands

Existing secret files must be retained. For a genuinely fresh project only: run `node scripts/setup-p07-security.cjs`, `node scripts/configure-p07-notifications.cjs`, validate root Compose, build only missing images, start OpenSearch without dependency waiting, run `node scripts/bootstrap-p07-security.cjs`, then start the complete project. Native security initialization must precede logging-init; a blanket first `up` alone cannot initialize the security index. Existing initialized volumes do not need security reinitialization. Do not run down -v.

Verification entry points: `node scripts/verify-p07-runtime.cjs`, `node scripts/verify-p07-isolated.cjs`, and `node scripts/finalize-p07-fresh.cjs`. These generate fresh test records and replace their own named evidence snapshots; existing source credentials remain unchanged. Final physical/mount/source evidence is in [fresh-final.json](p07-validation/evidence/fresh-final.json); see also [runtime](p07-validation/evidence/fresh-runtime.json), [security](p07-validation/evidence/fresh-security.json) and [native fixtures](p07-validation/evidence/fresh-native.json).

## Execution preflight - missing project data

2026-11-14: **BLOCKED; not ready for Final Acceptance.** Docker Desktop is operational on desktop-linux, but all 20 previously recorded project containers and all 11 expected project volumes are absent. This is consistent with the reported down -v, but the exact deletion command/recoverability is unproven. Application databases, telemetry, Fluent Bit offsets and retained logs cannot be claimed preserved. Prior runtime PASS results below are historical only. No deployment, build, new volume, credential change or protected-resource action occurred. The separate springboot-project volumes remain untouched.

Docker data file: `C:\Users\nguye\AppData\Local\Docker\wsl\disk\docker_data.vhdx` (36.93 GiB file length); C free 8.69 GiB. Capacity is below the proposed 10 GiB reserve and restore peaks are unknown.

All nine requested services: NOT DEPLOYED (preflight blocked). Security, storage and runtime acceptance: not completed. Recovery-source selection or explicit fresh-initialization approval and missing-dependency scope decisions are required before proceeding; do not silently recreate historical state. See [current machine evidence](p07-validation/deployment-planning/evidence/execution-preflight.json).


## Runtime drift deployment plan - 2026-11-14

**Planning only; P07 BLOCKED; deployment approval required.** Exact nine-service drift list is fluent-bit, prometheus, grafana, otel-collector, tempo, user-api, vocabulary-api, gateway, frontend. All require eventual recreation for full root alignment; eight can reuse exact cached platform manifests, while Fluent Bit needs a new verified P07 image and counted offset/backlog/spool handoff. Four app changes are logging-driver only. C: has 6.39GiB free; no build, recreation, restart, storage change or deletion occurred. Harmless Grafana file-path/default differences were separated from its real security changes. See [detailed gated deployment plan](p07-runtime-deployment-plan.md) and [machine evidence](p07-validation/deployment-planning/evidence/deployment-plan.json). Remote p07-verification.md and all source/submodule changes were preserved.

## Logs UI and backing-storage continuation - 2026-11-14

**Logs authentication RESOLVED; P07 remains BLOCKED.** Current valid/invalid auth returns200/401 with unchanged credentials and the same repaired logs-ui container. Docker data VHD is on C: (36.93GiB allocated), with 6.42GiB physical free; D: has 170.17GiB free. No disk cleanup or resource recreation occurred on resume. Integrated P07 source differs from nine active service configurations; no rollout was attempted. Swagger drift remains unchanged and unattributed. See the [current laptop report](p07-logs-ui-storage-verification.md) and [scoped acceptance evidence](p07-validation/logs-storage/evidence/acceptance.json). Earlier sections below are historical; their ingress-500 finding is resolved. The remote p07-verification.md remains unchanged.

## Final security, storage and recovery review — 2026-11-14

**P07 BLOCKED; P08 must not begin.** Isolated native TLS/RBAC/collector, snapshot/independent restore, compatible mapping migration/secure rollback, retention eligibility, and bounded tmpfs/pressure-rule fixtures pass. Live logs authentication fails because htpasswd is a directory; live native security, persistent quotas and end-to-end disk-pressure alerts remain unaccepted. All 20 original containers and 11 original volumes are preserved; Quarkus refs unchanged; unexplained Swagger-source drift recorded for review per operator instruction. See the [current detailed report](p07-security-storage-recovery-acceptance.md) and [scoped machine evidence](p07-validation/security-recovery/evidence/acceptance.json). Older sections below are historical and do not establish working live ingress auth or current acceptance.

## Vocabulary tracing follow-up — 2026-11-14

**Vocabulary revision/tracing blocker RESOLVED; overall P07 remains BLOCKED.** Quarkus is aligned to the pinned P06 revision with local work preserved. Seven tracing tests pass. A build-time OTLP enablement defect was fixed in the Vocabulary-only Docker build; only Vocabulary was recreated. 11 probe-matched Vocabulary traces and 1 fresh User traces are stored in Tempo, with deterministic sampling controls passing. All other containers/volumes are preserved and services healthy. See the [current resolution report](p07-vocabulary-tracing-resolution.md) and [current acceptance JSON](p07-validation/evidence/acceptance.json). No further approval is needed for this completed repair. Native auth/TLS/RBAC, hard quota/alarm and isolated restore/rollback gates remain.

## Initial runtime validation (historical)

The initial findings below are retained as evidence. Its Vocabulary mismatch/tracing and no-lifecycle statements are superseded by the follow-up above.

Decision: **BLOCKED**. Local development validation on 2026-11-14 Asia/Bangkok (runtime timestamps 2026-11-13 UTC). No deployment or P08 acceptance is claimed.

The laptop runs Docker context `desktop-linux`, Compose project `jp_learning_dev`, using `D:\japanese-learning\docker-compose.yml` alone. There is no running `jp_dev` project. Existing phase reports stop at P06, whose acceptance was blocked; this checkout contains no prior P07 implementation/report. Current source was assessed against the explicit P07 requirements in `p01-quality-gates.md` and `quality-gates.md`. Other-machine failures were not reused as laptop findings.

At completion, 15 containers run: all 12 with Docker healthchecks are healthy. Fluent Bit's HTTP health is `ok`; Tempo readiness is `ready`; the collector delivers User API traces but has no Docker healthcheck. All five migration/initialization containers exited successfully. Grafana initially timed out healthchecks and Tempo initially returned readiness 503; both recovered without intervention. These were transient observations, not fixes requiring restart.

All 20 Compose configuration hashes match the current rendered base configuration. Fluent Bit configuration, parser, Lua normalizer and OpenSearch configuration copied from their images are byte-identical to source. Bind mount paths match the P05/P06 source layout. These checks do not establish that an application image was built from the intended submodule revision.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Fluent Bit pipeline | PASS | Processed records 551 to 996. Retries remain 27 throughout; errors, failed retries and output/filter drops remain zero. No skipped/truncated line counters. Final HTTP storage snapshot reports zero pending chunks. A transient active chunk appeared during probes and drained. One old 4096-byte physical chunk file remains; no deletion or corruption claim. |
| State and offsets | PASS, diagnostic | Dedicated `jp_learning_dev_fluent_bit_state` mount; all three DB/WAL/SHM copies readable, `quick_check=ok`; offsets and inode metadata recorded. Temporary copies removed. Live offsets never opened or reset. Non-atomic file copies do not prove crash-consistent backup/restore. |
| Logging privacy | PASS, bounded | Synthetic bearer, cookie and query-password markers absent from inspected producer output and 3 correlation-matched OpenSearch documents, including `original`. Correlation presence prevents a vacuous no-ingestion pass. This is not the full historical/rotated/compressed/chunk/exception/outage privacy suite. |
| OpenSearch ingestion | PASS | Probe records searchable; application indices green, enabled ISM assignments on all 12 indices. Cluster yellow with 2 unassigned replicas; shard evidence retained. No index settings changed. |
| Metrics and rules | PASS | User API, Vocabulary API and Prometheus targets up; 48 rules healthy; no firing alerts at snapshot. Native promtool config, rules and unit fixtures pass. |
| Grafana connectivity | PASS | Health 200/database ok. Authenticated datasource checks for `jp-dev-prometheus` and `jp-dev-tempo` both 200/OK. Anonymous datasource and logs UI requests return 401. Initial validator used incorrect UIDs; corrected source and follow-up evidence supersede those 500 responses. |
| User API tracing | PASS | Configured export enabled, ratio 0.1, 10 roots/s cap. 9 User API traces searchable; sample retrieved with allowlisted resource/span attributes and normalized `/unmatched` route. |
| Vocabulary API tracing | BLOCKED | Export enabled and configured ratio 0.1, but no Vocabulary traces after 80 unmatched GETs and 80 GETs to matched `/api/v1/jlpt-levels` (all 401). No successful authenticated cross-service span chain proven. Sampling and authentication/instrumentation boundaries limit inference from request counts. |
| Retention | PASS, configured | OpenSearch 30-day ISM policy and active assignments; Prometheus runtime flags 2d/512MiB; Tempo source retention 24h. No accelerated deletion or expiration test on existing telemetry. |
| Exposure and isolation | PASS, local boundary | All published ports loopback; OpenSearch, collector, Tempo and Fluent Bit not host-published. All 6 networks and 11 volumes project-owned; no foreign members on inspected networks. Logging and tracing storage networks internal. No Docker socket mounts. Host/Docker administrators remain trusted. |
| Native auth/RBAC/TLS | FAIL | OpenSearch security explicitly disabled; security API absent. Unauthenticated internal cluster-health requests succeed. Current HTTP and OTLP links are plaintext; ingress Basic auth/network isolation do not meet P07 native controls. |
| Hard quotas/headroom alarms | BLOCKED | Fluent Bit output queue limited to 1G and monitoring resource limits configured; Docker data filesystem 4% used. Retention/ingestion limits are not hard total-volume quotas. OpenSearch/Tempo/state hard quota and headroom alarm acceptance not demonstrated. |
| Migration/restore/rollback | NOT VERIFIED | No laptop isolated P07 candidate, pre-migration restore, count/ID integrity or secure rollback evidence. Previous computer's Fluent Bit backup failure neither assumed nor reproduced. |
| Role/certificate negative matrix | NOT VERIFIED | No approved P07 role/CA candidate exists for wrong-role, wrong-CA, hostname or expired-cert tests. |

Quarkus is at `d6642616abf0d3373c4ebe1f514d69ec9b669f2a` (P02 merge), while the parent pins `815b637a799cab8009d154ee9c97cec0f1dce734`. The checked-out revision lacks the pinned P06 tracing classes, explicit OTLP endpoint, `service.namespace=japanese-learning` and `service.name=vocabulary-api` configuration. Runtime startup logs also identify `quarkus-service`. This is a confirmed source mismatch and a strong explanation for the missing accepted Vocabulary spans; the precise runtime export failure is not fully proven. Adding only an endpoint would leave namespace/privacy/sampler behavior unverified. Existing local Swagger configuration edits were preserved. The collector metrics endpoint was not reachable from Prometheus; the pipeline is verified through User API delivery, not collector counters.

Safe fixes were limited to validation: discover the actual project; use actual datasource UIDs; distinguish transient readiness recovery from persistent failure; inspect SQLite copies instead of relying on a shell absent in the Fluent Bit image. No application or runtime configuration was changed. Existing Quarkus changes and `import-file/` were left intact.

Required next actions and approvals:

1. Resolve the Quarkus gitlink mismatch while preserving the local Swagger edit and branch work. Review the intended P06 tracing/privacy source before rebuilding. This source mismatch must be addressed before treating P03-P06 prerequisites as accepted.
2. **Operator approval is required before rebuilding/recreating only Vocabulary API** with `docker compose -p jp_learning_dev -f docker-compose.yml up -d --no-deps --build vocabulary-api`, after the source prerequisites above. This does not authorize migrations, database recreation or changes to JWKS. No such command was executed.
3. Prepare concrete P07 auth/RBAC/TLS, secret custody, hard storage budget, dedicated candidate-volume, isolated restore/migration and secure rollback artifacts for review. No existing P07 candidate can currently be approved for deployment. Ask for narrowly scoped lifecycle approval when those artifacts exist. Do not enable security plugins in place on the current OpenSearch data volume. P07's minimal isolated restore prerequisite is still required; recurring P08 backup work has not begun.

All 20 container identities, start timestamps and restart counts were preserved through the final snapshot. No containers were started, stopped, restarted or recreated; no existing volumes/telemetry were deleted; no live SQLite offsets were reset; no application databases or shared JWKS/springboot_project were modified; no commit or push occurred.

Machine-readable evidence: [acceptance](p07-validation/evidence/acceptance.json), [initial/runtime checks](p07-validation/evidence/runtime.json), [corrected checks and SQLite](p07-validation/evidence/followup.json), [matched-route probes and native fixtures](p07-validation/evidence/final-checks.json), [final preservation/config/storage audit](p07-validation/evidence/preservation-final.json), and [SHA-256 evidence manifest](p07-validation/evidence/manifest.json). Failed diagnostic attempts remain visible rather than being rewritten as passes. Scripts are in `p07-validation/`; they use installed Docker tools and harmless GETs, and write only local evidence/temporary diagnostic copies.
