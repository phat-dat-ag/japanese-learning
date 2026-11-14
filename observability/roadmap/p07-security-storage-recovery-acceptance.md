# P07 security, storage and recovery acceptance

> Current closure: **P07 PASS with approved development-only strict-quota exception**. Durable synthetic backup/restore, rollback and accelerated native expiry passed; see [current verification](p07-laptop-verification.md). Earlier BLOCKED statements below are historical checkpoints.

> Fresh deployment supersedes earlier runtime/storage locations below. See [current laptop verification](p07-laptop-verification.md): 16 running, 13 healthy, five jobs successful; native OpenSearch TLS/RBAC and authenticated local notifications pass. Persistent quotas and durable recovery/elapsed retention remain acceptance blockers.

2026-11-14 laptop development environment. **P07 BLOCKED; P08 must not begin.** Existing tracing acceptance was reused, not reinvestigated. No application service was recreated. The isolated proofs below do not establish production-grade security or storage guarantees.

## Results

| Area | Result | Evidence and limits |
| --- | --- | --- |
| Live authentication | FAIL | Grafana missing/wrong auth 401; existing admin allowed. Logs ingress returns 500 with credentials because its htpasswd bind is a directory. Anonymous 401 alone was insufficient evidence. |
| Live native security | FAIL | OpenSearch remains unauthenticated HTTP inside log-storage; logs ingress has no TLS. No protected store or credential was changed. |
| Access boundaries | PASS locally | Loopback ports, unpublished raw stores and private networks inspected; direct gateway-to-store connection denied. Host/Docker administrators remain trusted. No universal hostile-host isolation claim. |
| Isolated TLS and roles | PASS | Native OpenSearch 3.9.0 allowed valid admin, writer and reader requests; denied wrong credentials, wrong role/index/admin operations, wrong CA, hostname, expired client certificate and plaintext. Expiry cause recorded server-side. |
| Collector trust | PASS in fixture | Separate Fluent Bit writes one synthetic record with verified CA/hostname TLS and scoped writer credentials. Existing Fluent Bit and its state volume were untouched. |
| Persistent disk quotas | BLOCKED | All 11 live named volumes have no driver quota options. Prometheus retention, Fluent Bit per-output queue and memory/log/ingestion limits are not total-volume guarantees. |
| Test quota | PASS in fixture | New 1MiB tmpfs returns ENOSPC exactly at budget; test-only truncation recovers space. Candidate data volumes each 96MiB, snapshot 64MiB, verified by df. These are memory-backed, not persistent storage quotas. |
| Pressure alerts | Fixture PASS; live BLOCKED | Native promtool passes 3 scenarios / 10 assertions for warning, critical, pending, recovery and missing metrics. Active Prometheus has no telemetry disk rules, no node filesystem series and no active Alertmanager. No notification delivery guarantee. |
| Retention | Configuration/eligibility PASS | Existing 30-day ISM assignments and 2d/512MiB Prometheus retention inspected; prior 24h Tempo configuration reused. Native fixture history shows age transition to expired and completed policy. The fixture has no delete action; live expiration/deletion timing not tested. |
| Native backup/restore | Synthetic fixture PASS | Snapshot SUCCESS on only 12 synthetic records, no global/security state; restored on a separate data volume. IDs/content hash match exactly; green primary health and native recovery recorded. |
| Migration/rollback | Scoped fixture PASS | Adding a mapping field preserves all records. Restoring the snapshot to a fresh rollback index restores the original mapping and hash, with auth still enforced and scoped reader/writer checks. Same engine version only. |
| Durable/real migration | NOT VERIFIED | Snapshot lives in bounded tmpfs, is same-host, unencrypted and ephemeral. No legacy protected-volume migration, persistent disaster recovery, real Dashboards role compatibility or live cutover proof. Test role config was initialized separately, not restored from secret snapshots. |
| Preservation | PASS | All 20 original IDs/starts/restart counts and normalized mounts/networks unchanged; all 11 original volume names/options preserved. No DB/offset reset, shared service mutation, commit/push or P08 work. |

## Confirmed ingress defect and required approval

`D:\japanese-learning\secrets\logging\htpasswd` is a directory, mounted read-only at `/etc/nginx/logs.htpasswd`. NGINX records `pread() ... Is a directory` and returns 500 whenever Basic credentials are supplied. The 401 challenge and healthy `/health` endpoint do not prove working authentication. Credential contents were neither read nor changed. No directory was replaced or deleted.

Operator action: select/supply an approved regular htpasswd file at a valid new path, preserve existing credentials/directory, validate that source is a regular file, and approve only ingress recreation using `docker compose -p jp_learning_dev -f docker-compose.yml up -d --no-deps --no-build logs-ui`. This repair was not executed because rebinding/recreating the live ingress requires approval.

## Storage and headroom boundaries

Docker reported 919.76 GiB available in its virtual filesystem. Windows C: had 6.47 GiB free and D: 170.17 GiB free at the recorded observation. Docker VHD backing placement and guaranteed physical reserve were not established; the virtual figure must not be reported as physical usable capacity. No host disk was filled, resized or cleaned.

