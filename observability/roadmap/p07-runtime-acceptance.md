# P07 controlled runtime acceptance procedure

Current read-only execution update: P07 component sources/settings are active. L1 logging/privacy and T1 .NET gateway/parent/Tempo/log correlation partially PASS; M1 three targets/48 rules PASS as point checks; B1 queue-zero and preserved-state metadata observed but retained8KiB files unresolved; I1 fresh38-container metadata equality PASS (active denial tests not run). Quarkus T1 trace was not retrieved for the unauthenticated401 probe; G1 authenticated datasource/RBAC, DB/client spans, S2/S3/R1/RB1 and historical privacy containment remain open. See current-acceptance-status.json and p07-verification.md. Statements below that no deployed cases ran describe the earlier stage. No maintenance/fault/restart action ran here.

Status: NOT EXECUTED on Docker; deployment and fault/restart tests require explicit separate
approval. Native Windows synthetic tests below do not certify the deployed Linux images,
stored records, Grafana queries, retention or production traffic. Root docker-compose.yml
remains the only Compose source. No shared JWKS or Spring Boot modification is permitted.

## Preparation and authorization gates

1. Run `docker compose -p jp_dev config --quiet` and
   `python observability/roadmap/p07-validation/check_config.py`. Review the full synthetic
   resolved model/effective env decisions privately; do not publish credentials or env dumps.
   Verify expected hashes and no additional Compose file/profile. Preserve P05 rules/datasource
   UIDs,24h Tempo retention, OTLP4317 and externally configured parent-based sampling.
2. Run offline checks listed below. Obtain native exact pinned Linux Fluent Bit parser/plugin
   validation and Linux Tempo verification on separately approved disposable infrastructure.
   Do not use docker-desktop WSL as a host validation environment. No portable Windows Fluent
   Bit validator was obtainable (official4.2.5 package/checksum endpoint403); this is UNVERIFIED.
3. Complete the backlog handoff procedure and independently review actual consistent backup,
   queue/offset/source-boundary ledger and receipt/dedup or deferred-quarantine decisions.
   Confirm sufficient protected source-log retention while the collector is quiesced. No
   handoff evidence, no cutover. No automated replay/delete/reset is allowed.
4. Security/data/platform owners approve stored-data containment, native access/TLS/identity
   design or an explicit development-only exception, quota/headroom/monitoring and isolated
   restore evidence. Native OpenSearch RBAC/TLS remains a critical production gate.
5. Request an explicit service-specific deployment plan/approval with immutable image/config
   hashes, affected services, exact existing mounts, downtime/loss budget and abort/rollback
   criteria. If builds/resources are needed, name them. Never broad up/down/prune, database
   migrations/initializer reruns, replacement state volumes or protected-project changes.
   Selectively recreate only approved services with dependencies excluded under that plan.
   No command in this report constitutes approval or has been executed.

## Evidence contract

Start from p07-validation/runtime-acceptance.template.json in protected evidence storage.
Record UTC start/end, deployment approval, exact versions/hashes, operator/reviewer references,
case ID, PASS/FAIL/BLOCKED, expected vs actual counts and redacted evidence references. Never
store real JWTs, cookies, credentials, bodies or real-user records in repository evidence.
Only synthetic sentinels and dedicated test identities are allowed; dedicated identity or
DB fixture creation itself needs separate approval. Unknown/missing evidence means BLOCKED.

Use fixed nonsecret W3C fixture values per approved isolated run: trace ID
11111111111111111111111111111111, parent ID2222222222222222 and a distinct correlation ID
P07_SYNTHETIC_CORRELATION. Example header:
`traceparent: 00-11111111111111111111111111111111-2222222222222222-01`.
Use a fresh fixture trace ID per run to avoid confusing old stored traces. Repeat with flag00
and distinct trace ID for unsampled-parent behavior. Sentinels are P07_SYNTHETIC_PRIVATE
in test-only attributes/labels/headers; never real tokens. Do not expose extra backend ports.

