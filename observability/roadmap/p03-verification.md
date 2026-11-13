# P03 verification and review report

2026-11-13. P03 source audit, inactive collector proposal and local fixtures completed.
Full P03 acceptance and deployment are **BLOCKED**. No production readiness or deployed
end-to-end verification is claimed. Stop at P03; P04 remains a recommendation only.

## A. Executive summary

Current source retains raw original records, cannot rediscover compressed Quarkus/JWKS
archives, lacks proxy-log inputs, and does not fully consume P02 canonical aliases.
Prepared an inactive typed/no-raw Lua adapter and isolated bounded collector profile.
Executed 13 P03 Python tests and 3 existing P02 fixture methods successfully. No application
test suite, Lua/Fluent Bit process or OpenSearch ingestion run occurred. Loss reproductions
are documented as FAIL against loss criteria even though the reproducer tests PASS.

## B. Preflight and gateway bind-source safety

All twelve mandatory documents reviewed before implementation; the roadmap, P01 gates and
relevant source configurations were also reviewed. Root initial HEAD:
1c828d6c3652af744722e57063cb5811caa614ef; initial status only lowercase m dotnet/quarkus.
Pre-existing internal edits: dotnet/src/JapaneseLearning.User.Api/Program.cs and
quarkus/src/main/resources/application.properties. Neither was touched. The detailed
[snapshot](p03-validation/evidence/preflight.json) was written after creating its own
snapshot.py, so its root status additionally includes the new P03 validation directory;
that directory was not pre-existing work.

| Repository | Initial working HEAD = parent gitlink |
|---|---|
| angular | 7d25cfe4830da3856661f7449260e9027c596afb |
| dotnet | dca468d5d1d470488be1c6a13fd8099b52d6deab |
| quarkus | d6642616abf0d3373c4ebe1f514d69ec9b669f2a |
| springboot-jwks-api | 7879d155eddb45fb079800709f49a3c3a1566120 |

P02 manifest has 45 entries; 18 current byte hashes differ, also after LF comparison.
These are historical evidence drift, not P03 edits. Current SHA/dirty state supersedes
historical snapshots; the old 224 results cannot certify this checkout. See
[manifest audit](p03-validation/evidence/p02-manifest-audit.json) for exact paths.

docker-compose.yml declares gateway/nginx.conf -> /etc/nginx/nginx.conf. Restored current
file hashes to Git blob ac2034f50abcf75ebefbd0f8b44cc47b484dbe93, matching HEAD. Comparing
gateway/nginx.p02.conf shows log-only maps/format changes; it is not referenced in inspected
Compose files. Both were read and left byte-identical. Gateway current text contains peer
address; candidate uses escaped JSON/static families. No candidate activation occurred.

P02's temporary bind-source modification remains an incident with unknown runtime impact.
Git restoration does not prove that the mounted inode, container-visible file, parsed
Nginx configuration or intermediate requests were unaffected. Docker ps/volume/network
listing each returned permission denied at dockerDesktopLinuxEngine; IDs/mounts/effective
config could not be inspected. No reload/restart/exec was attempted. No Nginx binary was
available: current source, candidate and frontend syntax are **NOT VERIFIED**, despite
passing static P02 template rendering. Candidate remains inactive pending separate review.

## C–E. Pipeline, compatibility and Fluent Bit changes

See [architecture](p03-pipeline-architecture.md) for all boundaries and
[compatibility](p03-collector-compatibility.md) for types, timestamps and readers.
Only new p03-validation files were created. Existing observability/logging is itself a
declared initializer bind source and was preserved. Candidate uses distinct /p03-state,
explicit 32 up chunks/8M backlog/64M test output, original-free allowlist, type_int_key for
status and time_as_table; existing 1M skip-long/infinite-retry/30s-grace policies retained.
No live state/DB/buffer replacement. These settings require runtime validation and budget
approval; they are not production sizing or a hard disk/RSS guarantee.

## F–G. Rotation, replay, overflow and loss