| Store/control | Existing bound | What remains unbounded/unproven |
| --- | --- | --- |
| OpenSearch | Retention, JVM/container limits and disk watermarks | Total persistent bytes, physical reserve, effective expiry timing and disk-alert delivery |
| Prometheus | 2d/512MiB block retention and resource limits | WAL/head/temporary compaction plus filesystem total |
| Tempo | 24h retention, per-trace/ingestion limits | WAL/block/compaction total and persistent quota |
| Fluent Bit | Per-output 1G queue limit | State DB/WAL and other file/queue overhead; not a volume hard cap |
| Grafana/Dashboards | Container memory and log settings | SQLite/plugin/state volume total |
| Docker local logs | Rotation sizes/counts | Driver metadata and total virtual/host disk across stores/projects |

Persistent named volumes in this Desktop configuration expose no enforced per-volume quotas. The tested tmpfs size option is a hard memory-backed fixture bound; substituting it for durable telemetry storage would lose persistence. A host/storage platform with reviewed durable budget enforcement and reserve monitoring is required for a stronger claim. Candidate alert files are reviewable source only; they were not hot-loaded or deployed to live Prometheus.

## Recovery scope, test handling and integrity

Fixture project `p07_accept_44b07b` had its own internal network, no published ports, new independent data/snapshot volumes, test-only CA/certificates and randomly generated test identities. No live telemetry or database volume was mounted. Only native index snapshot APIs were used, not raw data-directory copies. This follows the [OpenSearch snapshot guidance](https://docs.opensearch.org/latest/tuning-your-cluster/availability-and-recovery/snapshots/snapshot-restore/).

All 12 document IDs and sources share SHA-256 `af7ce2f96e051ba654539d9429258fec366bcb51de3018aa072a2bf136bca0ed` before snapshot, after restore, after compatible mapping migration and after rollback. Snapshot excluded global state and the Security index; roles were recreated from synthetic fixture configuration. This is a minimal isolated pre-migration workflow proof, not approval to enable security in place on existing OpenSearch data.

Native ISM history, rather than an inferred timer, records `transition_to=expired` and policy completion. The initial poller missed the transient state and reported false; its raw evidence remains. An attempted 10-second coordinator sweep was rejected by OpenSearch (minimum 5 minutes), no invalid change applied, and transient settings were reset. Final history is the authoritative eligibility evidence. ISM is a scheduled mechanism, as described in the [3.9 settings](https://docs.opensearch.org/3.9/im-plugin/ism/settings/); exact deletion deadlines are not promised.

Initial test issues are retained: a bootstrap helper exceeded the node-shared memory budget and was moved into its own bounded helper; the first writer role lacked required cluster bulk permission, which was added narrowly; the first promtool runner needed bounded writable /tmp. Corrected tests passed. No production limit was increased or disabled to accommodate tests.

The disposable collector inherited Compose labels from its image. Its exact stopped ID was reviewed against the original baseline and its private read-only mounts; its removal was separately approved and executed, with no volumes. The runner now overrides project/service labels. Source/restore fixture nodes were stopped after evidence capture to release test memory. Original containers were not stopped. No volume removal commands ran; tmpfs test contents are intentionally ephemeral after unmount. Generated test keys/passwords are excluded by the fixture `.gitignore` and are not acceptance evidence. Co-located test keys do not prove production secret custody.

## Quarkus and operator decisions

Quarkus stays detached at `815b637a799cab8009d154ee9c97cec0f1dce734`; local develop stays at `d6642616abf0d3373c4ebe1f514d69ec9b669f2a`, an ancestor of HEAD, while origin/develop matches HEAD. Both files matched prior hashes at the earlier 23:55 UTC checkpoint. The final check detected the Swagger addition absent and application.properties clean at its index; modification time is 23:56:45 UTC. The cause is unexplained and outside the source writes made by this task. The operator explicitly answered to record the drift for review. The current file was left unchanged and the saved original/patch retained; Dockerfile hash and branch refs remain unchanged. See `evidence/quarkus-final-drift.json`. The [branch strategy](p07-validation/security-recovery/quarkus-branch-strategy.md) proposes a future new branch at current HEAD, then explicitly reviewed preservation/commits and eventual fast-forward alignment only with a clean tree. None of those operations ran.

Remaining decisions: approve the ingress credential-source repair and ingress-only recreation; select the real CA/role/custody owners and persistent native-security candidate; choose enforceable persistent storage budgets and confirm backing-disk reserves; approve live filesystem metrics, pressure rules and an actual notification destination; require persistent candidate/compatible-reader rollback evidence before real migration. No blanket cutover approval is requested for an unprepared configuration.

P07 exit gates still fail on live authentication/native security and persistent storage/alert acceptance. Therefore **P07 cannot be accepted and P08 must not begin** under the current gates. The isolated successes reduce uncertainty but do not waive these requirements.

## Evidence

[Current scoped acceptance JSON](p07-validation/security-recovery/evidence/acceptance.json), [live baseline](p07-validation/security-recovery/evidence/live-baseline.json), [final preservation](p07-validation/security-recovery/evidence/live-final.json), [native fixture checks](p07-validation/security-recovery/evidence/fixture-runtime.json), [native history/closeout](p07-validation/security-recovery/evidence/fixture-closeout.json), [collector](p07-validation/security-recovery/evidence/collector-native-tls.json), [pressure tests](p07-validation/security-recovery/evidence/pressure-tests.json), [ingress diagnosis](p07-validation/security-recovery/evidence/ingress-auth-defect.json), and [branch evidence](p07-validation/security-recovery/evidence/quarkus-branch-state.json). Prior P06 tracing and P07 tracing-resolution evidence remains unchanged. The root P07 acceptance JSON points to this scoped bundle.
