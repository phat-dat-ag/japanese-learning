# P01 observability contract

Date: 2026-11-12. Status: implementation specification for review; not deployed and not business approval. This document supersedes the P00 telemetry proposal for future implementation. P00 source/runtime qualifications remain intact. Scope is Japanese Learning; shared JWKS edits require the dual-project gate. No new component is approved by this specification.

## 1. Signal model and compatibility

Canonical schema `jp.telemetry` version 1 describes normalized log events. Native Serilog, Quarkus JSON and Logback output can retain their native envelopes; versioned adapters produce this schema. Nginx uses an escaped JSON format in future P02, not hand-built interpolated JSON. Existing Nginx text remains a legacy input until a reviewed migration. Schema version is assigned only after validation, independent of .NET LogSchemaVersion or Quarkus log.schema.version.

Logs, metric labels and span attributes are separate contracts. Do not copy the whole log event into labels or spans. Required fields apply to first-party events under the new contract, not retroactively to every library message. Legacy/library events with missing metadata remain explicitly incomplete; missing values are never guessed from arbitrary request headers. Invalid telemetry must not fail an application request. Record a bounded diagnostic without retaining the rejected raw record; schema validation failures block release acceptance.

Keep native event names and indexed fields readable until migration is accepted. Add fields without changing existing types. Breaking meaning/type changes require a new schema/index mapping and tested old/new readers. OpenSearch dynamic:false means adding a log field alone does not make it searchable: mapping, adapters and dashboards must change together in a later authorized phase. No historical index rewrite or deletion is authorized. Normalize outcome into a new compatibility-aware reader; preserve legacy outcome values until readers are migrated. Do not blindly rename existing metrics, headers, API errors or JWT claims.

## 2. Canonical log fields

R = required for conforming first-party event; H = required for terminal HTTP event; D = required for dependency terminal event; C = required when specified condition holds; O = optional. Omit unavailable optional values rather than empty strings/zero IDs. `unknown` is permitted only for resource metadata and classified legacy events; it fails release metadata acceptance. All strings reject control characters. Limits below are technical contract bounds for implementation review, not business SLOs. No field allows sensitive input.

Privacy/cardinality classes: S = controlled scalar/registry, no personal data (timestamps are high-cardinality; S does not grant metric-label permission); I = opaque high-cardinality identifier, log/resource only, never a metric label; T = sanitized diagnostic text, never a metric label. Each field inherits section 5 privacy restrictions and section 6 signal restrictions.

| Canonical name | JSON type / required | Allowed values / bound | Privacy/cardinality | Backward compatibility |
|---|---|---|---|---|
| schema_version | integer R | 1 | S | adapter version; keep producer schema separately if needed |
| @timestamp | string R | UTC RFC3339, millisecond precision | S | parse Timestamp/@timestamp; do not replace event time with ingest time |
| collected_at | string C at collector | UTC RFC3339 | S | existing ingest field; no source mutation |
| level | string R | DEBUG, INFO, WARN, ERROR | S | Information->INFO, Warning->WARN, Fatal->ERROR; legacy TRACE maps DEBUG |
| service_name | string R | frontend, gateway, user-api, vocabulary-api, jwks-api; infrastructure exact Compose service registry | S <=64 | retain native identity through adapter metadata; do not trust caller header |
| service_version | string R | immutable release/commit identity <=128; unknown only incomplete legacy/dev | S resource; not request label | current assembly/SNAPSHOT values retained as native metadata until immutable version supplied |
| environment | string R | development, test, staging, production, unknown | S | explicit Development->development etc.; no silent arbitrary name coercion |
| service_instance_id | string R | process/container-lifetime opaque identity <=128; unknown only incomplete input | I | never derive from user/session; missing JWKS/Nginx identity requires trusted collector metadata or future producer change |
| event_name | string R | reviewed static event registry <=96 | S | native name aliases map explicitly; unknown library event uses log.message |
| operation | string C operation events | reviewed static operation <=128 | S | map native operation; no route ID or dynamic class suffix |
| outcome | string C terminal events | success, client_error, server_error, cancelled, timeout, partial_failure, failure | S | legacy failure stays failure if status/classification insufficient |
| http_method | string H | GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, OTHER | S | preserve native method separately only if safe; never raw unknown method |
| http_route | string H | registered matched template <=256, /unmatched, or /family/<registered-family> for proxy-only events | S | no raw uri/RequestPath fallback; legacy route aliases remain queryable |
| route_family | string H | section 6 registry | S | additive; metric family is separate from exact log/span template |
| http_status | integer C if final HTTP status observed | 100..599; documented local 499 cancellation | S | preserve actual observed status; on disconnect without status omit, never fabricate 200 |
| duration_ms | number H,D,C operation terminal | finite >=0, monotonic elapsed milliseconds | S | ElapsedMilliseconds/durationMs/elapsed_ms; Prometheus converts to seconds |
| correlation_id | string C request context | single [A-Za-z0-9_-]{1,64} | I | preserve X-Correlation-ID validation/generation; no new normalization of accepted value |
| trace_id | string C valid SDK/extracted span context | 32 lowercase nonzero hex | I | never promote X-Trace-Id, correlation or synthetic fallback as recorded trace |
| span_id | string C valid current span | 16 lowercase nonzero hex; requires trace_id | I | omit absent/invalid; never mint in log adapter |
| parent_span_id | string O | valid nonzero span ID, trace relationship established | I | never infer from callerSpanId without context validation |
| legacy_trace_id | string O | existing bounded legacy value <=64 | I | Quarkus legacyTraceId / X-Trace-Id stays separate; no W3C semantics |
| error_type | string C classified failure | safe exception class <=256 or fixed fallback http/transport/unknown | T controlled | no exception message; keep existing values readable |
| error_category | string C classified failure | validation, authentication, authorization, dependency, database, timeout, cancellation, internal, transport, unknown | S | additive; error.type is not automatically error.category |
| error_code | string O | reviewed domain/transport code <=96 | S | preserve API code; no API contract changes |
| dependency_name | string D | jwks-api, mysql, sqlserver, or reviewed infrastructure service | S | new metadata; never full URL/connection string |
| dependency_type | string D | http, database, storage, messaging | S | additive |
| dependency_operation | string D | http.request, jwks.fetch, db.query, db.execute, db.transaction, storage.read, storage.write; extensions reviewed | S | no SQL/URL/key material |
| message | string O | safe static template/rendered safe values <=4096 characters | T | remove sensitive arguments before rendering, not after indexing |

