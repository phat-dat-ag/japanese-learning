# P08 approved development policy and exception register

Authority: explicit user instruction **“P08 — Complete Local Development Backup & Recovery”**, 2026-11-14. Applies only to `jp_learning_dev` on this laptop. No production approval.

| Setting | Approved development value |
| --- | --- |
| Destination | `D:\JapaneseLearningBackups`, configurable in ignored `.local/p08-development/config.json` |
| Backup | Daily; configured 03:00 local Windows time, with StartWhenAvailable |
| Retention | Seven elapsed days; authenticated owned expired generations only; always retain newest valid generation |
| Drill | Monthly; first day 04:00 local time, after daily backup |
| RPO / RTO | 24 hours / four hours |
| Encryption | AES-256-GCM; key/credentials outside Git |
| Scope | Actual canonical application telemetry, original stored metric samples, OTel traces, dashboard definitions, collector offset SQLite databases and committed observability configuration |

The ignored configuration uses `offHostApproved:false` and a separately recorded development exception. The core policy validator rejects that exception for production. The existing unapproved example remains a fail-closed template, not an implicit policy grant.

## Exceptions

| ID | Decision / evidence | Boundary |
| --- | --- | --- |
| P08-DEV-LOCAL-STORAGE | User explicitly accepted development-only off-host exception for the D: destination | **D: is not off-host or independently durable storage. Physical disk/host failure can destroy live data, backups and the local encryption key together.** No independent off-host disaster recovery is claimed. |
| P07-DEV-QUOTA | Existing explicitly approved hard persistent-quota exception; see [P07 closure](p07-validation/evidence/closure.json) | Unchanged. Retention, resource limits and alerts do not become a hard persistent-volume quota PASS. |

No exception waives corrupted backups, credentials/privacy, live-resource preservation or the measured development RPO/RTO. The inherited fixture-label false positive was corrected, not waived. Earlier failed evidence remains unchanged.

## Operational settings and limits

`Configure-P08Development.ps1` creates a unique AES key only if absent and refuses to replace an existing invalid key. Windows ACLs restrict the ignored key/config/staging directory to the current development account and SYSTEM. Destination files are encrypted; possession of an artifact without the key is insufficient. The key is neither copied into recovery containers nor included in backups. Current single-key inventory requires retaining the same key for existing generations; rotation requires an explicit migration/custody plan.

The daily and monthly jobs run hidden under the existing interactive desktop user's token, including while the desktop is locked. Docker Desktop must be running. StartWhenAvailable catches missed runs after the user session resumes. This is not an always-on service or a guarantee while the laptop/user session is unavailable. No password is stored in task definitions. A process-only PowerShell execution-policy flag is used for these exact repository scripts because the existing machine policy blocks script files; no user/machine execution policy was changed.

The destination has a configurable conservative 1 GiB safety ceiling. Backup packages remain bounded at 64 MiB raw archive input (128 MiB encrypted-envelope read limit). Metric history is acquired in eight six-hour native range-vector queries, compressed before packaging, with original sample timestamps/values and per-chunk hashes retained. Any query warning, unsupported native histogram, incomplete scroll/search, export-budget failure or stale/invalid generation fails closed; no silent truncation. Larger datasets need explicit capacity/configuration review. No new infrastructure is installed.

Failure returns a nonzero task result and writes a value-redacted private job log and uniquely named evidence. Retention never removes unrelated files, unknown owners, legacy filenames, invalid/corrupt generations or the last valid generation. Corrupt/unreadable recognized files halt retention for operator review. Native source services remain unchanged; no snapshot repository/admin API is enabled on live stores.

Production/off-host acceptance remains **NOT VERIFIED / unapproved**: independent failure domain and transport, production custody/escrow/rotation, production ownership/classification, persistent budgets and full production drill. Do not infer those from local development acceptance.
