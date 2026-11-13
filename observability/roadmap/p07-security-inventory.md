# P07 telemetry security inventory

2026-11-13. Source inventory plus explicitly named read-only runtime observations. P07
component files under observability/p07 are referenced by the sole root Compose source for future deployment; previous active bind-source files remain unchanged.
Classification: operational metadata includes opaque diagnostic/trace IDs; raw application
logs, buffers and historical stores may contain restricted personal/secret data. A private
Docker bridge is not authentication, authorization or encryption.

| Flow | Configured endpoint / protocol | Auth, exposure, encryption | State, retention, buffering / failure | Privacy / evidence |
|---|---|---|---|---|
| User API to Fluent Bit | NDJSON /app/logs -> /logs/user, shared named volume | Filesystem permissions; producer RW, collector RO; no network transport; no configured at-rest encryption | user_api_logs; daily/100MiB rotation, 300 files/30 days; synchronous producer I/O; retention can outrun tail | P02 safe formatter/correlation tested again; library/free-template archive risk remains |
| Learning API to Fluent Bit | NDJSON /deployments/data/logs -> /logs/vocabulary/application.json.log | UID/group filesystem boundary; collector RO; no configured at-rest encryption | vocabulary_api_logs; 50M plus daily gzip, 100 backups/30-day worker; two 8192-entry discard queues | P02 JSON allowlist tested; active-only glob misses rediscovery of compressed archives |
| Shared JWKS to Fluent Bit | Native JSON /app/data/logs -> /logs/jwks/*.log | Protected producer; collector RO | Current e9b90c3 uses nested spool logs (active top-level input misses them; candidate corrects path) and configurable 2GB/30-day cap; runtime replay unverified | Peer/caller producer fields remain; P07 candidate removes them downstream; source unchanged |
| Gateway/frontend to collector | No configured Fluent Bit input; proxy stdout only | Docker daemon log access; no socket mounted in collector | Driver/rotation varies; pre-integration root app driver unspecified; root P07 source now selects local 10m x3 for four app/proxy services | Current gateway still legacy text with peer address; inactive P02 candidate untouched; collection GAP |
| Fluent Bit to OpenSearch | HTTP opensearch:9200 on log-storage | No native auth/TLS; no host OpenSearch port; logging-init/collector/Dashboards can reach store | fluent_bit_state filesystem chunks, 1G output budget/infinite retries currently; application-logs-* daily indexes; source ISM 30d, installed policy unverified | Current original retained; P07 memory-only/filter candidate and future-index source allowlist prepared |
| APIs to Prometheus | HTTP user-api:8080/metrics and vocabulary-api:8080/q/metrics | No scrape credentials/TLS; jp_dev default bridge; APIs also host-loopback published | 15s scrape, 5s timeout, 5000 samples, 5MB body, 16 labels/128-char values | P04 bounded labels tested; P07 drops samples carrying named private labels; no alert labels removed |
| Prometheus to Grafana | HTTP prometheus:9090, datasource proxy | No backend auth/TLS; default plus private p05-monitoring | prometheus_data; 2d/512MB source retention; WAL/head not a hard quota; scrape/evaluation failures can make data stale | Grafana admin auth, anonymous/signup off; prepared query bounds; no source credential embedded |
| APIs to OTel Collector | OTLP/gRPC otel-collector:4317 | No receiver identity/TLS; default plus p06-tracing; no host port | SDK queues 1024 spans, batches 128, 3s deadlines; bounded root sampling; export false by default in source | Existing app scrubbers/W3C controls pass regression; running container alone does not verify export enabled/delivery |
| Collector to Tempo | OTLP/gRPC tempo:4317 on p06-tracing | No auth/TLS; Tempo only on internal network | Memory limiter 192MiB, queue 64 requests, two consumers, finite 30s retries; drops/refusals and restart loss possible | P07 adds service allowlist, link/event rejection, scope/name/error filtering; native config checks PASS, actual filtering unverified |
| Tempo to Grafana | HTTP tempo:3200, datasource proxy | Backend API unauthenticated; no host port; Grafana joins p06-tracing | tempo_data, WAL/blocks; 24h compaction retention; no proven quota | Existing datasource preserved; query concurrency/time/expression bounds prepared; actual stored privacy/retrieval unverified |

Read-only runtime evidence confirms 38 project containers including running jp_dev Collector
and Tempo, separate Spring Boot networks/volumes, loopback publications and expected nonroot/
read-only/resource settings in the selective inspection. Runtime gateway/frontend/log UI
host ports were 8880/8099/5661, differing from synthetic Compose defaults; no real env was
dumped. Prometheus 9091 and Grafana 3001 are loopback publications. Effective overlays,
permissions inside every image and every network denial path remain unverified.

| Finding | Severity | Disposition / owner / closure gate |
|---|---|---|
| OpenSearch security plugin disabled, unauthenticated plaintext store | Critical for production | Deferred: security/operations must approve native RBAC/TLS, certificates, separate identity and isolated restore/migration evidence before P07 runtime acceptance |
| Raw original and raw prefilter filesystem chunks | High | Inactive P07 filter, memory-only record chunks and future-index source allowlist; live/historical exposure remains open until authorized adoption and stored-data checks |
| Tempo/Collector/Prometheus backend auth/TLS absent | High for untrusted hosts/networks | Deferred production design; existing private topology retained; do not treat Grafana authentication as backend authorization |
| Historical logs/traces, producer archives and backups unscanned | High | No historical sanitization claim; security/data owners classify and approve isolated sanitized migration, never purge here |
| No enforceable filesystem quotas / complete disk monitoring | High | Budgets and pressure plan prepared; platform owner must prove quotas and headroom before deployment |
| Missing proxy inputs, compression/replay and unanswered dependencies | High reliability | Carry forward; dedicated producer spooling/replay/failure evidence requires separate approved runtime scope |
| Resource metadata/opaque correlation can be misused for personal data | Medium | Controlled metadata syntax and narrower Collector output; producer/operations review still required; no universal secret detector claimed |

No shared JWKS fix is necessary to prepare the local collector controls. Producer-side JWKS
peer/caller privacy is deferred; any future shared edit requires both consumers' governance
and explicit approval. No shared source, keys, endpoints, claims or gitlinks changed.

Single-Compose revision: the sole root docker-compose.yml integrates nine services; no override/new state volume remains. Existing storage and old chunks are retained. See runtime-isolation and rollback for deployment/handoff gates.

Continuation: current selective metadata still shows loopback-only jp_dev publications and
no published backend OTLP/Tempo/OpenSearch/Fluent Bit ports. Native synthetic privacy checks
now verify Collector actual output and all three Prometheus jobs (self-scrape gap fixed).
No stored payload scan occurred. [Historical/access review](p07-stored-data-privacy.md)
details native unauthenticated/plaintext peers and production/development decision gates;
Loki is protected separate-project infrastructure, not a jp_dev service. No new exposure,
credential change, certificate or authentication semantics were introduced.