H applies to terminal server events from API/proxies; resources/route/status may be unavailable after early abort. Such exceptions must be explicit fixtures: unavailable status is omitted, route=/unmatched, outcome=cancelled/transport failure as applicable. No HTTP fields required for startup/background events. error_type/category are required for first-party failure events where a classifier runs; legacy input may be incomplete and must be counted as such. Outcome precedence: cancelled, known deadline timeout, partial business result, HTTP >=500 server_error, HTTP >=400 client_error, otherwise success; non-HTTP exception=failure. Category precedence: cancellation, known timeout, explicit authentication/authorization/validation, database provider, other dependency, transport, internal, unknown. Do not label an ordinary 404 an authentication failure.

## 3. Producer mapping (source observations, not runtime proof)

P means Serilog Properties object; Q/B columns are top-level native JSON. Missing means proposed metadata, not a verified existing field. Trusted collector tag binds identity even if native value disagrees; disagreement is a contract diagnostic. For environment/version/instance use explicit trusted deployment metadata or producer value under the stated field rules; never fabricate an instance from service_name.

| Canonical | .NET | Quarkus | Spring Boot JWKS | Frontend/Gateway Nginx |
|---|---|---|---|---|
| schema_version | assigned after canonical validation; native P.LogSchemaVersion separate | assigned after validation; native log.schema.version separate | adapter-assigned; native schema absent | adapter-assigned |
| collected_at | collector output metadata, not producer | collector output metadata | collector output metadata | future collector output metadata |
| @timestamp / level | Timestamp / Level | @timestamp / level | @timestamp / level | future $time_iso8601 converted UTC / mapped level; current access text lacks canonical timestamp at frontend |
| service_name | P.ServiceName; tag user-api | service.name; tag vocabulary-api | **service**; tag jwks-api | trusted frontend/gateway tag |
| service_version | P.ServiceVersion | service.version | **serviceVersion** | trusted image/release metadata; currently absent |
| environment | P.Environment | deployment.environment | **environment** | trusted deployment metadata |
| service_instance_id | P.ServiceInstanceId | service.instance.id | absent from inspected encoder | trusted container/process metadata; currently absent |
| event_name | P.EventName or P.EventId.Name | event.name | event | future http.request.completed; current text adapter |
| operation / outcome | P.OperationName or P.Operation / P.Outcome | operation / outcome | operation absent from encoder allowlist / outcome | proxy terminal operation from family / derived status only |
| http_method | P.RequestMethod | http.request.method | http.request.method | future $request_method allowlisted; absent current access format |
| http_route | P.RequestRoute (P.RequestPath only after proving template) | http.route | http.route | configured static family map; never $request or raw $uri |
| http_status | P.StatusCode | http.response.status_code | http.response.status_code | $status integer |
| duration_ms | P.ElapsedMilliseconds | durationMs | durationMs | $request_time seconds x1000 |
| correlation_id | P.CorrelationId | correlationId | correlationId | $correlation_id |
| trace_id / span_id | P.TraceId / P.SpanId or native TraceId/SpanId only with context provenance | traceId / spanId | traceId / spanId | absent unless future trusted span support; never parse correlation as trace |
| legacy_trace_id | no verified producer mapping | legacyTraceId | callerTraceId is untrusted caller metadata, not current trace | no current mapping |
| error_type / error_category | P.ExceptionType / classifier required | error.type / classifier required | error.type / error.category | static status/transport classifier; no upstream raw error text |
| parent_span_id | P.ParentSpanId when valid | parentSpanId when valid | extract SDK parent only if available; not in inspected encoder allowlist | absent |
| route_family | matched template registry in section 6 | matched template registry in section 6 | matched JWKS template registry | static approved family map |
| message | RenderedMessage only after safe argument filtering | message after safe field policy | safe message provider output | fixed access template, no request line |
| error_code | P.ErrorCode | error.code | errorCode | optional static gateway code; no invented API response |
| dependency_name/operation/type | not normalized today | not normalized today | not normalized today | no per-hop event today; future approved client/exporter metadata |

