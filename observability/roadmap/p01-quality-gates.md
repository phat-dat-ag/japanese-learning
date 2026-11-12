# P01 quality gates for P02-P11

Authoritative replacement for future acceptance requirements in the P00 [quality-gates.md](quality-gates.md). This is gate design, not execution or permission to deploy. [Contract](p01-observability-contract.md) supplies schema/privacy/security and R01-R15 objective IDs. [Plan](p01-implementation-plan.md) supplies dependencies, runtime blocker and permitted source-only progression.

## Status and progression rules

Each phase records separate source, isolated-runtime and target-environment results. Each check uses exactly:

- **PASS**: required test executed against named candidate/environment and expected result met; state evidence scope.
- **FAIL**: executed check contradicted its criterion; include observed result and remediation.
- **NOT VERIFIED**: not executed, inaccessible, stale evidence or unsupported claim. Never equivalent to PASS.
- **BLOCKED**: prerequisite/critical check prevents execution, acceptance or dependent deployment; name blocker and owner.
- **NOT APPLICABLE**: reasoned scope exclusion approved by reviewer, not a shortcut for missing evidence.

Source review can PASS while runtime remains NOT VERIFIED. With Docker unavailable, authorized source-only implementations and unit/fixture work can proceed as candidates after relevant design prerequisites; no integration run or phase-wide runtime acceptance. A phase may advance independent source/design work with a linked unknown, owner, risk and closure phase, but dependent behavior cannot be accepted/deployed until required runtime checks PASS. Source changes do not imply permission to touch protected resources. Critical FAIL or NOT VERIFIED involving data integrity, auth/authz, shared JWKS compatibility or persistent resource safety makes dependent deployment BLOCKED. These cannot be waived as routine risk acceptance. Noncritical unknowns require written owner disposition, due gate and a truthful limited result; P11 cannot label an unverified production control PASS.

Universal prohibitions: do not alter jp_dev/springboot_project containers, existing volumes/databases/keys/telemetry, pre-existing work, Git branches or Spring Boot resources. No commit/push/submodule update by implication. Faults, writes, load and lifecycle tests use separately authorized manifest-owned disposable resources only. No secret/environment dumps, full Docker inspect, real notifications, migrations or mutating existing verification scripts without scope review.

## Mandatory evidence bundle and shared gate

For each phase/check record: unique check ID, expected/actual, status/reason, UTC time, operator/tool version, environment/project/run ID, parent/submodule/index/working SHA and dirty-state, candidate image digests/config hash without secrets, commands, test workload/duration, artifact path/checksum, privacy screening, owner/approval, blockers, rollback steps/results and protected-resource before/after identities. Source-derived fixture evidence must say source-derived; do not call it captured runtime. A phase exit needs every applicable criterion with environment-qualified status.

Before ANY future shared JWKS edit, first read both parents metadata and relevant source/config, record drift and dirty state, classify effects and name owners under [governance](shared-jwks-governance.md). If second project is inaccessible, evaluation NOT VERIFIED and shared edit BLOCKED until it can be evaluated. Read-only evaluation is not permission to resume Spring Boot Phase 6B. A candidate change requires separately approved isolated scope, no overwrite of dirty parent trees, dual-consumer contract/auth/listener/privacy tests, immutable candidate identity, both reviews, and independent adoption/rollback decisions. Without authorized Spring Boot tests, shared release remains BLOCKED; local adapters may proceed without changing shared code.

## P02: Structured Logging & Correlation

