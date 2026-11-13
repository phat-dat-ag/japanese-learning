# P03 rotation, replay and bounded loss

Source audit: [pipeline](p03-pipeline-architecture.md). Measurements:
[test-results.json](p03-validation/evidence/test-results.json). All numbers below are local
synthetic Python reader/reference-model results, never Fluent Bit/OpenSearch counts.

| Experiment | Generated | Locally read | Unique | Rejected | Duplicate | Missing | Interpretation |
|---|---:|---:|---:|---:|---:|---:|---|
| readable rename spool | 100 | 100 | 100 | 0 | 0 | 0 | PASS local file strategy |
| delayed compression after replay | 100 | 100 | 100 | 0 | 0 | 0 | PASS local ordering only |
| immediate gzip, active-only glob | 100 | 0 | 0 | 0 | 0 | 100 | FAIL loss criterion; PASS reproducer |
| copy-truncate, active-only discovery | 100 | 0 | 0 | 0 | 0 | 100 | FAIL loss criterion; PASS reproducer |
| overlapping copy and active replay | 100 | 200 | 100 | 0 | 100 | 0 | FAIL duplicate criterion; PASS reproducer |
| reopen whole file without offsets | 100 | 200 | 100 | 0 | 100 | 0 | demonstrates replay != exactly once |
| malformed, oversize, partial + valid | 4 | 1 | 1 | 3 | 0 | 0* | partial becomes readable after newline |
| 256-byte queue model overflow | 100 | 25 | 25 | 0 | 0 | 75 | 75 explicitly evicted, 250 bytes retained |

*The three rejected physical records are accounted separately, not proof of acceptable
business-event loss. Intentional privacy filtering F is not equivalent to malformed or
oversize rejection. Delivery attempts and confirmed OpenSearch deliveries were both zero.
Local recovery read timing is recorded in JSON and is not backend recovery time.

## Actual source risks and proposed handoff

.NET's readable daily/size JSON filenames match the glob; deletion by count/time can
still outrun collection. Quarkus's only matched active file is renamed/compressed on
rotation; JWKS archives are compressed in a nonmatching subdirectory. A running tail may
drain an already-open inode during Rotate_Wait, but downtime/new discovery after compression
cannot rely on that. Increasing limits does not eliminate this window. No historical
archives were touched. Docker local-driver data and Nginx stdout are not collected here;
JSON-file rotation is only a hypothetical alternate driver, not the configured production
overlay. No Nginx file rotation control exists in this collector path.

Proposed strategy: producer-owned, immutable uniquely named readable spool segments,
bounded aggregate retention, collector glob restricted to exactly one readable copy,
then delayed compression after a proven replay/drain horizon. Tail offsets alone are
not end-to-end delivery receipts. An archive handoff needs a reviewed manifest/retention
policy with backend visibility evidence, independent bounded replay input/state and
duplicate accounting. Do not glob copied and original segments together. No decompressor
or archive deletion job is installed; replaying historical data needs separate approval.
Japanese JWKS layout changes remain forbidden and require the dual-parent gate.

Rename, copy-truncate, inode reuse, same-size truncate/regrowth between polls, partial
line across rename, restart offsets, open-inode grace and producer restart need actual
Fluent Bit tests. Do not casually enable DB.compare_filename: it changes rename/reuse
semantics and can cause replay. Existing DB names/options remain untouched. No DB reset.

## Buffer policy comparison

| Control | Existing source | Inactive isolated profile |
|---|---|---|
| filesystem sync/checksum | full/on | retained |
| backlog memory | 32M | 8M test sizing proposal |
| up chunks | implicit default | explicit 32; soft approximate bound, not RSS cap |
| output queued chunks | env/default 1G | 64M test cap; drop-oldest remains |
| retries/grace | unlimited retry / 30 seconds | retained |
| input line cap | 1M, skip long on | retained; no silent 64KiB cutover |
| health | HTTP 2020, health enabled | retained; storage.metrics enabled |

64M is a disposable experiment setting, not a new production budget. QueueModel evicts
records; Fluent Bit evicts chunks, so the 25/75 result must not size the collector.
Per-file read buffers, file count, up chunks, backlog, output response buffers, SQLite
WAL and process overhead all contribute to memory/disk. No hard host disk quota is
established by storage.total_limit_size. Actual RSS, retry/backoff, disk-full/corruption,
storage pressure, queue overlimit, slow sink/recovery and shutdown/crash/power-loss
behavior remain NOT VERIFIED. Full sync/checksum do not make DB offsets, chunks, output
acknowledgement and searchable documents one atomic transaction. Generate_ID is not an
exactly-once guarantee. HTTP health alone cannot prove delivery or queue freshness.

P01 R04-R08 rates/drain/outage budgets remain unapproved and unmeasured. The 15-minute
collector outage test was not run. A future isolated run must freeze generated sequence
IDs, count filtered/rejected/attempted/buffered/replayed/searchable unique/duplicate IDs,
bound storage and drain time, and inspect per-item bulk errors before acceptance.
