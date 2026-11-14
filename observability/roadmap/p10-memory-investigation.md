# Current memory recheck and recovery — P10 PASS for local development

The [subsequent full-recovery continuation](p10-full-recovery.md) measured fresh Windows/Engine headroom above all guards and completed the native drill safely, without further WSL settings, Docker restarts or unrelated process termination. Minimum sampled Windows availability was **2,096.715 MiB**. Full RPO/RTO and preservation pass; **P10 PASS, 11/12 phases complete, P11 unstarted**. Earlier memory failures below remain historical evidence.

# Current approved WSL2 change — P10 PARTIAL

The user subsequently authorized 9 GiB and one controlled interruption. Both completed; all original resources recovered. The [maintenance report](p10-wsl-maintenance.md) records final Engine headroom **4,848.480 MiB (PASS)** but Windows available RAM **463.957 MiB / 1,024 MiB required (FAIL)**. Full recovery remains unexecuted. The earlier measurements and no-restart authorization below are historical; no second interruption is authorized by this operation.

# P10 safe memory investigation — 2026-11-14

**P10 PARTIAL for local development. Full multi-store recovery was not executed.** The latest complete preflight measured **3,471.542 MiB available**, below the unchanged **3,680 MiB** guard by **208.458 MiB**. All other preflight checks passed. No existing service, memory setting, backup policy or acceptance criterion changed. P00–P09 remain accepted (10/12 phases); P11 remains unstarted.

## Evidence and method

Read-only consolidated [investigation](p10-validation/evidence/memory-investigation.json) and immutable [complete fresh preflight](p10-validation/evidence/full-recovery-memory-preflight.json) retain the measurements, process metadata, container limits and complete before/after resource identities. The earlier `full-recovery-preflight.json` remains unchanged. `investigate-memory.cjs` uses Docker inspection/stats, selected Windows process/settings metadata and `/proc/meminfo`; it has no process termination, container lifecycle, configuration mutation or cache-flush operation. The preflight now accepts a validated unique receipt name and reads meminfo with a small `cat` process rather than a Python interpreter. No prior resilience scenario was repeated.

## Memory accounting

| Resource / sample | Measurement |
|---|---:|
| Windows physical RAM | 16,078.074 MiB |
| Windows available RAM, investigation sample | 3,614.969 MiB |
| Engine / WSL VM visible RAM | 7,787.652 MiB |
| Running container working sets, initial sample | 4,342.940 MiB |
| Running container working sets, second sample | 4,344.394 MiB |
| Guard headroom, initial sample (14:37:08 UTC) | 3,444.712 MiB |
| Guard headroom, second sample (14:37:15 UTC) | 3,443.258 MiB |
| Complete final guard (14:37:34 UTC) | 3,471.542 MiB |
| Mandatory guard / final deficit | 3,680 / 208.458 MiB |
| Running container configured limits, summed | 12,224 MiB |
| Running container memory reservations, summed | 0 MiB |

Samples fluctuate naturally; the increase at the final guard is **not reclaimed memory**. Guard availability is the minimum of Engine total minus Docker-reported working sets and VM `MemAvailable`. Formatted Docker working sets are rounded and do not justify accepting insufficient headroom. Configured limits are ceilings, not allocations or actual usage; their sum can exceed VM RAM. Windows available RAM is distinct from VM available RAM. Available disk space does not satisfy this guard.

Second-sample working sets:

| Protected service | MiB |
|---|---:|
| OpenSearch | 1,122.30 |
| SQL Server | 985.80 |
| MySQL | 445.20 |
| Grafana | 403.50 |
| OpenSearch Dashboards | 266.70 |
| Vocabulary API | 249.50 |
| JWKS API | 223.50 |
| OTel Collector | 182.50 |
| Tempo | 137.30 |
| Prometheus | 113.40 |
| User API | 107.90 |
| Storage monitor | 42.64 |
| Fluent Bit | 19.71 |
| Gateway | 16.83 |
| Frontend | 15.77 |
| Logs UI | 11.84 |

Docker Desktop reports the WSL2 engine; only `docker-desktop` is running. No user `.wslconfig` exists and the inspected Desktop settings expose no explicit memory override. The observed VM capacity is consistent with WSL's documented default of 50% of Windows RAM, allowing for VM/kernel accounting. This is a configuration inference; the measured VM total is authoritative. See [Microsoft WSL configuration documentation](https://learn.microsoft.com/en-us/windows/wsl/wsl-config). The evidence does not establish a memory leak or a particular service regression.

Existing VM swap is 2 GiB; no additional swap was allocated. VM `MemAvailable` already accounts for reclaimable memory: cached pages are not an independently available capacity addition. No cache flush was attempted.

## Safe reclamation and preservation

**Reclaimed by action: 0 bytes.** No labelled P10 containers, volumes, networks or images were found. There are 52 pre-existing containers: 16 running and 36 stopped; all stopped containers have runtime PID zero. They are protected resources and do not offer substantial runtime RAM reclamation. The process scan flagged one transient PowerShell PID (19920); a follow-up read confirmed it had exited without intervention. No abandoned P10 owner was established and nothing was stopped. Codex/platform processes were preserved. Disk-only historical artifacts were retained.

Complete before/after comparisons pass for all 52 container IDs, image identities, start times, health/state, restart counts, mounts and networks; volume identities; backup artifact hashes/size/mtime; P08 task definition hashes; Git HEAD and submodule revisions. No business database write, authentication change, restore or live-volume operation occurred. This is resource/configuration preservation evidence, not a claim that actively running databases remained byte-identical during normal development activity.

## Acceptance and next action

| Check | Result |
|---|---|
| Engine memory >= 3,680 MiB | FAIL: deficit 208.458 MiB |
| Host memory, workspace capacity, CPU, cached images, no existing P10 runtime, develop branch | PASS |
| Protected runtime / volumes / backups / schedules / revisions | PASS |
| Full multi-store restore and recovered service verification | NOT EXECUTED |
| New full-drill RPO/RTO, peak storage/RAM/CPU, request count | Unmeasured; no recovery workload created |

All approved envelopes remain unchanged: 4 GiB disposable storage, 512 MiB data, 1,500 requests, 3,424 MiB Docker RAM, 768 MiB host Node RAM, 6 CPU cores, 20 minutes, no additional swap; existing client/rate/fault/drain limits still apply. The investigation Node process peak RSS was 48.625 MiB; this is not a recovery peak. Earlier P08 recovery timing remains historical evidence, not a new P10 result.

Within current authorization, retain the guard and wait for genuine natural headroom; there is no verified P10-owned runtime to reclaim. A concrete future maintenance option is an explicit WSL2 `memory=9GB` ceiling (approximately 1 GiB above the apparent default), with no swap increase and all existing P10 guards retained. This requires **separate user approval for a planned Docker/WSL interruption**, since applying WSL configuration can require shutdown/restart and would interrupt protected services. It is prohibited in this execution and was not performed. Recheck Windows available RAM and every guard before proceeding; increasing a ceiling neither creates nor reserves physical RAM and does not guarantee a pass. No further test-budget increase is proposed.
