# P07 verification: single authoritative Compose source

## Current runtime acceptance update (2026-11-13)

This section supersedes earlier statements that P07 was wholly undeployed or all backlog
state was unknown. P07 component files and runtime controls are now active, independently
verified read-only; deployment occurred outside this task. No restart/recreation/deployment
was performed here. Root Compose remains the sole source and no active component file changed.
**Decision: BLOCKED for final P07 acceptance, with substantial runtime checks now PASS.**

[Current status](p07-validation/evidence/current-acceptance-status.json),
[active artifact/counter audit](p07-validation/evidence/active-runtime-audit.json),
[settings/retention checks](p07-validation/evidence/active-acceptance-checks.json) and
[synthetic trace checks](p07-validation/evidence/live-trace-probes.json) are the current evidence.

| Check | Actual result and scope |
|---|---|
| Active configuration | All nine inspected files byte-match intended P07: Fluent Bit config/Lua/parser, Collector, Tempo, Prometheus config/rules, both Grafana datasources. All nine services use intended bounded local logs; Grafana defaults and Prometheus query flags match. |
| Fluent Bit operation | Version4.2.5, three memory inputs, Retry_Limit3, no storage.path. Output advanced220 to222, input/filter/output222 at final metric checkpoint; errors/retries/retry failures/drops0 and health OK. User/Learning inputs process records; JWKS input0 does not establish its collection coverage. No faults injected. |
| Current queue / preserved state | Active memory/filesystem/busy chunk counters0 at both checkpoints. Independently found TWO regular4KiB .flb files (8192 bytes total) retained under state/buffer, unlike the earlier no-file observation. Three DB/WAL/SHM sets remain mounted on jp_dev_fluent_bit_state. File presence is not proof of pending records and counters0 are not proof those retained files were delivered. No files replayed/read as records/deleted. |
| Volume sizing | Current archive metadata reports996368 logical bytes, including changing SQLite WALs; not allocated volume size or a consistent backup. User-reported~4.1MB is historical/different measurement scope. No inferred shrink/deletion or capacity rate. |
| Stored log privacy | Latest20 sampled documents:0 original/forbidden-key findings. Oldest20 sampled documents:20 original findings. Four synthetic GET probes produced safe correlated logs with matching trace IDs and no private sentinel/original. No complete history/value scan or historical sanitation claimed. |
| .NET tracing through gateway | Known in-ratio sampled trace retrieved from Tempo; exactly one SERVER span, unique ID, correct W3C parent (Tempo JSON base64 decoded), service user-api/namespace Japanese project, no events/links/private sentinel. OpenSearch log correlates independently. Covers unauthenticated401 path, not DB/client/business outcomes. |
| Quarkus tracing | Same GET401 path produced2 matching correlated log documents but trace retrieval remained404, even for an in-ratio trace ID. This path's export is NOT VERIFIED; do not claim a diagnosed exporter defect or successful cross-stack chain. Authorized read-only request coverage is needed. |
| Sampling | Initial random remote sampled IDs fell outside the public-boundary10% threshold; their non-retrieval is not an exporter failure. Positive probe fixture was corrected without changing sampling config. Both API export flags true, ratio0.1, root budget10; full runtime sampling distribution remains unverified. |
| Metrics/rules | Three targets UP, no target errors,48 rules healthy and active P07 flags match. This closes rule loading/target-health point checks, not alert firing/delivery or cardinality/capacity validation. |
| OpenSearch | ISM30d policy attached to26 indices; no expiry/deletion test.119979359 store bytes/257308 docs are point observations, not growth/quota. Cluster yellow:8 unassigned replicas,0 unassigned primaries on one node; no replica/data change made. |
| Tempo/Grafana | Matching provisioning and internal backend reachability; Tempo ready200 on final recheck after an earlier failed readiness request. One error-classified line in bounded Tempo diagnostics remains unclassified; no error-free lifetime claim. Authenticated Grafana datasource/RBAC checks still open. |
| Preservation | Fresh before/after metadata equal for all38 containers; no shared network IDs across projects. Normal read-only GETs added telemetry only. Source HEADs/indexes/protected files checked separately; no running resource or shared JWKS/Spring Boot change. |

