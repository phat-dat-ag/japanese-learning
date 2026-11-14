# P10 approved WSL2 maintenance — 2026-11-14

**P10 PARTIAL.** The approved 9 GiB configuration and one controlled interruption completed successfully. Engine memory now passes; Windows available physical memory does not. Full recovery was **not executed**, and no disposable recovery resources were created. Previous P10 successes and historical receipts remain unchanged. P00–P09 remain accepted (10/12 phases); P11 is unstarted.

## Authorization and configuration

The current user instruction explicitly approves `memory=9GB` and one Docker Desktop/WSL2 interruption. This narrow maintenance authorization supersedes the previous no-restart restriction for this operation only. It does not change the authoritative quality gate, full-recovery budgets, backup policies or data-preservation rules.

`C:\Users\nguye\.wslconfig` did not exist. Its absence was recorded before creation in the private backup [wslconfig-before.json](../../.local/p10-wsl-maintenance/wslconfig-before.json). Docker Desktop settings were separately copied to `.local/p10-wsl-maintenance/desktop-settings-before.json`; neither private backup is intended for Git. The resulting complete configuration is:

```ini
[wsl2]
memory=9GB
```

No swap, CPU, network or other option was changed. The configuration SHA-256 and exact before/after contents are in the [maintenance receipt](p10-validation/evidence/wsl-maintenance.json). Its value remains in effect; no second interruption or rollback was performed.

## Controlled interruption

The immutable [pre-change baseline](p10-validation/evidence/full-recovery-wsl-before.json) records all 52 containers, images, mounts, states, health and restart counts; all volume identities; backup hashes; P08 task-definition hash; Git HEAD/submodules; host/Engine capacity. Every running container with a health check was healthy. Both P08 tasks were Ready, not running. Read-only SQL Server/MySQL checks found no active backup or maintenance operation. Database metadata digests were captured without exposing row contents or credentials. Private configuration backups completed before shutdown.

Installed Docker Desktop CLI version: 4.99.0. Sequence:

| Event | UTC |
|---|---|
| Controlled `docker desktop stop --timeout 90` requested | 14:49:01.700 |
| Desktop stop completed | 14:49:29.251 |
| `wsl --shutdown` completed | 14:49:30.692 |
| `docker desktop start --timeout 120` requested | 14:49:43.367 |
| Desktop start command completed | 14:49:48.782 |
| Post-start complete inventory/health preflight recorded | 14:51:12.166 |

The stop-request/start-completion interval was 47.082 seconds. This is a maintenance command interval, **not measured application outage or restore RTO**. Startup health checks were allowed to settle; no Compose recreation, explicit individual container start, volume deletion, pruning or reset occurred.

## Fresh resource guards

| Measurement (MiB) | Before change | First post-start guard | Settled final guard |
|---|---:|---:|---:|
| Windows physical RAM | 16,078.074 | 16,078.074 | 16,078.074 |
| Windows available RAM | 3,469.535 | 195.727 | 463.957 |
| Engine/WSL visible capacity | 7,787.652 | 8,935.641 | 8,935.641 |
| Engine available headroom | 3,455.002 | 4,765.875 | 4,848.480 |
| Engine >=3,680 MiB | FAIL | PASS | PASS |
| Windows >=1,024 MiB | PASS | FAIL | FAIL |

The [first post-start guard](p10-validation/evidence/full-recovery-wsl-after.json) and [settled final guard](p10-validation/evidence/full-recovery-wsl-final.json) preserve both failed attempts. Intermediate Windows samples were 493.422, 519.031 and 435.121 MiB over approximately 32 seconds. The final host deficit is **560.043 MiB**. Disk, CPU (16 available / six maximum requested), cached images, branch, no-existing-P10-runtime and preservation checks passed. Configured 9 GiB and observed VM memory differ due to VM/kernel accounting; neither value is Windows free RAM.

At the final preflight, existing container working sets total approximately 4,066.614 MiB; VM MemAvailable was the limiting Engine measurement. The host process sample showed `vmmemWSL` at 7,390.406 MiB, plus browser processes, editor, security software and Windows overhead. These are observations, not proof of a leak or a reason to terminate unrelated processes. WSL capacity/headroom and physical host headroom are distinct: raising the former did not create physical RAM. No cache flush, swap increase, unrelated process termination or additional infrastructure interruption was attempted.

The approved full envelope remains 4 GiB disposable storage, 512 MiB test data, 1,500 requests, 3,424 MiB Docker RAM, 768 MiB host Node RAM, six cores, 20 minutes and zero additional swap; existing client/rate/fault/drain limits remain unchanged. The 1,024 MiB host guard was not reduced.

## Preservation and acceptance

The [consolidated verification](p10-validation/evidence/wsl-maintenance-verification.json) passes all 13 recorded checks:

- All 52 original container IDs/images/mounts and all original volume identities preserved; original running/stopped states restored.
- All 16 formerly running containers have expected new start times. Restart-count deltas are zero for each; Docker's restart counter does not count this Engine lifecycle as an automatic container restart. All services with health checks are healthy.
- P08 task definitions match and both tasks remain enabled; all backup artifact hashes/size/mtime match.
- Git HEAD and submodule revisions match.
- Read-only database metadata digests match. MySQL TABLE_ROWS is an estimate; this is metadata validation, **not an exhaustive business-row checksum**. No business-data mutation was performed.
- Existing log queries return 5,338 documents, Prometheus returns four `up` series, Tempo storage search returns a trace, and Grafana lists three dashboards. These prove access after restart, not full historical identity reconciliation. No live history was restored, deleted or rewritten.
- No P10 runtime containers remain; none were created for recovery.

Full recovered logs/mappings/settings, metric sample fidelity, trace identity fidelity, dashboards/datasources, collector state/resumed ingestion and recovered alert behavior remain **NOT EXECUTED for this full drill**. Prior scenario evidence stays valid. Full-drill peak storage/RAM/CPU, requests, RPO and RTO remain null/unmeasured; historical P08 timings are not substituted. The preflight and maintenance observations are not recovery performance results.

The remaining limiting resource is Windows available physical RAM. The least disruptive next action is for the user to save work and close unneeded browser/editor workloads, then rerun every guard; at least another 560.043 MiB is needed merely to reach the current host guard, and measurements must remain safe during any drill. No such processes were closed automatically. If sufficient headroom cannot be obtained, defer recovery or separately authorize another maintenance plan; the one approved interruption is already consumed. No larger WSL ceiling or test-budget increase is proposed.

Source checks: `node --check` passes for both new maintenance scripts; Git whitespace validation passes. No commit, push, merge, shared authentication change or P11 implementation occurred.
