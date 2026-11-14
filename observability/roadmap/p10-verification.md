# Current P10 acceptance — PASS for approved local development

The [full multi-store recovery report](p10-full-recovery.md) closes the remaining gate. Fresh Windows/Engine guards pass; actual backup recovery verifies **1,867 logs, 828,320 metric samples, 271 trace payloads, one backed-up dashboard, datasources, three offset databases, resumed ingestion and one firing/one resolved notification**. RPO **34,403.272s** and service RTO **544.245s** satisfy 24h/4h targets. Resource caps and continuously sampled host headroom remain safe. Exact cleanup and preservation of all 52 original containers, original volumes, backup artifacts, P08 tasks and Git revisions pass. [Immutable P10 acceptance](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/acceptance.json) retains prior native/ENOSPC/privacy/retention evidence; historical failures below are unchanged. **11/12 phases complete; P11 remains unstarted.** This is local-development acceptance only, with the documented fixture/loss/sampling/P07/P08 exceptions, not production readiness.

# Current P10 approved WSL2 maintenance — PARTIAL

The [approved 9 GiB change and single controlled restart](p10-wsl-maintenance.md) completed. All 52 original containers and volume identities, backup artifacts, P08 tasks and revisions are preserved; 16 expected start-time changes are recorded, restart-count deltas zero, services healthy and telemetry accessible. Final Engine memory passes (**4,848.480 MiB**), but Windows available RAM fails (**463.957 / 1,024 MiB**, deficit **560.043 MiB**). No full recovery environment was created; recovered-store integrity, peaks and full-drill RPO/RTO remain unmeasured. P10 remains PARTIAL; **10/12 phases complete, P11 unstarted**. All historical evidence below remains intact.

# Current P10 memory investigation — PARTIAL

The [safe memory investigation](p10-memory-investigation.md) and [fresh complete preflight](p10-validation/evidence/full-recovery-memory-preflight.json) supersede the earlier capacity sample: **3,471.542 MiB available / 3,680 MiB required; deficit 208.458 MiB**. No verified abandoned P10 runtime could be reclaimed; no processes, services or settings were changed. All 52 containers, volumes, backup artifacts, P08 schedules and revisions pass preservation checks. Full recovery was not executed; its resource peaks and RPO/RTO remain unmeasured. Prior successful tests remain valid. P10 remains PARTIAL, 10/12 phases complete, P11 unstarted. The proposed future WSL 9 GiB ceiling needs separate maintenance-interruption approval and fresh guards.

# Current P10 audit/recovery result — PARTIAL, capacity blocked

The full-recovery resource authorization is now granted. The [file audit and preflight](p10-file-audit.md) preserve all prior evidence, archive 49 exact duplicate paths and record **3,435.576 MiB available versus the mandatory 3,680 MiB**. Full recovery was not executed; new full-drill peaks/RPO/RTO are unmeasured. All 52 original containers, volumes, backups, schedules and revisions matched before/after. Prior native scenario, ENOSPC correction, privacy and retention passes remain intact. P00–P09 remain complete (10/12); P11 is unstarted.

# Current P10 resolution — PARTIAL, local development

The new [resolution report](p10-resolution.md) closes the tested ENOSPC cohort with a finite deterministic-ID recovery candidate (20/20 final documents, zero missing/duplicates), and records passing outage-privacy, native retention boundaries and post-retention ingestion. The native Fluent Bit pre-admission failure remains visible; no binary/live deployment or loss waiver is claimed. Full multi-store recovery remains BLOCKED pending a separate resource/data/request authorization and sufficient engine memory headroom. P00–P09 remain complete for applicable development scopes (10/12); P11 is unstarted. Earlier checkpoints below and both prior acceptance bundles remain unchanged.

# Current P10 result — PARTIAL, local development

The explicit user-approved development budgets close the earlier missing-budget blocker. Native pipeline outages, scrape/datasource failures, dependency/JWT fixtures, native alert grouping/resolution, collector-offset restart and limited encrypted logical recovery have now executed. **Twelve events remain missing after bounded native queue ENOSPC; full multi-store recovery and complete privacy/retention coverage remain unverified. P10 does not PASS.**

See the [continuation acceptance matrix and measurements](p10-continuation.md), [approved policy](p10-development-policy.md) and [machine acceptance](p10-validation/evidence/continuation-acceptance.json). All 52 original containers, original volume identities, P08 tasks and backup artifacts are preserved. P00–P09 remain complete for applicable development scopes (10/12); P11 remains unstarted. The original blocked checkpoint below is retained as historical evidence and is superseded only where the continuation explicitly records new results.

