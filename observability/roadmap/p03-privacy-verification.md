# P03 privacy verification

Authority: [P01 privacy policy](p01-observability-contract.md#5-privacy-and-original-record-policy).
[P02 producer evidence](p02-privacy-verification.md) remains historical except the three
reference fixture methods rerun here. No live telemetry, private/public keys, credentials
or existing environment values were read/exported.

Source finding: existing normalize.lua returns original=record and permits raw log/message,
uri/RequestPath and peer/caller fields. bootstrap.py maps original enabled:false and
dynamic:false; neither removes original from stored _source or backups. A malformed JSON
fallback can therefore retain the rejected raw line. This remains an unresolved current
source exposure; no deployed leak or clean state was established.

Inactive candidate drops original, native nested copies, raw messages/rendered exceptions,
peer/caller identity and raw-path fallbacks. It emits static bounded failure diagnostics
and approved typed scalar fields. pcall catches adapter errors so candidate errors do not
return the rejected input. Unknown optional fields remain absent; no raw quarantine.
This intentionally reduces library/free-text diagnostics pending reviewed safe templates.

Prepared [Lua tests](p03-validation/test_adapter.lua) inject synthetic bearer/password/
refresh-token/cookie/Authorization/DB-credential/private-key-like/query values, nested
objects and malformed fallback records. They assert raw fields absent while useful typed
records remain. Candidate scalar rejection checks include obvious token/credential/PEM,
URL, control and percent-encoded patterns. Test-only source-derived inputs contain no real
credentials. Lua execution, comprehensive JSON/URL-escaped sentinel cases and stored
OpenSearch document scans were NOT VERIFIED because the runtimes are unavailable.
No claim of zero sentinels in stored synthetic OpenSearch documents is made.

| Surface | Result |
|---|---|
| Existing raw-original privacy policy | FAIL source against P01 target |
| Candidate no-raw allowlist design | source reviewed; Lua execution NOT VERIFIED |
| P02 reference normalized view | PASS 3 fixture methods, bounded tested scope |
| Input chunks/tail DB/WAL/collector diagnostics | NOT VERIFIED; raw chunks may precede Lua filtering |
| Rotated/compressed producer files | NOT VERIFIED; collector filtering cannot sanitize producer archives |
| New synthetic stored _source / original / fallback | NOT VERIFIED; no OpenSearch environment |
| Historical _source, archives, backups | finding remains; no scans, deletion or migration |

Syntactically safe identifiers and trusted producer aliases can still contain unrecognized
secrets/personal data. Removing free text plus a denylist does not prove universal privacy.
The candidate is blocked from deployment until actual parser/filter/buffer/diagnostic/
stored-source sentinel tests pass, raw prefilter persistence is addressed, complete
contract validation is available, and reader diagnostic tradeoffs are reviewed.

Historical remediation is a separate approval-gated project: security/data owners classify
exposure without exporting raw records, approve retention/legal handling and affected
backups, prove isolated sanitized restore/migration and rollback, then authorize any
specific live action. P03 performs no reindex, deletion, retention/security policy change,
or disabling of useful current diagnostics.
