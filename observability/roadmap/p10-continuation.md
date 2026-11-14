# Current P10 completed continuation — PASS for local development

Fresh resource guards passed and the approved actual native [full multi-store recovery](p10-full-recovery.md) completed in **544.245s service RTO**, with **34,403.272s RPO**. Logs, full metric history, trace payloads, backed-up dashboard/datasources, offsets, resumed collector ingestion and isolated recovered alert firing/resolution pass. All 52 original containers, volumes, backups, schedules and revisions are preserved; only owned disposable resources and temporary restored copies were removed. Sampled peaks and all hard caps meet the approved envelope. [Final P10 acceptance](p10-validation/evidence/jp_obs_validation_20261114150620_955b6d3f/acceptance.json) combines this with prior successful evidence. **P10 PASS; 11/12 complete; P11 unstarted.** Historical checkpoints below remain preserved and are superseded only by measured new results.

# Current P10 approved WSL2 maintenance

The [9 GiB configuration and approved one-time interruption](p10-wsl-maintenance.md) succeeded. All 52 original container identities and volumes, backup/task definitions and Git revisions are preserved; services recovered with expected start-time changes and unchanged restart counters. Engine headroom now passes at **4,848.480 MiB**. Windows available RAM still fails at **463.957 MiB versus 1,024 MiB**, so full recovery was not executed. No new full-drill RPO/RTO or resource peaks are claimed. **P10 PARTIAL; 10/12 complete; P11 unstarted.**

# Current P10 safe memory investigation

Fresh read-only investigation confirms **3,471.542 MiB available against 3,680 MiB required (208.458 MiB short)**. Other guards and complete runtime preservation pass; no safe P10-owned runtime reclamation was identified. No full recovery resources were created, no infrastructure settings changed and no new full-drill RPO/RTO or resource peaks are claimed. See [memory breakdown, evidence and maintenance proposal](p10-memory-investigation.md). P10 remains PARTIAL; 10/12 phases complete, P11 unstarted. The approved test budgets and previous results remain unchanged; older measurements below are historical.

# Current P10 audit and approved full recovery

The [generated-file audit](p10-file-audit.md) records the approved full-recovery budget, lossless duplicate consolidation and a failed fresh memory guard (**3,435.576 MiB available /3,680 MiB required**). No full drill ran and no existing resource was stopped or recreated. P10 remains PARTIAL; all prior successful results and failed evidence below are preserved. Authorization is no longer the blocker; capacity is.

# Current P10 resolution — PARTIAL, local development

The twelve-event ENOSPC cohort is now reconciled by a bounded source-to-search handoff candidate: the final native run confirms **20/20 unique documents, zero missing/duplicate documents**, normal ingestion/restart and capacity firing/resolution. New outage-privacy and native retention/deletion-boundary checks pass. Full multi-store recovery remains BLOCKED by the approved storage/data/request caps and available memory headroom. See [root cause, new evidence and precise recovery proposal](p10-resolution.md). No approved budget or policy changed; all earlier measurements below remain historical evidence.

# P10 integrated continuation — local development

**Final status: PARTIAL.** The approved budgets removed the prior budget blocker, and native pipeline, monitoring, dependency, notification and limited recovery checks executed. ENOSPC loss accounting and full recovery/privacy coverage prevent P10 acceptance. P00–P09 remain complete for their applicable development scopes: **10/12**. P11 is unstarted. No production readiness claim.

