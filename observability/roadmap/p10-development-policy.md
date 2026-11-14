# P10 approved development resilience budgets

## Latest execution under unchanged approvals

Fresh Windows/Engine guards passed, and the [full native recovery](p10-full-recovery.md) completed safely under the existing envelope. **P10 PASS for approved local development**; prior failure samples and authorization history below are preserved. No additional WSL change, infrastructure interruption, budget increase, loss waiver or P07/P08 policy change occurred in this continuation. The earlier approved interruption remains consumed; P11 is unstarted.

## Approved one-time WSL2 maintenance

The current user explicitly authorizes a **9 GiB WSL2 ceiling and one controlled Docker Desktop/WSL2 interruption**. This exception permits expected container start-time/restart effects only for that maintenance operation; identities, data, volumes, backups and tasks remain protected. No unrelated settings or test budgets may change. The interruption has completed and is consumed. See [results](p10-wsl-maintenance.md): Engine guard passes, Windows host-memory guard fails; no full recovery ran. All existing resource/isolation guards remain mandatory, including Windows available RAM >=1,024 MiB and Engine headroom >=3,680 MiB.

## Full-recovery authorization — current user file-audit instruction

The user explicitly approved a separate full-recovery ceiling: **4 GiB disposable storage, 512 MiB test data, 1,500 requests, 3,424 MiB Docker RAM, 768 MiB host Node RAM, six CPU cores, 20 minutes and zero additional swap**. Two clients, five client requests/second, 30-second faults and 120-second queue-drain observations remain unchanged. Execution requires **at least 3,680 MiB free Docker Engine capacity** and all other isolation/resource guards. Approval never permits freeing capacity by stopping, restarting, recreating or deleting existing resources.

The new [preflight](p10-validation/evidence/full-recovery-preflight.json) records approval but fails memory capacity: **3,435.576 MiB available versus 3,680 MiB required**. Full recovery was not executed. Earlier proposals and authorization statements below are historical; the original smaller budgets still describe the earlier fault-test scope. P07/P08 policies and exceptions are unchanged.

Authority: explicit user instruction, **P10 — Resume and Complete Integrated Resilience Validation**, 2026-11-14, in this session. These approvals close the earlier missing-budget prerequisite. Historical blocked evidence remains unchanged.

| Parameter | Approved limit |
| --- | --- |
| Environment | Fully isolated disposable Docker Compose project |
| Concurrent test clients | 2 maximum |
| Client request rate | 5 requests/second maximum |
| Requests per scenario | 300 maximum |
| Injected fault | 30 seconds maximum per scenario |
| Drain/recovery observation | 120 seconds maximum |
| Generated scenario data | 64 MiB maximum |
| Total disposable storage | 512 MiB, including volumes, temporary files and artifacts |
| CPU/RAM | Explicit limits sized against available capacity |
| Loss | Measure and report actual loss; no assumed zero loss |
| Applicable RPO/RTO | 24 hours / four hours |
| Notifications | Isolated endpoints only |

No live fault, database change, existing volume/backup mutation, P08 task change, shared JWKS edit or production acceptance is authorized. P11 remains out of scope. P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE remain unchanged. This approval does not waive integrity or silently approve unexplained losses.

Native fixtures use already cached images, read-only root filesystems/configuration, an internal network without published ports, fresh test credentials/CA/RSA identities and hard bounded tmpfs storage. A tmpfs result does not establish durable persistent-volume quotas or host-loss recovery. Actual image IDs, filesystem options, workload counts, container limits and results are run-specific evidence.

The full native telemetry fixture reserves 443 MiB: 364 MiB of bounded filesystems, 7 MiB of rotating logs and 72 MiB for configuration/evidence/other task artifacts. Focused monitoring/routing uses 203 MiB. The final dependency fixture uses an 86 MiB envelope. Runners execute these projects sequentially; no image download or new image layer is needed. Existing protected resources and cached image layers predate the test and are not disposable test storage.

Original operational alert thresholds and pending periods are unchanged. Native promtool virtual-time tests exercise their long pending windows. Explicitly named short fixture rules exercise live firing/recovery within the fault cap; they are not replacements for approved operational rules. The Grafana grouping scenario waits for the active native routing configuration before starting its fault clock.

The existing full P08 drill model cannot be reused unchanged under this cap: its OpenSearch data tmpfs alone is 512 MiB, plus 1 GiB Prometheus, 256 MiB Tempo, 128 MiB Grafana and other temporary state. It was not executed. P10 reuses P08 authenticated packaging/verification/create-only restore for a small synthetic native logical restore, and separately validates native collector offsets. Those checks do not replace the full P08 multi-store drill.
