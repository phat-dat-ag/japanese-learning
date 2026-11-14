# P09 incident runbooks

Scope: Japanese Learning `jp_learning_dev`, local development. Owners reuse P05 logical roles: **jp-operations** for telemetry/storage, **jp-application** for APIs/database clients, **jp-security** for access/JWKS. The current development operator performs triage. Named human responders, escalation contacts and on-call acceptance remain unassigned; these roles do not establish production ownership.

## Notification to investigation

1. Acknowledge the existing authenticated local sink notification. Record UTC start, alert name/state and bounded job/store; do not paste payloads or credentials. This sink is not external paging or human acknowledgement.
2. Open Grafana at `http://127.0.0.1:3001`, then **JP Dev P09 API Operations** (`jp-dev-p09-apis`) or **JP Dev P09 Telemetry and Capacity** (`jp-dev-p09-telemetry`). Default window is one hour; rates use five minutes. Select User/Vocabulary for the shared API panels. Service-specific panels identify their scope explicitly.
3. Compare scrape availability, traffic and latency before interpreting errors. Scrape UP is not application readiness. Missing/NaN is UNKNOWN; idle latency and never-created error counters can be absent. Check `/api/v1/targets` and `/api/v1/rules` on loopback Prometheus (`9091`) for target errors and rule health. A dead Prometheus needs independent operator detection.
4. Open the linked Discover view at `http://127.0.0.1:5601` and authenticate with the existing log reader. Use the reproducible views in [Discover inventory](../p09/discover-views.json). Start with service and time. Stored environments currently include both `production` and `development`; these are producer labels, not proof of deployment environment. Inspect the environment field before adding an environment filter.
5. Compare bounded route, outcome, status and event names. Avoid free-text payload export, raw URLs, user filters and unbounded aggregations. Keep time windows narrow and page results. Use existing authentication; never embed credentials into links.

## API and dependency triage

Owner: **jp-application**; access/JWKS failures involve **jp-security**.

Compare throughput and 5xx fraction with p95. Idle/absent denominators are unknown reliability. User CPU is cores; Vocabulary CPU is a framework fraction. Heap is bytes and excludes native memory. Compare SQL Server client active/idle/pooled connections and Vocabulary queue/utilization; these are client observations, not database-server health. Do not run SQL diagnostics, migrations or application writes from dashboards.

JWKS has logs but no enabled Prometheus scrape. No JWKS availability/latency/DB-server metric is fabricated. Use authenticated service health and scoped log evidence. Do not enable its management listener, change JWT/JWKS contracts or copy signing material. Recovery requires fresh scrapes, traffic appropriate to the incident, latency/error stabilization and cleared alert state; a green scrape alone is insufficient.

## Telemetry and capacity

Owner: **jp-operations**.

Compare physical backing disk free space, per-store used bytes/budget fraction, measurement errors and coverage. Expected store names are `opensearch`, `prometheus`, `tempo`, `grafana`, `fluent-bit`. Missing Tempo/Grafana measurements currently have error=1; investigate monitor permissions/readability under separately scoped work. Budget utilization is not a hard filesystem quota. Preserve P07's development quota exception and P08's development off-host exception.

Check native read-only health paths through existing private/authenticated routes: Fluent Bit `/api/v1/health`, Collector health endpoint per its existing configuration, Tempo `/ready`, OpenSearch `/_cluster/health`, Dashboards `/api/status`. These are operator checks, not new scrape jobs or public links. Never bypass CA verification or enable a listener to obtain a green panel. Preserve denied anonymous/admin paths. Use Prometheus rule health and notification failure rate to distinguish application failure from pipeline failure.

No automatic restart, rescrape loop, silence, data deletion or volume change is authorized by this runbook. Escalate remediation with exact service/resource identity and rollback scope. Backup/recovery follows [P08 runbook](p08-recovery-runbook.md); do not change its tasks, destination, retention or data. Recovery means measurements return, error metrics clear, notifications resolve and previous data remains queryable.

## Logs and traces

Only a nonzero 32-hex `trace_id` is a candidate OpenTelemetry trace ID. Validate it, then open Tempo Explore via the dashboard link and paste it into the trace-ID query. Use the relevant service/time range to compare parent/child spans. Tempo can serialize IDs in base64 or omit leading zeros in search results; use the actual canonical log field or decode stored trace IDs rather than deriving one from a correlation value.

`correlation_id` and legacy `X-Trace-Id` are independent search keys. Never turn either into a Tempo URL. Unsampled requests, expired traces, delayed ingestion or missing instrumentation can legitimately yield no trace. Keep the matching logs and metrics as evidence and record the trace gap. A missing trace never implies a healthy request. No trace IDs, correlation IDs or personal values become dashboard variables or metric labels.

## Isolated drill and persistence verification

Run `node observability/roadmap/p09-validation/isolated.cjs` under approved Docker access. It creates a unique internal fixture network, bounded synthetic Python sink, Prometheus and Grafana using already-installed image IDs, no protected volumes/networks/credentials. It verifies notification -> provisioned dashboard -> synthetic Tempo storage measurement error -> recovery/resolved notification, Viewer read/write/admin boundaries, anonymous denial and saved dashboard/provisioning after candidate Grafana restart. Only fixture containers restart. Exact run-labelled IDs are checked before cleanup; failures preserve evidence. No P10 load, disk pressure or real failure injection occurs.

Before/after metadata is recorded in `p09-validation/evidence/isolated.json`. Run `test-panels.cjs` for all panel query scenarios and `verify-live.cjs` for read-only actual telemetry. A route returning HTML is not a screenshot; provisioning API equality and exact query results supply reproducible loading evidence.

## Rollback

Retain the existing P05 health dashboard and all saved objects. Revert only the two new P09 JSON dashboard definitions and P09 runbook/view additions after retaining reviewed copies. Existing provider has `disableDeletion: true`; removing a source file intentionally does not delete its database copy. Mark an obsolete P09 dashboard explicitly under a separate review rather than deleting saved state. Restore a previous reviewed JSON version at the same UID to roll back panel behavior. No datasource, alert, retention, backup or store configuration changes are needed. Candidate fixture cleanup is exact-ID/run-label guarded; never use broad prune/down/reset.
