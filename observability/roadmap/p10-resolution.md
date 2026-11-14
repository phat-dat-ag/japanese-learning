# Current P10 resolution — PASS for approved local development

The [actual native full recovery](p10-full-recovery.md) has now passed fresh resource/isolation guards, backup integrity, all restored stores/configuration/offset/ingestion/notification checks, RPO/RTO targets and exact protected-resource preservation. [Final acceptance](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/acceptance.json) retains the earlier ENOSPC/privacy/retention results and historical failures. The previously remaining authorization/capacity/full-recovery blockers below are historical. **P10 PASS; 11/12 phases complete; P11 unstarted.** Existing loss boundaries and P07/P08 local exceptions are unchanged; no production acceptance is claimed.

# Current full-recovery authorization and capacity

The user has approved the proposed full-recovery envelope. The [subsequent file audit/preflight](p10-file-audit.md) measured **3,435.576 MiB available versus 3,680 MiB required**, so full recovery remains unexecuted and P10 PARTIAL. The budget-authorization blocker in the historical sizing report below is superseded; its measurements and prior test results remain valid.

# P10 ENOSPC resolution, privacy, retention and recovery sizing

**P10 remains PARTIAL.** The missing-event cohort is recovered by a bounded source-to-search handoff candidate; new outage-privacy and native retention checks pass. Full multi-store recovery remains BLOCKED by the current storage/data/request budgets and memory headroom. No live deployment, policy waiver, production-readiness claim or P11 work occurred. All previous failed and successful evidence is retained.

## Authority and preserved results

