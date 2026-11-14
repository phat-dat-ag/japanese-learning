# P09 implementation and acceptance scope

Authority: [implementation roadmap](implementation-roadmap.md), [P01 plan](p01-implementation-plan.md) dependency table, and [P01 quality gate P09](p01-quality-gates.md#p09-unified-dashboards--incident-response). P01 supersedes the historical [P00 P09 gate](quality-gates.md#p09-unified-dashboards--incident-response). Exact scope is **Unified Dashboards & Incident Response**, not dashboards alone. Dependencies are P05, P06 and P08. Required work: extend existing Grafana/Discover views, service/dependency/queue/capacity/trace navigation, owned incident runbooks, panel fixtures, Viewer boundaries, provisioning persistence and an isolated notification-to-cause-to-recovery drill. No P10/P11 work.

## Inspected prerequisites and decisions

- P05 alert inventory/contract/verification; P04 metrics inventory; actual current `/api/v1/label/__name__/values`, aggregate label samples, targets and rules. Historical P05/P06 source-only BLOCKED reports predate accepted development deployment; current user context and P07 closure supersede those old runtime statuses without rewriting them.
- P06 tracing contract/architecture/verification and existing Tempo datasource mapping.
- P07 runtime acceptance/security inventory/backlog and `p07-validation/evidence/closure.json`, `fresh-runtime.json`, `fresh-security.json`: accepted laptop scope; logical response roles inherited from P05.
- P08 `p08-development-policy.md` exception register and `p08-validation/evidence/development-acceptance.json`: development PASS. **P08-DEV-LOCAL-STORAGE** and **P07-DEV-QUOTA** remain unchanged. No production/off-host/hard-quota PASS is inferred.
- Existing Grafana dashboard JSON, root Compose mounts, P07 datasource/provider files, OpenSearch Dashboards configuration, logging bootstrap and README. No separate decision register was found; the decisions/exceptions reside in the linked contracts, acceptance and policy records.

## Version-controlled operational inventory

| Artifact | Purpose / UID | Provisioning |
| --- | --- | --- |
| `observability/p05-candidate/grafana/dashboards/p09-api-operations.json` | API availability, throughput, 5xx fraction, p95, heap, CPU and database client pool/queue; `jp-dev-p09-apis` | Existing P07 provider, existing `/etc/grafana/p05-dashboards` bind; polls every 60s |
| `observability/p05-candidate/grafana/dashboards/p09-telemetry-capacity.json` | Telemetry scrape/storage/measurement coverage, alert states and notification/rule failures; `jp-dev-p09-telemetry` | Same existing provider/folder; no Compose or datasource edits |
| `observability/p09/discover-views.json` | Combined, warning/error and trace-candidate Discover URL/query definitions | Reuses existing `application-logs` index pattern; **no saved-object writes or overwrites** |
| `p09-incident-runbooks.md` | Notification, cause, recovery, safe trace navigation, owners and rollback | Version-controlled operator document |
| `p09-validation/build.cjs` | Reproducible dashboard generation | Produces only two new dashboards |

Existing `jp-dev-p05-health` remains loaded and unchanged. Historical `observability/grafana/dashboards/apis.json` remains unchanged; it is not the active provider in this stack. Provider `disableDeletion:true`/`allowUiUpdates:false` and datasource `editable:false` remain intact. Dashboard rows use two 12-column panels (24-column grid), eight units high, one-hour range, 30s refresh and explicit units/windows/gaps. No credential-bearing variables, high-cardinality grouping or zero filling.

Service selector applies to shared API panels; service-specific panels state their scope. Environment is fixed to the selected local datasource, not a synthetic Prometheus label. Live metric jobs are `user-api`, `vocabulary-api`, `prometheus`, `p07-storage`. Logs contain all three API service names and both `production` and `development` producer environment labels. Do not silently filter out User API logs based on the Compose environment.

## Verification mapping

| Required criterion | Execution / evidence |
| --- | --- |
| Every panel query with data, no-data and counter reset | `test-panels.cjs`, `panels.tests.json`, `evidence/panel-tests.json`: actual installed Prometheus image, isolated `promtool`, bounded tmpfs; 63 native assertions across 20 panels, including p95 seconds, 5xx ratio and reset detection golden values |
| Unsampled/missing trace fixtures and URL privacy | `test-navigation.cjs`, `evidence/navigation-tests.json`: sampled, missing, zero, legacy correlation and unsafe-input cases; no correlation-to-trace conversion. Manual validation/navigation policy, not automatic datasource linking |
| Live queries, loading, series/units/windows and gaps | `verify-live.cjs`, `evidence/live.json`: 20 instant and 20 thirty-minute range queries, provisioned JSON equality, HTML route loading, both datasource health checks, aggregate log query, current rule health |
| Viewer/read-only, anonymous denial | `isolated.cjs`, `evidence/isolated.json`: fresh synthetic account; read succeeds, write/admin denied. Live anonymous denied; existing log reader can search. No live accounts/permissions changed |
| Isolated incident drill and persistence | `isolated.cjs`: dedicated synthetic measurement error -> native Prometheus notification -> provisioned dashboard query -> cause -> recovery -> resolved notification; candidate-only Grafana restart and saved-state/provisioning check |
| Preserve runtime and previous state | Baseline/live/isolated before-after inventories compare all 21 existing container IDs, starts, restart counts, states and mounts. No protected lifecycle, migration or log/metric/trace store writes; the existing Grafana provider adds new dashboard definitions. Existing alert definitions/backups unchanged |

Runtime evidence scope is local development only. HTML plus exact provisioned JSON/query evidence is reproducible loading evidence; no screenshot or browser-rendering claim. Candidate alert fixture is a P09 workflow test, not P10 resilience/load testing.

## Limitations and dispositions

- Direct JWKS/DB-server/Fluent Bit/Collector/Tempo/OpenSearch metrics are not scraped. Existing app-side database pool signals, logs, native operator health paths and Tempo datasource are reused. No new exporters or invented production metrics.
- Tempo/Grafana storage measurements are missing with error=1. These remain visible operational findings; P09 does not alter monitor permissions or conceal gaps. Quiet APIs can have NaN p95 or absent 5xx counters. No active `ALERTS` series is explicitly distinguished from verified health.
- Local sink delivery does not establish external paging or human acknowledgement. P05 logical roles own the runbooks; named human contacts/on-call remain a production limitation, not assigned by this implementation.
- Trace navigation is manual via validated actual `trace_id`; sampling/retention can leave no trace. Existing datasource trace-to-metrics behavior remains unchanged. No automatic log-to-trace integration is claimed.
- No OpenSearch saved-object writes, live permission mutation, business-data reads/writes, key access, application/submodule edits or production cutover. P08 tasks and `D:\JapaneseLearningBackups` are untouched. New Grafana definitions are added through its existing file provider.
- Initial fixture failures (read-only promtool scratch, Docker Desktop internal-only port publication, cold Grafana fixture startup) are implementation failures, not accepted results. Final evidence must show their required checks pass; a failed isolated drill blocks whole-phase PASS.

See [verification result](p09-verification.md) and machine acceptance for final dispositions. Rollback is documented in the incident runbook; previous dashboards/saved data are retained.