- **Preconditions:** P01 design accepted; privacy/identity/event registries reviewed; runtime safety prerequisite for any integration run.
- **Required source inspection:** SerilogConfiguration, SafeJsonFormatter, SafeExceptionDetails, CorrelationIdMiddleware, MediatR LoggingBehavior; Quarkus ApplicationJsonFields/StructuredLog/OperationLog/CorrelationIdFilter/RequestTraceFilter; JWKS encoder/filter read-only; gateway and frontend log formats; normalize.lua and mappings.
- **Allowed modifications:** Japanese .NET/Quarkus logging helpers, tests and safe Nginx log format only after separate P02 authorization; versioned adapter/fixture design; remove unapproved identifiers from newly emitted events. Shared JWKS remains read-only unless both-parent evaluation and candidate authorization are complete.
- **Prohibited modifications:** No auth logic, JWT/JWKS contract/header changes, DB changes, automatic gitlink update, logging backend replacement or tracing exporter enablement.
- **Required tests:** Native-to-canonical fixtures for five producers; malformed/duplicate/missing IDs, timestamp/units/types, event ownership, secret sentinels, no raw-path fallback, async cancellation and concurrent context isolation; preserve existing business outcomes and legacy searches.
- **Runtime verification:** Isolated HTTP success/401/403/validation/5xx/disconnect through proxies and APIs; actual emitted JSON and one terminal summary per service; no auth/body/status regression; not a protected-project request load test.
- **Security verification:** All new output and rendered/native copies pass sentinel gate; no UserId/peer personal data by default; legacy header semantics unchanged.
- **Persistence verification:** No original indexes/state touched; isolated file rotation outputs retained for inspection; mapping additions preserve old readers.
- **Cross-project assessment:** Before any shared JWKS source edit evaluate both parents; without approved dual-stack candidate scope leave it untouched, test adapters against source-derived fixtures and mark shared runtime result NOT VERIFIED.
- **Rollback plan:** Restore previous formatter/config/adapter and query version from recorded artifacts without resetting unrelated files; verify reader compatibility and no privacy regression.
- **Acceptance criteria:** All static fixtures PASS; isolated request/auth/privacy/context checks PASS before deployment; shared gate required for shared candidate. Partial local-only work is not whole-phase PASS.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P03: Log Collection & Rotation Reliability

- **Preconditions:** P02 producer/adapter contract accepted; isolated manifest and approved R04-R08 workload/loss/drain budget.
- **Required source inspection:** fluent-bit.conf/parsers/normalize.lua, collector image, bootstrap.py, all three producers rotation/archive paths, Docker log sources and volume mounts.
- **Allowed modifications:** Existing collector/parser configuration and tests; reliable rotation handoff and explicit drop visibility; reviewed safe proxy log inputs. Reuse persistent offsets and bounded buffers.
- **Prohibited modifications:** No protected tail DB resets, log/volume deletion, live index rewrite, daemon logging changes or unbounded retries/buffers.
- **Required tests:** Sequence-count fixtures for rotation/compression, collector unavailable 15m candidate, restart/replay, long/oversize lines, malformed JSON, queue overflow, retry and duplicate accounting; privacy-filtered events counted separately.
- **Runtime verification:** Only disposable source logs/state/search volumes; verify searchable counts after approved drain, offsets survive collector restart, bounded storage/CPU, and visible drops under forced overflow.
- **Security verification:** No credentials/original payloads retained in diagnostics/state; collector lacks Docker socket, log volumes read-only; authenticated path where required.
- **Persistence verification:** Compare event IDs/counts and offset recovery before/after restart; no skipped archives or undocumented replay; protect existing state format and retention.
- **Cross-project assessment:** Local collector changes generally Japanese only; any JWKS file-format/layout producer edit triggers dual-project gate.
- **Rollback plan:** Restore prior image/config with compatible preserved offset/state; rehearse rollback on candidate state clone; report duplicates instead of deleting evidence.
- **Acceptance criteria:** R04-R08 approved test criteria PASS, including measured loss/duplicates and bounded capacity; exact archive limitations documented and resolved or deployment blocked.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P04: Application & Dependency Metrics

- **Preconditions:** P01 contract and P02 identity/route/privacy mappings accepted; resource inventory and exporter permissions available.
- **Required source inspection:** .NET ApplicationMetrics, Quarkus ApplicationMetricsFilter/pre-registry match-patterns, JWKS MetricsConfiguration/listener, Prometheus jobs, dashboard queries, actual DB/pool/gateway/collector APIs.
- **Allowed modifications:** Missing bounded application/dependency/infrastructure metrics, private targets and least-privilege exporters only when native coverage insufficient; name manifest captured before rules.
- **Prohibited modifications:** No SQL query logging, application JWT scrape credentials, public metrics, contract-changing JWKS listener edit, duplicate registries or invented exported metric names.
- **Required tests:** Parse actual exposition; type/unit/bucket/label checks; 10000 unknown-path synthetic cardinality test; route fixtures including quiz/admin/grammar; cancellation/in-progress decrement; client JWKS fetch vs cache distinctions.
- **Runtime verification:** Isolated targets UP with verified names; DB/pool, gateway, JWKS fetch/availability, collector, storage, Prometheus/Grafana coverage; approved series/headroom budgets; denied external reachability.
- **Security verification:** Least-privilege read-only DB accounts; no tokens/IDs/URLs/SQL in labels; verify unauthorized scrape/ingress behavior and no extra listeners.
- **Persistence verification:** Metrics collection does not mutate DBs; persistent TSDB survives isolated restart; no old metric/query break without compatibility bridge.
- **Cross-project assessment:** JWKS connector/source changes require both-parent gate; enabling a Japanese private scrape still needs shared configuration impact evaluation.
- **Rollback plan:** Restore prior target/instrument/exporter config and recording/query mappings; remove only disposable candidate resources; maintain existing metric series interpretation.
- **Acceptance criteria:** Verified metric-name/coverage manifest and all selected targets/privacy/cardinality/unit tests PASS; no missing critical dependency telemetry hidden as zero.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P05: Early Alerting & Capacity Budgets

