# P03 collector compatibility

Authority: [P01](p01-observability-contract.md); source producer inventory:
[P02](p02-logging-implementation.md). No producer or shared JWKS code changed.

| Input | Current collector source finding | Inactive candidate behavior / evidence |
|---|---|---|
| P02 .NET | native Properties still parsed; canonical snake-case aliases ignored in many fields | canonical alias first, native fallback; tag service authority; no service-name guess; numeric status/duration, false/zero retained; Lua runtime NOT VERIFIED |
| P02 Quarkus | native event.name/outcome preserved; canonical aliases/new error category missing | canonical/native event aliases accepted, original outcome retained, native string flags converted to booleans, error category and typed aggregates retained; no full schema claim |
| escaped Nginx JSON | no inputs; existing adapter would ignore canonical status/duration/correlation | adapter handles those fields in standalone fixtures; offset timestamp retained as native, telemetry_incomplete=true, no schema_version. Adding a live input remains BLOCKED |
| JWKS Logback | durationMs already works; top-level environment/version ignored; peer/raw copies retained | environment/version mapped without collector override; missing instance stays absent; no uri fallback; legacy traceId provenance is not assumed; no shared edits |
| legacy JSON | raw record and guessed ingest event time retained | approved scalar aliases only; missing optional fields omitted; unclassified diagnostic omits raw message; no fabricated event time or schema stamp |
| malformed/non-object/nested | parser fallback can preserve log/original; nested errors may enter _source | fail-closed pcall adapter, bounded static fallback, no original/log/Properties/free exception/message payload; exact Fluent Bit parser/error behavior NOT VERIFIED |
| numeric/boolean/error/context | useful indexed types exist but types/provenance not fully checked | finite >=0 duration, integer 100..599 status, boolean flag conversion, valid lowercase nonzero canonical trace/span; no native trace fallback; invalid correlation omitted |

Candidate: [normalize.p03.lua](p03-validation/normalize.p03.lua). It deliberately keeps
native outcomes for old readers; it does not silently turn legacy failure into success.
It does not overwrite native producer files. It adds adapter/incomplete diagnostics but
never stamps schema_version=1. Timestamp lexical checking is limited and does not validate
calendar correctness or normalize offset/no-fraction events. A complete versioned schema
validator/time converter remains a release blocker, not a claimed implementation.

Privacy policy removes all unapproved free text rather than trusting a secret denylist.
This removes some useful library messages/stack diagnostics; classification, durations,
context, static events and approved aggregate counts remain. Review/extend safe diagnostic
templates before adoption. Bounded identifiers, route aliases, version/operation/error
strings still trust sanitized producer semantics; syntactic validation cannot detect
every encoded credential or personal value. Do not claim universal secret prevention.

Existing bootstrap types remain unchanged. Candidate status/duration/flags match source
mapping types; additive service_version/error_category/dependency/aggregate fields are
unindexed under dynamic:false unless already mapped. Original-field removal intentionally
breaks raw-inspection consumers: scripts/verify-logging.py asserts original presence and
must not be run unchanged. Retain existing indexes and prepare separate reviewed reader
and additive template migration, with isolated old/new query tests, before deployment.
No migration was executed and no historical source was rewritten.

The Lua test file exercises the actual candidate when a Lua runtime is present. None was
found here. Python's five source checks and P02's three reference fixture tests do not
substitute for Lua, Fluent Bit MessagePack type conversion or OpenSearch indexing tests.
Existing canonical readers, live mappings, dashboards/searches: NOT VERIFIED.