Native Linux Fluent Bit happy-path parser/Lua/output compatibility is now evidenced by
matching active files, version and successful ingestion; the old Windows-download403 is
not a reason to redeploy or block this happy-path prerequisite. Retry/overflow/corruption/
restart behavior and consistent state handoff are still untested. Existing native offline
regression results remain valid historical evidence; no unnecessary full-suite rerun occurred.
Current root Compose config --quiet and Git diff --check PASS.

Remaining actions needing approval: an approved test identity/session for authenticated
read-only Learning/Grafana checks; a consistent protected backup/quiesce or platform snapshot
plan and custody decision for the retained8KiB files; named isolated fault/restart/pressure/
retention/rollback exercises; security/data/platform decisions on historical original,
backend native auth/TLS, quotas/headroom and monitoring. No blanket redeployment is justified
by the configuration comparison. Any later fix requiring recreation needs its own exact plan.
P07 is not complete; P08 is not started. Earlier sections below are historical stage evidence.


## Status and scope

P07 is integrated into the existing root `docker-compose.yml` for source review. No P07
Compose override is required or maintained; the redundant observability/p07/compose.candidate.yml
was removed after successful integration/model comparison. This is not deployed runtime
acceptance. No commit/push, restart/recreation/stop, volume deletion, stored-data mutation,
shared JWKS change, springboot_project change or P08 work was performed.

## Changed behavior and compatibility

Nine existing services change: fluent-bit builds P07 allowlisting/parser/config into its
image; prometheus references P07 config/rules and appends four query/evaluation bounds;
grafana references byte-identical P05/P06 provisioning copies and adds six session/new-user
controls; otel-collector and tempo reference hardened P07 files; user-api, vocabulary-api,
gateway and frontend receive bounded local Docker log policies (10m x3).

All20 services, existing images, ports, networks, dependencies, healthchecks, resource limits,
users, privileges, previous environment values and credentials are preserved. No existing
persistent volume is replaced or removed. Prometheus rules, Grafana dashboard binds and
Prometheus/Tempo datasource UIDs remain unchanged. P06 HTTP/OTLP endpoint values, sampling,
export toggles, namespace and tracing network/storage paths remain. Privacy filters remain
before export, with the previously reviewed P07 stricter filtering retained.

`fluent_bit_state:/state` and the three SQLite DB paths are preserved; the proposed new
p07_fluent_bit_state volume was never created and is no longer proposed. Old /state/buffer
chunks remain stored but are not replayed by P07's memory-only profile. Existing offsets
are reused; unknown files start at EOF. Protected consistent backup, queue/offset inventory,
privacy-safe drain/handoff and loss accounting are prerequisites to any deployment.
No claim is made that a retained volume alone guarantees uninterrupted/replayed delivery.

## Baseline and preservation

[Original preflight](p07-validation/evidence/preflight.json) records develop HEADs/indexes
and141 protected hashes; [follow-up baseline](p07-validation/evidence/single-compose-preflight.json)
records the prior root checksum and manifest digest. Root HEAD is
dcb831946f1af68280740ff300fcb590753c526c. Submodule HEADs/gitlinks remain dotnet
bbbab2f4dc80c0275152d4bf008f52b75c5778d6, quarkus815b637a799cab8009d154ee9c97cec0f1dce734,
angular7d25cfe4830da3856661f7449260e9027c596afb and JWKS
e9b90c31dfa311e0121285c8b7caa37c09cf4287. Branches/indexes and submodule trees remain unchanged;
root Compose is the only authorized tracked-file modification. The other140 protected files
remain byte-identical. An unrelated empty untracked root file0 is retained. Eight inaccessible
P03 directories remain uninspected; no cleanup/ACL change occurred.

