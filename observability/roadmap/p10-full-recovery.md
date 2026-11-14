# P10 full multi-store recovery — PASS for approved local development

The remaining full-recovery gate passed in `jp_obs_validation_20261114150620_955b6d3f`. The [immutable aggregate acceptance](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/acceptance.json) combines the retained ENOSPC/privacy/retention resolution receipt with this actual native multi-store restore. **P10 PASS for the approved local-development scope; 11/12 phases complete. P11 remains unstarted.** This does not establish production readiness or off-host durability. P07/P08 local exceptions and all approved budgets remain unchanged.

## Preflight and isolation

The [fresh memory recheck](p10-validation/evidence/full-recovery-memory-recheck-20261114.json) measured Engine available memory **4,692.736 MiB** and Windows available physical memory **4,747.754 MiB**, both passing. The supervisor repeated the complete guards immediately before each attempt; the successful [start receipt](p10-validation/evidence/full-recovery-start-955b6d3f.json) records all 52 protected containers, original volumes, images, restart/health/mount/network states, backup hashes, P08 task definitions and Git/submodule revisions. All guards and service-health prerequisites passed.

No WSL setting, Docker restart, protected service lifecycle operation or unrelated application termination occurred in this continuation. The previously approved 9 GiB setting remains in effect.

The disposable Compose environment used five store/agent containers plus one Fluent Bit collector, one internal network, no published ports, no Docker socket, no external/shared volumes and no protected writable mounts. Ten manifest-labelled local-driver tmpfs volumes have explicit size/UID bounds. The agent mounts only those disposable volumes read-only for storage measurement. All root filesystems and host configuration/input binds are read-only; fresh CA/admin/node certificates and scoped credentials are generated privately. Native TLS and RBAC remain enabled. Cached image identities are recorded in `restore.json`.

The model caps Docker RAM at **3,424 MiB**, total CPU at **5.25 cores**, and has a conservative aggregate storage ceiling of **2,649.150 MiB**, including retained P10 artifacts and staging reserves, below 4 GiB. Docker logging is disabled in this fixture to avoid unbounded logging outside the measured filesystems; diagnostic metadata and failed-attempt receipts remain available. Agent RAM+swap limits are equal, as are all other container RAM+swap limits: no additional swap is authorized or allocated.

## Method and measured results

The [worker](p10-validation/full-recovery-worker.cjs) reuses the P08 native restore body through explicit checked adapters; the original P08 implementation/policy is unchanged. It authenticates and create-only restores the actual approved encrypted generation `p08-local-4815fdd93d5a35541e7ee661f3e94c40.enc` (SHA-256 `e8b8f657c5d4ced23340ce88c19cfc260b8ef2c20b82363a6a7a69e5fd891a89`). No lock, export, retention or other write is made in `D:\JapaneseLearningBackups`. Package authentication covers **303 files**. OpenMetrics expansion and the restored data/manifest total **111,838,247 bytes**, below the 512 MiB test-data ceiling.

Restoration order: authenticate/decrypt/checksums; fresh fixture TLS/configuration; start isolated backends; initialize OpenSearch security; restore and query logs; validate offset databases; compare native Prometheus history; reload and retrieve traces; restore Grafana dashboard/provisioning; verify resumed Fluent Bit ingestion; exercise recovered alert delivery and resolution. All services target only disposable addresses.

| Native check | Expected / actual | Result |
|---|---|---|
| Logs, mappings and settings | 1,867/1,867 documents; sorted IDs and complete source digests match; mappings/settings match; scoped query works | PASS |
| Log authorization | Anonymous/invalid credentials rejected; reader write/admin and writer read denied | PASS |
| Metrics | 828,320 samples; all eight archived time chunks match native query digests, including expected empty chunks; nonempty chunk has 1,211 series | PASS |
| Traces | 271/271 trace identities retrieved; normalized resource/scope/span payload digests match | PASS |
| Grafana | One backed-up dashboard's title/panels match; Prometheus and Tempo datasource health OK; anonymous datasource access denied | PASS |
| Collector state | Three authenticated restored SQLite offset databases pass native integrity checks; resumed Fluent Bit marker is searchable exactly once | PASS |
| Recovered incident path | Authenticated isolated sink receives exactly one firing and one resolved notification for the restored acceptance rule; unauthorized sink POST denied | PASS |
| Loss / duplicate reconciliation | No missing or extra documents/spans within the compared backup payloads; metric digests match; collector marker count one | PASS within the checkpoint scope |

Detailed native checks: [restore.json](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/restore.json). This is recovery of the **actual backed-up checkpoint**, not a synthetic logical drill or a claim that every current live record was backed up. The backup contains one dashboard; the two later P09 dashboards are not relabelled as newly restored here. Their existing validation remains valid. Data/configuration produced after the checkpoint remain outside this restored generation; no zero-loss claim is made for that interval. RPO measures that checkpoint age against the approved 24-hour target.

## Recovery and resource measurements