Authority is the current user continuation instruction, the [P10 quality gate](p01-quality-gates.md#p10-isolated-resilience--performance-validation), [roadmap](implementation-roadmap.md) and [approved development budget record](p10-development-policy.md). Historical [P10 verification](p10-verification.md) and all original evidence remain below/alongside these results. Machine acceptance is [continuation-acceptance.json](p10-validation/evidence/continuation-acceptance.json); [artifact hashes](p10-validation/evidence/continuation-manifest.json) cover scripts and retained run evidence.

## Environment, workload and isolation

Fresh baselines include all **52 existing containers**, including **21 development containers**, exact IDs/images/start times/restart counts/health/mounts/network attachments, existing volume identities/options, Git HEAD/submodule SHAs/status, Docker/Node versions, available engine/host capacity, P08 task-definition hash and hashes of all backup artifacts. Each successful major scenario has a preservation snapshot. Baselines are immutable per-run files, not replacements for the original P10 baseline.

All runs used unique `jp_obs_validation_<UTC>_<random>` Compose projects. No published ports, external/shared networks, host networking, Docker socket, privileged mode or writable host binds were used. Every mutable target was verified against exact project/run labels and excluded from the protected baseline. Configuration binds were read-only and restricted to newly created fixture configuration and the P10 source client. Test-only CA/certificates, credentials and RSA/JWKS material were generated under ignored `.local` paths. No live signing material was copied.

Storage uses read-only roots, size-limited tmpfs mounts and two fresh 8 MiB local-driver tmpfs volumes. Their actual `statvfs` capacity was **8,388,608 bytes each** before faults. Native telemetry, focused routing/monitoring and final dependency envelopes are respectively **443 MiB**, **203 MiB** and **86 MiB**, including configuration/artifact/log allowances. Cached images were reused; none downloaded. Projects ran sequentially; attached routing attempts used the existing project's bounded agent/source volume. Final retained artifact/configuration bytes are recorded in machine acceptance and are below the reserved 72 MiB allowance.

The largest candidate configuration caps RAM at **2,688 MiB** and CPU at **4 cores** across seven containers, with bounded PIDs and rotating logs. The maximum aggregate candidate memory observed across retained `docker stats` samples was approximately **1.14 GiB**; this is **not a measured continuous peak**. Engine/host capacity snapshots and samples are retained. The final runner also rejects insufficient engine memory headroom with a 256 MiB reserve. Workload clients are serial, except independent routing/controller observation where at most two clients exist. Log/span generators run at no more than **4 events/second**; dependency clients at no more than **2 requests/second**. No scenario approached 300 generated requests or 64 MiB data. Scrapes and control traffic are distinct from generated application load; no packet-capture claim of an aggregate all-hop peak is made.

Native software: Fluent Bit **4.2.5**, OpenSearch **3.9.0**, Collector **0.145.0**, Tempo **2.10.3**, Prometheus **3.14.0**, Grafana **13.2.2**, Python **3.14 Alpine**, cached NGINX stable Alpine; host Node **v24.20.0**, Docker client/server **29.9.3**. Every actual image ID is in its run manifest. The running OpenSearch/Fluent Bit image IDs were no longer present in the image store; cached tagged candidates resolved to different immutable IDs. Those candidate identities are explicitly recorded; the live containers were not rebuilt, replaced or restarted. This is candidate validation, not proof that unavailable deployed image bytes are identical. SQLite's separate library version and NGINX's separate binary version were not captured; the complete cached image identities are retained.

## Scenario acceptance matrix

Every row below uses a manifest-owned internal-only environment and the approved <=30s fault, <=120s observation and <=512 MiB storage limits. Durations include the controller overhead stated in the evidence; no fixture timing is substituted for full service disaster-recovery RTO.

| Scenario / evidence | Workload and injected fault | Actual result | Timing | Status |
| --- | --- | --- | --- | --- |
| Original P05/P07 rule semantics; native run | 42 existing P05 cases plus one P07 capacity case; exact active rule bytes, native `promtool` virtual time | Both native commands `SUCCESS`; capacity pending/firing/resolution assertions pass. No real long fault or live rule change. | Virtual timestamps; wall execution 23.861s | PASS, rule scope |
| Fluent Bit → OpenSearch; native run | 8 nominal +20 outage events, 2,108 source bytes; pause only owned OpenSearch | 28 searchable unique sequences, 0 missing, 0 duplicates; native retry/output evidence and source/queue filesystem usage retained | Outage 8.022s; recovery verification 3.688s; drain observation 2.740s | PASS, this workload |
| Collector → Tempo; native run | 4 nominal +20 outage spans; pause only owned Tempo; bounded 64-item queue, two consumers and native retry policy | All 24 IDs retrieved; 0 missing; one query-visible span per ID; exporter queue/failure/sent metrics before/during/after retained; tested header sentinel absent from retrieved traces | Outage 8.240s; all IDs verified within 34.782s after return, including query overhead | PASS, this workload |
| Scrape-target failure; native run | Private target returns 503; short explicitly named fixture alert, 3s pending | 2 `up=0` samples; alert firing then absent on recovery; P09 dashboard provisioned. Metric exposition gap is not backfilled. | Fault 10.881s; detection 9.771s; recovery verification 7.622s | PASS, short fixture rule |
| Prometheus / Grafana datasource; monitoring run | Pause owned Prometheus; independent client, Grafana datasource-health and actual datasource-proxy queries | All three requests time out; datasource/query recover, proxy returns 200, all pre-fault samples remain; largest observed sample gap 12.492s | Outage 11.899s; recovery verification 2.787s | PASS, query availability/history; no browser-rendering claim |
| Native queue/storage pressure; focused pressure run | Fill only 8 MiB queue/offset volume to zero free bytes; 12 sequenced events during fault, 4 fresh after clear | **0/12 pressure events delivered; 12 missing; 0 duplicates. All 4 fresh events delivered after clearing pressure.** Output drop counter does not reconcile the missing records. | Pressure 8.936s; fresh-delivery observation 6.088s | PARTIAL; loss disposition unresolved |
| Capacity alert; original and focused evidence | Native pressure plus short fixture rule; unchanged long operational rule in virtual time | Raw receiver records `P10ShortCapacity` firing and resolved; original 1m pending capacity rule passes virtual-time assertion. | Fits pressure/observation window; exact notification timestamps retained | PASS, explicitly split scopes |
| Collector offsets / restart; pressure run | Restart only owned Fluent Bit with independent source/queue volumes still mounted; 4 new events | SQLite integrity `ok` before/after; offsets identical; 12 existing searchable records become 16 with 4 new, 0 duplicate sequences. Missing pressure events remain missing. | Restart through verified fresh delivery 14.104s | PASS for offset persistence, not end-to-end delivery correctness |
| Database adapter unavailability; final dependency run | Pause native SQLite HTTP adapter; one synthetic protected request plus recovery request | 503 then 200; native Prometheus dependency alerts fire and resolve; bounded application timeout | Fault 5.264s; detection 5.108s; recovery incl. alert clear 4.353s | PASS, adapter scope |
| JWKS unavailability; final dependency run | Pause fresh RSA public JWKS endpoint | 503 then 200; native dependency alerts fire/resolve; no auth bypass | Fault 5.055s; detection 4.895s; recovery incl. alert clear 4.366s | PASS, fixture scope |
| Application unavailability; final dependency run | Pause synthetic JWT-verifying application behind native NGINX | Gateway 504 then 200; native scrape alert fires/clears; 1s proxy read timeout | Fault 5.716s; detection 5.575s; recovery incl. alert clear 4.278s | PASS, fixture scope |
| Gateway unavailability; final dependency run | Pause owned NGINX | Client timeout then 200; native gateway scrape alert fires/clears | Fault 6.120s; detection 5.972s; recovery incl. alert clear 4.531s | PASS, fixture scope |
| Native SQLite lock; final dependency run | Five-second exclusive transaction on an empty synthetic-only DB | Protected request returns 503 during lock, then 200; SQLite busy timeout 0.2s | Five-second lock; complete observation 7.179s | PASS, SQLite scope |
| Invalid JWT regression; final dependency run | Valid fresh RS256 token, malformed/expired/tampered/`alg:none` variants | Valid request 200; all four invalid classes 401 | Bounded single requests | PASS, synthetic application only |
| Existing notification path; native run | Actual unchanged `P07AcceptanceNotification` expression toggled on private exporter | Firing and resolved received by private API-compatible receiver; diagnostic context/labels retained | Fault/firing delivery 10.494s; resolved delivery after clear 15.096s | PASS, transport; not deduplication |
| Native grouping/dedup/resolution; final routing run | Real Grafana-managed multidimensional rule, active embedded Alertmanager policy, two alert instances, private webhook | Exactly one grouped firing webhook containing two alerts, followed by one resolved webhook; same native fingerprints retained | Firing receipt 7.295s; fault 11.172s; resolved receipt after clear 7.613s | PASS, tested native grouping window |
| P08 encrypted native logical recovery; native and pressure runs | P08 authenticated package/create-only restore of synthetic actual OpenSearch documents; import into a new disposable index | Exact normalized hashes/counts match: 28 records first run, 16 second run. No live restore or full multi-store disaster drill. | Checkpoint ages 133.150s /12.009s; logical restore 3.608s /4.463s | PASS, limited logical recovery only |

Selected runs, including full immutable relative paths, are listed in machine acceptance:

- Native: `jp_obs_validation_20261114100614_0f855f4d`
- Focused pressure/offsets: `jp_obs_validation_20261114101510_db3b3b73`
- Native dependency monitoring: `jp_obs_validation_20261114103330_35f14ce3`
- Native grouping: `jp_obs_validation_20261114103509_bae147ae`
- Datasource/metric persistence: `jp_obs_validation_20261114103848_5de8e2be`

The original 13 source guards, 8 MiB OS ENOSPC/write recovery, 24-item synthetic queue result, original monitoring/backup authentication and runtime-preservation evidence remain unchanged. They are not counted as native pipeline acceptance.

## Loss, recovery and remaining criteria

**The pressure loss is a substantive finding.** Filling the disposable filesystem produces Python ENOSPC; native chunk allocation logs report `Operation not supported`/`cannot adjust chunk size`/`no available chunk` under pressure. After collector restart, native diagnostics remove twelve unreadable chunk tags. Offset integrity and continued operation therefore do not imply all eligible events reached OpenSearch. The 12 missing sequences remain absent after restart, and the output drop counter does not account for them. Results apply to this tmpfs filesystem candidate and do not prove the same failure mode on live persistent volumes. No live configuration fix or policy waiver was made.

The two synthetic logical-restore checkpoint ages are below 24h and restore timings below four hours, but they **do not establish full P10 service RPO/RTO** or cure the missing pressure events. The full existing P08 multi-store drill model exceeds 512 MiB unchanged and was not run. Full encrypted telemetry/config/dashboard/offset restoration order and complete disaster recovery remain BLOCKED under that model; the approved P08 evidence is retained, not relabeled as new P10 evidence. An appropriately bounded multi-store model would require separate engineering and validation within the same approval, not a silent storage-budget increase.

Full stored/rotated/buffered privacy regression for all JWT/key/password/header/body/PII classes, complete native retention/expiry lifecycle and real SQL Server/MySQL/application behavior remain NOT VERIFIED. The SQLite HTTP adapter is not those wire protocols. Source/config retention limits were inspected; no long expiry process was claimed executed inside the 120s observation budget. Cross-project JWKS adoption is not applicable: no shared candidate or contract change was made. The native trace header sentinel and evidence secret/JWT/private-key scans pass within their stated scopes.

Copied full P05 rules correctly detected three intentionally omitted application jobs in the native telemetry fixture and repeatedly sent those absent-job states to the private raw receiver. The evidence keeps this noise visible. The native Grafana grouping scenario is separate, with only its intended rule; its success does not claim noise-free acceptance of the entire original operational catalogue or change the live development receiver. Prometheus total outage was detected by the independent test client, not by a fictitious self-watchdog.

## Failed attempts, corrections and preservation

All failed directories and earlier P10 reports remain. Corrections included missing cached deployed image IDs; partial Compose creation cleanup; executable OpenSearch native-library scratch; strict CA key usage; all NGINX temporary paths on bounded writable scratch; and waiting for active Grafana Alertmanager policy adoption. Direct external-style alert POSTs to embedded Grafana returned 400; the successful scenario uses a native Grafana-managed rule. One attached routing attempt raced fixture cleanup and is retained as BLOCKED. The first generic pressure wrapper marked a row PASS before verifying fresh delivery/loss; the focused PARTIAL result supersedes that interpretation without rewriting the historical JSON.

Final cross-run comparison preserves every original container's ID/image/start/state/health/restarts/mounts and every original volume identity/options. P08 backup file hashes/size/timestamps and scheduled-task XML hashes match. All declared disposable containers/networks/volumes were removed by exact ID/name plus run/project ownership checks; partial creations were handled with the same guards. No broad prune/down, live lifecycle operation, live database read/write, backup mutation, shared key/submodule change, commit/push/merge or P11 work occurred. These controls prove the P10 operation boundary; no claim is made of cryptographic equality of mutable business DB bytes during independent live activity.

## Reproduction

Under authorized Docker access, from the repository root:

```powershell
node observability/roadmap/p10-validation/integrated.cjs
node observability/roadmap/p10-validation/integrated.cjs pressure
node observability/roadmap/p10-validation/dependencies.cjs
node observability/roadmap/p10-validation/integrated.cjs routing
node observability/roadmap/p10-validation/integrated.cjs monitoring
node observability/roadmap/p10-validation/finalize-continuation.cjs
```

Each runtime invocation creates a new evidence directory and ignored fixture workspace. The finalizer selects completed native evidence, checks preservation/privacy/artifact allowance and records hashes; its original native-run reference intentionally identifies this continuation's full run. Retain acceptance/manifest files before re-finalizing if the previous aggregate must remain immutable. Do not rerun the original `validate.cjs`/`report.cjs` to overwrite historical evidence. No unexecuted criterion is PASS.
