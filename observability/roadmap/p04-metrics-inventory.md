# P04 metrics inventory

2026-11-13. Authority: [P01 contract](p01-observability-contract.md),
[P01 gates](p01-quality-gates.md). Source topology remains the
[P00 inventory](architecture-inventory.md). Actual emitted names/types/label values from
local tests are recorded in [machine inventory](p04-validation/evidence/metrics-inventory.json).
That evidence is not a deployed scrape or a production capacity measurement.

## Components and endpoint availability

| Component | Source version/instrumentation | Endpoint/topology | Availability and priority |
|---|---|---|---|
| Angular/frontend | Angular ^22.1.0; Nginx stable-alpine digest; no browser telemetry SDK | frontend:8080, base loopback host 8088; metrics/q blocked by frontend config | no application metrics endpoint; use backend/proxy observations; no browser metric implementation needed |
| User API | net9.0, prometheus-net.AspNetCore 8.2.1, SqlClient 7.0.2; no OTel metric exporter | user-api:8080/metrics; base host loopback 8081 | actual local host scrape PASS; deployed endpoint/scrape BLOCKED |
| Learning API | Quarkus 3.38.2, Java 17, BOM-managed Micrometer 1.17.0 Prometheus **simpleclient**, Vert.x 4.5.32, existing OTel | vocabulary-api:8080/q/metrics; base host loopback 8082 | actual local Quarkus scrape PASS; deployed endpoint/scrape BLOCKED |
| shared JWKS | Boot 4.1.2, Actuator/Micrometer/Prometheus; source read-only | jwks-api:8080 health/API; base loopback 8083; optional unpublished 9091/actuator/prometheus listener disabled | existing meters source-verified, exposition NOT VERIFIED; do not scrape 8080 or enable listener automatically |
| SQL Server | SQL Server 2022 image/digest; Dapper/stored procedures | sqlserver:1433; base loopback 1433; production network isolated | SqlClient process diagnostics added; database-server exporter absent; actual DB metrics NOT VERIFIED |
| MySQL | mysql:8.4 image/digest; Hibernate Reactive/Vert.x pool, not Agroal/JDBC | mysql:3306; base loopback 3306; production network isolated | native pool meters admitted; native SPI fixture PASS; real reactive datasource utilization/faults NOT VERIFIED |
| gateway | Nginx stable-alpine image/digest | gateway:8080; base loopback 8080; no metrics route/stub_status/exporter | exporter/stub_status design needed; P02 candidate remains inactive |
| Fluent Bit | 4.2.5 pinned image/digest | fluent-bit:2020 HTTP monitoring, only log-storage network currently | existing native endpoint /api/v1/metrics/prometheus; inactive scrape/network proposal; names/samples NOT VERIFIED |
| OpenSearch/Dashboards | existing Dockerfiles/config/digests, source inventory unchanged | opensearch:9200; dashboards:5601 behind logs-ui loopback ingress | no Prometheus exporter; actual cluster/index/ingest/rejection/disk metrics missing |
| Prometheus | v3.14.0 digest; existing 15s/5s scrape/evaluation settings | prometheus:9090; base loopback 9090; production removes host port | existing API jobs retained; self-scrape candidate only; actual targets/TSDB NOT VERIFIED |
| Grafana | 13.2.2 digest; provisioned Prometheus datasource and APIs dashboard | grafana:3000, loopback host 3000; monitoring networks in production | existing queries reuse HTTP counters/histograms; self-metrics/auth NOT VERIFIED, no new job |

These are declared versions/default ports, not image identities or effective runtime
configuration. Compose overlays may change exposure. No resolved Compose/env dump was used.
Production API/DB/monitoring network separation is source configuration, not verified policy.

## Actual instrument families