## Acceptance cases (all require approved deployment/fixtures unless marked offline)

| ID | Reproducible action and observation | Required result / abort condition |
|---|---|---|
| L1 | Submit a counted synthetic request set via the existing gateway to each API using independently chosen correlation/trace headers and reviewed non-mutating/failed-login routes. Capture initial/final producer/tail/output counters and query only the run's safe correlation/time window in OpenSearch through an approved existing access path. | Expected completed/error events and timestamps, service/status/duration/correlation survive; counts reconcile with sampling/rotation/filter decisions. No original/Properties/body/header/SQL/session/free-error sentinel in the whole stored _source, not just indexed fields. Missing/duplicate records block acceptance. |
| L2 | In approved disposable fixtures feed synthetic malformed/unknown producer envelopes and nested token/body/query/exception sentinels through the exact Linux Fluent Bit parser/Lua/output chain. | Drop/allowlist matches offline fixtures; MessagePack numeric/boolean types compatible; filter failure does not forward original. Do not inject private fixtures into real-user log files. |
| M1 | Read existing /api/v1/targets and /api/v1/rules from loopback Prometheus; exercise both APIs with counted read-only synthetic traffic and query P04 metrics. | Three expected jobs UP, P05 rules healthy, essential label dimensions preserved; no cardinality spikes or business behavior change. Verify sample/body limits and no stored exemplars. |
| M2 | Repeat synthetic scrape/relabel scenario in approved exact-image disposable harness with every forbidden label name; query p07_private_total and p07_safe_total. | Private series absent, safe series/labels preserved for all three jobs. Native Windows test already verifies22 label names, but Docker image remains a separate gate. Never add a private-label fixture job to live Prometheus without approval. |
| T1 | Send a sampled W3C context through gateway into user-api and independently vocabulary-api; enable export only under approved external environment settings. Query each exact trace ID in Grafana Explore using jp-dev-tempo. | Backend SERVER span parent equals fixture parent; real HTTP/DB CLIENT children only for actual dependencies, one span per hook, normalized names and error status; existing correlation ID remains independent. Both APIs share namespace japanese-learning. |
| T2 | Repeat parent flag00, malformed/all-zero context, unknown attributes, sensitive event/link/resource/header/query/SQL/exception fixtures on approved harness. Inspect complete OTLP result and stored Tempo trace JSON. | Parent sampling respected; no claim every request traced. Unsafe events/links/attributes/status messages absent, wrong-service resource rejected, trace/span IDs and safe error status retained; no stale context/concurrent leakage or duplicate spans. Native Windows Collector six-in/two-out test already passes, not Tempo storage acceptance. |
| T3 | Evaluate real outbound dependency fetch and cache-hit paths only using approved isolated fixtures. | CLIENT context injection/parentage is correct; cache hit produces no fake HTTP span. There is no User-to-Learning business call today: two separate server roots are expected. Use an approved synthetic HTTP parent/client fixture for cross-stack propagation; do not invent a new business call or change JWKS. |
| G1 | Authenticated Grafana datasource health: GET /api/datasources/uid/jp-dev-prometheus/health and /api/datasources/uid/jp-dev-tempo/health via approved secret/session handling; query a synthetic trace in Explore and P05 dashboard. Check unauth /api/datasources and viewer/editor/admin denial matrix. | Both internal datasource URLs/UIDs work, dashboards/rules retained, anonymous denied; least-privilege and session/cookie behavior documented. Credentials stay out of CLI history/repository. Trace-to-metrics works only for actual existing metric names; trace-to-logs is not configured/claimed. |
| S1 | Measure volume/free filesystem bytes, actual ingestion growth and native write-rejection counters over an approved representative interval; verify effective ISM attachments, Prometheus retention flags, Tempo config/compactor state. | Approved budgets/headroom and independent70/85/90 pressure alerts; actual bytes/rate, not estimated capacity. ISM policy existence alone is not attachment/deletion success. Retention is not a filesystem quota. |
| S2 | Observe approved synthetic records age beyond normal30d OpenSearch/2d Prometheus/24h Tempo windows plus native grace/compaction; alternatively demonstrate mechanisms only in separately approved disposable harness. | Record native purge/compaction evidence and untouched protected data; shortened fixture retention is a mechanism test, not proof of live retention. Never accelerate live expiry or delete records for a test. |
| S3 | Inject bounded outage/ENOSPC/quota pressure ONLY on approved disposable clone/harness; do not fill live host disk. | Retry/drop/refusal behavior, integrity and capacity recovery quantified. Warn70%, critical85%, emergency90% or native write rejection trigger owner response; no unbounded memory/disk; no silent-loss claim. |
| B1 | At approved cutover compare protected state hashes, byte/file counts, ledger, source inodes/offsets, memory/inflight receipts and later output counts. | Same fluent_bit_state volume/DB paths; no legacy chunk overwrite/delete/replay, unknown source files accounted, lost/deferred/duplicate counts explicit. Quarantine is retained/deferred, not delivered. |
| R1 | Separately approve one service restart/recovery at a time or run on disposable exact-image harness; preserve mounts and capture pre/post IDs/counters/synthetic receipts. | Count expected memory-queue loss and offset continuation; retained source data/chunks unchanged. Confirm no initializer/migration or springboot resource lifecycle. No exactly-once guarantee inferred from restart success. |
| I1 | Compare selective before/after identities/networks/ports/mounts for both projects; from approved probes test expected allows and denied cross-project/host access without new published ports. | Only approved jp_dev services change, loopback/internal boundaries hold, protected project unchanged. Docker metadata alone is not an active network-denial test. |
| RB1 | Rehearse source-hunk reversal and privacy-safe recovery on a disposable consistent copy; reconcile post-cutover receipts/offsets before restoring any state. | Preserve original volume/archives, forbid old raw backlog fallback and offset rewind; no data deletion. Unknown partial success or rollback exposure blocks acceptance. |