Existing normalize.lua maps durationMs correctly, including JWKS. It currently ignores JWKS top-level environment (uses deployment.environment/P.Environment/LOG_ENVIRONMENT), version and instance; tag-based service identity already exists. It falls back to uri/P.RequestPath, and retains original. P00's missing-duration statement was incorrect (see correction in proposal). Mapping tests must cover Boot environment disagreement with collector LOG_ENVIRONMENT. Preserve legacy exact query compatibility with aliases/readers, not indefinite retention of sensitive raw payloads.

.NET middleware can mint a fallback trace-shaped ID without Activity; that is diagnostic metadata, not a recorded trace. Omit it from canonical trace_id unless provenance is valid and retain only a separately named safe legacy diagnostic when justified. Quarkus all-zero invalid span context must be omitted. Existing response headers remain unchanged; normalization is not authorization to remove them.

## 4. Logging conventions and event ownership

UTF-8 NDJSON, exactly one JSON object per physical line; JSON escaping for quotes/newlines and no pretty printing. Writer must not render raw exceptions, destructured request objects or user identities. Safe exception details may include approved exception class, bounded code, <=20 sanitized stack frames and <=3 causal classes; strip messages, raw SQL, argument values, filesystem/user paths and arbitrary exception data dictionaries. Stack details are log-only, restricted access, never labels; truncation must be explicit.

First-party canonical event registry: http.request.completed, operation.completed, dependency.completed, job.started, job.completed, log.message. Existing started/slow/failure events remain readable; map http.request.failed and HttpRequestCompleted as terminal HTTP aliases. Additional business events need static names and reviewed safe fields, not removal merely to reduce volume.

INFO: ordinary terminal requests, successful business outcomes and lifecycle/job boundaries. WARN: validation/401/403, expected dependency rejection/timeouts/cancellation, slow summaries and partial outcomes; rate-limit repeated security failures with visible aggregate loss/count. ERROR: unexpected exception, failed job or loss of required dependency/service; safe exception owner emits one diagnostic. DEBUG: bounded internal decisions, disabled by default in production, no relaxed privacy. Completion can be WARN while its single exception diagnostic is ERROR. A proxy and API each emitting a terminal event is useful per-service evidence, not duplication.

Exactly one terminal request summary per service/request, including auth rejection and async completion. Do not count start/slow/business events as completed requests. Maintain separate useful operation terminal events at use-case/transaction boundary; no duplicate log-and-rethrow stack dumps at every layer. Classifier/central exception handler owns detailed safe exception diagnostics; dependency event reports category/code/duration without repeating stack. Expected validation/auth/authorization failures do not need exception stacks or submitted values. Failed login must not distinguish submitted identity existence in telemetry. DB failures expose only provider category, safe error number, logical operation and retry outcome; no SQL text, binds or credential strings.

Background jobs use job.started/job.completed, operation and instance identity, separate attempts with bounded attempt counter; do not put unique execution IDs in labels. Async requests end after actual completion, not scheduling. Restore context across await/reactive/callback/executor boundaries, clear MDC/scopes at completion and cancellation, verify concurrent context isolation. Do not extend span lifetime after completed work or retain ambient context between jobs.

## 5. Privacy and original-record policy

