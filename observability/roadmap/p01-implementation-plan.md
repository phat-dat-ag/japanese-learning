# P01 implementation plan

Status: implementation-ready design for review, no implementation started. [Contract](p01-observability-contract.md) is normative for fields/signals/objectives/security; [gates](p01-quality-gates.md) are normative for acceptance. P00 inventory and historical evidence remain reference material, not runtime certification. This plan supersedes P00 future-sequence details where refined here.

## Sequence and dependencies

| Phase | Hard acceptance dependencies | Incremental scope |
|---|---|---|
| P02 logging/correlation | P01 design review | Fix actual producer/adapter gaps, privacy and JSON framing; preserve current behavior and business logs |
| P03 collection/rotation | P02 | Reliable existing tail/offset/rotation/buffering with measured loss and capacity; avoid replacement |
| P04 application/dependency/infrastructure metrics | P01 and P02 identity/route/privacy contract | Reuse registries, capture real names; fill DB/pool/gateway/JWKS/client/collector/storage/self-metrics gaps |
| P05 early alerting/capacity | P03 and P04 | Actionable owned availability/dependency/collector/disk alerts before tracing expansion |
| P06 tracing | P02, P04, P05 | Complete supported client/server/DB contexts; justify private collector/store; bounded exporter failure |
| P07 telemetry security/storage | P03, P04, P05, P06 | Deeper RBAC/TLS/native storage security and hard quotas; minimal isolated backup/restore prerequisite before migration |
| P08 backup/restore | P05 and P07 | Recurring off-host encrypted telemetry/config backup and demonstrated independent recovery |
| P09 dashboards/incident response | P05, P06, P08 | Extend current Grafana/Discover views and runbooks; do not replace stores |
| P10 isolated resilience/performance | all P03-P09 | Integrate fault/load cases under hard isolation/storage/cleanup guards |
| P11 readiness | P01-P10 | Fresh host-specific evidence and owner acceptance, separate release authorization |

Dependencies are acyclic. Required isolated runtime evidence is not deferred wholesale to P10: each phase proves its own behavior in disposable fixtures; P10 integrates and stresses them. Basic access controls, redaction, bounded queues and storage safety apply from P02 onward, even though P07 deepens security. P07 pre-migration restore is an immediate safety prerequisite; P08 automates recurring backup/recovery, avoiding circular dependency. P04 source inspection/fixture work can proceed alongside P03 after P02 mapping acceptance; P05 waits for both runtime gates. Independent source work can proceed with NOT VERIFIED runtime results according to gate progression rules, never as deployment acceptance.

Do not add Loki: OpenSearch already provides log search. Reuse Serilog, Quarkus JSON/OTel/Micrometer, Logback/Boot observations, Fluent Bit state, current Prometheus jobs and Grafana provisioning. First inventory native coverage before adding exporter/agent. A trace backend has a demonstrated missing capability (no current trace store), but P06 must select one through documented retention/auth/capacity/maintenance tradeoff. A collector is justified only for needed routing/buffering/scrubbing; avoid duplicating in-process exporters. P05 chooses one alert delivery path with owned receiver; no new notification component without requirement. No unapproved component choice is hidden in a later prompt.

## Recommended P02 scope

1. Refresh read-only source/Git metadata, read applicable service AGENTS.md before any future edit, and establish scoped candidate files. Do not reconcile submodule pointers. Keep shared JWKS source read-only by default; evaluate both parents before proposing any edit.
2. Implement source-derived canonical fixtures and reviewed adapters for actual .NET/Quarkus/Boot/Nginx fields. Preserve JWKS durationMs (already mapped), add correct Boot environment/serviceVersion mapping and metadata/schema support. Restrict route fallbacks, classify failures and separate legacy trace/fallback diagnostic IDs from valid span context. Adapter changes affecting collection/index behavior require P03 verification too; P02 cannot claim ingestion PASS from fixture validation.
3. Remove unapproved identity/secret-bearing data at producer/rendering boundary, including .NET UserId in completion message/properties and reviewed Quarkus identifier/peer fields. Preserve aggregate business outcome/count logs. Define sanitized extensions; omit original from new canonical outputs only after compatibility and privacy fixture review. No historical purge.
4. Reuse current correlation generation/accepted-value semantics; test all terminal paths/concurrency and legacy headers. Add escaped structured Nginx access output under future authorization; do not change routing/rate limits/auth or enable browser telemetry/tracing exporters.
5. Extend index schema/readers additively only as required for candidate validation; no live bootstrap/reindex. P02 may use source fixture validation without Docker but must report isolated/runtime outcomes NOT VERIFIED and deployment BLOCKED. P03 owns full state/rotation/replay tests. Shared JWKS changes are separately gated and may be deferred while Japanese adapters consume existing fields.

