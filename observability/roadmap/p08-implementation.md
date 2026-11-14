# P08 encrypted backup and recovery implementation

Status: **PASS for explicitly approved local development only**. See [current acceptance](p08-validation/evidence/development-acceptance.json) and [approved policy/exception register](p08-development-policy.md). No production/off-host approval or P09 work. P07's development-only hard-quota exception remains unchanged.

## Completed local development continuation

`local-backup.cjs` acquires real canonical OpenSearch documents with native scroll consistency and mapping/settings metadata; all retained metric samples from native six-hour range vectors, gzip encoded without resampling; complete queried OTel traces; Grafana dashboard definitions; and read-only online SQLite backups of three collector offset DBs. It includes allowlisted committed observability configuration and excludes all credentials, JWT/JWKS keys and business data. `runtime.cjs` restricts source discovery to the canonical development service identity. No live native snapshot/admin API is enabled, no application code changes, and no live volumes are copied or mutated.

The development setup creates the approved configurable `D:\JapaneseLearningBackups` destination and ACL-protected ignored AES key/config. Daily 03:00 and monthly day-1 04:00 tasks use the existing Windows scheduler and desktop account, run hidden, catch up when available, and have both executed successfully with result 0. `Invoke-P08Local.ps1` invokes the actual-data workflow with forced daily acquisition; it does not skip the next calendar run merely because a manually created generation is younger than 24 hours. A common lock prevents overlapping backup/drill/retention operations. No account password is stored in task definitions.

Retention authenticates all recognized files before deletion, matches encrypted ownership/project/generation metadata, checks containment, regular-file/no-link identity and unchanged ciphertext, selects only owned generations older than seven days, and always retains the newest valid generation. Unknown, legacy, unrelated and corrupt files are not deleted; corruption halts cleanup for review. Tests exercise expiration using synthetic packages, never historical telemetry. `cleanup-staging.cjs` separately removes only exact workspace-contained, closed run directories owned by immutable run evidence; it never targets destination backups or live stores. The continuation cleared 12 temporary plaintext directories while preserving every earlier JSON evidence file and both real encrypted generations.

`local-drill.cjs` restores authenticated actual packages into fresh bounded native OpenSearch, Prometheus, Tempo, Grafana and collector resources on an internal network, with new test credentials/TLS and no source mounts or external endpoints. Original sample timestamps become native TSDB blocks, traces are replayed through OTLP then queried by ID, dashboard panels/datasources and all three offset DBs are checked, and native Fluent Bit ingests a marker into the recovered search index. Restored P05/P07 rules deliver and resolve an authenticated alert solely into the isolated local sink. Both scheduled tasks and full native preservation checks pass; exact evidence is in [verification](p08-verification.md).

The final disposable validation profile keeps metric/trace data for 10 days only inside bounded, short-lived targets so archived history cannot expire mid-comparison. Native profile readiness/CLI checks pass; the full accepted drill passed with the stricter original 2d/24h target TTL. Source/live retention and seven-day backup retention are unchanged. This is not retention expansion of live stores.

The remaining sections retain the original candidate design/history. Their pending-policy and incomplete-acquisition statements are superseded **only for the approved local scope above**; production/off-host decisions remain unapproved. Source locations for the authoritative gate remain applicable.

## Authoritative scope and decisions

| Source | P08 requirement |
| --- | --- |
| [Roadmap](implementation-roadmap.md), Incremental strategy / P08 | Approved telemetry/config backups and isolated restore; business DB interfaces only |
| [P01 gates](p01-quality-gates.md), P08 | P05/P07 accepted; approved R10–R13 owners/destinations/classes; recurring encryption, integrity and isolated tools/runbooks |
| Same gate, required tests | Corrupt/incomplete/missing backups; checksums plus native integrity; mappings/settings/counts/queries; scoped credential denial |
| Same gate, runtime/security/persistence | Independent restored resources without original volumes; measured newest recoverable data and full RTO; ingest/auth/query/alert recovery; verified transport/at-rest encryption and custody; independent off-host recovery, retention and reproducibility; overwrite prevention |
| Same gate, rollback/cross-project | Retain valid generations; restore previous job/config only; no active-volume restore; no shared keys or Spring Boot backup resources |
| [Decision register](p01-implementation-plan.md), D06 | Operations/data owners approve location, encryption, RPO/RTO and drill schedule; DB policy separate |
| [Contract](p01-observability-contract.md), R10–R13 | Retention/classification/maximum deletion lag, backup ownership/location/encryption/retention/budget, RPO data classes and RTO boundaries require approval |

Daily encrypted backups, monthly drills, RPO <=24 hours and RTO <=4 hours are **proposals only**. No owner, destination, custody, schedule, retention/budget or recovery target is approved here. `policy.example.json` deliberately has null decisions and false approval flags. A same-laptop directory, Docker network or different volume is never an independent off-host destination.

Baseline: `develop`, merged P07 HEAD `a39dda31802ebbbfa8d1b0f666f82b3d047c2b6f`; initially clean. P05 source/test/rule assets were inspected; its original verification document contains historical blocked runtime checkpoints. Current P07 [closure](p07-validation/evidence/closure.json) and [laptop acceptance](p07-laptop-verification.md) supersede those runtime limitations for the accepted development baseline. P07's same-host recovery is reused as a design pattern, not relabeled off-host evidence.

