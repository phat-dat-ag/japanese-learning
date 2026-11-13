# P04 verification and review report

2026-11-13. Repository: C:/Personal/japanese-learning, as explicitly corrected by the user.
P04 source candidate implemented and local checks PASS. **Runtime acceptance BLOCKED**;
no production readiness, full deployed metrics acceptance or P05 implementation claimed.

## A–B. Summary and baseline

Read relevant service AGENTS.md, complete Quarkus R01–R19, P00 architecture/Docker/shared
governance, P01 contract/gates/plan, P02 implementation/verification/privacy/correlation,
all seven P03 reports and P03 manifest before implementation. No missing-document exception
or shared-source authorization was inferred. [Preflight](p04-validation/evidence/preflight.json)
records Git state before P04 edits; root HEAD c1b84a4b03d083fdfd0e5a013c1eaac2c6c9086e.

| Submodule | Initial HEAD/index gitlink | Existing dirtiness |
|---|---|---|
| angular | 7d25cfe4830da3856661f7449260e9027c596afb | none |
| dotnet | dca468d5d1d470488be1c6a13fd8099b52d6deab | Program.cs: commented Swagger development guard |
| quarkus | d6642616abf0d3373c4ebe1f514d69ec9b669f2a | application.properties: Swagger always-include |
| springboot-jwks-api | 7879d155eddb45fb079800709f49a3c3a1566120 | none |

Those pre-existing changes were preserved. No untracked files were reported initially,
but Git could not inspect eight inaccessible P03 workspace directories; do not interpret
that as a complete hidden-content inventory. P03's other eight OS-temp directory findings
also remain open. None of these pre-existing directories was repaired/deleted and no
permissions changed. Existing application tests manage their own synthetic fixture state.

Normal-access Docker container/volume/network lists were denied at dockerDesktopLinuxEngine.
No protected IDs/mounts/images/starts were obtainable; isolated-resource prerequisites
therefore failed and no Docker test environment was started. Source Compose inspection
never exposed resolved environment values. No deployment, reload/restart or lifecycle action.

## C–F. Inventory, implemented/reused metrics and services

[Inventory](p04-metrics-inventory.md) gives component endpoints, source versions, native
coverage and emitted names/types/units/labels. [Contract](p04-metrics-contract.md) defines
bounded vocabularies/semantics; [implementation](p04-implementation.md) explains each change.
Native HTTP request and runtime instruments remain the owners; no second server counter
or OTel metric stack. Eight new custom family definitions across the two APIs plus reviewed
native client/pool admission; no package/version update.

.NET adds security results, actual JWKS attempt latency/outcomes, passive SqlClient
terminal-operation counts and allowlisted sampled connection gauges. Existing request
histogram gains the 2s bucket. API/auth/signing/validation/cache/retry/repository behavior
was not changed. Existing Program.cs was untouched.

Quarkus adds security response observations, classified unexpected DB failures, JWKS SPI
attempt/response metrics, native pool/client filters and missing route families. Additive
route_family preserves legacy route selector meanings, including lessons/grammar and
other/quiz/admin. Existing logging/correlation/tracing configuration and JWT behavior
remain. Real DB/native provider emission is not inferred from synthetic fixtures.

## G–H. Shared JWKS and integration

Shared source/index/HEAD/dirty state unchanged. Existing Actuator/Micrometer/listener
capabilities were inspected read-only; no source, key, endpoint, listener, consumer or
gitlink change. Neither shared consumer stack was tested against a new shared artifact
because none was created. Dual-consumer runtime compatibility remains NOT VERIFIED;
any future shared edit requires [governance](shared-jwks-governance.md) and explicit approval.

Existing Prometheus bind source/jobs, retention/history/volume declarations and Grafana
resources unchanged. New scrape/network files are inactive proposals only. Self/Fluent Bit
scrapes require fresh safety/network/auth/endpoint validation; JWKS scrape stays blocked
by disabled listener/exposure. No Nginx/OpenSearch/DB exporter was installed. No P02/P03
candidate was activated or edited. Production endpoint security and resource behavior are
NOT VERIFIED, not established by private-network source declarations.

## I–K. Privacy, cardinality, tests and runtime blockers

