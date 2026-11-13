# P07 consolidated storage budget

[Machine model](p07-validation/storage-budget.json) is an unmeasured planning model, not
an approved allocation or hard cap. No storage policy, quota, volume or retained data changed.
GiB/MiB below are binary units; image/config MB/G strings retain their native interpretation.

| Component / state | Configured retention and bounds | Illustrative growth / proposed allocation | Pressure, loss and recovery |
|---|---|---|---|
| .NET log files | 30d, 100MiB rolling, 300 files | About 84.4MiB/day at 1 event/s x1KiB; roughly 29.3GiB rotation ceiling plus overshoot; 30GiB allocation proposal | Count/time deletion can precede collection; I/O failure affects synchronous logging; do not truncate files for recovery |
| Quarkus files | 30d worker, daily gzip/50M, 100 backups | Same hypothetical input rate; compression unknown; up to roughly 5GiB precompression rotation allowance; 6GiB proposal | Async discard and gzip discovery gaps; no lossless replay promise |
| Shared JWKS files | Current source 30 history /2GB archive cap | Same hypothetical rate; 3GiB proposal including active spool | Protected source remains unchanged; verify actual spool/retention, never modify keys |
| Current Fluent Bit state | Raw filesystem chunks, 1G output limit, 32M backlog, infinite retries | Active state size unmeasured; no hard quota | Oldest chunks can drop; raw data may precede filter; preserve sensitive old volume |
| P07 Fluent Bit state | Three memory inputs x8MiB, retry limit3; persistent offsets only | 24MiB plus chunks/read buffers/overhead, within existing 512MiB container; 64MiB disk planning for offsets | Queue/reference tests are not native measurements; pauses/rotation/retry exhaustion/restart can lose data; cutover requires offset plan |
| OpenSearch | Source ISM30d; no installed-policy proof or hard volume cap | 3 events/s x1KiB x2 index factor =506.25MiB/day; 30d ~14.83GiB before reserves; 24GiB proposal | Watermarks70/80/90% proposed; flood blocks writes, not deletes data; growth depends on shards, mappings, merges and real messages |
| Prometheus | Source2d/512MB block retention; WAL/head/compaction extra | ~1017 samples/s including rule allowance at 2B/sample assumption ≈167.6MiB/day; 2GiB proposal | Retention deletes eligible blocks, not a hard filesystem quota; exhaustion can reject samples/corrupt availability; retain existing data |
| Grafana | SQLite/provisioning/plugins, no general time retention | Growth unknown, 1GiB proposal | No account/data purge; bound plugins, monitor DB/filesystem and recover only under reviewed plan |
| OTel Collector | 192MiB limiter inside256MiB; 64 queued requests, batches128; 30s retry elapsed | No disk queue; sizes/overhead unmeasured | Refuse/drop under pressure; restart loses memory; exporter deadline3s, no business-path retry |
| Tempo | 24h compaction;16kB/s sustained ingest,1MiB burst/trace,1000 live traces | Ingest ceiling1.38GB/day before overhead;4GiB proposal incl WAL/compaction | Retention deletion lag and byte quotas unverified; full disk can reject ingest, queues eventually drop; no trace purge here |
| Docker telemetry logs | Existing infrastructure10m x5; Prom/Grafana10m x3; tracing5m x2; app defaults vary | Candidate four app/proxy services local10m x3; aggregate2GiB planning reserve, not a global enforced limit | Rotation is per container plus overhead; old stopped containers and other projects consume additional space; shared JWKS/DB driver policy deferred |

Allocation subtotal is 72.0625GiB; propose an 80GiB independently owned telemetry storage
pool with verified filesystem limits and headroom. Application databases and Spring Boot
storage are excluded and must have separate capacity. These allocations do not reserve disk.
No Docker volume driver_opt or host filesystem change is made: safe project quota support,
host filesystem, Docker Desktop disk and existing-volume ownership have not been established.
Memory limits, retention durations, index watermarks and local-driver rotation do not prove
a maximum total disk size. There is no finite proven total disk ceiling in this environment.

Current read-only Prometheus observations at 2026-11-13T08:10Z: 1502 head series,
1666641 stored block bytes and 7304213 WAL bytes. These are point samples from the running
self-scrape, not peak capacity, full-volume size, daily growth or retention acceptance.
No other component ingestion/storage rate was measured. Never extrapolate one point into
guaranteed capacity or sum metadata counts as a disk quota.

Warning: 70% of approved allocation or forecast headroom below a reviewed recovery window.
Critical:85%; emergency:90% or any native write rejection. Require independent host/volume
free-byte and backend rejection monitoring before activation; missing exporters are a gap,
not invented P05 metrics/alerts. Thresholds are proposals requiring owner approval. P05
existing alert rules remain byte-identical and do not supply complete filesystem coverage.

On pressure, alert an authorized operator; preserve IDs/data and do not prune Docker,
delete indexes, purge traces, truncate logs or disable store protection. Review approved
capacity expansion or disabling candidate export/writers, with service-specific approval.
Verify quotas/free space and backend integrity before draining bounded queues. Old raw
buffers require data-owner custody and migration approval. Recovery/rollback is not yet
tested; see [rollback](p07-rollback.md). Isolated restore evidence precedes any migration.

Single-Compose revision retains fluent_bit_state:/state and all legacy buffer files. Its existing size is unmeasured and must be added to the offset-only planning allowance until an approved handoff is complete. No storage allocation/quota or volume replacement is applied. Memory-only P07 configuration does not replay or sanitize old chunks.

Current continuation independently read Prometheus effective flags:2d/512MiB; admin and
lifecycle APIs disabled. Native Tempo24h configuration verification passes, not actual
compactor expiry. Budget formulas/70-85-90 thresholds pass offline fixtures; no measured
full-volume size/growth or hard quota is newly established. Loki has no jp_dev retention
configuration. The [stored privacy/recovery review](p07-stored-data-privacy.md) provides
component-specific disk-full/loss/recovery actions without deleting data. Legacy backlog
must be measured in addition to the nominal64MiB offset allowance before allocation.