The current user instruction authorizes investigation/correction/validation inside the existing [development budgets](p10-development-policy.md). The [P01 P10 gate](p01-quality-gates.md#p10-isolated-resilience--performance-validation) remains authoritative: approved loss/recovery budgets and protected-resource preservation must all pass. The approved limits remain 512 MiB total disposable storage, 64 MiB data/scenario, 300 requests/scenario, two clients, five client requests/second, 30s faults and 120s queue-drain observation. No operational policy or acceptance threshold was changed.

Earlier [continuation results](p10-continuation.md), including 28/28 log delivery, 24/24 traces, datasource recovery, offsets/restart, dependency/JWT fixtures, 43 native rule cases and native grouping/resolution, remain valid for their recorded candidates and workloads. Those tests were not used as substitutes for the new failures. The first resolution invocation inherited an unnecessary rule-test rerun from the generic harness; subsequent focused modes skip it.

## ENOSPC mechanism and correction

The failure is **before output queue admission**, not a failed OpenSearch bulk operation:

1. The new deterministic reproduction generated four nominal records and twelve pressure records. Each source append was flushed and `fsync` completed. The source retained all sixteen IDs and grew from 426 to 1,733 bytes.
2. An independently bounded 8 MiB filesystem reached zero free bytes. Twelve zero-length chunk files appeared; native diagnostics reported failed chunk allocation, including `Operation not supported`, `cannot adjust chunk size` and `no available chunk`.
3. The native tail admission counter remained four. Processed output remained four, retries zero and output drop count zero. The twelve records therefore never entered a usable output batch and could not benefit from output retries.
4. The new forensic snapshot's persisted SQLite offset stayed at 426 bytes while full. It was **not** an acknowledgement of all 1,733 source bytes. Earlier evidence shows a later successful append/checkpoint advancing beyond missing records. Read progress, SQLite checkpoints, successful chunk admission and searchable delivery are not one transaction. The in-memory read cursor was not dumped; its exact byte value is not claimed measured.
5. Clearing storage alone did not make those twelve IDs searchable. The raw source still contained them. The native filesystem candidate uses filesystem chunks; the approved live P07 inputs use memory buffering. This is a measured candidate failure, not an assertion that the live memory-only profile has identical ENOSPC semantics.

The smallest implemented recovery correction stays in P10 fixtures/tooling:

- Assign stable `event_id` values and configure native OpenSearch `Id_Key event_id` instead of random generated IDs.
- Retain source records until actual authenticated OpenSearch searches confirm their IDs. Producer success, a collector counter and a tail offset are insufficient acknowledgements.
- After capacity returns, compare the source ID set with searchable `_id` values. Copy only missing source records into one new, fsynced replay segment. Do not reset/delete original SQLite offsets or mutate the old source.
- Allow **one** create-only replay pass, at <=4 events/s. Repeating that pass is rejected. Existing `Retry_Limit 3`, 1 MiB input buffer setting, 4 MiB output cap, 8 MiB filesystem and container limits are unchanged. No unlimited retries, storage increase or business application change was introduced.

This adds a finite recovery handoff; it does **not** patch Fluent Bit's native admission behavior or deploy an automatic production spool manager. A later failure that remains unconfirmed must remain a failed recovery with retained source, not an accepted loss waiver. The historical missing records from already-cleaned disposable environments remain historical losses; new runs reproduce and recover equivalent deterministic cohorts.

| Reconciliation point | Unique source events | Admitted | Searchable | Missing | Duplicate documents | Valid records pending |
| --- | --- | --- | --- | --- | --- | --- |
| Previous pressure cohort | 12 | 0 | 0 | 12 | 0 | No recoverable native batch |
| New reproduction before handoff, including nominal four | 16 persisted | 4 | 4 | 12 | 0 | 12 unconfirmed at source |
| After one finite replay of twelve IDs | 16 persisted | 16 | 16 | 0 | 0 | 0 by input/output counters and source/search reconciliation |
| Four fresh records, then owned collector restart | 20 persisted | 20 over the run | 20 | 0 | 0 | No source IDs unconfirmed |

The twelve replay presentations are explicitly counted; zero duplicate documents does not mean exactly-once transport. Native output drop count is zero because these were pre-admission failures. The recovery ledger accounts for all twelve initial admission failures and twelve subsequent successful replays.

**Measured correction:** pressure **8.385s**, queue/search recovery **9.338s**, collector restart verification **8.317s**. Both capacity firing and resolved notifications were received. Four fresh records delivered after pressure; restart retained all twenty unique documents. Original source offsets were preserved rather than reset, and SQLite integrity remained `ok`. These are queue/collector recovery measurements, not full-system RTO.

Evidence: `p10-validation/evidence/jp_obs_validation_20261114130109_183210b6/` (`results.json`, `enospc-lifecycle.json`, diagnostics, baseline, preservation snapshots, image/config identity and post-test inventory). The earlier reproduction in `jp_obs_validation_20261114125058_82f31f0e` is retained.

## Privacy verification

The final focused privacy run paused only its own OpenSearch and Tempo for **4.156s**, generated eight log fixtures and eight trace fixtures, then retrieved all eight of each after recovery. Payload classes include synthetic JWT/Bearer syntax, credential/password, authorization, query parameters, request body, response body, PII and private-key markers. No real secret or personal data was injected.

| Surface | Result / scope |
| --- | --- |
| Searchable native log documents | PASS: eight documents; zero sentinel occurrences after exact copied P07 Lua filter |
| Stored native traces | PASS: eight actual trace IDs retrieved; zero sentinel occurrences after unchanged P07 processors; events/unsafe attributes removed |
| Collector persisted state/chunks | PASS: six files scanned, zero sentinels; deliberately controlled raw source excluded; no process-memory dump |
| Collector/Prometheus/Grafana diagnostics | PASS: both stdout and stderr scanned, zero sentinel occurrences |
| Metric labels | PASS: eight bad sensitive-label sample variants dropped by copied P07 relabel rules; good control series present, bad family absent |
| Dashboard variables and links | PASS, source/reuse scope: current definitions inspected; normalized-LF hashes match P09 definition hashes and earlier native query/navigation/RBAC evidence is reused. Working files have CRLF from checkout; no dashboard file was rewritten. No browser-rendering claim. |

Evidence: `p10-validation/evidence/jp_obs_validation_20261114131138_01655ef1/`. Initial after-recovery privacy passes remain in the earlier resolution runs. These tests cover the changed P10 pipeline and approved local fixture surfaces; they do not claim to scrub historical live telemetry, certify a production secret-custody system or repeat unchanged producer-specific application suites.

## Retention verification

Native ISM deleted a designated **pre-expired disposable index**. The unrelated control index, existing synthetic telemetry and collector SQLite integrity survived. The final focused run also:

- Deleted only an owned, pre-expired synthetic source file whose event was already searchable.
- Preserved an equally old unacknowledged file and an unrelated file.
- Delivered four fresh native events after retention; the original four became eight searchable unique records and SQLite integrity stayed `ok`.

The observation plus post-checks completed within **134.552s**; total scenario including setup was **145.861s**. This is healthy lifecycle scheduling with no ongoing outage, not a queue-drain observation. The 120s **queue-drain** limit was not extended. Healthy ISM observation was explicitly bounded to eight minutes and fewer than 100 polls, below 300 scenario requests. The earlier 110s observation that had not seen deletion remains BLOCKED evidence; it was not relabeled PASS.

The test uses a pre-expired index to exercise the native delete action, and reuses accepted P07 age-eligibility evidence. It does not claim a real 30-day wall-clock soak or change the approved age threshold. The temporary scheduler settings were restored on the disposable cluster. The source-file guard is an isolated deletion-boundary test, not deployment of a new producer retention policy.

Evidence: `p10-validation/evidence/jp_obs_validation_20261114131728_dc5f783a/`; earlier native deletion/control checks are retained in `jp_obs_validation_20261114130109_183210b6/`.

## Exact reference recovery sizing and proposed authorization

The existing encrypted generation was authenticated and analyzed **read-only in memory**. No acquisition, destination lock, retention, backup rewrite or full drill was executed. Latest analyzed generation: `p08-local-4815fdd93d5a35541e7ee661f3e94c40.enc`, 4,851,499 encrypted bytes, SHA-256 `e8b8f657c5d4ced23340ce88c19cfc260b8ef2c20b82363a6a7a69e5fd891a89`.

Exact current-package values:

- Plaintext extracted files: **3,560,732 bytes**.
- Native metric samples: **828,320**; largest decoded metric JSON chunk **19,812,101 bytes**.
- Exact OpenMetrics expansion matching the P08 exporter: **108,214,021 bytes**.
- Extraction plus OpenMetrics staging: **111,774,753 bytes**, approximately **106.6 MiB**. This alone exceeds the current 64 MiB scenario-data cap.
- Existing reference trace loop requires at least **271 uploads +271 trace reads =542 requests**, before logs/auth/metrics/dashboard/collector/alert calls. This exceeds 300 requests/scenario.

| Required reference store/workspace | Existing hard tmpfs allocation |
| --- | --- |
| OpenSearch data | 512 MiB |
| Prometheus data + scratch | 1,024 +64 MiB |
| Tempo data + scratch | 256 +16 MiB |
| Grafana data + scratch | 128 +64 MiB |
| Recovery agent scratch | 16 MiB |
| **Reference total** | **2,080 MiB**, excluding host staging, logs and uncapped original OpenSearch writable scratch |

The reference RAM limits total **3,296 MiB** across OpenSearch, Prometheus, Tempo, Grafana, the agent and Fluent Bit. Stopped-container metadata confirms those caps and some additional swap allowance. **Actual historical peak RAM/storage were not retained and cannot be reconstructed from destroyed tmpfs contents.** These allocation figures must not be labeled measured peaks. Historical complete P08 recovery took **543.938s**; it is prior evidence, not a new execution or a guaranteed duration.

A lower-resource approach is plausible: reuse smaller P10 stores, produce non-overlapping TSDB blocks incrementally and batch trace uploads. It is **NOT VERIFIED**. Streaming/splitting does not by itself reduce total generated data or prove complete history/offset/security fidelity. Individual-store checks and the earlier synthetic logical restores are not equivalent to coordinated full multi-store recovery. The unchanged known reference profile demonstrably cannot run under the existing three caps.

**Proposed P10-only full recovery budget — not approved or executed:**

| Limit | Proposed ceiling / reason |
| --- | --- |
| Total disposable storage | **4,096 MiB** |
| Backend and scratch allocations | **2,152 MiB**: existing stores, plus bounded OpenSearch logs/tmp and collector scratch; use read-only roots |
| Rotating logs | **24 MiB** across six containers |
| Extraction | **64 MiB** maximum |
| OpenMetrics input | **128 MiB**, above measured 103.2 MiB |
| Configuration, evidence and optional encrypted staging copy | **192 MiB** |
| Planned subtotal / reserve | **2,560 /1,536 MiB**; reserve covers unmeasured metadata/transient staging overhead and future package variation. It is not an automatic per-store quota increase. |
| Docker RAM / swap | **3,424 MiB /0 additional swap**; agent raised from 128 to 256 MiB to avoid reliance on its former RAM+swap envelope |
| Host Node process RAM | **768 MiB** explicit process budget |
| CPU | **6 cores total** across the six disposable containers |
| Full-drill generated/extracted data | **512 MiB** maximum |
| Full-drill requests | **1,500** maximum; use bounded verification passes/deadlines, not the old 25-pass retry ceiling |
| Execution deadline | **20 minutes**; historical 9.1-minute drill plus startup/throttling/instrumentation margin |
| Unchanged controls | <=2 clients, <=5 client requests/s, <=30s injected faults, <=120s queue-drain observations; RPO <=24h, RTO <=4h |

Preflight must require **3,680 MiB free engine capacity** (3,424 plus the existing 256 MiB reserve), adequate host RAM for Node, and measured physical backing headroom. The sampled engine has 8,165,945,344 total bytes; the protected-runtime sample left about 3,526 MiB before own P10 use, so the proposed memory guard was **not met**. No engine restart, memory-setting change or live service stop is authorized to obtain headroom. Defer until sufficient headroom exists or validate a smaller memory candidate first.

Windows C: and D: had approximately 50.2 GB and 152.9 GB free at preflight. Docker's virtual filesystem reported about 1 TB free; that virtual figure is not physical backing capacity or off-host durability. A fresh capacity snapshot is required before any later drill.

The future harness must reuse P08 authentication/export/native recovery logic through a P10-owned workspace, with the backup destination **read-only**. It cannot invoke `local-drill.cjs` unchanged because that creates destination lock files and has uncapped original writable scratch. Cleanup must stop generators, preserve measurements, then remove only exact manifest-owned containers, bounded volumes/networks and owned temporary staging. Never remove backup generations, keys or pre-existing retained P07/P08 resources. Native-store imports, full offsets/config/dashboard restoration, all original samples/traces/documents and RPO/RTO comparisons remain mandatory.

Machine estimates are in immutable `p10-validation/evidence/recovery-budget-*.json`. They distinguish measured package expansion, source/retained-container allocations, unknown peaks and the proposed envelope. The approved P08 policies and current P10 limits remain unchanged.

## Preservation, acceptance and reproduction

Fresh before/after evidence covers all original containers and volume identities, backup hashes/size/mtime, P08 task XML hashes and submodule revisions. Every fault/deletion targeted an exact owned resource in a new internal Compose project; all disposable resources were removed. No business DB contents, live volumes, shared JWKS contracts/keys, existing backup artifacts, branch/index pointers, commit/push/merge or P11 scope changed.

| Gate | Current disposition |
| --- | --- |
| ENOSPC loss investigation | PASS, source/admission/output/search stages reconciled |
| Bounded correction and native replay | PASS for the tested candidate; 20/20 final unique documents, zero missing/duplicates, capacity firing/resolve, normal ingestion/restart retained |
| New outage privacy / metric and dashboard surfaces | PASS within explicit synthetic/local scopes; existing P07–P09 evidence retained |
| Native retention delete, unrelated-data and source-ACK boundaries, post-retention ingestion | PASS within explicit fixture scope |
| Prior successful native P10 scenarios | Retained, not invalidated |
| Coordinated full multi-store recovery and associated full P10 RPO/RTO | **BLOCKED**, additional budget/authorization and headroom required |
| Overall P10 / roadmap | **PARTIAL; 10/12 complete**, P11 unstarted |

Reproduction under approved Docker access:

```powershell
node observability/roadmap/p10-validation/integrated.cjs resolution
node observability/roadmap/p10-validation/integrated.cjs resolution-privacy
node observability/roadmap/p10-validation/integrated.cjs resolution-retention
node observability/roadmap/p10-validation/recovery-budget.cjs
node observability/roadmap/p10-validation/finalize-resolution.cjs
```

Each runtime invocation creates a fresh evidence directory. The finalizer writes new timestamped resolution receipts/manifests and leaves both earlier P10 acceptance bundles unchanged. Its first receipt reported BLOCKED on a raw dashboard-byte hash mismatch; exact LF-normalized hashes match the P09 artifacts, confirming only the pre-existing checkout newline difference. That failed receipt is retained. No dashboard was rewritten and no prior P09 result was invalidated. Full over-budget recovery is not part of these commands. Final phase acceptance remains withheld until every applicable quality-gate criterion is satisfied.