[Rotation report](p03-rotation-replay.md) records every measurement. Readable rename and
precompression replay each read 100 unique of 100. Immediate compression and active-only
copy-truncate each missed 100/100 locally; copied overlapping inputs and whole-file reopen
each created 100 duplicate reads. A 256-byte model retained 25 records/250 bytes and evicted
75/100; actual chunk queues were not exercised. Four malformed/oversize/partial/valid
physical records yielded one read and three separately counted rejects. Backend attempted
and confirmed deliveries: zero. No actual recovery/loss rate or crash/power-loss promise.

## H–I. Privacy and isolated verification

[Privacy](p03-privacy-verification.md) documents raw original retention in _source and the
prefilter buffer risk. Synthetic sentinel Lua tests were prepared but not executed;
OpenSearch stored-source privacy is NOT VERIFIED. Historical remediation stays separately
approval-gated. No existing documents, archives or retention policies changed.

No Docker environment was started: normal access and protected-resource isolation could
not be verified. No test volumes/networks/ports/containers exist from this task. Future
runtime harness preflight must prove exact ownership/mount/port/resource/hard-storage
bounds. The local harness writes only synthetic files to new owned UUID directories;
its final runs clean those exact files. Initial restrictive tempfile failures left 16
inaccessible empty-by-write-history directories (eight workspace/eight OS temp); normal
cleanup was denied. No permission changes/escalation. [Cleanup inventory](p03-validation/evidence/cleanup.json).

## J–K. Tests and remaining gates

[Test matrix](p03-test-matrix.md) contains commands/counts and all scenario statuses.
Remaining FAIL: original source privacy, demonstrated archive/copy-truncate loss and
duplicate replay. Remaining NOT VERIFIED: Lua/config/Nginx syntax, parser failure behavior,
calendar/UTC timestamp validation, encoded sentinel/filter/buffer/_source behavior,
installed mappings/readers, offset persistence, crash/restart/slow sink/backpressure/
disk pressure/searchable recovery. Deployment BLOCKED by those critical data/privacy
gaps, Docker/isolation denial, raw-reader migration and unapproved R04-R08 budgets.
Owners: operations for isolation/rotation/capacity, security/data for privacy/migration,
service owners for metadata/diagnostic templates, both parent owners for shared changes.
Close these in a separately authorized P03 acceptance run before dependent deployment.

## L. Shared JWKS compatibility

Japanese JWKS is clean at 7879d155eddb45fb079800709f49a3c3a1566120 and unchanged. Adapter
handles its existing serviceVersion/environment/duration/error envelope without changing
keys, auth, source, pointers or dependencies. Its gzip archive gap remains. Spring Boot
has a historically different spool layout; no current Spring Boot source/test/change was
attempted. No dual-consumer runtime compatibility is asserted. Future shared edits must
follow [governance](shared-jwks-governance.md); P03 does not authorize them.

## M–N. Final safety audit and file inventory

[Preservation](p03-validation/evidence/preservation.json) compares preflight/final metadata:
HEADs, branches, index/gitlinks, service statuses/diff hashes and protected source hashes.
Only seven new P03 reports plus dedicated candidates/tests/evidence were created; exact
file paths/hashes are in [change manifest](p03-validation/evidence/change-manifest.json).
Root tracked diff remains the pre-existing submodule dirtiness only. All P03 files are
new and unstaged. No shared JWKS/Spring Boot files, database schema/migration, Compose,
Grafana, JWT/JWKS keys or existing runtime config was modified. No commit/push, Git branch
operation, container lifecycle command, log truncation, buffer reset or live index/data
operation occurred. Existing submodule diff hashes remain unchanged.

Docker resource preservation is **NOT VERIFIED independently**: prohibited-operation
compliance is supported by command audit; inaccessible IDs/start times/mounts/volumes
prevent before/after equality proof. External processes are outside this task's control.
No secrets were exposed in evidence; only metadata and synthetic fixtures were used.

## O–P. Rollback and next scope

[Rollback](p03-rollback.md) is source-only and preserves every existing file/state. No
deployed rollback was needed or tested. Recommended P04: inventory existing application,
dependency and collector metrics, capture real names/types/units/cardinality in a safe
environment, then review bounded gaps under P01. Do not install alerting/tracing/security
infrastructure or begin P04 automatically. P03 runtime acceptance remains open for review.