Earlier selective snapshots each contained38 containers and detected external jp_dev
replacements/restarts around08:15-08:16UTC. The historical Docker identity comparison FAILED;
springboot_project identities and mount/network sets matched. This evidence is retained,
not rewritten or presented as proof of unchanged runtime for this follow-up. No container
lifecycle command was issued by this task. Actual data integrity remains unverified.

## Executed validation and evidence

- `docker compose -p jp_dev config --quiet`: PASS with the local environment; no resolved
  credentials were printed or stored.
- Updated check_config.py: PASS. Full synthetic-interpolated root model reviewed against
  pre-integration HEAD source via stdin; exactly permitted differences across nine services;
  no overlay. Every named volume/mount and unrelated service remains equal. Private env-file
  contents are not resolved into evidence. [Resolved model](p07-validation/evidence/resolved-compose.json).
-16 P07 security fixtures PASS, including actual LuaJIT filtering, sensitive sentinels,
  useful metadata preservation, datasource identity and offline budget/queue models.
  Existing P03 Lua fixture rerun:229 assertions PASS; not native Fluent Bit embedding.
- Native Collector0.145.0 and Prometheus3.14.0 config/48-rule validation PASS, YAML/provisioning
  syntax PASS. Native Tempo2.10.3 Windows config.verify now PASS; exact Linux image behavior and Fluent Bit embedding remain UNVERIFIED.
- Earlier P07 results retained:151 .NET and372 Quarkus offline regressions,42 native promtool
  scenarios PASS. These application suites were not rerun for the Compose-only follow-up;
  application sources and P05 rules are unchanged. Mysql fixtures were excluded.

[Configuration evidence](p07-validation/evidence/config-validation.json),
[test summary](p07-validation/evidence/test-summary.json) and
[preservation](p07-validation/evidence/preservation.json) distinguish source/model/native
validation from runtime observation. Queue overflow and document shape tests are offline
models, not measured backend tests. Original read-only monitoring observations (three targets
UP,48 rules healthy, Grafana unauth APIs401) are point-in-time historical observations, not
acceptance of the newly referenced source configuration.

## Security, storage and outstanding findings

[Inventory](p07-security-inventory.md), [privacy](p07-privacy-hardening.md),
[budgets](p07-storage-budget.md) and [isolation](p07-runtime-isolation.md) cover trust boundaries,
control losses and remaining risks. Raw/original and arbitrary message fields are removed
from future filtered records; historical data is not sanitized. Memory-only buffering and
finite retries can lose data. Strict Grafana cookies can affect external login/deep links;
query limits can reject expensive workloads; sample rejection can reduce monitoring data.
None is runtime-approved.24h Tempo retention remains, without a hard disk quota guarantee.
OpenSearch templates/settings remain unapplied; native RBAC/TLS is critically deferred.

All unresolved P02-P06 findings remain: gateway verification, missing Nginx inputs, native
Fluent Bit parser/MessagePack/rotation/replay, stored original privacy, historical manifest
mismatches, inaccessible dirs, runtime metrics/cardinality/capacity, Quarkus exemplar privacy,
unanswered dependencies, alert firing/notification delivery, OTLP ingestion/Tempo retrieval,
stored-trace privacy, storage quota/retention. Actual Lua-only execution and native rule
validation/scenarios were verified in P07; those narrower results do not close runtime gaps.
The shared JWKS nested-spool collection gap is corrected only in future P07 config; shared
producer source and both consumers' JWT/JWKS behavior remain unchanged.

## Deployment, rollback and P08

Runtime acceptance is BLOCKED pending explicit deployment authorization, exact-image
permissions/validation, backup/offset handoff, stored synthetic privacy and reader checks,
OTLP ingestion/retrieval, network/access/TLS denial tests, quotas/retention/pressure/recovery,
monitoring/notification validation and confirmation of both projects' isolation. No broad
Compose up/down or initializer/migration execution is authorized by source integration.