- **Preconditions:** P03 and P04 runtime gates PASS; approved R01-R09/R14-R15 evaluation choices, owners and test notification destination.
- **Required source inspection:** Actual metric manifest, existing dashboard queries, Prometheus rule/alert config and Grafana provisioning; discover existing rules before adding any.
- **Allowed modifications:** Minimal owned availability/error/latency, no-data, collector drop/queue/disk, DB saturation and storage alerts; one justified rule/notification engine using existing stack where possible.
- **Prohibited modifications:** No messages to real recipients without explicit authorization; no five-minute pending critical rule claimed as two-minute detection; no duplicate notification engines without requirement.
- **Required tests:** Rule fixtures for normal/fault/low-traffic/no-data/stale/counter-reset/recovery; threshold boundaries; routing/dedup/silence expiry.
- **Runtime verification:** Isolated fault -> pending -> firing -> delivered -> cleared -> resolved timestamps using approved test sink; R14/R15 timing and meaningful runbook links.
- **Security verification:** Notification payload excludes secrets/identifiers; receiver credentials protected; alert administration authorized.
- **Persistence verification:** Rules/contact config reproducible from source; candidate alert state/restart behavior documented; no deletion of existing alerts or telemetry.
- **Cross-project assessment:** Local routing only; changes to shared JWKS metric meaning/name require dual-parent evaluation; no Spring Boot alert integration by implication.
- **Rollback plan:** Restore previous rule/contact config; preserve coverage; only explicit bounded expiring silence; validate notifications after rollback.
- **Acceptance criteria:** All critical availability/collector/storage delivery and recovery tests PASS; approved thresholds recorded; unverified delivery blocks alerting acceptance.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P06: Cross-Stack Distributed Tracing

- **Preconditions:** P02, P04, P05 runtime acceptance; trust-aware sampling and backend/queue/storage budget approved; security minimums from contract applied.
- **Required source inspection:** Existing Activity/HttpClient/SQL instrumentation and Quarkus OTel/OIDC/reactive DB/Boot observations; SDK/semantic-convention versions; proxy header forwarding and async boundaries.
- **Allowed modifications:** Only missing SDK/hooks and justified private collector/trace store; log-to-trace links; approved sampling/resource identity; reuse existing instrumentation.
- **Prohibited modifications:** No JWT/key/cache semantics changes, public exporter/store, baggage, raw DB statements, duplicate automatic/manual spans or unbounded export queues.
- **Required tests:** Valid/invalid/duplicate context, all-zero IDs, legacy X-Trace-Id separation, sampled/unsampled and untrusted sampled inputs, async concurrency, cache vs real fetch spans, exporter failure/privacy fixtures.
- **Runtime verification:** Isolated gateway -> each API -> JWKS plus supported DB parent chains; exporter outage does not change API/auth behavior; finite queue/drain/drop evidence and approved overhead.
- **Security verification:** No secret/PII/span-header leakage; verified destination TLS/auth as required; bounded public sampling; no trust from caller headers.
- **Persistence verification:** Trace retention/quota enforced on dedicated volume; queue/store restart behavior measured; no protected telemetry migration.
- **Cross-project assessment:** Any shared JWKS code/dependency/propagation change requires both independent consumer runs and owners approval; otherwise no shared edit.
- **Rollback plan:** Disable candidate exporter/instrumentation independently; restore prior context/log behavior and backend mappings; retain compatible data and diagnose bounded drop.
- **Acceptance criteria:** Correct single-hop spans, sampled/unsampled log links, unchanged JWT behavior, privacy and exporter-down tests PASS; component selection/budgets must be explicit.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P07: Telemetry Security & Storage Hardening

