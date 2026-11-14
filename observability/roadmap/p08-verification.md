# P08 verification and acceptance evidence — 2026-11-14

## Current development acceptance

**P08 PASS for approved local development only.** [Development acceptance](p08-validation/evidence/development-acceptance.json) and [final completion receipt](p08-validation/evidence/development-completion.json) supersede the historical PARTIAL/BLOCKED checkpoints below for this scope. Production/off-host readiness remains unapproved, and P09–P11 are untouched. Policy and exceptions: [development register](p08-development-policy.md).

### Actual sources and encrypted artifact

The daily task acquired **1,867 canonical log documents across four indices**, **828,320 original metric samples / 1,211 series**, **271 traces**, **one actual Grafana dashboard**, **three offset SQLite DBs**, and allowlisted committed telemetry configuration. Actual generation: `D:\JapaneseLearningBackups\p08-local-4815fdd93d5a35541e7ee661f3e94c40.enc`, **4,851,499 bytes**, SHA-256 `e8b8f657c5d4ced23340ce88c19cfc260b8ef2c20b82363a6a7a69e5fd891a89`. [Acquisition evidence](p08-validation/evidence/local-backup-4815fdd93d5a35541e7ee661f3e94c40.json) records all source counts, hashes and unchanged protected runtime. The earlier resumed real export remains separately retained; no acquisition time was relabeled as current.

Both installed tasks executed through Windows Task Scheduler and returned **0**, ending Ready:

| Task | Next verified run (UTC+07) | Scope |
| --- | --- | --- |
| JapaneseLearning-P08-Daily | 2026-11-15 03:00 | Actual acquisition, AES-256-GCM verification and guarded seven-day retention |
| JapaneseLearning-P08-MonthlyRecovery | 2026-12-01 04:00 | Complete isolated native recovery from latest actual backup |

### Automated and native checks

**17 package/policy/retention/staging tests pass**, plus the previously executed three SQLite fixture tests and native integrity checks of all three actual restored offset DBs. [Final development verification](p08-validation/evidence/development-verification-3e9957ce2c2cb272.json) verifies real-package authentication, manifest/checksums, wrong-key/missing/corrupt/truncated rejection **before any plaintext restore directory**, schedule definitions and key ACLs. Synthetic expiration tests prove only authenticated owned expired files are removed, unrelated/legacy/unknown-owner files remain, newest generation survives, and corrupt/wrong-key input halts deletion. Real generations are younger than seven days, so the actual retention dry run correctly selects none.

The [installed monthly task drill](p08-validation/evidence/p08_local_b6f800537e4b146e.json) is **PASS**, restoring the actual daily-task generation on a new private network using fresh bounded native OpenSearch, Prometheus, Tempo, Grafana and Fluent Bit resources. Checks include exact document IDs/counts/digests, mappings/settings and representative reader queries; anonymous/invalid/wrong-role denials; all original metric samples reconstructed into native TSDB blocks and compared chunk by chunk; all trace IDs retrieved after OTLP re-ingestion; dashboard panels and datasource health; offset DB native integrity; actual collector ingestion; and authenticated restored alert firing/delivery/resolution to a private sink. No external notification was sent. All target containers were stopped with exact ownership guards. All **21 original development container records remained unchanged**, including IDs, starts, restarts and mount identities.

| Measurement | Observed | Approved target |
| --- | --- | --- |
| Recovery checkpoint age | 202.820 seconds | 86,400 seconds |
| Conservative actual event/config RPO across logs/metrics/traces/config/offsets | **256.445 seconds** | **24 hours** |
| Full local recovery through authenticated alert resolution | **543.938 seconds** | **four hours** |

RTO ran from 05:36:38.798Z to 05:45:42.736Z and includes decrypt, new identities/TLS, native startup/import/query/auth, Grafana, collector and alert recovery. Event RPO is derived from actual recovered log/sample/span timestamps, not job exit or archive creation time. This is **same-host** recovery; no off-host transfer or physical-disk survival is claimed.