Out of P02: metric registry expansion, trace backend/export enablement, alert delivery setup, TLS cutover, new store, retention expansion, backup jobs, existing database/volume changes or shared gitlink synchronization. No future implementation prompt may modify shared JWKS code without first evaluating both parent projects and meeting the shared gate.

## Shared JWKS drift and compatibility

P00 (historical): Japanese parent pin 53d50ba151d04d7ee7d4f7ea01beba524262c3d9; checkout 7879d155eddb45fb079800709f49a3c3a1566120. Spring Boot parent/checkout 7879d155eddb45fb079800709f49a3c3a1566120 with local JWKS changes.

P01 read-only observation on 2026-11-12: Japanese index gitlink remains 53d50ba151d04d7ee7d4f7ea01beba524262c3d9 and checkout remains 7879d155eddb45fb079800709f49a3c3a1566120, clean internally on develop tracking origin/develop locally. Spring Boot HEAD/index gitlink and JWKS checkout are now e9b90c31dfa311e0121285c8b7caa37c09cf4287; JWKS status clean internally on develop, local origin/develop same SHA; branch log identifies merged Phase 6B review. No network freshness or deployed SHA established. This is external drift observed, not work performed by P01; it does not authorize continuing Spring Boot.

Both parent pins and working HEADs now differ. P00 dirty edits must not be assumed absent at other revisions, and shared compatibility is NOT VERIFIED. Re-evaluate current Spring Boot listener/log behavior before any shared edit; do not copy its changes or assume semantic equality by repository URL. Separate trees/pins mean changes do not propagate automatically. [Shared governance](shared-jwks-governance.md) remains mandatory with the P01 before-edit restriction and independent release decisions in [gates](p01-quality-gates.md).

## Runtime blocker and safe verification procedure

P00 Docker access failed at npipe:////./pipe/dockerDesktopLinuxEngine with permission denied. P01 performs static verification only, does not retry Docker or claim access restored. No privilege escalation/bypass/settings changes. Minimum needed for inventory: normally authorized read access to container list and selective inspect plus volume/network list/inspect. Prefer an approved read-only broker/operator-provided redacted evidence if available. Docker daemon/group access can grant lifecycle privileges; do not claim it is intrinsically read-only or request broad rights merely to inventory. Separate authorization is required for future isolated creation/test lifecycle; it never includes protected resources.

Missing evidence: real project labels, IDs/names/images/digests, start times/status/health, effective Compose overlays, network membership/exposure, actual mount IDs/sources/RW, logging driver/rotation, CPU/memory/PID/restart enforcement; endpoint behavior/auth/TLS, actual metrics/exposition/series, log content/delivery/lag/loss, disk/retention, traces, alerts, backup integrity and measured RPO/RTO. Source health paths and limits do not fill these gaps.

Future read-only inventory commands (not executed in P01), run only with normal authorization:

```powershell
docker ps -a --format '{{.ID}} {{.Names}} {{.Image}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.service"}}'
docker volume ls --format '{{.Name}} {{.Driver}}'
docker network ls --format '{{.ID}} {{.Name}} {{.Driver}}'
# Replace the literal container ID only after listing; never pass an unreviewed selector.
docker inspect --type container --format '{{.Id}} {{.Name}} {{.Config.Image}} {{.Image}} {{.State.StartedAt}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' CONTAINER_ID
docker inspect --type container --format '{{json .Mounts}} {{json .NetworkSettings.Ports}} {{json .NetworkSettings.Networks}}' CONTAINER_ID
docker inspect --type container --format '{{.HostConfig.LogConfig.Type}} {{index .HostConfig.LogConfig.Config "max-size"}} {{index .HostConfig.LogConfig.Config "max-file"}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}} {{.HostConfig.CpuQuota}} {{.HostConfig.CpuPeriod}} {{.HostConfig.CpusetCpus}} {{.HostConfig.PidsLimit}} {{json .HostConfig.RestartPolicy}}' CONTAINER_ID
```