Prohibit passwords, access/refresh tokens, Authorization headers, cookies, private keys, database credentials, sensitive bodies, unapproved personal data and key bodies. Raw URLs/query strings, email/account/user/session identities, DB bind values and free-form exception messages are excluded. Current .NET completion template includes UserId; Quarkus exports session/item/vocabulary identifiers and peer address fields. These are source-confirmed review items, not proof of production leakage. Masking only canonical indexed fields leaves RenderedMessage/native/original copies exposed.

Existing normalize.lua sets original=record; bootstrap maps original enabled:false and dynamic:false. These disable indexing, not storage or access through _source/backups. Target policy: omit original for new canonical events; allow only individually approved sanitized extension fields with types and bounded sizes. Historical originals remain a privacy finding; remediation/deletion/reindex requires separate owner-approved retention/migration plan and backup treatment. No P01 purge. No unsanitized quarantine on schema failure.

Synthetic sentinel gate for future P02/P03/P06/P07: unique harmless markers per password/token/cookie/key/DB credential/body/personal-data class; exercise rejected requests, exceptions, import failures, duplicate DB keys, auth/authorization failures, async cancellation and dependency outages. Scan producer stdout/files, rotated/compressed files, collector diagnostics/buffers, OpenSearch _source including original, traces and evidence bundles in isolated fixtures. Check literal, JSON-escaped and URL-encoded forms and rendered messages. Use synthetic values only. Acceptance: zero occurrences outside the intentionally controlled input fixture; output contains category/code and valid context instead. Never search/read existing real secret files as a substitute. Loss tests must prove removal is privacy filtering, not silent pipeline failure.

Technical proposals: maximum new canonical encoded event 64KiB, message 4096 chars; truncate only safe diagnostic text with an explicit truncation indicator, preserve core fields, and count oversize rejection via reviewed bounded counters. Existing collector 1M line cap remains source configuration until P03; no silent change here.

## 6. Metrics contract

Use existing verified instrument identifiers below; exported library metric names require capture before query/rule creation. New instrumentation names are deliberately pending P04 inventory, not fabricated here. New custom instruments use descriptive lowercase snake_case Prometheus names, unit suffix (_seconds/_bytes), _total for counters, seconds for latency; exported Micrometer translation must be verified. Never rename a working family without compatible recording/query migration. Histogram buckets must be finite, documented and aggregatable; percentiles derive from merged buckets, never average per-instance percentiles. Record counts, sums and sample volume. In-progress gauge decrements on every terminal/cancelled path.

| Coverage | Source-confirmed existing instrument/configuration | Required P04 discovery/addition |
|---|---|---|
| .NET HTTP | http_requests_received_total, http_request_duration_seconds, http_requests_in_progress; labels http_method, route, code (gauge lacks code) | verify exporter output and scrape inclusion; classify edge vs backend 5xx |
| .NET runtime | DotNetStats.Register custom registry | enumerate actual exported names; GC, allocation, threads/process coverage |
| Quarkus HTTP/runtime | Micrometer http.server.requests; filter permits jvm.*, process.*, system.* only | capture Prometheus names/buckets and JVM metrics; current filter can deny new DB/client instruments |
| Spring JWKS HTTP/client/security | http.server.requests / http.client.requests configured buckets; app.security.events counter in source | capture actual exported names and valid routes; private listener disabled in Japanese Compose; no active scrape established |
| SQL Server / MySQL | no exporter configured | uptime/connection saturation, waits/locks/errors, query duration aggregates, storage; read-only least-privilege collector account; no query text labels |
| Connection pools | no verified pool metrics | used/idle/max/waiters/acquire latency/timeouts for actual SQL client/reactive pool; distinguish configured max from capacity |
| Nginx gateway/frontend | safe access logs; no exporter | requests/status/active connections/upstream duration and rate rejections; choose status/exporter or log-derived approach after requirement/overhead review |
| JWKS availability/retrieval | health endpoint and .NET named HTTP client exist | distinguish cache hits from actual fetch count/duration/error; server health is not proof clients can refresh keys |
| Fluent Bit | HTTP server port 2020; not scraped | capture input/output/retry/drop/backlog metrics names; actual oldest queued age support must be established |
| OpenSearch | no Prometheus exporter | cluster/index health, ingestion rejection, disk/watermark, indexing latency; enumerate API/exporter fields safely |
| Prometheus | two API scrape jobs only | self/target health, failed scrapes, rule evaluation, storage/WAL/head series; confirm names before rule binding |
| Grafana | dashboard provisioning exists; not scraped | datasource/query errors, availability; verify whether authenticated metrics endpoint is enabled |
| OTel components | none deployed | if introduced: receive/export failure, dropped spans, queue capacity/age, exporter retry and process resources; verify component-specific names |

