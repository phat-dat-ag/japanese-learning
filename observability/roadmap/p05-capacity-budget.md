# P05 provisional capacity budgets

Extends [P04 cardinality budget](p04-cardinality-budget.md). These are source limits and
planning assumptions, **not measured production capacity**. Docker access is denied.

| Budget | Proposed value | Acceptance measurement |
|---|---|---|
| Scrape/evaluation | 15s; 5s timeout | Actual target timings, missed scrapes and rule-group durations under representative load |
| Per-target samples | 5000; warning >4000/critical >4750 | Compare post-relabel samples, successful `up`, head series and churn; no silent increase |
| Per-target response | 5MB; <=16 labels/sample, <=128 characters/value | Validate actual export sizes and target rejection errors; limits reject scrapes, not sanitize them |
| Prometheus retention | 2d and 512MB, whichever expires first | Observe retained time span, block/WAL/head sizes, write rate and disk headroom |
| Prometheus resources | 1 CPU, 512MiB memory/swap limit, 128 PIDs | Measure peak RSS/head/WAL/compaction, throttling, query and rule evaluation |
| Grafana resources | 1 CPU, 512MiB memory/swap limit, 128 PIDs | Measure datasource queries, startup/provisioning and dashboard peak RSS |
| Temporary files | 64MiB tmpfs per added container | Verify health/startup/log temporary usage; tmpfs consumes memory |
| Container logs | local driver 10MB x3 per added service | Check driver semantics and overhead; only newly added containers |
| Histograms | Reuse P04 buckets, no new application buckets | Inspect actual le sets, exemplar privacy and multiplied label sets |
| SQL pools | Native Quarkus ratio with queue; SqlClient allocated busy ratio | Verify real max sizes, provider coverage and background failures; do not modify pool configuration |
| Collector buffering | Existing settings unchanged | P03 candidate remains inactive; real overflow/replay/loss requires isolated runtime tests |

Worst incoming sample budget: 3 targets x5000 /15s = **1000 samples/second**;
two days = **172.8 million samples**, before recording/alert series. Storage estimate:
`samples_per_second * retained_seconds * measured_bytes_per_sample + WAL + head + index + reserve`.
The 512MB retention value cannot promise two days at that ceiling, and excludes portions of
WAL/head/transient compaction storage. Named Docker volumes have **no portable disk quota** here;
retention is not a hard filesystem bound. Grafana SQLite/plugins/data also need a filesystem
budget and approved capacity monitoring before runtime acceptance. Do not claim bounded total
host disk from these flags. Container memory limits can OOM the monitor; no availability guarantee.

P04 estimates new application-family series at .NET 89 and Quarkus 240; these are estimates,
not full scrape totals. Existing native status/route combinations can exceed 5000. P05 adds
15 recording rules, each retaining at most three job values: conservative <=45 active series.
33 alerts x <=3 jobs gives <=99 identities; at most two `ALERTS` states adds <=198 series,
plus implementation-dependent alert timing/rule self metrics. This <=243 subtotal is not a
complete TSDB budget. Real target churn, rule transitions, Prometheus self metrics and native
runtime pools require measurement. Alert aggregation strips dynamic dimensions; no per-request,
per-user, trace or correlation labels are introduced.

For histogram growth use `(finite buckets + +Inf + sum + count) * product(label values)`;
native extra max/created series differ by framework. Reuse exact captured native metric names.
Do not add a second HTTP counter or rename framework metrics to match queries.

Runtime acceptance must establish baseline and representative peak traffic, series/churn and
sample counts; record CPU/RSS, disk growth and evaluation time; test sample-limit rejection,
backend restart, alert firing/recovery and data retention without touching protected projects.
No load tests or capacity measurements ran in P05. Storage, CPU, pool, latency and alert threshold
approval remain prerequisites for operational rollout. The two-minute notification gate remains
open as detailed in the [alert contract](p05-alert-contract.md).
