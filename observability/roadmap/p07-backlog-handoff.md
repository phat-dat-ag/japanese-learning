# P07 Fluent Bit backlog handoff: BLOCKED pending operator evidence

Current audit supersedes the earlier all-unknown inventory: active queue counters are zero at two checkpoints, but two regular4KiB .flb files remain (8192 bytes), with record/delivery state unknown. P07 memory configuration is already active externally. Preserve those files and existing SQLite DB/WAL/SHM sets; do not manufacture an empty-backlog result, replay them or reset offsets. Live archive metadata is not a consistent backup. Future maintenance needs the counted custody/backup procedure below; it is no longer a proposed wholesale backlog migration before initial P07 deployment.

## Compatibility finding

Old and proposed Dockerfiles pin Fluent Bit4.2.5 to the same image digest. The old input
uses filesystem storage at /state/buffer, SQLite /state/{jwks,user,vocabulary}.db,32MiB
backlog memory,1G per-output chunk limit and infinite retries. P07 retains the same named
volume and DB paths but has no storage.path, uses memory-only inputs8MiB each and retry3.
Thus the chunk format has no intentional version transition, but P07 cannot discover or
deliver the old backlog. Volume retention is preservation, not migration or delivery.
The new JWKS spool glob also discovers files unknown to the old top-level glob; with
Read_from_Head Off those files start at EOF. Count them separately as unread source data.

Pinned4.2.5 source inspection: normal append runs flb_filter_do before writing chunk data;
old normalize.lua embeds `original=record`, so those persisted chunks may contain the raw
payload even though filtering already occurred. Recovery in in_storage_backlog/sb.c calls
flb_input_chunk_map, whose recovery path validates/maps data without re-running Lua.
Enabling storage.path is therefore NOT a privacy-safe way to retrofit P07 filters. Recovery
may truncate partially corrupt chunks or delete unmappable chunks: never test it against
original state. Format compatibility does not establish semantic/privacy compatibility.

OpenSearch Generate_ID hashes the packed outgoing map, not an independent producer event
ID. Re-sanitizing changes the hash; Current_Time_Index On chooses processing-day indexes.
Partial bulk success, retries across dates, copied offsets and reprocessing can duplicate
logical events. There is no atomic transaction spanning tail offsets and OpenSearch acks.
Zero files or zero retry counters alone cannot certify exactly-once delivery.

