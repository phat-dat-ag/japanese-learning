# P04 metrics contract

Extends [P01 section 6](p01-observability-contract.md#6-metrics-contract); no HTTP, JWT,
JWKS, logging or tracing contract change. Preserve native framework names and old readers.
Counters measure cumulative events, gauges current state, histograms/summary sums seconds,
memory bytes. Target job identifies service; no guessed environment/version metadata is
attached. Prometheus-managed instance is a scrape address, not an application UUID.

## Bounded vocabulary

| Dimension | Allowed values / rule |
|---|---|
| HTTP method | GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, OTHER |
| .NET legacy route | login, register, refresh, logout, me, admin, other; endpoint metadata only |
| Quarkus legacy route | flashcards, jlpt-levels, lessons, import, other; existing meanings retained |
| Quarkus route_family | flashcard, jlpt_levels, lessons, vocabulary, grammar, quiz, quiz_admin, vocabulary_admin, other; subset of P01's 13 families |
| existing status/code | observed native bounded HTTP code; Quarkus invalid -> OTHER; never exception text |
| new native-client status_class | 1xx, 2xx, 3xx, 4xx, 5xx, other |
| .NET security operation | login, register, refresh, logout, authentication, authorization |
| .NET security outcome | success, unauthenticated, denied, invalid_request, failure |
| Quarkus security operation/outcome | authentication/authorization; same five-value outcome vocabulary as .NET, currently emits success/unauthenticated/denied |
| dependency/operation | new JWKS metrics fixed jwks-api/jwks.fetch; SQL fixed sqlserver/connect or command; native HTTP client target jwks-api or other |
| .NET dependency outcome | success, failure, timeout, cancelled; unknown -> failure, invalid/nonfinite/negative duration omitted |
| Quarkus dependency response outcome | success for observed 2xx, otherwise failure; no response callback -> unresolved attempt |
| SQL pool state / Quarkus pool | active, idle, pooled / default only; single datasource source topology |
| failure category | database fixed; exception messages/classes never labels |

No JWT, header, password, API key, account/user/session ID, correlation/trace/span ID,
raw URL/path/query, SQL/parameters/body/exception message or caller/host/connection string
may enter custom labels. Custom/HTTP metric mappers replace the whole tag set. Runtime
GC/memory/thread labels belong to managed framework binders and are inventoried separately.
Do not add arbitrary prefixes to the registry allowlist or additional datasources without
revisiting mappings and budgets. No new dependencies or second telemetry registry stack.

.NET keeps exactly one existing HTTP middleware and isolated registry; no arbitrary
Meter/EventCounter auto-export. Quarkus keeps one native HTTP server timer. Metrics paths
and probes are excluded from business traffic; unmatched request classification does not
cache raw paths. Unknown methods collapse to OTHER before label registration. Regex family
matching happens before native URI caching; actual registry filter also replaces tags.

## Compatibility and semantics

.NET legacy routes map to auth/other in cross-service interpretation. Quarkus keeps legacy
route=lessons for grammar and route=other for quiz/admin, adding route_family to expose the
canonical split without changing old route selectors. Existing flashcards/jlpt-levels/import
aliases remain; method/status labels and native metric names stay readable. Existing
Grafana aggregate expressions remain source-compatible; live dashboard evaluation is
NOT VERIFIED. A route family is bounded classification, not an exact matched URL template.

Security counters classify completed HTTP outcomes. Login/register/refresh/logout take
precedence in .NET; other 401/403 classify authentication/authorization, successful
authenticated responses classify authentication success. Quarkus observes 401/403 before
security rejection and successful responses with an established context user. These are
request outcomes, not password checks, issued-token counts, unique users or audit records.
Ordinary anonymous success/404 is not authentication success. Uncompleted/cancelled server
responses can lack a security terminal event; no successful status is fabricated.

Dependency latency boundaries differ and must not be pooled blindly: .NET handler observes
through response headers/transport completion, Quarkus OIDC response hook after received
response processing. Attempt count is not response count. Quarkus transport failures have
no response hook, so attempts minus response observations includes in-flight/unresolved
work and is not an exact failure count. No unbounded pending map or fake cache-hit events.
Native client timers are a separate transport view; do not sum them with JWKS SPI timers.

SQL command counters do not report rows, transactions or database-server health. Pool
gauges are process-wide provider samples, first emitted after observation; absent is not
zero/healthy. Pooled total overlaps active/idle: do not sum all states. Quarkus native pool
idle is available capacity per SPI, not a proven count of established idle TCP connections.
Database failure counter covers classified unexpected request-boundary failures, not every
retry/background/recovered database error. Cause traversal is bounded to eight levels.

HTTP/new dependency histogram finite seconds boundaries: .01, .05, .1, .25, .5, 1, **2**,
2.5, 5, 10; plus +Inf and sum/count. The additive 2s bucket closes P01's p99 threshold gap;
it does not validate a latency SLO. Do not average per-instance percentiles. .NET exemplars
remain explicitly disabled. Quarkus plain-text sentinel exports pass; OpenMetrics exemplar
privacy with sampled trace context remains NOT VERIFIED and blocks complete privacy
acceptance. No sampling/exporter/tracing policy was changed under P04.
