# P07 laptop runtime drift and safe deployment plan

> Current closure: **P07 PASS with approved development-only strict-quota exception**. Durable synthetic backup/restore, rollback and accelerated native expiry passed; see [current verification](p07-laptop-verification.md). Earlier BLOCKED statements below are historical checkpoints.

> Fresh deployment supersedes earlier runtime/storage locations below. See [current laptop verification](p07-laptop-verification.md): 16 running, 13 healthy, five jobs successful; native OpenSearch TLS/RBAC and authenticated local notifications pass. Persistent quotas and durable recovery/elapsed retention remain acceptance blockers.

2026-11-14. `develop` at `5c53cb963ca29c5e9c8626fbb456dbae7c13b7d3`; project `jp_learning_dev`. **Assessment/planning only: no deployment approved or performed. P07 remains BLOCKED; P08 must not begin.** The remote P07 report is retained unchanged; this report is laptop-specific.

## Exact scope and classification

| Service | Classification | Actual meaningful difference | Recreate for full root alignment? | Image requirement |
| --- | --- | --- | --- | --- | --- |
| `fluent-bit` | security-critical, storage-related, observability-related | Baked privacy filter, JWKS spool path, disk→memory queue, retry/EOF semantics | Yes | Verified new P07 artifact/build required |
| `prometheus` | security-critical, storage-related, observability-related | Private-label drops/exemplars0 plus query limits;48 rules unchanged | Yes | Reuse cached exact image; no build |
| `grafana` | security-critical, observability-related, harmless | Strict cookies, Gravatar off, session limits; identical provisioning move | Yes | Reuse cached exact image; no build |
| `otel-collector` | security-critical, observability-related, storage-related | Service/link filtering, tighter attribute/scope normalization,16 streams | Yes | Reuse cached exact image; no build |
| `tempo` | observability-related, storage-related, harmless | Query concurrency/timeouts/expression/retry limits;24h unchanged | Yes | Reuse cached exact image; no build |
| `user-api` | storage-related, observability-related | Unbounded json-file→local10m×3 | Yes | Reuse cached exact image; no build |
| `vocabulary-api` | storage-related, observability-related | Unbounded json-file→local10m×3 | Yes | Reuse cached exact image; no build |
| `gateway` | storage-related, observability-related | Unbounded json-file→local10m×3 | Yes | Reuse cached exact image; no build |
| `frontend` | storage-related, observability-related | Unbounded json-file→local10m×3 | Yes | Reuse cached exact image; no build |

Exactly nine services have meaningful drift. All nine need eventual recreation to adopt the current root model. Eight need no new image. Fluent Bit needs a verified P07 image; simply recreating its currently cached old image would leave the old baked config active. A config-path relocation with identical files alone is harmless, but Grafana also has four effective security changes, so its recreation is still required.

## Detailed differences and effects

### fluent-bit

