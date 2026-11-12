# Security and reliability objectives

> P01 refinement: use [contract sections 8-9](p01-observability-contract.md#8-reliability-objectives-and-acceptance-measurements) for measurement definitions, revised alert timing and security prerequisites. Values below remain unapproved P00 proposals, not current acceptance claims.

No business-approved thresholds supplied. Everything in the proposal column requires owner approval; none is a measured result. Runtime measurements for every row are NOT VERIFIED.

| Objective / measurement | Existing configured value | Proposed starting point, requiring approval |
|---|---|---|
| Availability, successful eligible requests / eligible requests over 30d | no SLO | 99.9%; define planned maintenance and client-error exclusions explicitly; include gateway failures |
| API server error rate, 5xx / eligible requests | no alert rule | <1% over 30d; alert sustained >2% for 5m with minimum volume and low-traffic probe fallback |
| API latency, histogram eligible request duration | buckets exist; no approved SLO | p95 <500ms, p99 <2s for interactive APIs; import separate budget after measurement |
| Ingestion lag, ingest time minus source time | Fluent Bit flush 2s | p95 <10s, p99 <30s; clock skew monitored |
| Log loss, sequence-generated vs searchable unique events | no loss guarantee; async discard, bounded buffers | zero loss in normal load; zero loss for approved 15m collector outage; report duplicates separately; crash loss budget must be measured/approved |
| Queue capacity, persisted bytes and oldest age | Fluent Bit default 1G; backlog memory 32M; Quarkus 8192 per async queue | >=30m peak measured ingest plus 25% margin; warn 70%, critical 85%; explicit overflow/drop visibility |
| Storage headroom, usable free bytes and projected days | memory limits are not disk limits | >=30% free, warn below 25%, critical below 15%; forecast exhaustion <24h alert |
| Retention, oldest searchable event and policy runs | logs default 30d, JWKS archive cap 2GB; Prometheus 2d/512MB; other file limits in inventory | retain initial settings pending privacy/capacity review; propose metrics 15d only after sizing; no silent expansion |
| Backup frequency and verification | no verified schedule | daily encrypted telemetry/config backup; isolated restore drill monthly; business DB policy separately owned |
| RPO, newest recoverable event age | NOT VERIFIED | logs/config <=24h backup RPO; distinguish 15m ingestion outage tolerance; business data RPO separately approved |
| RTO, incident declaration to verified service restoration | NOT VERIFIED | telemetry <=4h; business API/DB recovery target requires service owner approval |
| Alert detection latency, fault to delivered notification | scrape/evaluation 15s, timeout 5s; no notification chain | critical <=2m including pending/delivery; measure full path |
| Recovery verification | historical E2E only | readiness + auth success/rejection + read/write disposable canary + telemetry continuity + alert resolved; no writes in protected projects |

Use burn-rate windows and minimum traffic criteria once SLOs are approved; do not declare production readiness from proposed values. Measure latency per normalized operation, database pool usage/waits/connections and collector retry/drop/queue/disk metrics before choosing saturation thresholds. Queue sizing: peak bytes/s x approved outage seconds x safety factor, plus tail files, offsets and index expansion; disk sizing includes archives, DB logs, Docker logs, WAL, compaction, backups and temporary restore space. Retention and capacity caps can shorten recoverable history.

## Security boundaries

Configured: host ports bind loopback by default; production isolates DB/API networks and removes backend ports. OpenSearch security is disabled and Dashboards security plugin removed; authentication is delegated to Basic-auth logs ingress over HTTP, not storage authorization. Grafana requires admin credentials and disables anonymous/signup; Prometheus and API metrics rely on listener/network isolation. Public TLS boundary NOT VERIFIED. Metrics on debug host ports may disclose runtime details. Shared private network membership is a trust boundary, not per-service authorization.

Requirements for future phases: authenticated TLS ingress for all human telemetry access; role-scoped viewer/operator/admin privileges and audited administrative actions; no public raw storage/collector/metrics endpoints; authenticated or tightly authorized internal collection with TLS across untrusted hosts. Decide whether storage-native auth/TLS is required before multi-host use. Keep service credentials distinct from user API JWTs; scrapers must not carry application bearer tokens. Public JWKS remains public according to its existing contract.

Secrets stay in approved ignored files/secret mounts or a future secret manager with access review; never embed them in images, dashboards, labels, command output or evidence. Certificate/credential rotation is a separate reviewed operation and must not regenerate JWT keys. Backups require encryption, scoped credentials, off-host isolation, integrity verification and retention/deletion policy. P00 neither reads secret files nor approves expanded retention. Privacy review must cover original log objects, peer addresses, traces and backup copies.

Failure domains: single host/Docker engine, shared disk and named volumes, single search node/zero replicas, one collector and no external backup evidence. Durable buffers do not survive volume loss and unlimited retries do not prevent bounded-queue eviction. Snapshot consistency, SQL Server/MySQL backup ownership and live restore safety remain unresolved. Recovery tests belong only in the future disposable environment.
