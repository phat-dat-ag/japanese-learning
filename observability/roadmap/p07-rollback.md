# P07 single-Compose rollback and state preservation

Current state: P07 is already active, verified read-only. Earlier source-only rollback descriptions below are historical. Any runtime rollback now requires separate approval and post-cutover receipt/offset reconciliation. Retain both4KiB .flb files and all SQLite DB/WAL/SHM files; zero active queue counters do not authorize deleting/replaying them. No rollback is needed merely to correct stale deployment-status documentation, and no blanket restart is proposed.

Only root Compose source and P07 component/evidence files change. No deployment, rollback,
container lifecycle, data migration, volume deletion, credential change or key change ran.
The root docker-compose.yml is the sole Compose configuration; do not recreate an override.

## Source reversal before deployment

Review the current machine manifest and root Git diff. Reverse only the authorized P07
root hunks: four local Docker log policies, Fluent Bit build context/Dockerfile, Prometheus
config bind/four appended flags, Grafana provisioning bind/six added defaults and Collector/
Tempo config bind sources. Prior sources are observability/logging/Dockerfile.fluent-bit,
observability/p05-candidate/prometheus and observability/p06/{collector.yml,tempo.yml,
grafana/provisioning}. Preserve all later user edits; never reset/checkout/clean broadly.
The pre-integration HEAD and source checksum are in single-compose-preflight.json.
Revalidate the sole root configuration after any source reversal. Retain evidence.

## Fluent Bit migration and rollback gate

The original fluent_bit_state:/state mount and DB filenames stay in place. No new empty
state volume is substituted. P07 reads existing offsets and leaves old /state/buffer files
untouched but does not replay them. Before separately approved deployment, inventory queue
counts/bytes and offsets; take an authorized consistent protected backup with UID185
ownership preserved; validate image behavior and privacy-safe isolated replay; record exact
image/config identities and counted drain/handoff/loss decisions. This remains a release gate.
Never copy offset DBs over a running collector, reset offsets, delete legacy chunks or
silently replay sensitive records. Memory-only queues can lose records on restart/outage.

After a future deployment, reverting Fluent Bit to storage.path=/state/buffer could replay
old sensitive chunks and reverting filters could restore raw original export. Neither is an
automatic safe rollback. Require an explicitly approved privacy-safe image/config and
service-specific recovery plan preserving all state; prefer containing export under that
plan over bypassing privacy. No old volume/archive is deleted or deemed sanitized.

All other named storage (Prometheus, Grafana, Tempo, OpenSearch, application logs and DBs)
is unchanged. Retain datasource UIDs, credentials,24h Tempo retention and P05 rules/dashboards.
Source reversal cannot restore omitted new fields or sanitize historical data. OpenSearch
JSON templates/settings remain unapplied proposals; do not PUT, reindex or purge as rollback.

Any deployment/recovery must be separately authorized, avoid initializer/migration jobs,
and verify monitoring/tracing/privacy/offset continuity and both projects' isolation. Do not
use broad up/down/prune. Runtime acceptance is BLOCKED; P08 remains unstarted.

## Backlog recovery clarification

See [counted handoff](p07-backlog-handoff.md) and [runtime cases](p07-runtime-acceptance.md).
Pinned source recovery bypasses the new Lua path and may truncate/drop corrupt chunks;
never enable recovery on the only state copy. Map-hashed generated IDs and current-day
indexing cannot establish replay idempotence across rewritten data/dates. The inventory
script is read-only on a consistent offline snapshot and never replays or authorizes a
cutover. Retained quarantine requires custody and explicit deferred-delivery approval;
reconciled delivery requires record/item receipts plus stable-ID/index reconciliation.
Do not restore pre-cutover offsets onto active post-cutover files; that can lose/duplicate
records. Unknown inflight/ack history is a stop condition, not permission to discard chunks.

Native local test processes used only synthetic temporary state and were terminated after
checks. No running Docker process was stopped/restarted. Native Prometheus self-scrape now
has the same label rejection as API jobs; reverting it would reopen a privacy gap and needs
review. Existing root deployment source and named volumes are unchanged this continuation.
