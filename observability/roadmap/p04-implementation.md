# P04 implementation

Source candidates only; [verification](p04-verification.md) separates local tests and runtime
acceptance. [Inventory](p04-metrics-inventory.md) and [contract](p04-metrics-contract.md) list
every custom and reused native family. No package dependency/version changed.

## .NET User API

Extended existing ApplicationMetrics/UseApplicationMetrics rather than introducing native
ASP.NET/OTel metric duplication. Added bounded terminal security counter and JWKS duration
histogram; added 2s bucket to the existing request histogram. Explicitly exclude /metrics
as well as /health traffic. Native exporter already excluded scrape requests from counts;
the explicit boundary also excludes the new security observer. Existing HTTP route/status
names remain unchanged. Native in-progress gauge still owns request lifetime/decrement.

Existing JwksLoggingHandler receives optional ApplicationMetrics through existing DI and
observes its existing finally block. No URL/body/key access, retry, cache, timeout, signing,
validation, response/header or logging outcome change. Actual success/error/timeout/cancel
cases run through an in-memory HTTP handler. Older logging-only test constructions remain
compatible without injecting a registry.

SqlClientMetrics passively subscribes to selected SqlClient diagnostic event names for
connect/command success/error; payload objects are never inspected. A narrowly scoped
EventListener consumes only three connection-count EventCounter names every 15s from
Microsoft.Data.SqlClient.EventSource. No connection strings, SQL statements, database
queries or arbitrary event sources/meters are exported. Names do not imply that native
provider events have been captured against a real DB: that validation remains blocked.
Observers are disposed with ApplicationMetrics; instrumentation changes no repository/SQL
transaction logic. No migrations or infrastructure connection-factory edits.

## Quarkus Learning API

Extended the existing Micrometer filter; kept native HTTP/JVM/process/system binders.
Enabled reviewed HTTP-client and datasource metrics configuration. Pre-registry disjoint
patterns handle quiz/admin and grammar before general lessons, with fixed unknown fallback.
An additive route_family exposes canonical classification while legacy route labels retain
their previous meaning. HTTP/client/custom tags are replaced with bounded sets; mysql
meters are explicitly allowlisted and collapse pool identity to default. Native client
status_class avoids 500-code multiplication on this newly admitted view.

SecurityMetrics observes terminal responses via a Vert.x filter before proactive auth.
DatabaseFailureMetrics adds one classified counter in the existing global exception
mapper, leaving its logging, response and correlation behavior intact. It examines types
and a bounded cause chain only, never messages, SQL or credentials.

Native HTTP-client metrics did **not** appear for the actual local OIDC JWKS fetch.
Added JwksMetricsFilter using existing OIDC request/response SPI, restricted to JWKS and
bearer flow, retained with Unremovable for dynamic discovery. This adds an attempt counter
and duration/outcome for observed responses. Per-attempt state is one timestamp/completion
flag in the request's existing context, no global map. Repeated response callback cannot
double count; no cache event is minted. Transport failure remains unresolved without a
response callback. It does not alter the existing P02 correlation filter or JWT behavior.
The actual local bearer-auth fetch now exports the SPI metrics; 503/repeated/unanswered
cases are separate direct SPI fixtures. Shared JWKS code was not changed.

PoolMetricsTest exercises the installed Quarkus native Vert.x pool SPI directly, including
acquire/release/rejection, and captures real Prometheus translation. It also exercises
the native-client timer adapter and database classifier with synthetic inputs. These are
provider fixtures, not live MySQL connection tests. Keep this distinction in P05 evidence.

## Prometheus and infrastructure

[Inactive scrape candidate](p04-validation/prometheus.p04.yml) preserves both API jobs and
limits verbatim, adds self-scrape and the existing Fluent Bit native endpoint. The
[inactive overlay](p04-validation/compose.metrics.p04.yml) would substitute the candidate
config bind and join Fluent Bit to monitoring, after the four existing Compose files.
No deployment command is supplied. Existing bind sources, retention, TSDB volumes, job
labels, Grafana resources and P02/P03 candidates remain untouched.

The overlay is not standalone and must not be applied without renewed Docker inventory,
network/mount/exposure/ownership/resource checks, collector endpoint access/privacy tests
and promtool validation. No port is added. Network-only trust is a local single-host
assumption, not production authentication/TLS acceptance. JWKS listener is disabled and
its metrics endpoint exposure defaults to health only, so no failing speculative scrape
job or source/listener change was added. Shared compatibility/source editing is forbidden.

Proposed exporters only: Nginx stub_status + exporter (32MiB/0.1 CPU starting budget),
OpenSearch read-only stats exporter (128MiB/0.25 CPU), separate SQL Server/MySQL server
exporters (128MiB/0.25 CPU each). Those costs are unmeasured proposals, not installed limits.
Each needs isolated validation, fixed query/label inventory, private endpoints, scoped
monitoring credentials/TLS and explicit review. No app/root credentials or JWTs reused.
Grafana self-metrics needs authenticated endpoint review; Fluent Bit needs no extra process.
Collector storage-detail metrics remain limited by inactive P03 configuration.

Technical references used with installed API/bytecode and tests:
[Quarkus Micrometer](https://quarkus.io/guides/telemetry-micrometer/),
[OIDC filters](https://quarkus.io/guides/security-oidc-bearer-token-authentication/),
[reactive SQL clients](https://quarkus.io/guides/reactive-sql-clients/),
[SqlClient EventCounters](https://learn.microsoft.com/en-us/sql/connect/ado-net/event-counters?view=sql-server-ver17).
Current online documentation alone does not prove the installed-version runtime behavior.
