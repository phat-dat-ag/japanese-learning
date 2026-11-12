# Telemetry contract proposal

> P01 supersedes this proposal for implementation: [canonical contract](p01-observability-contract.md). P00 observations remain historical. Correction: normalize.lua already reads record.durationMs, including JWKS; the missing-duration claim below was incorrect and is corrected in place with this note retained.

Status: proposed defaults for P01 review, not implemented or business approved. Preserve API response bodies, authentication, existing headers and current application behavior. Existing log fields stay readable through versioned adapters; do not silently rename indexed fields or metrics.

## Canonical event

Use the existing search-friendly normalized snake_case vocabulary to minimize replacement. Resource attributes map to OTel names at export; event timestamp UTC RFC3339, duration milliseconds in logs and seconds in Prometheus. R=required for every event, H=required for HTTP completion, C=required when context exists, O=optional. Absence must not fabricate a span.

| Field | JSON type / requirement | Constraint |
|---|---|---|
| schema_version | integer R | proposed 1; explicit adapter version, not automatic equivalence to existing service schema |
| @timestamp | string R | UTC RFC3339 event time |
| collected_at | string C | collector UTC ingest timestamp; retain source time |
| service_name | string R | registry: frontend, gateway, user-api, vocabulary-api, jwks-api; infrastructure uses Compose service name |
| environment | string R | development, test, staging, production, unknown; unknown flagged |
| service_instance_id | string R | opaque process/container instance <=128 chars; log/resource only |
| service_version | string R | immutable release/commit <=128; unknown flags incomplete release metadata |
| level | string R | DEBUG, INFO, WARN, ERROR; TRACE only approved diagnostic use |
| event_name | string R | finite event registry e.g. http.request.completed |
| message | string O | safe template; no arbitrary payload; proposed max 4096 chars |
| http_route | string H | route template or approved family; /unmatched fallback; no IDs/query |
| http_method | string H | GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, OTHER |
| http_status | integer H | 100..599; documented internal 499 cancellation convention |
| duration_ms | number H | finite >=0; monotonic elapsed time |
| correlation_id | string C | X-Correlation-ID single ASCII [A-Za-z0-9_-]{1,64}; replace invalid input |
| trace_id | string C | 32 lowercase nonzero hex; logs allowed when unsampled; never substitute correlation ID |
| span_id | string C | 16 lowercase nonzero hex from actual span context |
| parent_span_id | string O | valid span ID only when parent exists |
| operation | string C | finite operation name; no user input |
| outcome | string C | success, client_error, server_error, cancelled, timeout; explicit classification |
| error_type | string C on failure | approved exception category; sanitized, no exception message as category |
| error_code | string O | stable domain/transport code allowlist |
| dependency_name | string C on dependency event | mysql, sqlserver, jwks-api or approved logical identity |
| dependency_type | string C on dependency event | database, http, messaging, storage |
| caller_service | string O | bounded claimed metadata, never authorization identity |

Never log credentials, tokens, cookies, Authorization, refresh tokens, private/public key contents, database bind values, bodies, query strings, email/user IDs or arbitrary exception text. IP addresses are personal data: omit by default or approved restricted retention; existing peer fields require a privacy decision. `original` in current normalizer remains stored even though unindexed: sanitize before retention or remove under reviewed compatibility rules. Proposed whole-event maximum 64KiB and explicit oversize/drop counters require approval in P01; current collector skips lines over 1M.

## Cross-language mapping

| Canonical | .NET current source | Quarkus current source | Spring Boot current source / target adapter |
|---|---|---|---|
| service_name | ServiceName property; collector tag currently wins | service.name; collector tag wins | service (custom encoder); collector tag wins |
| environment | Environment | deployment.environment | environment (custom encoder) / resource deployment.environment.name |
| service_version / instance | ServiceVersion / ServiceInstanceId | service.version / service.instance.id | serviceVersion / instance absent from inspected encoder |
| correlation_id | CorrelationId scope | correlationId | correlationId |
| trace_id / span_id | TraceId / SpanId, Activity | traceId / spanId context | traceId / spanId context |
| http_method / route / status | RequestMethod / RequestRoute / StatusCode | http.request.method / http.route / http.response.status_code | structured HTTP fields mapped through adapter |
| duration_ms | ElapsedMilliseconds | durationMs | durationMs (current encoder); collector already supports this field |
| operation / outcome | OperationName or Operation / Outcome | operation / outcome | operation / outcome |
| error_type / code | ExceptionType / ErrorCode | error.type / error.code | error.type / error.code |

Existing normalize.lua already maps most request/error fields. It currently omits version/instance/schema and dependency metadata; JWKS durationMs is already included in its duration expression. It can fall back to raw uri/RequestPath; P01 must define fixtures and safe fallback before changes. These are mapping proposals, not claims that every producer emits all fields. .NET default application name, Quarkus quarkus-service and Boot jwks-service differ from collector names; canonical names should be assigned through reviewed configuration/adapters. Keep legacy search aliases during migration. Do not alter shared JWKS until its cross-project gate passes.

## Metrics and tracing restrictions

Metric labels: service/environment/approved route family/method/status or status class/dependency name only where needed. No correlation/trace/span/instance IDs, versions changing per request, user IDs, raw path, URL, IP, exception messages or arbitrary headers. Proposed budget: <=5000 active series per API target, <=32 route families; measure actual histogram multiplication before adoption. Existing sample_limit=5000 is per scrape admission, not proof of this active-series budget. Preserve existing .NET route aliases and Quarkus families via mapping; no blind metric rename.

Use W3C traceparent/tracestate with strict parsing; retain bounded correlation header separately. No baggage by default. Ignore untrusted sampling instructions according to an approved edge policy; current parent sampling is not a security control. OTel mapping: service.name, service.version, service.instance.id, deployment.environment.name; http.request.method, http.route, http.response.status_code; error.type and logical dependency attributes. DB spans omit statements/binds; JWKS spans omit key bodies/tokens. Parent-based 0.1 sampling is existing Quarkus/Boot configuration, not an approved end-to-end retention policy. Missing/unsampled trace lookup must be explicit in dashboards.

Compatibility gate: fixtures for each native producer and canonical output, malformed IDs, missing/unsampled spans, unknown routes/methods, numeric typing, version migration, oversize events and secret canaries. No application build/test is authorized during P00.