## Implemented capabilities

- `observability/p08/backup.cjs`: Node built-in AES-256-GCM envelope (random 96-bit nonce, 128-bit authentication tag, authenticated version header); external 32-byte key file. Authenticated manifest and per-file size/SHA-256; native artifact inventory, uniqueness and safe-path validation. All package bytes authenticate and validate before any restore output is written.
- Native export inputs are explicitly typed and classified. No raw live-volume backup, recursive repository backup, business-data exporter or credential discovery. Immutable native export staging is a prerequisite, not established by a checksum or user-supplied classification label. Native validation is explicitly marked REQUIRED_ON_RESTORE.
- Configuration uses an explicit allowlist of tracked `HEAD` observability blobs, never working environment/secret files. Backup manifests preserve their byte checksums. This intentionally excludes working edits, TLS private keys, JWT/JWKS key material, application secrets and global OpenSearch security state. Baseline configuration version is the recorded Git HEAD; later restoration must use matching image versions and external secrets.
- Create-only encrypted generations and newly created restore directories; no overwrite switch, in-place restore, deletion or retention purge. Link/unsafe-name rejection and conservative secret-marker screening. Screening is defense in depth, not evidence that arbitrary binary exports are privacy-approved.
- Policy-gated unattended `run`: exclusive destination lock, configured due interval, configured RPO freshness requirement, verified previous generations, storage-budget reserve, expiry-candidate reporting only. `Invoke-P08Backup.ps1` is a scheduler entry point; no scheduled task is installed. Every run requires freshly prepared immutable native exports; the runner does not create live snapshots itself.
- Bounded candidate: maximum 64 MiB raw input and 128 MiB encrypted input. JSON/base64 packaging uses additional memory; this is not a scalable whole-store production backup backend. No oversized export is silently omitted. Larger approved datasets require a reviewed streaming implementation within P08 before acceptance.
- `native-sqlite.py`: read-only integrity and foreign-key checks for offline Grafana/Fluent Bit SQLite exports. Does not read live databases or reset offsets.
- Fresh synthetic native OpenSearch snapshot -> authenticated encryption -> decrypt into a new directory -> independent native restore, mapping/settings/count/hash/query/access checks and new ingestion. Restored Prometheus rule files are evaluated using the existing native promtool test suite. The fixture uses bounded dedicated tmpfs data mounts, fresh private test credentials, an internal network and no published ports or live data mounts. It proves neither persistent-volume durability nor off-host recovery.

## Store coverage and outstanding integration

| Store/config | Candidate support | Still required for phase acceptance |
| --- | --- | --- |
| OpenSearch application telemetry | Native synthetic snapshot/restore through encrypted package; no global/security state | Approved scoped recurring snapshot/export identity/repository, privacy review, real sizing, off-host independent drill |
| Prometheus | Configuration/rule recovery and native rule evaluation; typed immutable TSDB snapshot input | Approved consistent TSDB snapshot acquisition; independent restored history, queries and actual alert pipeline |
| Grafana | Tracked provisioning input, typed SQLite export and native integrity checker | Consistent SQLite backup acquisition, secret-bearing DB classification and independent dashboard/datasource recovery |
| Tempo | Typed immutable block-export input only | Approved consistency/checkpoint method (including WAL boundary), block integrity and restored trace queries |
| Fluent Bit | Typed offline SQLite export and native integrity checker | Approved source-log/offset/buffer consistency and replay/loss verification; no live offset reset |
| Configuration | Allowlisted committed observability config with hashes | Approved complete restore set and external-secret/certificate reprovisioning/custody, independent authenticated service reconstruction |

Do not claim a package of immutable files alone is a store-native backup, or a restored rule-unit test is alert delivery. Current typed inputs do not implement all store acquisition adapters. Full-service dashboard/metrics/trace/collector and notification recovery remain NOT VERIFIED. No external notification is sent by any P08 tool.

## Approval-dependent acceptance

Operations/data owners must approve D06 and R10–R13: owner/contact; data classes and privacy retention/deletion lag; off-host failure domain and access; encryption/key custody/recovery/revocation; backup and restore identities; storage budget/retention; recurring backup and drill schedules; RPO data classes and full RTO start/end/dependencies. Then validate transport/access denial at the actual destination, retained generations and expiry governance, fresh unattended native acquisition for each selected store, cross-host restore without original stores or their credentials, full ingest/auth/query/dashboard/alert functionality and approved RPO/RTO. No policy is inferred from test success.

## Rollback

Disable only the new approved scheduler task if one is later installed, restore its prior tool/config version, and retain every valid generation and encryption key under approved custody. Do not roll back store security, restore over an active volume, delete telemetry or run `down -v`/prune. Current implementation has no deployed job to roll back. Fixture shutdown checks the exact P08 ownership label; all files and stopped container records are retained, and no Docker volume is deleted.

Verification commands, native drill observations and remaining dispositions are in [P08 verification](p08-verification.md). Operational steps and business DB boundaries are in the [runbook](p08-recovery-runbook.md).