| Family/query sample name | Type/unit | Labels | Evidence/reuse |
|---|---|---|---|
| http_requests_received_total | counter/requests | http_method, route, code | existing .NET instrument, one middleware owner; local emitted sample verified |
| http_request_duration_seconds | histogram/seconds | http_method, route, code; le on buckets | existing .NET instrument; additive 2-second bucket, no duplicate request timer |
| http_requests_in_progress | gauge/requests | http_method, route | existing .NET; returns to zero in local 10000-path test |
| http_server_requests_seconds | histogram/seconds (+ native max gauge) | method, legacy route, additive route_family, status | existing Quarkus timer; old route alias meanings retained; new family classification before lookup |
| app_security_events_total | counter/events | .NET operation/outcome; Quarkus operation/outcome | new bounded terminal HTTP classifications; not unique users or independent JWT validator counts |
| app_dependency_duration_seconds | histogram/seconds | dependency, operation, outcome | .NET actual JWKS attempt through headers, incl errors/cancellation; Quarkus actual observed JWKS response through body/filter callback |
| app_dependency_requests_total | counter/attempts | dependency=jwks-api, operation=jwks.fetch | new Quarkus SPI request-filter invocation; not cache hits or confirmed responses |
| app_database_operations_total | counter/operations | dependency=sqlserver, operation=connect/command, outcome=success/failure | new .NET passive provider diagnostic observation; synthetic DiagnosticListener fixture verified |
| app_database_pool_connections | gauge/connections | state=active/idle/pooled | new .NET allowlisted provider EventCounter bridge; synthetic sample fixture verified, live native sampler unverified |
| app_database_failures_total | counter/terminal failures | dependency=mysql, category=database | new Quarkus unexpected request-boundary SQL/driver/ORM classification; synthetic nested SQL exception fixture verified |
| http_client_requests_seconds | histogram/seconds (+ max) | dependency=jwks-api/other, status_class | existing native Micrometer name newly admitted; verified native timer fixture, **not observed on actual OIDC transport** |
| sql_pool_active / sql_pool_idle | gauges/resources | pool=default | existing Quarkus Vert.x SPI, no duplicate pool implementation; synthetic native lifecycle verified |
| sql_pool_ratio / sql_pool_queue_size | gauges/ratio, queued tasks | pool=default | native SPI fixture verified |
| sql_pool_usage_seconds / sql_pool_queue_delay_seconds | summary/seconds with count/sum, separate max gauges | pool=default | native SPI fixture verified; no quantile/latency histogram promise |
| sql_pool_completed_total / sql_pool_rejected_total | counters/acquisitions, rejected submissions | pool=default | native SPI fixture verified; rejection is not every SQL query error |

Additional allowlisted mysql.processing/queue.delay/queue.size/current/completed/reset
instrument names were identified from installed Quarkus bytecode. Their actual reactive
datasource export is NOT VERIFIED; do not bind P05 rules to guessed translations.

Existing .NET DotNetStats exports process_working_set_bytes, process_private_memory_bytes,
process_virtual_memory_bytes, process_open_handles, process_num_threads,
process_start_time_seconds, process_cpu_seconds_total, dotnet_total_memory_bytes and
dotnet_collection_count_total. Existing Quarkus runtime binders export JVM memory/buffer/
GC/class/thread families, process_cpu_usage, process_uptime_seconds, process_cpu_time_ns_total,
system_cpu_usage/system_cpu_count. Keep native units: process_cpu_time_ns_total is
nanoseconds, unlike seconds counters. The machine inventory is the exact local list and
captures framework-controlled GC/pool/thread labels; do not invent common family names.

JWKS source declares app.security.events, app.build.info, HTTP server/client SLO timers and
JVM/process instruments. Prometheus name translation and sample labels remain unverified
here. Source uses bounded URI tag budgets but no label privacy/canonical parity is inferred
for every future library meter. Shared listener/scrape adoption requires separate review.

## Remaining infrastructure work

Do not invent metrics or add exporters merely to make dashboards green. Fluent Bit can
reuse its existing HTTP exporter; filesystem-storage detail may be absent because P03's
storage.metrics candidate is inactive. OpenSearch needs an explicitly reviewed read-only
cluster/index-stats exporter or polling adapter; no document access, indexing changes or
security activation is authorized. Nginx needs a private stub_status endpoint and exporter
candidate, not a public management location. Database-server metrics require new scoped
read-only monitoring users and query allowlists; existing app/root credentials must not be
reused. Grafana authenticated self-metrics and host/container resource exporters need
separate inventory/permission review. None was installed or exposed in P04.
