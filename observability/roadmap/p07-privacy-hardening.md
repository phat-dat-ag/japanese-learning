# P07 privacy hardening and compatibility

Root Compose now references P07 component files for future deployment; no deployment ran. OpenSearch JSON proposals remain unapplied. Active P02–P06 bind sources
and application sources are unchanged. Existing app-side structured logging, metric-label
allowlists, trace scrubbers, export-off defaults and bounded sampling were inspected and
regression-tested. This does not certify arbitrary future message templates or old archives.

## Logging and raw original

P07 extends the unactivated P03 Lua adapter. It reconstructs a small typed output rather
than deleting selected fields from the original. No original/native Properties/log/body/
headers/rendered exception copies survive. Whole-filter failure or an unrecognized service
returns the Lua drop code, including malformed/unknown carrier cases; protected-mode errors
must not accidentally forward the original. Actual LuaJIT sentinel fixtures test this path.

Static event/error registries are compiled from source literals and known operation terminal
suffixes, never learned from traffic. Review registry.json before regeneration/adoption.
Messages become approved static event names. Approved error classes and operations retain
their existing meanings; unknown classes/codes/operations are omitted. Business event
names/counts, numeric status/duration, booleans and valid independent correlation/trace/span
IDs remain. Unknown events become log.message. Registered normalized route templates remain;
other routes become /unmatched, with route_family kept separately. Version/instance syntax
is constrained; resource strings are not a universal
secret scanner. Date validation rejects invalid calendar values; explicit timestamp_source
marks collector-time fallback. Aggregate integers are bounded to exact Lua double range;
durations above 24h are omitted rather than poisoning storage types.

Fluent Bit candidate inputs use memory chunks with 8MiB per input and three output retries.
There is no storage.path or filesystem record buffering. Only SQLite tail offsets persist
on the existing fluent_bit_state volume with unchanged DB paths; legacy chunks remain untouched and are not replayed; raw records cannot be durably chunked before Lua in this profile.
Memory thresholds may overshoot by a chunk and are not exact RSS caps. Pausing, finite retry
exhaustion, crash/restart and rotating files can lose records. This is a deliberate privacy/
durability tradeoff requiring owner review, not an exactly-once or replay guarantee.

The inactive OpenSearch template adds a positive _source field allowlist plus explicit raw
exclusions and dynamic:false. Existing mapped field types remain compatible; approved count/
category/family metadata becomes queryable in future indexes. The template limits field count
and result windows. A separate unapplied cluster-settings body proposes 70/80/90% disk
watermarks and 10000 aggregation buckets. None of these JSON bodies has been submitted.

Neither filtering nor _source exclusions sanitize old documents, current indexes' templates,
raw producer files, old Fluent Bit chunks, WAL/backups or arbitrary direct store writes.
Native store authorization/TLS remains a critical deferred prerequisite. Source allowlisting
is defense in depth, not substitute access control. No live document/body was scanned here.

Compatibility changes are intentional: raw/original inspection and free-message searches
are removed; unregistered exception classes/routes/operations and some resource metadata
are omitted rather than repurposed. Existing scripts/verify-logging.py expects original and must not
be used unchanged for adoption. New test_security.py contains safe read-shape fixtures.
Before cutover, inventory actual saved searches, approve these losses, validate old/new
readers against an isolated synthetic store, and approve the future-index template priority.
Keep old indexes untouched. Existing offsets remain on fluent_bit_state; Read_from_Head Off skips unknown files and legacy chunks are not replayed. Counted backlog/offset handoff, protected backup and loss accounting remain deployment blockers; see rollback.

## Metrics, traces and access

The Prometheus candidate keeps jobs, rules, labels, intervals and existing sample/body limits.
It drops whole samples carrying named sensitive labels, avoiding unsafe label-removal series
collisions. P04/P05 required dimensions remain. Unknown private label spellings or sensitive
values hidden in allowed dimensions still require producer controls. Exemplars are explicitly
stored with maximum zero; API scrapes request classic text. Quarkus producer OpenMetrics
exemplar privacy remains unverified; negotiation alone is not an enforcement claim. Query
time/concurrency/sample and rule-concurrency caps are proposed without enabling new features.

Collector filtering remains before batching/export. Only the two Japanese API service names
and namespace pass; links and events are dropped, scope/name/status text is normalized,
free-form route/error fields are removed, and method/DB system values are constrained.
Resource version/instance and arbitrary scope attributes are omitted at this boundary pending
explicit metadata approval. This reduces forensic granularity; service lineage, IDs, method,
status and error outcome remain. This is not authentication: an internal peer can spoof a
service name. OTTL parsing/type validation passes; native Windows synthetic filtering/diagnostics now pass; Linux image and stored Tempo privacy still
require approved runtime tests. Debug/payload exporters are absent.

Grafana candidates retain datasource UIDs, dashboards, anonymous/signup/plugin restrictions,
existing credentials and localhost binding. New users default to Viewer; framing and Gravatar
are disabled; SameSite strict and 4h idle/7d maximum sessions are proposed. Existing users are
not downgraded or passwords rotated. Strict cookies can affect external login/deep links;
review before adoption. Secure cookies require reviewed HTTPS and are not forced onto this
HTTP localhost setup. No credentials are embedded in new provisioning files.

Residual priorities: reviewed native RBAC/TLS and CA ownership, protected archive access,
stored sentinel checks, real permissions, storage quotas and recovery. P01 requires isolated
backup/restore evidence before migration; P07 does not begin P08 backup automation.

References: [Fluent Bit buffering](https://docs.fluentbit.io/manual/4.2/data-pipeline/buffering),
[Prometheus storage](https://prometheus.io/docs/prometheus/latest/storage/),
[Grafana configuration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/).

Current JWKS source writes nested `spool/*.log`; the active top-level input misses it. The integrated root-source P07 configuration targets `/logs/jwks/spool/*.log` with a regression fixture. Shared source and live collector are unchanged; actual collection remains unverified.

[Continuation review](p07-stored-data-privacy.md) documents historical remediation without
data deletion. Native synthetic Collector output/diagnostics now exclude sentinels; native
Prometheus actual scrape/storage rejects sensitive-label samples for APIs AND self-scrape.
These checks do not inspect/sanitize historical OpenSearch original, Fluent Bit chunks,
Prometheus WAL/blocks, Grafana data or Tempo WAL/blocks. Legacy chunks are normally postfilter
and can embed original; recovery bypasses new Lua. See backlog handoff before cutover.