- **Preconditions:** P03-P06 accepted; access/TLS/privacy design approved; pre-migration isolated backup/restore PASS (not waiting for P08 automation).
- **Required source inspection:** OpenSearch/Dashboards images/plugins, ingress auth, cert/trust paths, store version/index/mapping/ISM, all exposed listeners, service identities and volume/capacity model.
- **Allowed modifications:** Candidate auth/RBAC/TLS/secret delivery and hard storage budgets; incremental security migration with compatible readers; no in-place protected store changes.
- **Prohibited modifications:** No protected volume plugin enablement, raw data purge/reindex, insecure TLS bypass, public unauthenticated rollback, JWT key changes or destructive resize.
- **Required tests:** Allowed roles vs denied user/wrong role, wrong/expired cert and hostname, secret sentinel, no alternative listener, migration compatibility/rollback fixtures.
- **Runtime verification:** Isolated restore/migration on new volumes; collector writes and role-scoped queries succeed; unauthorized paths denied; storage/headroom alarms work.
- **Security verification:** Production access matrix and CA/rotation ownership explicit; storage-native auth and verified transport, no implicit Basic ingress-only compliance.
- **Persistence verification:** Pre/post counts/IDs and store-native integrity on candidate copy; retention and backup privacy verified; rollback preserves security and data.
- **Cross-project assessment:** JWKS TLS/listener/dependency changes require shared gate; local store hardening does not authorize Spring Boot changes.
- **Rollback plan:** Restore prior secure ingress/network and compatible image/config on candidate; verify data/auth; block cutover if rollback needs disabling security or deleting volume.
- **Acceptance criteria:** Security denial/allow matrix, candidate migration and integrity/rollback PASS; no production cutover without separate authorization and host evidence.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P08: Backup, Restore & Failure Recovery

- **Preconditions:** P05, P07 accepted; approved R10-R13 owners/destinations and data classes.
- **Required source inspection:** Actual telemetry stores, config/provisioning, encryption/secret interfaces, retention, native backup support and candidate restore constraints.
- **Allowed modifications:** Recurring encrypted telemetry/config backups, integrity verification, isolated restore tooling/runbooks; business DB backup interface documentation only unless separately scoped.
- **Prohibited modifications:** No production DB content reads/copies, existing-volume restore, deletion of original telemetry or reuse of protected backup credentials.
- **Required tests:** Corrupt/incomplete/missing backup negative cases; checksum plus native integrity, mapping/settings/count and query tests; scoped credential denials.
- **Runtime verification:** Dedicated restored volumes verified without original volumes; measured newest recoverable data/RPO and complete RTO, ingest/auth/query/alert recovery.
- **Security verification:** Encryption in transit/at rest, scoped restore permissions and test custody; backup contains no prohibited original/secret payload.
- **Persistence verification:** Off-host independent restore and count/integrity evidence, backup retention and restore reproducibility; manifest prevents overwrite.
- **Cross-project assessment:** No shared keys or Spring Boot backup resources; JWKS metadata/config compatibility evaluated without copying key material.
- **Rollback plan:** Restore previous job/tool config; retain valid backup generations; rollback never restores over active protected data.
- **Acceptance criteria:** Approved backup schedule/integrity/RPO/RTO verified in candidate drill; job exit 0 alone cannot PASS.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P09: Unified Dashboards & Incident Response