Sources: [pinned backlog mapper](https://github.com/fluent/fluent-bit/blob/v4.2.5/plugins/in_storage_backlog/sb.c#L617),
[pinned chunk paths](https://github.com/fluent/fluent-bit/blob/v4.2.5/src/flb_input_chunk.c#L912),
[pinned output ID generation](https://github.com/fluent/fluent-bit/blob/v4.2.5/plugins/out_opensearch/opensearch.c#L542).
Source hashes are recorded in blocker-resolution evidence; no original chunks were opened.

## Implemented safe tooling

`p07-validation/backlog_handoff.py` only reads an operator-provided OFFLINE consistent copy.
It has no Docker calls, chunk decoder, exporter, migration, deletion or offset update. It
hashes files, records aggregate bytes and classifies state; it emits neither bodies, SQL
rows nor filenames. Symlinks/reparse points, traversal denial and detected file mutation
fail closed. Hash metadata and snapshot custody still require protected access. Run only
on an approved stable snapshot, not a live mount or an ad-hoc copy of open SQLite files.

Commands for the operator AFTER snapshot approval/creation (not run on real data here):

```powershell
python observability/roadmap/p07-validation/backlog_handoff.py --snapshot <protected-offline-state-copy>
python observability/roadmap/p07-validation/backlog_handoff.py --snapshot <same-copy> --ledger <reviewed-ledger.json>
```

Securely capture stdout to the approved evidence location, outside public Git. Start from
p07-validation/handoff-ledger.template.json. The tool compares inventory identity and one
ledger entry per legacy file, rejects missing/duplicate/unknown chunks and unaccounted
memory, and requires evidence references. It never authorizes deployment. References are
not cryptographic approval; an independent reviewer must inspect the underlying artifacts.
Empty snapshot directories are NOT proof that the production queue was empty.

## Required operator sequence (none executed)

1. Obtain approval for a service-specific maintenance/handoff window and protected snapshot
   storage. Identify exact jp_dev_fluent_bit_state identity, UID185 ownership, active image/
   config hashes and live collector ID via selective inspect. Verify root Compose alone;
   no alternate Compose file, global up/down, initializer or migration job is needed.
2. Agree producer continuity: quiescing the collector alone lets source logs grow/rotate.
   Approve a bounded producer pause or sufficient retained-source window and catch-up plan.
   Record pre-boundary files/inodes/lengths/offsets, open/rotated archives, memory/inflight
   counters and output retries/failures. Current config lacks verified storage metrics;
   absence of a metric is UNKNOWN, not zero. Observe the output acknowledgement boundary.
3. Under that separate approval, quiesce safely and create a consistent protected snapshot
   of the ENTIRE state plus required source-log boundary evidence. Include SQLite DB/WAL/SHM
   as one consistent set and all buffer stream files. Do not copy DBs individually over live
   state. Verify copy byte hashes, counts, ownership and independent restore evidence before
   touching the deployment. Never start an old image against the only snapshot/original.
4. Inventory the offline copy; classify every chunk, including empty/corrupt/unknown files.
   Byte count is not record count. If record counts or acknowledgement history cannot be
   established, mark UNKNOWN and retain quarantine; do not invent a drain count.
5. Choose and approve one branch per chunk:
   A. Retained quarantine: preserve original and protected verified copy; record custody,
      bytes/hashes, unknown delivery state and data-owner approval to DEFER delivery. This
      is not delivered/zero-loss acceptance. A delivery-required deployment stays blocked.
   B. Reconciled delivery: build/test a decoder on a disposable copy using the exact pinned
      format, re-run the P07 allowlist on canonical records, and send only sanitized records
      to a separately approved destination. Record per-record stable source identity and
      target index/ID, backend item-level receipts and conflict/partial-ack reconciliation.
      Keep the original source-to-target ledger access restricted. Existing original IDs
      cannot simply be assumed to equal sanitized IDs. If already-delivered items cannot be
      reconciled, stop for an explicit duplicate-risk decision; never silently replay.
   No automatic replay tool is supplied because format/corruption/ack accounting and exact
   Linux embedding remain unverified. No deletion/discard disposition is accepted.
6. Reconcile memory/inflight records to zero at the boundary, plus failures, unread source
   files and all retired/unknown files. Record a counted handoff and review ledger. Drain or
   quarantine must not overwrite existing buffers. Zero backlog is only acceptable with
   consistent snapshot, acknowledgement and source-boundary evidence, not a file listing.
7. Prove native exact-image config/permissions and synthetic privacy/retry/recovery first.
   Obtain explicit deployment approval after all global P07 gates. Reuse the existing state
   volume and DBs; do not reset offsets, enable Read_from_Head or change storage.path to
   consume legacy chunks. Compare post-cutover inode/offset continuity and backend item
   counts against the signed boundary ledger; unexpected differences halt acceptance.

## Rollback

Keep all originals and snapshot ledgers. Before deployment, reverse only reviewed root
source hunks; no runtime action is required. After deployment, old storage.path can load
sensitive backlog and recovery can modify chunks; do not automatically restart the old
collector or overwrite DBs with old copies. Require a privacy-safe service-specific recovery
plan, reconcile post-cutover offsets/acks, and use isolated restore copies for investigation.
Never roll offsets backward on live state or reset counters to make totals match. Unknown
partial success remains an explicit blocker. See p07-rollback.md and runtime acceptance.

## Current exact blocker

Live queued chunk counts/bytes, record counts, memory/inflight count, receipt history and
consistent snapshot/restore evidence are UNKNOWN. Docker metadata confirms the existing
volume mount only; no volume helper, container exec, copy, replay or quiesce was performed.
No safe lossless/exactly-once migration is guaranteed. The implemented inventory/assessment
and9 synthetic tests resolve procedure/tooling gaps, not this operator-dependent evidence.
