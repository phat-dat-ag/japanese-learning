# P04 cardinality and resource budget

Proposals under [P01 R06/R09 and metric budgets](p01-observability-contract.md); not approved
production limits or measured production capacity. No retention/storage expansion occurred.
Exact emitted local samples/label sets: [machine inventory](p04-validation/evidence/metrics-inventory.json).

## New/admitted family bounds

| Instrument | Label value bounds | Estimated maximum series per target | Value and mitigation |
|---|---|---:|---|
| .NET app_security_events_total | 6 operations x 5 outcomes | 30 | terminal auth results; no account/reason text |
| .NET app_dependency_duration_seconds | 1 dependency x 1 operation x 4 outcomes | 52 | 10 finite buckets + Inf + sum/count = 13 per tuple; actual JWKS attempts only |
| .NET app_database_operations_total | 1 dependency x 2 operations x 2 outcomes | 4 | connect/command results, never SQL labels |
| .NET app_database_pool_connections | 3 states | 3 | native sampled process-wide connection counts; no connection/pool identity |
| Quarkus app_security_events_total | 2 operations x 5 allowed outcomes | 10 | only three combinations currently emitted; vocabulary shared with .NET |
| Quarkus app_dependency_requests_total | fixed dependency/operation | 1 | attempts, not cache hits/confirmed delivery |
| Quarkus app_dependency_duration_seconds | fixed dependency/operation x 2 response outcomes | 28 | 13 histogram series plus native max per tuple; unanswered attempts not counted as responses |
| Quarkus app_database_failures_total | fixed dependency/category | 1 | bounded classified failure boundary |
| admitted native http_client_requests_seconds | 2 dependencies x 6 status classes | 168 | 14 samples per tuple, no URI/method/exception/remote address tags |
| admitted native mysql pool/client allowlist | 1 fixed pool; 14 instrument names | <=32 starting allowance | gauges/counters/summary count,sum,max; only native SPI subset locally observed; real pool inventory pending |

.NET new custom upper bound: 89 samples/target. Quarkus new/admitted allowance: 240
samples/target (including conservative native-pool allowance). No request/session/version/
correlation/trace dimensions. These are bounds for listed instrument definitions, not
total HTTP/runtime/TSDB resource limits. Disabled/new native names must be captured before
using them in P05. Native-created timestamp/format changes may require revising budgets.

## Existing HTTP/native budgets

Keep 5000 samples/target as the proposed active-series/scrape ceiling and existing scrape
sample_limit. Labels <=16, values <=128, body <=5MB remain configured limits. Framework
runtime series must fit within that allowance too. Native status precision is preserved
for server metrics: conservative full Cartesian products exceed the target budget:

- .NET: 8 methods x 7 routes x up to 500 valid status codes x 14 counter/histogram samples
  + 56 active gauges = 392056, before runtime/new metrics.
- Quarkus: 8 methods x 9 correlated family/legacy-route combinations x 501 statuses
  (including OTHER) x 14 timer/max samples = 505008, before runtime/new metrics.

These are deliberately conservative vocabulary bounds, not expected production series.
Actual source routes/methods/status outcomes are much sparser. Do not multiply legacy
route by route_family independently: family determines its legacy alias. A sample_limit
breach fails a scrape; it does not safely evict arbitrary application series. This remains
an explicit production sizing risk: measure reachable combinations/load and obtain owner
approval; if necessary prepare a reviewed status-class/route migration retaining old
readers. P04 does not silently change existing status labels or claim a hard 5000 bound.

The .NET fixture issued 10000 distinct unknown paths/methods, all one OTHER/other/404
request tuple, and exported 108 samples in its whole local registry. Quarkus registered
10000 distinct unknown IDs/tags into one timer and checks fixed pre-registry path patterns;
its local application export count is in the evidence, not a production peak. Pool/SPI
fixtures and live-app exports are separate registries and must not be summed as deployed
series. Passing the fixture does not establish rate/churn/cache bounds at peak traffic.

## Proposed operational budgets and unknowns

Keep existing 15s scrape/evaluation, 5s timeout, 2d/512MB Prometheus retention and 512MiB/
1 CPU source container budget. Do not infer those settings are enforced or sufficient.
New jobs have the same sample/body/label limits. At a hypothetical 4 x 5000 samples/15s,
ingest is about 1333 samples/s, or 230.4 million samples in two days before overhead;
512MB retention is a cap, not a promise of retaining two full days at that ceiling.
WAL, head blocks, churn, queries, disk headroom and metadata need independent measurement.

No additional metrics dependency/process was installed. SQL EventCounters sample every
15s; handler/SPI counters perform bounded per-call work, no user cache/global pending map.
Measure allocation/CPU/latency/scrape size under an approved isolated workload before
capacity acceptance. No host/DB/container saturation, TSDB write, retention or collector
resource experiment was run against existing resources. P05 capacity/alerts remain blocked
until actual targets/names, cardinality and operational budgets are accepted.