For network/volume inspection select exact IDs and print only name/driver/scope/mount identity/network attachment fields; no volume driver options or arbitrary labels (may contain credentials). Treat bind source paths/internal addresses as restricted evidence and redact user-specific paths before sharing. Never print Config.Env, full inspect, arbitrary logging-driver option values (may contain credentials), healthcheck commands/output, unfiltered logs, .env/keys or resolved Compose. Config/image IDs do not prove built service SHA without provenance evidence. Compare both protected projects before/after any authorized disposable run; identity unknown blocks fault tests.

Inventory alone cannot verify observability behavior. Later authorized isolated tests need dedicated service read/telemetry viewer credentials for scoped health/query/scrape endpoints and test-only fault permissions. Do not docker exec into protected containers or run existing verification scripts blindly. No DB migrations or API writes against protected projects. Read-only endpoint queries can still emit telemetry; P01 performs none.

| Work | While Docker unavailable |
|---|---|
| P01 documentation/static validation | can complete design; no runtime PASS |
| P02/P03 source-derived schema/privacy/parser fixture work | can proceed if authorized; actual producer delivery/rotation/state gates NOT VERIFIED |
| P04 source instrument inventory/route-budget design | can proceed; actual names/targets/cardinality/DB permissions NOT VERIFIED |
| P05 rule fixtures/runbook drafting | can proceed against recorded/synthetic verified-name fixtures; delivery/timing BLOCKED |
| P06 source duplicate/context review | can proceed; propagation/export/drop/overhead BLOCKED |
| P07 security design/static negative fixture design | can proceed; actual exposure/migration/integrity BLOCKED |
| P08 backup/restore design | can proceed; recoverability/RPO/RTO BLOCKED |
| P09 dashboard/query fixture design | can proceed with explicit synthetic evidence; live panel/incident drill NOT VERIFIED |
| P10 fault/load/resilience and P11 readiness | BLOCKED pending runtime/isolation and all prerequisite evidence |

All P02-P11 full runtime acceptance needs Docker-backed isolated/host evidence or a separately approved equivalent runtime with demonstrable isolation. None can deploy on source PASS alone.

## Approval/decision register

| ID | Decision and owner needed | Blocks |
|---|---|---|
| D01 | project reviewers accept canonical names, required fields, aliases, event ownership and privacy removal/extensions | P02 contract acceptance |
| D02 | service/business owners approve R01-R03 denominators, windows and workloads, import budget | SLO acceptance/P05/P10/P11 |
| D03 | operations approve R04-R10 peak ingest, drain deadline, drop policy, disk/retention/series budgets | P03/P04 acceptance, capacity alerts |
| D04 | operations/security approve public trace trust policy, root ratio, component selection, queue/overhead/retention | P06 acceptance |
| D05 | security/data owners approve roles/CA/transport/retention, original-record historical remediation and secret custody | P02 privacy, P07 migration/production |
| D06 | operations/data owners approve backup location, encryption, RPO/RTO and drill schedule; DB policy separate | P08 acceptance/P11 |
| D07 | incident owners approve contact destinations, pending/clear/escalation/dedup windows and delivery tests | P05/P09 acceptance |
| D08 | both parent owners approve shared candidate scope/evidence/adoption; fresh metadata and dirty-state reviewed | any shared JWKS edit/release per gates |
| D09 | normal read-only runtime access/evidence and disposable hard bounds/isolation authorized | runtime acceptance/fault tests |

No approval was inferred from P00 completion or elapsed time. Until D01 review, the contract is a technically specified candidate; business defaults stay proposals. Stop after P01; next task is narrowly scoped P02 after review.