The accepted full drill used the stricter original target expiry (2d metrics/24h traces). The final disposable profile uses 10d/240h solely to prevent an archived generation expiring mid-validation. [Native profile validation](p08-validation/evidence/recovery-profile-validation.json) confirms readiness/CLI parsing with that relaxation; the full functional drill was not repeated solely for the less restrictive validation expiry. No source/live retention changed. The Linux Tempo image lacks `config.verify`; its failed flag attempt remains in retained diagnostic/container history, and native isolated startup/readiness was used instead.

### Preservation investigation and failed evidence

[Investigation](p08-validation/evidence/preservation-investigation.json) distinguishes three causes:

1. **Real Logs UI restarts:** its mounted entrypoint had CRLF despite indexed LF; `/bin/sh` exited 2 before nginx. Normalizing bytes and pinning that exact path in `.gitattributes` restored health through the existing restart policy. No authentication change or manual live lifecycle command. Exact origin of the earlier checkout rewrite is not proven; `core.autocrlf=true` permits this invisible checkout difference.
2. **Real earlier initialization timestamps:** five root initialization jobs changed timestamps. The inspected P08 lifecycle command stream never targeted them; retained Docker data does not identify the initiating actor. This remains explicitly unattributed external activity, not a claimed formatting error or a waived check.
3. **Actual-drill false positive:** a standalone disposable collector inherited root Compose project/service image labels. The raw inventory grew from 21 to 22 even though every original record was identical. Its exact ID, new network, fixture-only mounts, name and owner prove it was the P08 collector. Explicit project/service labels and exact source discovery fix this. The stopped mislabeled fixture alone was removed after ownership verification; [cleanup evidence](p08-validation/evidence/mislabeled-fixture-cleanup.json) confirms no volumes/live services removed. The subsequent installed monthly drill preserves the real runtime and passes.

All original failed JSON evidence remains byte-preserved, including [first actual drill](p08-validation/evidence/p08_local_a7b020597ef5a943.json), the earlier candidate failures and the original `acceptance.json`. A separate development acceptance file records the new result. Temporary plaintext/test-key cleanup covered 12 closed, exactly owned staging directories; encrypted generations, the live AES key and historical evidence were retained.

### Changes and remaining limits

- `.gitattributes`, `.gitignore`, and byte-only LF normalization of `observability/logging/logs-ui-entrypoint.sh`.
- `observability/p08/`: existing package/policy support extended; `runtime.cjs`, `local-backup.cjs`, `local-drill.cjs`, `recovery-agent.py`, `cleanup-staging.cjs`, `Configure-P08Development.ps1`, `Invoke-P08Local.ps1` added. Earlier P08 entry points remain available.
- `observability/roadmap/p08-validation/`: local tests, task/actual-artifact verifier, preservation audit/comparison, scoped fixture cleanup, final development acceptance/profile validation and uniquely named evidence added; original evidence retained.
- This report, roadmap P08 progress, implementation/runbook and development policy/exception register updated.

No application/submodule/JWKS contract/key/business-DB changes, commits, pushes, live destructive tests, volume deletion or P09 work. P07's hard-quota exception is unchanged. D: and the local key share the host/disk failure domain; production/off-host acceptance remains separate. Desktop user session/Docker Desktop availability, finite package/destination budgets, logical canonical export scope and separately owned business recovery remain documented limits. The complete P00–P11 roadmap is still unfinished.

## Historical candidate verification (retained)

**Implementation: PARTIAL. Authoritative whole-phase acceptance: BLOCKED.** P08 adds executable backup/recovery candidates and local synthetic validation. It does not approve policy, deploy a recurring job, demonstrate off-host recovery or start another phase. Overall roadmap remains unfinished.

## Automated results

Command: `node observability/roadmap/p08-validation/verify.cjs`.