Approved technical label vocabulary: normalized method; bounded route family; observed status/code or class; controlled dependency/operation only for relevant instruments. Service/environment are trusted target/resource metadata. Avoid duplicating target metadata on every instrument. No user IDs, JWTs, raw URLs/paths, correlation/trace/span IDs, arbitrary caller/host/error strings, query text, session IDs or service-instance UUID labels. Prometheus target instance address is permitted as managed scrape identity, never an application-controlled identifier. Runtime pool/GC/memory-region labels require fixed exporter inventory and series budget. TRACE exemplars remain off until privacy/access/sampling review; never ordinary trace-ID labels.

Route-family registry (13 values): auth, quiz, quiz_admin, vocabulary, vocabulary_admin, flashcard, grammar, lessons, jlpt_levels, jwks, infrastructure, static, other. Classification applies after route matching, before label registration; early auth/404 uses the same bounded matcher and never caches raw URL values. Priority: quiz_admin before quiz; vocabulary_admin before vocabulary; grammar content endpoints before generic lessons; probes/scrapes excluded from business SLIs. Unknown paths/methods always other/OTHER.

| Family | Source route/template rule |
|---|---|
| auth | /api/auth matched templates |
| quiz_admin / quiz | /api/v1/admin/kanji-quiz/questions and descendants / /api/v1/kanji-quiz and descendants |
| vocabulary_admin | /api/v1/admin/vocabularies/{vocabularyId} and matched descendants |
| vocabulary | /api/vocabularies/import (keep legacy import metric alias); other matched vocabulary endpoints only after source registration |
| flashcard | /api/v1/flashcards and matched descendants |
| grammar | /api/v1/lessons/content/import and /api/v1/lessons/{lessonId}/content matched methods |
| lessons / jlpt_levels | remaining matched /api/v1/lessons templates / /api/v1/jlpt-levels |
| jwks | matched owner-scoped JWKS templates only |
| infrastructure / static / other | health/scrapes; frontend static/SPA; unmatched |

Grammar is lesson-content functionality, not an assumed /grammar endpoint. Current Quarkus filter only distinguishes flashcards, jlpt-levels, lessons, import, other; quiz/admin require P04 changes to both pre-registry matcher and MeterFilter. Gateway current family map is coarse and misses some admin detail. Nginx cannot derive route templates; use bounded family markers and do not claim an exact matched route. Preserve .NET login/register/refresh/logout/me/admin/other aliases and current Quarkus aliases in legacy series; canonical family queries use adapters/recording rules after verified name capture.

Proposed active-series budget <=5000 per API target and <=32 families is a ceiling subject to P04 measurement, not a scrape success guarantee. Existing sample_limit=5000, label_limit=16, value limit=128, body=5MB are configured, not measured. Compute series upper bound using actual label products, buckets including +Inf, sum/count and runtime series; choose tighter family/status combinations if the result exceeds the target limit. Cardinality test sends 10000 distinct synthetic unknown paths and IDs: label value sets must remain fixed and post-test series count within approved budget; no raw markers in labels. P04 must provide inventory before enabling dependent P05 rules.

## 7. Distributed tracing contract

W3C traceparent/tracestate via supported SDK propagation only. Strictly reject duplicate/malformed/zero IDs and illegal trace flags/version encoding using the installed SDK parser; do not implement a permissive regex parser. Do not log trace headers. Baggage is neither collected nor propagated. Browser instrumentation is optional and not currently verified; it must be separately justified and never collect bodies/tokens/user identifiers. Preserve X-Correlation-ID separately and Quarkus X-Trace-Id response semantics. X-Distributed-Trace-Id is a diagnostic response header, not authoritative incoming parent context.

Future public-edge policy: preserve a valid external trace lineage, honor parent decisions only from an authenticated/controlled upstream; untrusted public sampled flag must not force unlimited recording. A trust-aware sampler bounds local recording while preserving lineage. If chosen SDK cannot enforce that policy, P06 remains BLOCKED pending an explicit owner-reviewed alternate edge policy; do not silently restart traces or change sampling behavior in P02. Tracestate is accepted only for approved vendors through SDK validation; strip unapproved entries, never treat it as caller identity. Existing Quarkus/Boot parent-based 0.1 and exports-off remain unchanged until P06; they do not currently implement this trust policy.