## Offline commands already executed in this continuation

```powershell
python observability/roadmap/p07-validation/check_config.py
python observability/roadmap/p07-validation/test_backlog_handoff.py
python observability/roadmap/p07-validation/test_security.py
python observability/roadmap/p07-validation/test_collector_native.py
python observability/roadmap/p07-validation/test_prometheus_native.py
docker compose -p jp_dev config --quiet
```

Collector loopback dependencies are pinned in requirements-native.txt under ignored .local;
no system service installation or Docker resource is used.9 handoff tests and16 privacy
fixtures (including229 original Lua assertions) PASS; native Collector synthetic privacy,
native Prometheus relabel/isolated TSDB and Tempo config.verify PASS. Fluent Bit native
plugin compatibility, exact Linux images and all deployed/stored-data cases remain open.
Earlier151 .NET/372 Java/42 promtool results remain historical, not new executions here.

## Abort and completion

Abort acceptance on any unexpected secret, chunk loss, duplicate discrepancy, offset reset,
public listener, wrong-project mutation, backend integrity failure or unaccounted queue.
Do not auto-rollback into old raw filters/backlog. Use the approved containment/recovery plan
and preserve all evidence/state. Only after every applicable case passes and owners sign
may runtime acceptance change from BLOCKED. P08 is not part of these procedures.

Probe implementation note: public-boundary samplers apply the configured ratio even for remote flag01. Positive trace IDs must lie below the threshold (prefix01 for current0.1 ratio), without changing runtime sampling. Tempo JSON serializes IDs as base64; compare decoded bytes with W3C hex. High random IDs were inconclusive initial probes, not exporter failures. Authenticated401-path coverage alone cannot establish DB/client spans or successful Learning API export.