[Automated evidence](p08-validation/evidence/p08_automated_f69dcb8839b4b03e.json) records Node v24.20.0, cached Python image digest, commands/results, Git HEAD/gitlinks and source SHA-256 values.

- **PASS: 11 Node package tests.** Authorized decrypt/restore/config hashes; encrypted-file and restore-directory overwrite refusal; wrong key denied before plaintext creation; missing backup; modified header/nonce/tag/ciphertext; truncation; missing/duplicate entries and inconsistent inventory/checksum; traversal; pending policy; unreviewed/business classification; oversize/empty exports; forbidden config and private-key canary; due/not-due invocation; lock collision; expired-generation report without deletion; destination budget refusal; stale RPO export refusal.
- **PASS: 3 native SQLite tests.** Valid offline database integrity with unchanged bytes; missing/corrupt/truncated export rejection; empty file and foreign-key violation rejection. Python's local Windows alias was unavailable. Tests instead used the already cached Python container, no network, read-only observability source, 16 MiB tmpfs and 64 MiB memory. No dependency was downloaded.
- **PASS:** `git diff --check`; tracked protected Compose/scripts/P07/submodule paths and gitlinks unchanged. Initial tree was clean. No commit/push/merge, secret changes or submodule modifications.

The runner's approved-policy test uses clearly labeled synthetic mock decisions only. It neither approves an actual off-host location nor touches actual telemetry. All test keys and package artifacts are under ignored `.local/` or bounded container tmpfs. The checker does not print database content, credentials or private keys.

## Native isolated recovery

Command: `node observability/roadmap/p08-validation/drill.cjs`.

Latest [native drill](p08-validation/evidence/p08_drill_5ffec34627f7f0c1.json): **53 checks PASS, one preservation check FAIL; whole drill FAIL, not PASS.** Source and restore used the same cached immutable image digest `sha256:9d7dcf60dbdac122598a7d739d4414c609cc715e55bfe84f9b0036af2ae5ef3a`. Source/code hashes, image/version metadata, unique owner/run resources and live before/after inventories are recorded.

Functional checks passed:

- Native TLS/hostname-verified authenticated OpenSearch synthetic snapshot SUCCESS, then authenticated encrypted-package restore into a new directory.
- Source stopped before target startup; no source data mount/volume or live data mount on the restored node. The independent restore repository is read-only. Both nodes use their own 512 MiB tmpfs data mount, 1 GiB memory ceiling, CPU/PID limits, internal network and no published ports. This is not persistent-volume or off-host durability evidence.
- Native restored shards have zero failures and green health. Twelve IDs/documents match the baseline exactly: SHA-256 `6f55747fc1ebd1569bec8086024d0e0d5baa265deea54e94ed452920ac3eb039`. Strict mapping and shard/replica settings match.
- Reader queries work; anonymous/invalid credentials return 401. Reader writes/admin, writer reads and writer out-of-scope writes return 403. Writer inserts a fresh recovery marker; the reader's representative term query finds exactly one.
- The encrypted configuration includes the existing P07 storage alert rules and native tests. Restored files pass native `promtool test rules` with `SUCCESS` in an isolated no-network container. No alert is sent externally. This proves rule evaluation, not a restored Prometheus TSDB, Grafana or notification pipeline.

Local candidate measurements:

| Measurement | Observed | Scope |
| --- | --- | --- |
| Snapshot event to declaration (candidate RPO) | 5.573 seconds | Synthetic OpenSearch timestamp only; not approved R12 acceptance |
| Declaration to decrypt/start/auth/native restore/query/ingest/rule validation | 65.938 seconds | Local candidate duration; excludes independent-host retrieval, Grafana, metrics/traces/collector and notification recovery; not full R13 RTO |

No approved target was used as a passing threshold. Both P08 nodes were stopped with an ownership-label guard. Stopped containers, uniquely owned networks, encrypted generations, decrypted synthetic snapshots and fresh test-only credentials remain retained. No Docker volume, historical telemetry or snapshot was deleted.

