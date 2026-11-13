# P04 rollback

No deployment or live configuration change occurred. No runtime resource, TSDB history,
log buffer/database, OpenSearch index or application database needs restoring.

1. Review the P04 change manifest and current per-repository diff against recorded
   preflight HEADs. Preserve later user work and evidence. Reverse only P04 hunks/new
   files by a reviewed manual patch; never reset/clean/checkout the tree.
2. Keep the pre-existing commented Swagger guard in .NET Program.cs and Quarkus's
   Swagger always-include line. Program.cs was not edited in P04. When reversing metrics
   properties, leave the user's properties and every P02/P03 setting intact.
3. Reverse new instrumentation and call sites together: .NET ApplicationMetrics,
   SqlClientMetrics, optional handler metric call and tests; Quarkus filter/new observers,
   mapper injection, metrics-only properties and affected tests. No dependency/version
   rollback, shared JWKS edit, key regeneration, auth/cache/retry change or migration.
4. The original Prometheus/Grafana/Compose/gateway/collector files remain unchanged.
   Remove only reviewed new inactive P04 candidates if desired. Do not remove P03 artifacts
   or touch the 16 inaccessible directories; cleanup needs explicit authorization.
5. Rerun the relevant local suites and preservation checks. Do not stage, update gitlinks,
   change branches, commit or push under this task.

Future adoption needs a separate authorized immutable image/config rollout and rollback
plan, with backward-compatible registry/readers, protected volumes/history retained and
actual endpoint/target/privacy verification. Added buckets/family labels/new series do
not justify deleting old metrics. Any deployed rollback is NOT VERIFIED and must not
restart/recreate existing jp_dev/springboot_project resources under this document.