| Boundary | Expected P06 behavior / verification |
|---|---|
| Browser -> frontend/gateway | optional valid context forwarded; absence creates first API server root; verify both proxies preserve allowed W3C headers; no invented Nginx spans |
| Gateway -> .NET / Quarkus | without Nginx instrumentation transparent context; API SERVER span child of incoming context, or new root; with future instrumented proxy add exactly one appropriate proxy/server+client chain after duplicate review |
| .NET -> JWKS | existing named client uses one CLIENT span and injects its context; JWKS SERVER child on actual fetch; cached lookup does not create a fake HTTP call |
| Quarkus -> JWKS | inspect actual OIDC client instrumentation; add only missing supported span/propagation; no manual+automatic double span |
| API -> SQL Server/MySQL | supported driver CLIENT spans under active server/operation context; cache/in-memory work not a DB call |
| Async/background | captured context restored safely; scheduled independent job has its own root/approved link; no context leak across tasks |

Resource attributes: service.name canonical registry, service.version immutable release, service.instance.id opaque process instance, deployment.environment.name normalized environment. Bridge older deployment.environment through adapter. HTTP spans use http.request.method, matched http.route, http.response.status_code, safe error.type; duration is native span time, not duplicate duration attribute. CLIENT dependency identity comes from trusted target and bounded operation. DB attributes use installed instrumentation's supported semantic-convention version recorded in evidence; allow DB system/logical namespace/operation only, no statements, binds, query text, row data or credentials. Pin semantic-convention/package versions and test before dashboard queries; no assumed exporter field names.

SERVER 5xx/unhandled errors mark error; 4xx classification stays explicit without automatically marking every 4xx server span as error. Client timeout/fetch failure marks client span error. No full response/key bodies or JWT data on JWKS spans. Log-to-trace uses valid active trace_id/span_id even when unsampled; UI says unavailable/unsampled rather than treating missing trace as broken auth. Telemetry exporter failure must not change HTTP/JWT/JWKS success semantics: bounded nonblocking queues, finite exporter deadlines, backoff/jitter, drop visibility and bounded shutdown. Exact queue/retry/shutdown limits require P06 component sizing; unbounded buffers or request-path retries are prohibited. Preserve existing application dependency timeout/cache behavior.

P06 duplicate audit must list ASP.NET/HttpClient/SQL, Quarkus OTel/OIDC/reactive DB and Boot observations before adding SDK hooks. Acceptance requires one logical span per instrumented hop, correct IDs/parents across concurrent calls, no stale MDC, unchanged JWT acceptance/rejection, and controlled exporter-outage overhead. No trace backend is selected in P01; P06 must justify trace storage and collector by operational requirement. Do not add Loki to duplicate existing OpenSearch.

## 8. Reliability objectives and acceptance measurements

All measured baselines below are NOT VERIFIED. E=existing source configuration, D=proposed engineering default (not approved), B=business/owner decision required. A technical bound is not a business SLO. Approvals must name owner, environment, operation set, workload, window and artifact; absent approval leaves corresponding acceptance BLOCKED. P00 values are preserved as historical proposals; revisions below take precedence.