[Cardinality budget](p04-cardinality-budget.md) bounds each new family and explains why
existing server status Cartesian upper bounds can exceed the 5000 target allowance.
Local 10000-path/tag checks yield fixed label sets and bounded exported samples; they
do not measure production peak/churn/headroom. New metric labels omit all submitted
identifiers/URLs/headers/SQL/exception messages; provider payloads are never serialized.
.NET exemplars explicitly off; Quarkus sampled OpenMetrics exemplar privacy remains
NOT VERIFIED. No alert, recording rule, trace backend, dashboard or security migration.

[Test matrix](p04-test-matrix.md): 136 .NET unit cases, 83 Quarkus focused cases and 5 Python
checks PASS, zero final failures/errors/skips; two YAML candidates pass installed Prettier
parsing/style. Metrics subsets are included, not added again. [Summary](p04-validation/evidence/test-summary.json)
contains raw result hashes/counters. No package download/elevation was needed. Final diff,
Python source parsing, Java basic style/manual R01–R19 and documentation checks ran.

Runtime remains BLOCKED: actual deployment identities/endpoints, Prometheus scraping/UP,
native DB/pool sampling, SQL/HTTP faults, TSDB persistence/retention/real capacity, network
denial/auth/TLS, shared metrics listener, collector infrastructure coverage and Quarkus
OpenMetrics exemplar policy. Native client timer was not observed on OIDC transport;
actual JWKS SPI metrics are the verified local view. Quarkus transport failures without
a response remain unresolved attempts, not invented response/failure counts. These limits
must accompany any P05 query design; no full dependency-health/loss guarantee.

## L. Unresolved P02/P03 findings

All remain open: P02 gateway runtime/syntax and temporary bind-file impact; P03 inactive
collector candidate; missing Nginx inputs; unexecuted Lua; unverified live log rotation/
replay/recovery; stored OpenSearch original privacy; 18 historical P02 manifest mismatches;
16 inaccessible temporary directories; independently unverified Docker preservation.
P04 did not rerun P03 tools that overwrite evidence or manipulate their files.

[Hash investigation](p04-validation/evidence/p02-hash-investigation.json) checks P03's
18 baseline versions against committed HEAD variants, LF/CRLF and up to 12 local path
history commits. All 18 P03 baseline versions match committed source variants from the
existing P02 feature history; they are not P04-introduced unexplained working-tree edits.
However none of the expected historical manifest hashes was found among inspected EOL/
history candidates. Thus current committed provenance is established, but the exact
manifest-to-source transition cannot be explained/proven legitimate from hashes alone.
The historical mismatch finding is **not resolved**. One current working hash now includes
authorized P04 JwksLoggingHandler edits; historical comparison explicitly uses the P03
baseline and committed HEAD instead. No history/manifest was rewritten or remote fetched.

## M–O. Preservation, files, rollback and P05

[Preservation](p04-validation/evidence/preservation.json) checks root/submodule HEADs,
branches/indexes/gitlinks, protected source, P03 artifacts, pre-existing changes and
allowed changed paths. [Change manifest](p04-validation/evidence/change-manifest.json)
lists all task files/hashes and metric/scrape changes. Only the two permitted service trees
and new P04 reports/validation artifacts changed. No shared JWKS/Spring Boot/Grafana/DB/
keys/secrets/old telemetry change, no migration, Git reset/clean/checkout/pull/submodule
update/commit/push/staging or branch operation. All P03 artifact hashes match preflight.
Spring Boot resource preservation was not independently inventoried; no action targeted it.

Docker/volume/data preservation is supported by prohibited-operation compliance, **not**
independent before/after runtime equality: access remained denied. No Docker resources
were created, so no container/network/volume cleanup occurred. No real credentials or
key material entered evidence; tests use existing synthetic/ephemeral fixtures.

[Rollback](p04-rollback.md) is source-only and protects pre-existing edits/state. P05 may
be planned from verified names, but implementation/deployment should wait for P03/P04
runtime gates, private access/exemplar policy, real target/pool/fault/cardinality evidence,
accepted capacity budgets and notification ownership. P04 stops here for review; no P05.