- Baked config/Lua change to fail-closed allowlisted output; arbitrary original/rendered/exception payloads no longer forwarded
- JWKS input /logs/jwks/*.log -> /logs/jwks/spool/*.log; populated spool exists and old root file remains
- Filesystem chunk storage and infinite retries -> memory inputs, 8MiB each, Retry_Limit3; no storage.path; Grace30s ->10s; Read_from_Head On ->Off
- Same /state/jwks.db,user.db,vocabulary.db and named state volume; legacy /state/buffer retained but not replayed; compatibility env1G no longer caps these memory queues

Image: Existing cached tag is the old image. Full P07 adoption requires a separately supplied/verified P07 image or an approved collector-only build; no build performed.

State/downtime: Highest risk: unknown legacy delivery/ack state, durable-buffer removal, bounded retry loss, memory loss on restart, and new spool files starting at EOF. Preserve original buffers and offsets; counted handoff/consistent snapshot and explicit unread-spool disposition required.

### prometheus

- Config bind p05-candidate/prometheus -> p07/prometheus
- 22 private-label drop rules on each of 3 existing jobs; app scrapes explicitly PrometheusText0.0.4; label-name limit80; exemplar storage0
- New query timeout15s, max concurrency4, max samples5,000,000, rule eval concurrency2
- Same scrape targets, global timing, 48 byte-identical recording/alert rules, 2d/512MiB block retention

Image: No build/pull needed; exact cached platform manifest matches running image.

State/downtime: Reuse jp_learning_dev_prometheus_data. WAL replay, head/compaction temporary disk, scrape/rule gap and intentional rejected private series. Existing TSDB private history is not sanitized by future scrape filters.

### grafana

- Provisioning bind p06 -> p07; all 3 provisioning files byte-identical (harmless path relocation)
- Effective cookie SameSite lax ->strict, Gravatar false ->disabled, inactive lifetime7d ->4h, maximum lifetime30d ->7d
- Explicit new-user org roleViewer and allow_embedding=false already equal effective current settings (harmless explicit defaults)
- Same datasource UIDs/URLs, dashboards, image, admin credential settings and SQLite state volume

Image: No build/pull needed; exact cached platform manifest matches running image.

State/downtime: Reuse jp_learning_dev_grafana_data; same version, but provisioning can update SQLite rows and stricter cookie/lifetime controls can require re-login. Defaults do not retroactively downgrade existing accounts or prove a full Viewer/Editor/Admin role matrix.

### otel-collector

- Config bind p06/collector.yml ->p07/collector.yml
- Only user-api/vocabulary-api namespace spans accepted; link-bearing spans rejected; events removed
- Resource allowlist narrows to service/name/namespace/environment; service version/instance and http.route removed; instrumentation scope/method/error/attribute values normalized
- max_concurrent_streams16; memory/batch/queue64 requests and30s retry window remain; OTLP transport still plaintext/internal

Image: No build/pull needed; exact cached platform manifest matches running image.

State/downtime: No persistent collector queue. Restart loses unaccounted memory/inflight spans; privacy filtering intentionally drops unsupported spans/fields. Preserve required Docker diagnostic logs before old container replacement.

### tempo

- Config bind p06/tempo.yml ->p07/tempo.yml
- Explicit querier concurrency4; search/trace lookup timeout10s; frontend API timeout15s; expression limit16384B; max retries1; multi-tenant queries/MCP disabled
- Same24h trace retention, local WAL/blocks, OTLP endpoints, ingestion/per-trace limits; comments/phase labels are harmless

Image: No build/pull needed; exact cached platform manifest matches running image.

State/downtime: Reuse jp_learning_dev_tempo_data; in-memory ingestion, WAL recovery/flush/compaction and queue outage windows must be accounted. Query limits can reject long/expensive requests; not a disk quota.

### user-api

- Docker logging json-file with no rotation options -> local max-size10m/max-file3
- No application-image, JWT/DB, source env or API behavior change required for this drift

Image: No app rebuild needed. Cached OCI platform manifest exactly matches running app despite different index/attestation IDs.

State/downtime: Single-instance request interruption; reuse user_api_logs and read-only signing-key binds, no DB migration. Old Docker log history/writable layer replaced; transient Data Protection/tmpfs state not preserved.

### vocabulary-api

- Docker logging json-file with no rotation options -> local max-size10m/max-file3
- Current verified tracing image can be reused; APP_OTEL_EXPORT_ENABLED build argument stays true; no Quarkus rebuild or Swagger/source change required

Image: No app rebuild needed. Exact cached platform manifest matches running app; do not use --build for a log-driver change.

State/downtime: Single-instance request/inflight work interruption; reuse vocabulary_api_logs and existing MySQL service unchanged. No Flyway/init work or offset/DB reset.

### gateway

- Docker logging json-file with no rotation options -> local max-size10m/max-file3
- Same pinned NGINX image/config/ports/networks; upstream DNS already refreshes with10s resolver

Image: No build/pull needed; exact cached platform manifest matches running image.

State/downtime: Brief gateway interruption; graceful stop75s still not zero downtime. Docker stdout history and tmpfs state are transient; no named data volume changes.

### frontend

- Docker logging json-file with no rotation options -> local max-size10m/max-file3
- Same cached UI image/config and gateway dependency; no Angular build required

Image: No app rebuild needed; exact cached platform manifest matches running image.

State/downtime: Brief frontend/static proxy interruption; writable/tmpfs and Docker stdout history replaced; no application database state touched.

## Identity and source checks

All nine current cached linux/amd64 platform manifests match the corresponding running manifests. Local application OCI index IDs differ because indexes/attestations are not the same object as a platform manifest; the image-content check used the local containerd OCI index and exact platform digest, not naive tag/index comparison. This permits no-build reuse **only while those tags still resolve to the recorded manifests**. Recheck at approval/execution time. No image save/export, pull, build, tag mutation or new container was used in this assessment.

The standalone pinned Fluent Bit base reference is absent from the Docker image store; nginx base is cached. Existing custom image/BuildKit may contain reusable Fluent Bit layers, but this is not proof a new collector build can run offline or within a particular incremental disk budget. The active custom collector is about47.8MB by image metadata; that is not an estimate of all build/import/cache/startup headroom.

Grafana effective admin settings were read using existing credentials in memory: Viewer/embedding=false already match; SameSite=lax, Gravatar=false, inactivity7d and lifetime30d differ from strict/disabled/4h/7d. Existing users are not demoted by the new default-role setting. No credential/role was changed. All three provisioning files are byte-identical.

P07 Prometheus adds22 private-label dropping rules to each of3 existing jobs, app text protocol pinning, label-name length80 and exemplar storage0. Existing target names/global intervals/sample limits, 2d/512MiB retention and the48 rule file are unchanged. Sensitive labels cause whole affected series to be intentionally dropped; this is a privacy change, not a promise to preserve all series. Historical TSDB samples are not rewritten.

JWKS metadata only: 1 matching root log and 1 matching spool log exist. The spool is populated and newer than the root file. No records/keys were read and no JWKS source, image or container was modified. The new spool path plus Read_from_Head Off requires explicit treatment of unread historical content, not a zero-loss claim.

## Persistent-state and replacement hazards

All nine desired persistent volume names/destinations match their existing named mounts; no new empty state volume or database is proposed. Current volumes include fluent_bit_state, prometheus_data, grafana_data, tempo_data and API log volumes under the jp_learning_dev prefix. SQL Server/MySQL and migration jobs are dependencies, not deployment targets.

Volume identity is not the whole state model: replacement removes the old container, its writable layer and Docker-driver log history. All nine containers have diagnostic/stdout history; preserve anything required in protected storage before replacement. App file-log volumes do not prove they duplicate every stdout record. Tmpfs/cache/process state is lost; User API Data Protection keys in tmpfs may regenerate, while its readonly JWT PEM binds and database remain unchanged. Prometheus WAL/head/compaction, Tempo WAL and Grafana SQLite provisioning can write/recover on startup. No retention/quota guarantee or zero-downtime claim follows from keeping volumes.

Docker requires container recreation to change log drivers; `compose restart` does not apply new Compose configuration. See [logging-driver behavior](https://docs.docker.com/engine/logging/configure/) and [restart behavior](https://docs.docker.com/reference/cli/docker/compose/restart/). No daemon-wide logging change is proposed.

## Disk gate

C: currently has **6.39GiB free**, below the proposed10GiB critical reserve; D: has 170.17GiB free. Existing backing-VHD measurement and storage review remain in p07-logs-ui-storage-verification.md. Do not infer physical reserve from the roughly1TiB virtual filesystem. No-build recreations reuse cached layers, so full image sizes should not be added as required new space; however writable layers/log captures/SQLite/WAL/compaction/recovery and rollback custody require nonzero headroom and unmeasured peaks.

Recommend an approved physical-capacity/reserve solution before any wave, and no collector build on the current C: reserve. A limited no-build maintenance window would still need explicit measured capacity-risk acceptance. This task did not move/compact/resize data, clear cache, prune, delete volumes or modify Desktop settings.

## Minimum gated sequence (NOT EXECUTED)

### Stage 0: Pre-deployment stop gates

Targets: none; prerequisites/acceptance only. Status: BLOCKED.

- Raise/secure physical backing-store reserve or obtain explicit measured no-build capacity-risk acceptance; C is currently below proposed10GiB critical reserve
- Approve exact target services, interruption window and required old Docker-log/writable-state capture; source/image hashes must still match this assessment
- Review exact candidate native validation evidence; no unsupported config/schema claims; preserve old immutable image refs and compatible secure rollback artifacts
- Do not start initializers, migrations, databases, shared JWKS or springboot_project; root Compose only and --no-deps everywhere

### Stage 1: Independent no-build monitoring/privacy wave

Targets: `prometheus` -> `tempo` -> `otel-collector` -> `grafana`. Status: AWAITING_SEPARATE_APPROVAL_AFTER_STAGE_0.

- One service at a time; Prometheus first preserves target/rule visibility before later steps
- Tempo before Collector (downstream before upstream); independently verify /ready because running is not readiness
- Bounded collector queue/retry window is30s; no-loss requires counted drain/producer quiescence. Approve/measure unavoidable single-instance gaps; do not assume restart finishes within retry window
- Collector validation must include successful sanitized ingestion and sampling-aware IDs, not just running state; no Docker healthcheck exists
- Grafana last, after Prometheus/Tempo readiness; verify actual authenticated datasource health and cookie/session behavior

### Stage 2: Collector build/artifact and backlog handoff

Targets: `fluent-bit`. Status: BLOCKED_ARTIFACT_AND_HANDOFF.

- Obtain separately approved P07 collector image build/load under disk budget; existing tag contains old baked config. Retain exact old image refs; no unreviewed tagging or pull/build implicit in up
- Standalone pinned Fluent Bit base reference is not present in image store; BuildKit layer reuse possible but offline/no-download build not proven
- Quiesce under an approved producer/source continuity window; capture consistent whole state/source boundary, offsets, memory/inflight and item acknowledgements
- Retain legacy chunks; decide reviewed quarantine/deferred delivery or reconciled sanitized delivery. No replay, zero-loss claim, discard, offset reset or Read_from_Head override
- Account unread JWKS spool records; known populated new path with no established DB rows will start at EOF
- Verify candidate schemas, permissions, exact baked hashes and count/ID continuity on approved disposable copies before touching sole live state; future raw collection only after explicit handoff approval

### Stage 3: Storage-only application/proxy wave

Targets: `user-api` -> `vocabulary-api` -> `gateway` -> `frontend`. Status: AWAITING_SEPARATE_APPLICATION_INTERRUPTION_APPROVAL.

- Prefer after new Fluent Bit sanitized pipeline/handoff is accepted, so startup telemetry uses the reviewed pipeline
- Order user-api then vocabulary-api then gateway then frontend; validate each readiness and critical read-only routes before next
- Reuse exact inspected cached app manifests, no --build or pulls. Recheck tags immediately before approval/execution
- --no-deps prevents SQL Server/MySQL/Flyway/JWKS or dependent service lifecycle; do not rerun initialization jobs
- Archive required Docker log history under approved custody first; Compose replacement removes old container and its log/writable layer history even though named volumes survive

### Stage 4: Final acceptance

Targets: none; prerequisites/acceptance only. Status: NOT_AUTHORIZED.

- Compare all unrelated original IDs/start times/restarts/mounts/networks and all volume identities; demonstrate only explicitly approved services changed
- Validate privacy rejection and native limits without altering existing telemetry; retain historical data separately and do not claim future filters sanitized old records
- Close native backend access/TLS/RBAC, durable quotas/reserves/alerts, retention behavior and real recovery/handoff gates; require owner decisions/sign-off
- No automatic rollback to raw legacy collector/backlog or weaker privacy controls; preserve evidence and stop acceptance on unaccounted records/errors. P08 remains out of scope

Use this exact command shape only after service-specific approval and all applicable gates are satisfied:

```powershell
docker compose -p jp_learning_dev -f docker-compose.yml up -d --no-deps --no-build --pull never --wait --wait-timeout 180 <one-approved-service>
```

Full topological target order: **prometheus -> tempo -> otel-collector -> grafana -> fluent-bit -> user-api -> vocabulary-api -> gateway -> frontend**. This is9 replacements total, not nine commands to run now. Prometheus is independent of the trace backend; Tempo precedes Collector, Grafana depends on healthy backends. Fluent Bit must pass artifact/handoff gates before the application startup wave. APIs precede gateway, gateway precedes frontend. Gateway DNS refresh is already configured; that reduces stale-upstream risk but does not promise uninterrupted requests.

`--no-build` prohibits implicit application/collector builds; `--pull never` forbids implicit downloads; `--no-deps` prevents initializer/database/JWKS/dependency recreation. Do not use a blanket up, down, --build, --force-recreate, --always-recreate-deps, --remove-orphans or volume-renewal flags. The current cached Fluent Bit tag is **not** a P07 artifact, so its command is blocked until an approved candidate replaces the reference after old artifact preservation. The root Compose file remains the sole deployment topology; no overlay was created. See [Compose up semantics](https://docs.docker.com/reference/cli/docker/compose/up/).

`--wait` checks running/defined healthchecks, but Tempo and Collector have no Docker healthcheck here. Require independent Tempo readiness and Collector-to-Tempo sanitized ingestion evidence; a running state is insufficient. For each step also check bounded errors, expected data/IDs/counters, all unrelated container starts/IDs/mounts, and no unexpected published listener. Stop at the first unaccounted loss, schema/permission failure, secret exposure or image/source change. Do not automatically roll back to weaker privacy filters or raw backlog replay.

## Services deliberately excluded

`logs-ui`, `opensearch`, `opensearch-dashboards`, `mysql`, `sqlserver`, `jwks-api`, `logging-init`, `logging-ui-init`, `sqlserver-init`, `flyway-user`, `flyway-vocabulary`. The passed logs-ui auth repair stays in place. No shared JWKS or springboot_project action, application DB recreation, Flyway/init job, OpenSearch bootstrap, retention change or index-template migration is part of this nine-service plan.

## Remaining acceptance requirements

- **backendSecurity**: Native store auth/RBAC/TLS, verified collector/Dashboards trust, secret/CA/rotation owners, denial matrix and historical data custody. Nine-service alignment does not implement these.
- **storageQuota**: Reviewed durable per-store budget/enforcement and independent host backing reserve. Retention, queue limits, query caps and logging rotation are not hard persistent quotas.
- **diskPressureAlerts**: Actual filesystem metric collection, warning/critical/emergency rules, missing-metric detection and tested notification destination. Existing48 rules remain identical and cannot establish disk monitoring.
- **recovery**: Consistent protected state/source snapshot, restored counts/IDs/schema and role integrity, acknowledgement/offset ledger, unread/spool/buffer disposition, compatible readers and privacy-safe rollback. Synthetic tmpfs tests do not satisfy durable real-data recovery.
- **retention**: Observe actual attachments and effective policies; prove expiry/compaction mechanism on appropriately approved fixtures without purging existing telemetry; include grace/overhead.
- **runtimeRisk**: Single-instance downtime, finite memory/retry loss and transient key/cache state must be approved/accounted. No zero-downtime/lossless guarantee.

The unmounted P07 OpenSearch settings/template files are proposals, not an installed policy or native security implementation. Recreating the nine listed services does not apply them or enable backend TLS/auth. An OpenSearch/Dashboards native-security migration needs its own isolated persistent candidate, access matrix, trust and compatible reader/rollback review; never enable plugins blindly against the live data volume.

## Approval boundary

No deployment is recommended to proceed immediately. Obtain separate explicit approval for (1) the four-service no-build monitoring wave after capacity/log-custody/rollback checks, (2) a P07 collector image build/load and counted state handoff, and (3) four application/proxy interruptions with unchanged images and no DB/init work. A blanket nine-service approval is not an adequate response to unresolved artifact/backlog/capacity gates. This assessment stops here; no lifecycle/build/storage action has been issued. No commit, push or P08 work occurred.

## Evidence

[Machine-readable plan](p07-validation/deployment-planning/evidence/deployment-plan.json), [current runtime/image/config assessment](p07-validation/deployment-planning/evidence/runtime-assessment.json), [physical headroom](p07-validation/deployment-planning/evidence/host-space.json), [source preservation](p07-validation/deployment-planning/evidence/source-preservation.json). Existing laptop auth/tracing/recovery evidence remains scoped to its recorded state and was not unnecessarily repeated.