| ID / objective | E: existing configuration | D: proposed criterion and exact measurement | B: pending decision |
|---|---|---|---|
| R01 availability | no SLO | 99.9% over rolling 30d; available eligible requests = valid completed non-5xx non-timeout responses; separate synthetic readiness/auth check | define endpoint set, maintenance and expected client-disconnect exclusions; traffic-only ratio cannot prove idle-time availability |
| R02 error rate | no rules | <1% server failures over rolling 30d; (5xx + gateway timeout/transport failures without HTTP status)/eligible requests counted once at edge; backend per-service ratio separately | approve SLO and minimum traffic; 401/403/validation not server errors but separately observable |
| R03 latency | finite HTTP bucket configs | interactive p95 <=500ms, p99 <=2s measured from edge request start to terminal response over approved window, report completed and timed-out requests separately | imports/batch/streaming and exact workload/window pending; existing 1s/2.5s bucket gap cannot certify p99 <=2s without new bucket or raw duration evidence |
| R04 ingest lag | flush 2s, not delivery promise | over 30m synthetic load: p95 <=10s, p99 <=30s for source event -> searchable; measure periodic query visibility, query interval <=1s and clock uncertainty <=1s | approve workload; collected_at is collector/output time, not proof of searchable time; unsynced clocks invalidate result |
| R05 log loss | bounded queues, skip-long-lines | zero missing eligible unique sequence events at nominal load and 15m isolated collector outage after drain; duplicates reported separately | approve rate/size and maximum drain time (pending P03 measurement); crash/host-loss budget pending, no zero-loss claim for discard queues |
| R06 buffer sizing | 1G output cap, 32M backlog memory; app async queues 8192 each | persisted capacity >=peak bytes/s *1800s *1.25 plus offsets/files/expansion; warn 70%, critical 85%; report oldest age | approve peak rate, storage allocation and outage window; host capacity unmeasured |
| R07 overflow | Quarkus async discard; Fluent Bit bounded output | zero drops at nominal workload and approved outage; forced overflow in isolated bounded fixture must increment/drop-account and preserve app health | approve loss response; do not promise unlimited durability; drop-counter name pending actual exporter inventory |
| R08 retry | Fluent Bit Retry_Limit False; .NET JWKS timeout 5s | retries remain within bounded storage; transient sink failure recovers after drain with counted duplicates; no CPU-tight retry loop | exact retry/backoff deadlines component-specific pending; do not alter JWT client retry/cache semantics |
| R09 storage headroom | volume declarations no quota | operating target >=30% free; warn <25%, critical <15% or forecast exhaustion <24h; bytes/free% at actual backing filesystem | approve capacity budget, exclusions and growth model; CPU/memory bounds cannot pass this gate |
| R10 retention | logs default 30d subject to file/cap limits; search ISM age 30d; metrics 2d/512MB | verify policy installation, oldest retained data and deletion scheduling; preserve current settings until reviewed | privacy retention and maximum deletion lag pending; P00 15d metric expansion deferred, no automatic adoption |
| R11 backups | no verified schedule | daily encrypted off-host telemetry/config backup, monthly isolated restore; checksums + store-native integrity + query/event count checks | backup owner, destination, encryption/retention and budget pending; business DB backup separate policy |
| R12 RPO | unknown | telemetry/config <=24h at incident: fault time minus latest recoverable event/config; measured by restore, not job success | approve data classes and RPO; business DB RPO pending |
| R13 RTO | unknown | telemetry <=4h from incident declaration to validated auth/query/ingest/dashboards/alerts restored | approve start/end and dependency assumptions; business API/DB RTO pending |
| R14 detection | scrape/evaluation 15s, timeout 5s; no contact path | critical availability/collector/disk alerts delivered <=2m from detectable fault; include pending and delivery | owners/contacts, no-data windows and availability pending duration; P00 >2% for 5m error alert cannot satisfy 2m and stays a separate advisory candidate |
| R15 recovery | no verified alert chain | one resolved notification <=2m after configured clear window ends, after readiness and ingest evidence pass; no false recovery on stale/missing data | clear-window default 2m proposed, escalation/repeat/dedup periods pending; auth/read/write canaries only isolated |

R01/R02 denominators: application API traffic only, exclude health/scrape/static and malformed transport before eligible request classification; record exclusions and rejected/rate-limited requests separately. Count gateway unavailable/timeout failures as server failures even if backend emitted no event. Count at one authoritative boundary; never sum proxy and API request counters. Synthetic availability complements low-traffic SLIs. 499 only excluded when proven client cancellation; unknown disconnects are not silently excluded. p95/p99 must report sample counts; no-data means NOT VERIFIED, never zero latency or 100% availability. Do not derive an error-rate SLO from availability without agreeing definitions.

For loss tests generated count G, intentionally privacy-filtered ineligible events F, unique searchable IDs U: missing=max(0,G-F-U); duplicates=total searchable-U. Use synthetic sequence IDs in log test fixtures only, never production metric labels. Record producer enqueue/drop/flush counts and replay windows to locate loss. Freeze cutoff, stop generation, allow approved drain deadline, then compare. Checksums alone do not prove recoverability or completeness. Capacity budgets include Docker logs, rotated archives, WAL, temporary restore space and backup copies; hard storage limits precede disk-full tests.

## 9. Environment and security contract

These are target requirements, not active controls. Existing source findings in [P00 inventory](architecture-inventory.md) remain CONFIGURED BUT NOT VERIFIED.

| Boundary | Development requirement | Production requirement |
|---|---|---|
| Networks/ports | explicit unique project, loopback debug ports only; no protected shared writes | segregated edge/API/DB/storage/monitoring networks; only approved ingress host exposure; private metrics/storage/collector |
| Human access | authenticated Grafana/log ingress; HTTP permitted only loopback under explicit local-only profile, never transmit credentials over untrusted network | TLS with verified chain/hostname and role-scoped viewer/operator/admin; audited privileged access, approved ingress termination |
| Service collection | private least-privilege scrapers, no user JWT; loopback/internal HTTP exception documented for trusted single-host dev | encrypted verified transport across hosts/untrusted networks; production storage-native authentication/authorization required; tightly scoped service identities; mTLS where identities require it, not a claimed existing feature |
| Certificates | generated test certificates and explicit trusted test CA only in disposable tests | managed CA/trust/rotation/expiry alerts; no verify=false/insecure skip; mTLS client checks where enabled |
| Secrets | ignored approved secret files/mounts, test-only creds isolated | scoped approved store/mount delivery, access review and rotation procedure; never evidence/env dumps or embedded image secrets |
| Data/retention | synthetic data preferred; same prohibition on secrets/personal data | approved classification, access audit and retention/deletion including backups; no unrestricted original records |
| Metrics | direct loopback debug endpoints allowed but not frontend routes; bounded labels | collector-only reachability/authorization, no raw public endpoint; probes minimal, no sensitive health details |
| JWKS | preserve public owner-scoped contract and read-only key binds | same key/JWT semantics; endpoint auth changes forbidden as an observability side effect |

