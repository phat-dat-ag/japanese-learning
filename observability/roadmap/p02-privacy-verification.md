# P02 privacy verification

Authority: [P01 privacy rules](p01-observability-contract.md#5-privacy-and-original-record-policy). This record covers synthetic fixtures, actual in-memory formatter output and isolated test-file output. No production telemetry, secrets or keys were inspected. PASS never means a universal secret detector or proof of current deployed redaction.

## Producer safeguards

.NET request completion and auth success events no longer include UserId in either properties or rendered text; peer IP/port no longer enter request scopes. SafeJsonFormatter filters explicit password/access-token/refresh-token/header/cookie/key/connection-string/body/request/response property names before rendering, and replaces exception serialization with safe typed diagnostics. This is defense in depth for known paths, not a promise that arbitrary future message templates are safe. Native numeric/boolean types remain intact. SafeExceptionDetails is bounded to three causal classes and at most twenty stack frames total (12/6/2), retains safe SQL error codes, excludes messages/Data/source paths, and exposes a typed truncation flag.

Quarkus's existing allowlisted provider omits peer fields and session/item/vocabulary/lesson/level/quiz/reading/meaning/example/kanji identifiers from emitted JSON. Count/scheduling/state fields remain. Operation message interpolation replaces ID placeholders with [redacted] while preserving aggregate counts and success/partial/failure events. Central diagnostics contain at most three classes/twenty code frames, no raw exception messages and an explicit truncation marker. Existing JSON formatter and async handlers are retained. The existing Quarkus 3.38.2 SPI string-valued flags are unchanged for compatibility; they are not newly converted booleans and do not establish a canonical boolean migration.

Nginx escaped JSON access formats contain only fixed service metadata, normalized family/method, status/duration, bounded correlation and upstream result/timing. No remote address, raw URL/query/request line, Authorization or cookie field is referenced by either format. Request error logs remain disabled as before; global startup error behavior unchanged. Angular introduces no console output, error-reporting SDK or storage of credentials; its existing in-memory auth behavior remains.

Both internal JWKS correlation helpers add only a validated already-bound ID; they never copy bearer/cookie/body/key data. The .NET helper disables default URL-oriented HttpClient logs for this named client only and logs safe target/type/operation/duration. Quarkus uses the existing JWKS-only OIDC SPI and does not read token/request bodies. No shared JWKS code was edited.

## Synthetic sentinel matrix

| Class | Producer/fixture coverage | Result / limits |
|---|---|---|
| Authorization bearer | .NET request middleware and forbidden property tests; Quarkus formatter and invalid-token file request; offline five-source fixtures | PASS tested output excludes markers; live gateway auth traffic NOT VERIFIED |
| Access/refresh tokens, password | actual .NET handlers with mock token/password services; safe property tests; Quarkus unknown MDC keys; offline fixtures | PASS tested emitters; API responses intentionally retain normal token contracts and are not telemetry |
| Cookie | .NET request/property tests, Quarkus provider, static Nginx variable exclusion | PASS tested output; actual Nginx runtime NOT VERIFIED |
| Sensitive query/path | .NET unmatched request and JWKS failure URL, Quarkus unknown-route file request, proxy format exclusions | PASS no raw markers in captured output; correlation intentionally accepts bounded diagnostic strings, not arbitrary other headers |
| DB credential/error data | .NET synthetic SQL diagnostics and throwing fake HTTP handler, Quarkus unknown connection-string field and safe unexpected mapper, offline original field | PASS tested output; no live DB connection or failure injected |
| Private-key-like content | .NET PrivateKey property test and Quarkus privateKey MDC field; offline PEM-like field | PASS raw marker omitted; synthetic strings only, not actual key contents |
| Personal/domain/session ID | .NET auth/request assertions, Quarkus provider and redacted operation messages; native aggregate outcomes/counts retained | PASS targeted fields removed; historical documents untouched |
| Nested original record | source-derived fixture includes unsafe original object; reference normalized output has no original | PASS reference view only; current collector still retains producer original records and was not changed |

Tests fail on unexpected sentinel occurrences in their output and also assert valid JSON, meaningful fields/event counts and unchanged application results, so dropping all logs cannot satisfy the tests. Fixtures are explicitly synthetic/source-derived, not claimed captured JWKS or Nginx runtime evidence. Encoded/escaped sentinel handling in a complete pipeline, collector buffers, compressed archives, stored _source/backups and trace backends is NOT VERIFIED in P02; those require isolated collection/storage tests and an approved remediation plan. No scans of existing real telemetry or secret files were performed.

## Residual privacy and compatibility risks

- normalize.lua still stores original=record; enabled:false/dynamic:false do not remove _source or backup content. Producer sanitization reduces newly emitted exposure but does not purge historical data or secure existing archives.
- Native Quarkus outcome/event/flag formats and JWKS fields remain for readers; the reference fixture adapter is not the live collector. Store schema/searchability requires later authorized mapping/reader work.
- Read-only JWKS encoder still allowlists peerAddress/caller diagnostic fields. Its live privacy is NOT VERIFIED. Any shared change requires the mandatory dual-parent gate and is prohibited here.
- Library log messages, future extensions and generic string templates require continued source review/sentinel coverage. No generic denylist can prove absence of unknown personal data.
- Unknown immutable version/environment values remain explicit metadata acceptance gaps; no ID or deployed version was invented. Full 64KiB event-size enforcement and telemetry drop/lag/cardinality measurements remain pending engineering-budget review; P02 did not change overflow or retention.

No sensitive production data was put into reports or fixtures. Existing signing/public keys, certificates, environments, databases and historical telemetry were not modified. See [test matrix](p02-test-matrix.md) for executed groups and [verification](p02-verification.md) for preservation evidence.