- **Preconditions:** P05, P06, P08 accepted; actual names/queries, roles and runbook owners available.
- **Required source inspection:** Existing APIs Grafana dashboard, datasource/provisioning and Discover patterns; accepted metric/trace manifest and alert links.
- **Allowed modifications:** Extend existing dashboards and owned incident runbooks; service/dependency/queue/capacity and trace navigation; no replacement stack.
- **Prohibited modifications:** No Loki duplicate store, private personal-data dashboard filters, saved-object overwrite in protected environment or unverified metric query names.
- **Required tests:** Every panel query tested with data, no-data, counter reset and unsampled/missing trace fixtures; role/read-only and incident drill.
- **Runtime verification:** Isolated notification -> dashboard -> cause -> recovery workflow; every panel has units/window and expected series, missing data explicit.
- **Security verification:** Viewer cannot edit/admin; URL links include no tokens or personal IDs; datasource credentials server-side scoped.
- **Persistence verification:** Provisioning reproducible and old dashboards retained; candidate restart retains approved saved state.
- **Cross-project assessment:** Japanese views only; shared metric/schema changes still need shared gate; no Spring Boot dashboard writes.
- **Rollback plan:** Restore earlier provisioned dashboard/runbook versions and compatible queries without deleting saved data.
- **Acceptance criteria:** All panels correct and owned runbook/drill evidence PASS; unavailable signals shown as gaps, never fabricated healthy state.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P10: Isolated Resilience & Performance Validation

- **Preconditions:** P03-P09 accepted; approved workload/fault budgets; normal Docker access; validated non-sharing and hard storage bounds.
- **Required source inspection:** Disposable Compose model/manifests, protected ID/mount snapshot, cleanup guard, actual exporters/backends, capacity and all previous evidence.
- **Allowed modifications:** Bounded load/fault tests on manifest-owned resources only; candidate test fixtures/scripts and evidence.
- **Prohibited modifications:** No protected stop/restart, shared writable network/volume/DB/key/endpoint, host disk-full, broad prune or cleanup by ambiguous prefix.
- **Required tests:** Guard negative tests for empty/protected/colliding project names, wrong labels/IDs, external volumes, symlinks and protected endpoints; failure/load matrices with abort ceilings.
- **Runtime verification:** Disposable collector/store/exporter/DB faults, queues/rotation/storage pressure, latency/availability/drop/recovery measurement; before/after protected resource identity evidence.
- **Security verification:** Test-only credentials/certs/keys; synthetic data; auth still rejects invalid JWTs; restricted fault/test endpoints.
- **Persistence verification:** Independent dedicated bounded volumes; expected events vs searchable/restored IDs/counts; no protected mounts; cleanup only exact manifest IDs.
- **Cross-project assessment:** Shared JWKS candidate matrix requires independent .NET/Quarkus and separately authorized Spring Boot test environments; never reuse either parent resources.
- **Rollback plan:** Stop candidate generators, revert fault on candidate, preserve evidence, manifest-guarded authorized cleanup; do not widen selection after cleanup failure.
- **Acceptance criteria:** All approved resilience/performance/loss/RPO/RTO budgets PASS and protected resources preserved; any unverified isolation = BLOCKED, not risk acceptance.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

## P11: Final Hardening & Production Readiness

- **Preconditions:** P01-P10 accepted; current immutable artifacts and explicit production deployment authorization/owners.
- **Required source inspection:** All gate/evidence records, fresh parent/gitlink/dirty/image identities, host exposure/access, restore drill, actual capacity and open decisions.
- **Allowed modifications:** Resolve scoped findings and finalize deployment/rollback/operator docs; production validation only under separately approved non-destructive plan.
- **Prohibited modifications:** No source-only production PASS, silent NOT VERIFIED waiver, unreviewed gitlink/key/contract change or destructive rollback.
- **Required tests:** Reproducibility, complete auth/security/privacy/compatibility regression, restore and rollback review; no duplicate/fresh unbounded tests without need.
- **Runtime verification:** Production host-specific access/TLS/capacity/ingest/alerts and release identities verified under authorized plan; isolated PASS is supporting evidence only.
- **Security verification:** Access review/cert ownership/secret custody complete; critical auth/privacy/shared risks closed.
- **Persistence verification:** Recoverable backups, approved RPO/RTO and retention; persistence identities and compatible readers confirmed.
- **Cross-project assessment:** Both-parent shared gate required for adopted JWKS candidate; adoption/release decisions independent; no automatic Spring Boot deployment.
- **Rollback plan:** Approved tested per-service immutable image/config/reader rollback; no data/key rollback as observability fix; recovery verification required.
- **Acceptance criteria:** All critical gates PASS; no unresolved critical safety/data/auth/authorization/shared compatibility result; business signoff and production readiness explicitly recorded.
- **Evidence requirements:** universal bundle plus artifacts/results for every test and verification above; include all FAIL/NOT VERIFIED/BLOCKED/NOT APPLICABLE dispositions.