OpenSearch secure migration prerequisites for P07: fresh inventory and image compatibility, current store/ISM/index state, approved auth/RBAC/certificate design, credentials custody, dedicated candidate volumes, bounded disk for copy/restore, backup and demonstrated restore of isolated candidate, privacy treatment for originals, and tested collector/Dashboards/client trust. Prove unauthorized, wrong-role, wrong-CA/hostname and expired-cert requests fail safely; prove scoped ingest/read/admin works; prove no alternative open listener. Current disabled security/plugin removal cannot be assumed fixed by a TLS ingress alone.

Migration testing restores/copies synthetic or separately approved sanitized data only to new candidate volumes. Never enable plugins blindly against existing volumes or run bootstrap scripts against protected OpenSearch. Cutover is separately reviewed and authorized. Retain old secured ingress/network boundary, mappings and immutable artifacts for rollback; never roll back by exposing unauthenticated storage, disabling certificate validation or deleting volumes. Compatibility-sensitive index changes require backward-readable readers and isolated restore evidence. If rollback cannot preserve data/security, block cutover. P08 provides full recurring backup/recovery; P07 must still perform its own minimal pre-migration backup/restore prerequisite to avoid a circular unsafe dependency.

## 10. Static conformance examples and future fixture matrix

Source-derived canonical HTTP example (synthetic, not a captured request):

```json
{"schema_version":1,"@timestamp":"2026-11-12T00:00:00.000Z","level":"INFO","service_name":"user-api","service_version":"candidate-sha","environment":"test","service_instance_id":"test-user-1","event_name":"http.request.completed","http_method":"GET","http_route":"/api/auth/me","route_family":"auth","http_status":200,"duration_ms":12.5,"correlation_id":"synthetic_request_1","outcome":"success"}
```

No trace_id/span_id is correct when no valid context is proven. A dependency event uses event_name=dependency.completed, operation=jwks.fetch, dependency_name=jwks-api, dependency_type=http, dependency_operation=jwks.fetch, duration_ms and outcome; it need not contain server http_route/status. A background job requires resource fields/event_name/operation and terminal outcome/duration; no HTTP or correlation fields are fabricated.

Future fixture cases and exact expected contract behavior:

| Case | Expected assertion |
|---|---|
| .NET Information + P.CorrelationId + numeric elapsed | level=INFO; identical accepted correlation; duration_ms numeric, never formatted string |
| JWKS environment=test while collector LOG_ENVIRONMENT=development | environment=test; native serviceVersion mapped; durationMs preserved |
| Quarkus legacyTraceId=valid_legacy plus zero span IDs | legacy_trace_id retained; trace_id/span_id omitted; response header behavior unchanged |
| .NET random trace-shaped fallback without Activity provenance | no canonical trace_id/span_id; no fabricated trace link |
| Valid active unsampled context | valid trace_id/span_id retained, unavailable trace UI expected |
| Unknown path containing sentinel or identifier | http_route=/unmatched; route_family=other; marker absent from message/original/labels |
| Quarkus grammar lesson content template | family=grammar; generic lessons remains lessons; route ID only template placeholder |
| HTTP cancellation with no observed status | outcome=cancelled, category=cancellation; no invented status; one terminal summary |
| Partial import | operation terminal outcome=partial_failure with aggregate counts; separate HTTP status/outcome may remain success |
| Two concurrent async requests and reused executor | each event has its own context; completed scope cleared; no cross-request data |
| New metadata but unchanged index mapping | fixture may validate output, searchability NOT VERIFIED; mapping/readers needed before end-to-end PASS |
| Secret nested under original/native exception/rendered args | FAIL privacy even when canonical indexed fields are clean |

Tests are specified, not executed in P01. Native fixture values must be derived from the inspected source envelope, then later supplemented by isolated captured output; source-derived fixture PASS never proves current runtime emission.