## Preserved failed attempts and runtime drift

All attempts remain separate rather than being overwritten:

1. [First attempt](p08-validation/evidence/p08_drill_659e384d40ef3d70.json): document/mapping/settings/access/ingestion recovery passed; promtool failed because its read-only root lacked temporary writable storage. Corrected by adding bounded 64 MiB tmpfs. Five existing initialization jobs changed start timestamps in its before/after inventory. No P08 code issues lifecycle commands for those jobs.
2. [Second attempt](p08-validation/evidence/p08_drill_ef94e87f97216e26.json): cached runtime image reference unavailable before source creation.
3. [Third attempt](p08-validation/evidence/p08_drill_4c41444f416bb565.json): source snapshot/encryption passed; the cached manifest became unavailable before restore creation. Corrected by creating both owned containers before stopping the source and starting the already created restore container directly. No pull/build or image deletion occurred.
4. Latest attempt above passed functional native/rule checks but failed exact live-resource equality: existing `jp_learning_dev-logs-ui-1` retained its ID/mounts/networks but changed start time and restart count. Latest read-only inventory shows Logs UI restarting. All other latest before/after container records are equal. Cause is not established here. No root project lifecycle, live fault or P07 repair was performed by these tools. The failure remains **FAIL**, not an exception or P07 acceptance revocation.

The final [acceptance summary](p08-validation/evidence/acceptance.json) records drift, pending approvals, candidate source match, all dispositions and SHA-256 references to retained evidence. Its final inventory is read-only. P07's quota exception remains unchanged; no hard persistent-quota PASS is claimed.

## Remaining acceptance requirements

| Criterion | Disposition |
| --- | --- |
| Encryption/checksums/manifest/negative cases | PASS within bounded synthetic package scope; actual custody/ACLs remain unapproved |
| Native OpenSearch mappings/settings/count/query/ingest/auth recovery and restored rule evaluation | PASS within same-host synthetic scope |
| SQLite native export integrity | PASS on synthetic offline fixtures; actual Grafana/collector acquisition/recovery not verified |
| Exact protected-runtime preservation | FAIL due observed drift; investigation required before a preservation PASS |
| D06/R10–R13 owners, data classes, destinations, encryption/custody, retention/budget, schedules and RPO/RTO | BLOCKED pending explicit owner decisions |
| Scheduled approved full telemetry/config acquisition | NOT VERIFIED; no task deployed; immutable export adapters for all stores remain incomplete |
| Independent off-host transport/storage authorization denial and recoverability | BLOCKED pending destination, identities and key custody; same laptop is insufficient |
| Full restored metrics/traces/Grafana/collector/query/notification pipeline and full RPO/RTO | NOT VERIFIED; requires approved complete restore set and isolated drill |
| Retention governance, destination hard budget and reproducible off-host generations | NOT VERIFIED; expiry candidates are reported, never deleted automatically |
| Business SQL Server/MySQL backup jobs | Documentation boundary only; no job/data/schema/application modification authorized |

Required follow-up stays within P08: resolve approvals and runtime drift; complete approved scale-appropriate native acquisition/restore integrations; demonstrate independently recoverable generations and full-service restoration against approved targets. Do not advance based on job exit code or synthetic success alone.

## Files changed

- `observability/p08/backup.cjs`, `policy.example.json`, `Invoke-P08Backup.ps1`, `native-sqlite.py`.
- `observability/roadmap/p08-validation/`: package/SQLite tests, native drill, automated verifier, evidence finalizer and uniquely named JSON evidence plus acceptance summary.
- `observability/roadmap/p08-implementation.md`, `p08-recovery-runbook.md`, `p08-verification.md` and the P08 progress section in `implementation-roadmap.md`.

Rollback is documented in the implementation/runbook. There is no deployed scheduler to disable. Retain generations/keys and never restore over an active protected store.
