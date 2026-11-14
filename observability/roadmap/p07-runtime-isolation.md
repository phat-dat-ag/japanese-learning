# P07 single-Compose architecture and runtime isolation

The existing root `docker-compose.yml` is the sole authoritative Compose source for P07.
No P07 overlay is required or maintained. `observability/p07/compose.candidate.yml` was
removed after its intended changes were integrated and the resolved root model verified.
This is source integration, not deployment: running services have not adopted these changes.
No container/image/volume/network lifecycle action was issued by this task.

## Scope and compatibility

Exactly nine services change: fluent-bit (build context/Dockerfile), prometheus (config
bind and four query/evaluation flags), grafana (provisioning bind and six session/new-user
defaults), otel-collector and tempo (config bind sources), user-api, vocabulary-api, gateway
and frontend (bounded local Docker logs). Component files live under observability/p07.
Fluent Bit configurations are copied into its image at build time; the other components
use read-only config binds. All old active bind-source files remain untouched.

Resolved-model validation compares root against the pre-integration HEAD source supplied
through stdin, never another Compose file. All20 service names, published ports, networks,
dependencies, healthchecks, privileges, users, resource limits, existing environment values,
credentials, images and persistent volume declarations/mounts are preserved. Only the six
explicit Grafana settings are added. P05 dashboard binds/rules/datasource UIDs remain;
P06 OTLP endpoints, export toggles, sampling, namespace, tracing networks and Tempo storage
remain. P07 privacy filtering strengthens the existing pipeline without duplicate exporters.

## Fluent Bit state and handoff gate

`fluent_bit_state:/state` is retained unchanged, including `/state/jwks.db`, `/state/user.db`
and `/state/vocabulary.db`. There is no `p07_fluent_bit_state` declaration or replacement
volume. Old `/state/buffer` files are neither deleted nor overwritten. The P07 memory-only
profile does not configure storage.path, so legacy filesystem chunks are not replayed.
It preserves the existing offsets, but does not guarantee continuity or drain queued records.
New JWKS spool files without known offsets start at EOF (Read_from_Head Off).

Before deployment, an approved service-specific handoff must measure outstanding chunks
and offsets, retain a protected consistent backup under an authorized quiesce plan, verify
UID185 access and exact-image behavior, and account for queued/unread/rotated records.
Drain only through a tested privacy-safe pipeline on approved isolated resources; never
blindly enable legacy backlog replay, reset offsets, copy DBs over current state or delete
chunks. An unapproved/unaccounted backlog is a deployment blocker. The environment variable
FLUENT_BIT_STORAGE_LIMIT remains for compatibility but does not cap memory-only queues.

Fluent Bit build context is only observability/p07/fluent-bit, excluding repository secrets.
Existing log mounts remain read-only; UID/groups and existing ownership remain unchanged.
No Docker socket, host log directory or springboot_project volume/network is introduced.

## Validation and remaining gates

`docker compose -p jp_dev config --quiet` PASS with local environment (no config output).
Synthetic full resolved root model and exact permitted-difference checks PASS; evidence
contains synthetic interpolation and env-file paths, not private env-file contents.
Native Collector/Prometheus configuration checks and Lua security fixtures PASS. Native
Tempo/Fluent Bit embedding, stored privacy, outage/backpressure, retention/quota, permissions,
network denial and restore/handoff acceptance remain blocked pending approved runtime work.

Earlier P07 snapshots recorded external container replacements/restarts around08:15-08:16UTC;
that historical identity comparison FAILED. It is retained, not rewritten as a successful
preservation check for this source-only revision. No data integrity conclusion follows.
Shared JWKS and springboot_project source/resources are not modified. No P08 work occurred.

Continuation: selective before/after inspection now matches all38 container IDs/start/state,
mounts/networks/publications. This is a new bounded observation, not erasure of the earlier
external-drift failure. Native synthetic tests used only loopback OS processes and temporary
synthetic state, never Docker Desktop WSL, live volumes or container exec. Root Compose
source remained unchanged during this continuation; only the undeployed P07 Prometheus
self-scrape privacy rules changed. Exact-image/backlog/runtime acceptance remains blocked.
