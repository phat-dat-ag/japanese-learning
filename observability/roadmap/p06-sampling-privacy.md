# P06 sampling, privacy and budgets

JP_TRACE_EXPORT_ENABLED=false by default. JP_TRACE_SAMPLE_RATIO=0.1 and
JP_TRACE_MAX_ROOTS_PER_SECOND=10 are shared development defaults, not production approval.
Direct .NET configuration is Tracing:ExportEnabled/SampleRatio/MaxRootsPerSecond/Endpoint;
Quarkus uses APP_OTEL_EXPORT_ENABLED/SAMPLE_RATIO/MAX_ROOTS_PER_SECOND/ENDPOINT.
Both ratios must agree. Root configuration rejects nonfinite/out-of-range probabilities;
the per-instance root budget accepts 1..1000. Do not silently use probability 1 in production.

The SDKs' built-in ratio algorithms need not agree. P06 deliberately compares the first
63 bits of a valid SDK trace ID to probability times the signed 64-bit maximum in both
stacks. Test vectors cover an accepted low ID and rejected high ID. Remote sampled parents
pass this check; local sampled descendants preserve their decision. Remote unsampled
parents remain unsampled. Each process also admits at most ten eligible roots/remote
server boundaries per monotonic one-second window. Adjacent windows can admit twenty in
a sliding second. Local descendants do not consume this boundary budget.

Trace IDs are preserved even on rejection; P06 does not restart traces. Different ratios,
independent process rate budgets, upstream sampling, outages and privacy filters can create
partial traces. The common ratio alone avoids SDK disagreement, but does not guarantee
complete traces under load. Attacker-selected IDs cannot bypass the fixed-window budget.
Head sampling cannot recover every error trace; it is not tail-based error retention.

Volume estimate: total requests/second × eligible probability × spans/request × encoded
bytes/span. Example only: 10 requests/s × 0.1 × 6 × 400 bytes ≈ 207MB/day before storage
overhead. Measure real span sizes and fanout; this is not a capacity observation. Tempo
limits ingestion to 16,000 bytes/s with a 1MiB burst, 1000 live traces and 1MiB per trace.
The sustained ingestion ceiling is about 1.38GB/day, before WAL/compaction overhead.

Tempo retains blocks for 24h, not an exact per-span deletion deadline. Budget 4GiB dedicated
disk including WAL and compaction headroom; target steady-state use below 2GiB. A normal
Docker local named volume has no proven hard quota here. Deployment is BLOCKED until disk
ownership, quota/free-space monitoring, deletion lag and permission behavior are verified.
Retention, rate limits and 16MiB blocks do not constitute a hard total-volume cap.

Collector memory limiter is 192MiB with 32MiB spike allowance inside a 256MiB cgroup.
Batch maximum is 128 spans; export queue is 64 requests, two consumers, 3s attempt timeout,
1..5s backoff and 30s maximum retry elapsed time. Queue capacity is request units, not exact
bytes. Refusal/drop on pressure and loss on restart are expected; no disk queue is used.
SDK queues are 1024 spans each. These are finite bounds, not measured overload guarantees.

Application scrubbers exclude sensitive headers, identities, query/body/SQL content and
unbounded exceptions. Java resource strings are restricted to controlled metadata syntax;
.NET constructs a dedicated resource without default environment resource detectors.
Do not put personal data in trusted operator metadata. No telemetry payload logging or
debug exporter is configured. Collector allowlists span/resource keys, clears status text,
normalizes names and drops events before batching. Its native config/OTTL validator passes;
actual sentinel execution, stored traces, link handling and diagnostics remain NOT VERIFIED.
Only these two sanitized applications should send to this unauthenticated private receiver.

Remaining risks: in-memory instrumentation may initially observe SQL before export scrubbing;
new library behavior may introduce event/link span drops; no generic metadata sanitizer proves
absence of encoded secrets. Private Docker networking is not authentication/TLS. Tempo stores
unencrypted local data and its API has no application-level authorization; Grafana controls
UI access, not access by internal network peers. No claim of production privacy/security or
stored-data acceptance is made. Existing OpenSearch raw original/archive findings remain open.