[Manifest](p07-validation/evidence/change-manifest.json) records root modification, all P07
artifacts and redundant candidate removal. [Rollback](p07-rollback.md) describes source-hunk
reversal and the privacy-sensitive legacy-buffer handoff gate without deleting stored data.
P07 runtime acceptance remains incomplete; P08 is not ready and was not started.

## Blocker-resolution continuation: still BLOCKED

No root Compose change was needed in this continuation. The only component correction is
extending the same sensitive-label sample rejection to Prometheus self-scraping; a native
synthetic test exposed that coverage gap. The updated source generator reproduces the fix.
No active bind source or running resource changed. Existing service identities, credentials,
P05 rules/dashboards, P06 pipeline and all named volumes remain intact.

[Backlog handoff](p07-backlog-handoff.md) establishes the exact incompatibility: memory-only
P07 does not load legacy chunks, while enabling recovery does not re-run the new Lua filter
and can modify corrupt chunks. Old chunks can embed original. Generate_ID hashes rewritten
maps and Current_Time_Index can move replay into another daily index, so dedup/exactly-once
cannot be assumed. A read-only offline inventory and fail-closed ledger assessment are
implemented;9 synthetic tests PASS. No live chunk count/bytes/record/ack snapshot was read,
no replay/migration was attempted and no safe lossless migration is guaranteed.

[Stored privacy/access review](p07-stored-data-privacy.md) separates historical containment
from future filtering. Loki is absent from jp_dev and belongs to the protected project;
no Loki contents/configuration were inspected or changed. No historical telemetry is
claimed sanitized. Native RBAC/TLS, custody/restore, quotas and pressure recovery still need
owner decisions/evidence; source-only work cannot invent keys, policy activation or capacity.

Newly executed checks:16 security fixtures plus229 actual Lua assertions PASS;9 handoff tests
PASS; native Collector0.145.0 six-input/two-output synthetic OTLP pipeline PASS with no secret
sentinel in exported protobuf or diagnostics; native Prometheus3.14.0 rejects22 sensitive
label names and preserves safe series for all three jobs in a temporary synthetic TSDB.
No Docker/Tempo/live storage was used by these native processes. The first metrics fixture
failed on the unfiltered self job, the source was corrected, and final engine tests passed.
The initial sandbox handoff run failed temp-directory access; approved execution outside
the sandbox passed without historical-directory repair. Existing inaccessible P03 dirs
remain unresolved; no new claim of exhaustive filesystem access is made.

Pinned official Tempo2.10.3 Windows archive checksum was verified; native config.verify
PASS without server startup. Native Collector, Prometheus config/48-rule and root Compose
validation rerun PASS. Fluent Bit4.2.5 native validation remains UNVERIFIED: official Windows
package/checksum endpoint returned403, release API has no binary assets, and only protected
Docker Desktop WSL exists; it was not used. Exact deployed Linux image behavior is still a
gate even where the same-version Windows validator passes. Earlier151 .NET/372 Java/42
promtool scenarios are retained evidence, not newly rerun application suites.

Fresh selective before/after metadata comparison PASSED for38 containers: IDs/start times,
state, networks, mount sets and publications matched for both projects. This narrow new
result does not erase earlier external drift or certify mutable data integrity. Current
Prometheus flags independently confirm2d/512MiB retention and admin/lifecycle APIs off;
Grafana13.2.2 database OK and unauth datasource API401. No backend payloads were read.

[Runtime acceptance runbook](p07-runtime-acceptance.md) and machine template define15
reproducible cases with proof/abort conditions. All Docker deployment/stored/fault/restart
cases remain NOT EXECUTED. [Blocker register](p07-validation/evidence/blocker-resolution.json)
lists exact owner actions. P07 is NOT READY FOR CONTROLLED DEPLOYMENT until backlog,
privacy/access, capacity and exact-image gates have reviewed evidence and deployment is
explicitly approved. P07 completion requires actual runtime acceptance. P08 is not started.