# P10 resilience validation — 2026-11-14

**P10 BLOCKED for integrated acceptance.** Source guard tests, read-only baseline and a bounded synthetic OS/queue experiment executed. No native pipeline/application outage or load acceptance is claimed. Machine results: [acceptance](p10-validation/evidence/acceptance.json).

## Authority and criteria

[P01 P10 gate](p01-quality-gates.md#p10-isolated-resilience--performance-validation) supersedes historical P00 gates. Dependencies: all P03–P09 accepted; the current user instruction establishes their applicable development acceptance. Historical blocked checkpoints in earlier reports do not reverse subsequent acceptance. The roadmap requires collector, disk/queue, DB dependency, trace-backend failures and recovery in a dedicated environment. Required measurements include latency, availability, drops, recovery, searchable/restored event identities and preserved protected resources.

The exact exit condition is: **“All approved resilience/performance/loss/RPO/RTO budgets PASS and protected resources preserved; any unverified isolation = BLOCKED, not risk acceptance.”** Preconditions include approved workload/fault budgets, normal Docker access, non-sharing validation and hard storage bounds. Mandatory guard cases cover empty/protected/colliding names, wrong labels/IDs, external volumes, symlinks and protected endpoints. Synthetic identities and test-only keys/certificates must preserve invalid-JWT rejection. Independent bounded state and exact-ID cleanup are required.

Approved P08 development targets remain RPO <=24 hours and RTO <=4 hours. The backup age check below is not an actual-event RPO measurement. P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE remain unchanged. They do not supply P10 workload approvals. P11 is untouched.

The [P03 decision record](p03-rotation-replay.md) explicitly says R04–R08 rates/drain/outage budgets remain unapproved; [P01 decisions D02/D03](p01-implementation-plan.md) require owner decisions. The roadmap's 5 GiB/15-minute maximum proposal explicitly requires approval and sizing. Neither that proposal nor a prior development PASS defines a peak rate, payload size, drain deadline, performance threshold or crash/drop allowance. These were not invented. Operations/application owners must supply or identify the approved budget record before integrated fault/load execution. This is the stopping prerequisite, not a request to change live resources.

## Baseline and execution

Reproduce under authorized Docker access:

```powershell
node observability/roadmap/p10-validation/validate.cjs
node observability/roadmap/p10-validation/report.cjs
```

The runner refreshes evidence filenames; retain the directory before rerunning if the previous run must remain immutable. `report.cjs` minimizes Windows task metadata and hashes retained artifacts. Baseline includes UTC, tool versions, parent HEAD, branch, submodule SHAs/index gitlinks, working status, Compose source hashes, every container image ID/reference, health/state/start/restart/mount identities and volume names/drivers. Exact versions and IDs are in [baseline](p10-validation/evidence/baseline.json); candidate Python is the cached pinned 3.14 Alpine image, without a pull. Parent HEAD: `1ba53cf0d1e472e7639e2de03370605512367b11`, branch `develop`.

The [health record](p10-validation/evidence/health.json) captures four UP scrape targets, eight healthy rule groups, no active alerts, three dashboard listings and both Grafana datasource health responses OK. OpenSearch is yellow with one node; no green-cluster claim. Tempo search responded; its completed/total job counts do not prove complete trace retrieval. Container health is not a full application functional test. Private collector health endpoints and full dashboard rendering were not independently exercised.

Both P08 scheduled tasks were Ready/enabled, StartWhenAvailable true and last result zero. Existing packages were read and authenticated with P08 `backup.verify`, without restoring plaintext or modifying destination/task configuration. Two valid generations were found. Latest: `p08-local-4815fdd93d5a35541e7ee661f3e94c40.enc`, 303 manifest files, SHA-256 `e8b8f657c5d4ced23340ce88c19cfc260b8ef2c20b82363a6a7a69e5fd891a89`. Current generation age is recorded in health evidence; it is within 24h. No keys, package contents or telemetry documents were exported.

The sole mutable resource was a manifest-owned standalone container with network `none`, no binds/volumes/ports, read-only root, all capabilities dropped, no-new-privileges, 0.25 CPU, 64 MiB memory/swap, 16 PIDs, local logs bounded to two 1 MiB files and an 8 MiB tmpfs. It uses synthetic integers and a harmless marker. The runner filled only this tmpfs, removed only its synthetic pressure file and verified a subsequent write/read hash. Exact ID/run/owner and exclusion from baseline were checked before container removal. No Docker prune, Compose down, host disk exhaustion or live lifecycle commands ran.

## Acceptance matrix

| Criterion | Status | Actual evidence / limitation |
| --- | --- | --- |
| Source guard predicates | PASS, source only | 13/13: one positive and twelve rejected cases. Boolean external/symlink/endpoint declarations are tested; this is not filesystem/path/network discovery or a validated native Compose model. |
| Bounded OS storage rejection/recovery | PASS, synthetic only | ENOSPC at 8,388,608 bytes; fill/rejection 0.0118324s; subsequent write/read 0.0693150s; marker hash correct. Whole fixture 0.0816621s. No native telemetry backend pressure claim. |
| Synthetic queue overflow/accounting | PASS, synthetic only | 24 generated, capacity 16, 16 recovered, 8 explicit drops, zero duplicates. No native collector buffering/retry guarantee. |
| Baseline backup authentication and schedules | PASS, read-only | Latest valid generation identified; both existing tasks enabled. No P10 restore/RPO/RTO drill. |
| Runtime preservation | PASS | All 52 pre-existing containers, including all 21 `jp_learning_dev` containers, retain exact captured identities/state/start/restart/health/mounts. [Post-test inventory](p10-validation/evidence/post-test.json). No existing volume mounted by candidate. |
| Fluent Bit → OpenSearch outage/retry/delivery/offsets | NOT VERIFIED | Approved integrated rate/size/drain/fault budgets missing; no zero-loss claim. |
| Collector → Tempo outage/retry/loss | NOT VERIFIED | Same prerequisite; memory-queue crash loss remains unmeasured. |
| Prometheus/Grafana datasource fault detection/recovery | NOT VERIFIED | Baseline reachability only. No independent watchdog acceptance. |
| Application, DB, JWKS, gateway failures/recovery | NOT VERIFIED | No real application dependency faults or invalid-JWT regression executed; business data and shared JWKS unchanged. |
| Native retention, queue/storage pressure, bounded resource behavior | NOT VERIFIED | OS fixture does not validate store retention, collector queues or host headroom under integrated load. |
| P07/P08 native recovery, event integrity, offsets, restoration order, RPO/RTO | NOT VERIFIED | P08 verifier reused for authentication only; prior P07/P08 drill evidence retained, not relabeled as P10. |
| P09 alert firing/routing/context/deduplication/resolution | NOT VERIFIED | Existing rules healthy; no fault notifications sent, no external destination contacted by fixture. |
| Full outage security/privacy sentinel regression | NOT VERIFIED | Selective metadata and synthetic hash only; no JWT/auth functional or rotated/buffer/stored sentinel suite. |
| Approved integrated performance/loss/fault budgets | BLOCKED | Owner decision required by authoritative gate; no new thresholds approved here. |

No measured native outage/recovery durations or native telemetry loss counts are available. Fixture timings above must not be used as service RTO. No PASS is assigned to an unexecuted scenario.

## Failed attempts and corrections

Initial Docker access was denied by sandbox; approved escalation restored access without daemon/config changes. Selective inspect initially failed on containers without `State.Health`; an `index` lookup fixed it. Cached Python selection initially expected an unpinned reference; corrected to the baseline pinned reference. The local log driver rejected compression with one retained file; corrected to two files. Both failed disposable containers were removed by exact owned ID in `finally`. Latest diagnostic is retained in `evidence/failure.json`; earlier failed preflights produced no fault resources. Historical attempts are described here because the runner uses fixed evidence filenames.

## Remaining work and progress

After approved budgets are identified, build and audit actual disposable native models against the protected inventory; establish headroom/abort ceilings; execute the native matrix with sequence-based loss/duplicate accounting, private notification receiver, fresh backup recovery and complete sentinel/JWT regression. The current predicate fixture is not an authorization mechanism for arbitrary Compose models. Non-destructive alternative now available: read-only health/inventory, actual encrypted package authentication and bounded synthetic OS/queue checks.

Only P10 files and roadmap progress are added. No commit/push/merge, submodule changes, business DB access, backup modification, live recreation/restart or P11 implementation. P00–P09 remain accepted for applicable local development: **10/12 phases complete; P10 BLOCKED; P11 unstarted**. No production readiness claim.