| Measurement | Actual | Approved ceiling / target |
|---|---:|---:|
| Native service restore RTO | **544.245 s** (9m 4.245s) | 4 hours |
| Checkpoint RPO | **34,403.272 s** (9h 33m 23.272s) | 24 hours |
| Full supervised execution including fresh preflight/cleanup/final inventory | **595.343 s** | 1,200 s |
| Sampled aggregate Docker RAM peak | **1,642.670 MiB** | 3,424 MiB |
| Sampled aggregate parent/worker host Node RAM peak | **504.129 MiB** | 768 MiB |
| Sampled CPU peak | **2.6693 cores** | 6 cores |
| Sampled accounted storage peak, including retained P10 artifacts | **501.003 MiB** | 4,096 MiB |
| Maximum current host staging observed | **106.690 MiB** | 192 MiB internal staging bound |
| Minimum sampled Windows available RAM | **2,096.715 MiB** | >=1,024 MiB |
| Native test-client requests | **648**, serialized admissions >=0.26s apart | <=1,500; <=5/s; <=2 clients |

The isolated sink counted 296 incoming requests, including periodic scrapes and some already-counted client calls. A conservative accounting adds these and a 34-request setup/collector allowance to the 648 client calls: **978**, not an independently measured exact all-process HTTP total. The controller enforces a stricter 1,100-admission client cap. No fault longer than the approved 30 seconds was injected: the alert stimulus has an automatic 25-second clear. This full restore did not introduce a queue-outage scenario; earlier queue/drain measurements remain authoritative.

The [parent supervisor](p10-validation/full-recovery.cjs) remains responsive while native imports block. **120 samples**, approximately every 3–8 seconds, record Windows headroom, combined Node working sets, Docker working sets/CPU, tmpfs allocated blocks and all P10 artifact/staging bytes. Any insufficient/invalid measurement or exceeded limit aborts the owned worker and triggers exact-owner cleanup. The reported peaks are **sampled**, not subsecond high-water guarantees; explicit resource/filesystem caps bound consumption between samples. No guard tripped. [Complete samples and cleanup](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/results.json).

## Failed attempts, corrections and checks

Both earlier attempts remain preserved:

- `jp_obs_validation_20261114150313_c99b07f8`: the adapter failed on a CRLF cleanup anchor before any native resource creation. Normalize line endings in memory; P08 source was not rewritten.
- `jp_obs_validation_20261114150429_7a6de3bb`: authentication passed; created containers failed the ownership check before native startup because a double-quoted inspection template still referenced the P08 label. Translate all exact label references. Only newly owned resources were removed; all protected comparisons passed.

The successful attempt used the same approved budgets. No previous successful ENOSPC/privacy/retention/pipeline scenario was repeated.

The supervisor's numeric resource predicates were subsequently extracted into a pure fail-closed validator, adding rejection of invalid samples without changing approved numeric thresholds. **12 boundary/invalid/deadline checks pass**, with zero Docker operations. All **120 actual successful-run samples** were replayed successfully through that validator; the existing inline supervisor already enforced the same numeric limits during the native run. Syntax and Git whitespace checks pass. The [artifact manifest](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/manifest.json) records the final reproducible sources and retained evidence; it is not a claim that the post-run guard extraction was loaded by the already-running process. New published evidence was checked against fixture credentials and JWT/private-key patterns.

## Cleanup and protected-resource preservation

Exact ownership verification removed **17 Docker resources: six containers, ten volumes and one network**. The [finish receipt](p10-validation/evidence/full-recovery-finish-955b6d3f.json) and successful aggregate results compare all 52 original container inventories exactly, including IDs, images, start times, restart counts, health/state, mounts and network attachments. Original volume identities, backup hashes/size/mtime, P08 task-definition hashes and Git HEAD/submodules match. There were **no additional restart effects** in this continuation. Business databases were not accessed by the restore fixture; live-volume contents were not overwritten or reset. This does not claim byte-identical normally active business databases.

The finish preflight also passes every resource guard: Windows available RAM **2,852.770 MiB**, Engine headroom **4,510.669 MiB**. A final read-only label inventory confirms no P10 containers, volumes or networks remain; `.wslconfig` still hashes to the approved maintenance value `d4f748ea8f222563e1beb8319e62496c62635ce052aa4dd380ee332b73375268`. All 11 artifacts in the retained recovery manifest match their hashes.

After acceptance, exact manifest-owned restored-data copies and OpenMetrics inputs from only these new attempts were removed: **610 temporary files, 223,676,494 bytes**. Public receipts, failed history and private configuration/diagnostics remain. The [consolidated cleanup receipt](p10-validation/evidence/full-recovery-temporary-cleanup.json) retains a corrected counter error: a PowerShell leaf-file enumeration counted each `samples.om` twice, while removal occurred once. Original counter values are retained alongside corrected unique-file counts. No broad cleanup, historical acceptance deletion or backup-directory mutation occurred.

## Acceptance and reproduction

All applicable authoritative P10 local-development gates are satisfied by the previous immutable continuation/resolution evidence plus this native recovery receipt. Existing loss boundaries, fixture scopes, sampled-peak limits, and P07/P08 local-storage exceptions remain explicit. No production/off-host, application implementation change, shared JWKS change or P11 acceptance is claimed.

```powershell
node observability/roadmap/p10-validation/full-recovery-guards.test.cjs
node --max-old-space-size=128 observability/roadmap/p10-validation/full-recovery.cjs
# Select the exact newly completed run; this refuses to overwrite prior acceptance.
node observability/roadmap/p10-validation/finalize-full-recovery.cjs <exact-run-id>
```

Each execution requires fresh guards and creates a unique disposable project. Do not rerun an earlier finalizer to overwrite historical receipts.
