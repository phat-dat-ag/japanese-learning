# P07 stored-data privacy, access and recovery review

This is source/configuration review plus explicitly named metadata observations, NOT a
scan of real telemetry. No stored payload, user data, credentials, logs or trace contents
were read or changed. Future filtering cannot sanitize historical state.

| Store | Historical exposure hypothesis | Future protection | Safe remediation decision, requiring approval |
|---|---|---|---|
| Fluent Bit state/source archives | Legacy postfilter chunks embed original; source files may hold tokens, identifiers, peers, bodies or exception text | P07 output allowlist, memory-only chunks, restricted existing volume | Protected consistent copy and counted quarantine/reconciled replay; no direct backlog load or deletion |
| OpenSearch | original mapping enabled:false still retains raw values in _source; free message/peer/caller/correlation can expose data | Application/P07 Lua allowlists; future-index template proposed but unapplied | Restrict readers first; classify/sentinel-audit approved copy, produce sanitized copy with reconciliation and reader compatibility, retain originals under restricted custody; do not PUT/reindex/purge here |
| Prometheus | Historical private labels/exemplars may remain in blocks/WAL/head; request paths could carry sensitive values | Whole-sample sensitive-label rejection and no new stored exemplars; existing dimension contracts preserved | Restrict access; classify approved isolated copy; natural policy expiry is deletion and is not run/accelerated here; no admin delete_series/clean_tombstones or WAL edits |
| Tempo | Old attributes/events/links, query strings, DB/exception text and resource IDs may remain in WAL/blocks | Producer scrubbers plus P07 pre-export filtering and bounded sampling | Restrict API/storage; audit approved synthetic/isolated copy, separate sanitized destination if justified and supported; no in-place block edits, key changes or trace purge |
| Grafana / Docker logs | Query history, audit/session metadata, SQLite secrets, provisioning and console errors may contain restricted data | Existing login/no signup/no anonymous, plugins off; P07 sessions/query bounds and Docker rotation | Restricted host/storage access, approved redacted evidence and safe-reader checks; no password/user/database changes |
| Loki | No jp_dev service/config/volume exists in authoritative root. Historical metadata identifies springboot_project-loki-1 | Out of scope; P01 explicitly prohibits adding duplicate Loki | Do not inspect or change its config, credentials, retention or data. Owner must handle separate-project findings; no Loki safety/retention claim made |

## Access boundaries and prepared corrections

The resolved root and current selective runtime metadata show jp_dev published endpoints
bound to127.0.0.1. Prometheus9091 and Grafana3001 are loopback, as is authenticated logs UI
(actual5661); no OTLP, Tempo, OpenSearch, Fluent Bit2020 or raw Dashboards port is published.
Current runtime metadata is in blockers-runtime-before/after.json, not inferred from defaults.
Grafana datasource API without credentials returned401; this does not prove full RBAC.

Prometheus has no query authentication/TLS; its loopback queries remain available to local
processes. logs-ui Basic authentication and Grafana login are plaintext on localhost;
remote tunnels/proxies/shared hosts change the threat model. Application metrics share
published API listeners. Internal bridge membership does not authenticate a peer: APIs can
reach the Collector/default bridge, Grafana can reach Tempo, and logging peers can reach
OpenSearch. Namespace filtering can be spoofed. OpenSearch security is disabled; backend
OTLP/Tempo/Prometheus use plaintext and no native identities. No new port/network or wider
binding is introduced by P07. Existing credentials and secret files are not read/modified.

Safe source corrections already integrated: preserve loopback/internal boundaries, disable
anonymous/signup/plugins, fail-closed privacy filters, finite queues and bounded queries.
No newly discovered expanded binding requires changing a published endpoint. Before an
untrusted-host/production deployment, security owner must approve native OpenSearch RBAC/TLS
and collector/backend client identities, CA/SAN/expiry/rotation and per-role denial matrices;
platform owner must prove restore, ownership and data compatibility. Certificate issuance,
identity provisioning and live security-plugin activation cannot be safely fabricated here.
Do not solve this by invented passwords, TLS insecure_skip_verify or public backend ports.
For development, any residual-risk exception must be explicit and scoped; it is not a
replacement for missing privacy/backlog/runtime gates. No production approval is claimed.

## Non-destructive historical remediation order

1. Assign data/security owner and containment/access review; identify storage, replicas,
   archives, WAL, snapshots and exports, without copying payloads into Git or tickets.
2. Obtain separate approval for a consistent protected copy and isolated restore. Record
   custody, file hashes, counts, retention/legal constraints and permitted readers.
3. Run synthetic sentinel checks first. Any approved real-data scan emits only aggregate
   categories/counts and protected evidence references; finding snippets must be redacted.
4. Choose restricted retention/quarantine or a separately validated sanitized replacement
   with exact mapping/IDs/counts and compatibility testing. Rewrites can change event IDs,
   query behavior and duplicates; do not switch reader aliases without an approved plan.
5. Reconcile original/sanitized totals and lost-field decisions. Preserve originals under
   authorized custody. Historical disposal, expiry changes and credential rotation are
   separate owner decisions, not actions performed or automatically authorized by P07.

## Retention, quotas and disk-full recovery

Source: OpenSearch ISM30d (policy attachment/action success UNVERIFIED), Prometheus2d/512MB
(native current flags independently report2d/512MiB), Tempo24h (native2.10.3 config verify
PASS; actual compactor deletion UNVERIFIED), Grafana no general disk retention, legacy
Fluent Bit1G per-output dropping oldest (not whole-volume quota), P07 memory queues/retry3.
No Loki retention applies to jp_dev. No backend hard filesystem quota is configured/proven.
Time retention, block-size retention, memory cgroups and Docker per-container rotation are
not a total disk quota. Existing legacy chunks are additive to the offset budget.

Budget arithmetic and70% warning/85% critical/90% emergency thresholds remain planning
assumptions; also alert on absolute recovery headroom, native watermark/write rejection or
forecast time-to-full, whichever comes first. Proposed OpenSearch70/80/90 watermarks are
unapplied. Native installed settings and host/volume free bytes still require owner evidence.
Current Prometheus point flags are not a measured ingestion/growth rate or disk quota.

At disk-full: OpenSearch watermarks/rejections can halt writes; Fluent Bit finite retries
or old queue eviction can lose data; SQLite offsets may fail; Prometheus WAL/compaction/
scrapes can fail; Tempo WAL/compaction/ingest can fail and in-memory export retries expire;
Grafana SQLite writes/sessions may fail. Producer rotation/async drops and Docker rotation
can remove data before collection. Loss is possible and must be counted, never hidden.

Recovery needs an authorized incident plan: preserve evidence/state, contain new ingestion
if approved, expand verified capacity or restore to approved isolated storage, then validate
backend integrity and free-space margin before resuming. Never prune volumes, truncate WAL,
delete indexes/chunks, clear OpenSearch flood blocks before headroom exists, or replay from
old offsets as an automatic remedy. Run pressure/restart tests only on separately approved
disposable resources; filling the live disk is forbidden. No runtime fault was injected.

Current bounded aggregate scan supersedes the earlier no-payload-scan statement: latest20 documents have no original/forbidden-key findings; oldest20 all retain original. Payloads were processed only in memory and not printed/persisted. Synthetic .NET stored trace/logs exclude the private query/header sentinel; Quarkus correlated logs exclude it but trace retrieval is open. Historical containment/remediation decisions remain required; no telemetry was removed or sanitized.
