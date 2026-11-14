# P07 laptop logs access and Docker storage verification

> Current closure: **P07 PASS with approved development-only strict-quota exception**. Durable synthetic backup/restore, rollback and accelerated native expiry passed; see [current verification](p07-laptop-verification.md). Earlier BLOCKED statements below are historical checkpoints.

> Fresh deployment supersedes earlier runtime/storage locations below. See [current laptop verification](p07-laptop-verification.md): 16 running, 13 healthy, five jobs successful; native OpenSearch TLS/RBAC and authenticated local notifications pass. Persistent quotas and durable recovery/elapsed retention remain acceptance blockers.

2026-11-14. Repository `develop` at `5c53cb963ca29c5e9c8626fbb456dbae7c13b7d3`, Compose project `jp_learning_dev`. **Logs authentication repair PASS; P07 overall BLOCKED; P08 must not begin.** The integrated remote `p07-verification.md` and its other-machine evidence were left unchanged. Current laptop findings are recorded here and in the laptop report.

## Completed versus unfinished work

The interrupted task had already recovered and validated bcrypt from the existing credentials, corrected the operational auth-file pointer, added the NGINX file-type/readability startup guard, and recreated only logs-ui. Saved tests show valid API 200, root 302, invalid/missing credentials 401, and intentionally anonymous health 200. Setup safety tests and five Node auth regression tests had passed. Those tests, credential hashing and recreation were not repeated.

On resume, the logs-ui ID/start timestamp still match that repaired container, as do all 20 project container identities and normalized mounts/networks. A minimal current `/api/status` recheck again returns **valid 200 / invalid 401**. Credential-file and bcrypt-file hashes match their pre-interruption evidence. All 12 configured Docker healthchecks are healthy. No container recreation was necessary. The unfinished storage artifact, reclamation assessment, source-drift review and laptop evidence updates are now completed.

## Logs UI root cause and preserved fix

The active mount had pointed at an empty `secrets/logging/htpasswd` directory, so NGINX failed with EISDIR and returned 500 when credentials were supplied. `.env.logging` already held a valid existing username/password, but is only a private credential reference, not an initializer or an NGINX password file. The original setup refused the entire existing parent directory or credential file, preventing recovery; the former healthcheck checked only an anonymous endpoint.

The exact historical actor/command creating the directory is not recoverable from current evidence. Tracked Compose already had `create_host_path: false`; that setting rejects a missing source but does not reject an existing directory. Docker documents that short `--volume` syntax can create a missing source as a directory, but that is only a possible origin, not a diagnosed command here. See [bind-mount behavior](https://docs.docker.com/engine/storage/bind-mounts/).

The earlier repair created **a new** `secrets/logging/htpasswd.recovered` bcrypt file from the same identity/password, verified correct and incorrect passwords, and selected it using only `LOGS_AUTH_FILE` in the private operational `.env`. `.env.logging` and the old directory were preserved. The helper refuses overwriting an existing recovery destination. Setup now distinguishes an invalid auth source from an existing parent, and logs-ui refuses startup unless its mounted auth source is a nonempty readable regular file. Loopback binding, private networks, non-root/read-only runtime and Authorization stripping remain intact. No reset, account replacement or unrelated deployment was required.

## Actual storage location and usage

| Measurement | Result | Scope |
| --- | --- | --- |
| Actual data VHD | `C:\Users\nguye\AppData\Local\Docker\wsl\disk\docker_data.vhdx` | Windows C:; file and parent directories are not reparse links |
| VHD allocated file bytes | 39651901440 (36.93 GiB) | Read-only Windows allocated-file API; not a reserved filesystem quota |
| C: free | 6.42 GiB | Actual backing-drive headroom |
| D: free | 170.17 GiB | Potential alternative location, not an approved move |
| Linux data filesystem | 35.97 GiB used / 919.67 GiB available | `/dev/sdd`, mounted at `/mnt/docker-desktop-disk`; `/data` backs Docker `/var/lib` |
| Nine telemetry/log volumes | 48.88 MiB allocated | Previous read-only du measurement at 2026-11-14T00:30:56.154Z reused; database volumes excluded |
| Project container log directories | 4.35 MiB allocated | Includes application/DB/infrastructure container logs; separate from named volumes |

The WSL disk advertises approximately 1TiB of virtual capacity, but its dynamic VHD grows on C:. About 6.42 GiB of physical backing reserve, not the guest free-space figure, constrains safe expansion. Docker documents this [WSL storage location](https://docs.docker.com/desktop/features/wsl/) and [data-VHD filename](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/); Microsoft explains the [virtual versus host disk distinction](https://learn.microsoft.com/en-us/windows/wsl/disk-space). No live disk was filled, resized or compacted. The earlier .ps1 invocation was blocked by script execution policy; equivalent inline read-only metadata queries completed without changing that policy.

## Space opportunities, without deleting anything

1. The primary non-deletion capacity option is a reviewed, supported relocation of Docker Desktop data from C: to D:, or host C: capacity expansion. D: currently has 170.17 GiB free. A move requires version/backend-specific procedure review, backups and separately approved downtime affecting all Docker projects; no manual move of a live VHD is proposed or performed.
2. Vendor-supported offline compaction of already-unused blocks might reduce allocation without deleting logical contents, but this backend procedure and possible gain were not validated. The roughly 36.93 GiB VHD is already close to guest used blocks, so do not promise large savings or run generic distro repair/compaction commands against it.
3. Inventory only: Docker reports **14.9GB build-cache** and **6.475GB image** reclaimable categories. Read-only cache metadata includes 220 unshared records unused for at least roughly 14 days, with 9.68 GiB of rounded displayed sizes. These categories share layers across projects and cannot be added or treated as guaranteed C: savings. Cache/image pruning deletes data and is expressly outside this request. No such cleanup was performed or requested.
4. The measured telemetry volume subtotal is only 48.88 MiB; deleting telemetry is neither authorized nor a sensible remedy for the major cache/image/VHD consumption. Stopped containers, legacy chunks and database volumes were preserved.

## Pressure thresholds (recommendations only)

Proposals require owner approval and representative growth observations before live alert deployment. They change no current rules, watermarks, retention or capacity allocations.

| Monitor | Warning | Critical | Emergency/recovery |
| --- | --- | --- | --- |
| Physical backing C: | Free below max(20GiB,10%) for 5m | Free below max(10GiB,5%) for 2m | Emergency below5GiB immediately; recover above max(25GiB,12%) for10m |
| Guest filesystem (secondary) | 80% used | 90% used | 95% used; physical host alarm always takes precedence |
| Approved per-store budget | 70% used | 85% used | 90% used, as already proposed in integrated p07-storage-budget.md |
| Time to full | Below24h | Below6h | Not evaluated: no representative growth time series |

Current C: is **CRITICAL** under the proposed reserve thresholds. Missing live filesystem exporters, quotas and notification delivery remain gates, not assumed working controls. Responses should notify the operator; no automatic pruning, log truncation, index deletion, service stop or retention shortening is proposed.

## Integrated source versus live runtime

The synchronized remote P07 source is not equivalent to a deployment on this laptop. The comparison finds differences in **vocabulary-api, grafana, prometheus, user-api, tempo, otel-collector, frontend, gateway, fluent-bit**. Prometheus/Grafana/Collector/Tempo still use their old bind sources; Prometheus query and Grafana hardening settings differ; four application/proxy containers retain unbounded json-file log options instead of the new bounded local-driver source. Saved immutable Fluent Bit byte hashes from the unchanged container/image differ from new P07 config/Lua; that evidence was reused rather than repeating collector investigations.

This does not invalidate previously verified P06 tracing or the logs-ui repair, and it does not authorize recreating those services. P07 rollout requires separate service-specific review, preserved state/backlog handling and approval. The remote report describes its own environment and was not rewritten to imply those controls are active here.

## Quarkus Swagger drift review

Quarkus remains detached at `815b637a799cab8009d154ee9c97cec0f1dce734`; develop remains `d6642616abf0d3373c4ebe1f514d69ec9b669f2a`. Only the previously reviewed Dockerfile change is dirty. The properties file has hash `a2797b77679f90c358dad81c858054e3ce178c2e662e02b56118c913c5501141`, timestamp `2026-11-13T23:56:45.336Z`, no local diff, and no `quarkus.swagger-ui.always-include=true` setting. It is unchanged from the previous drift checkpoint. The reflog shows no later checkout/commit that explains an ordinary file edit; the actor/cause remains unknown. Per existing operator instruction, no restoration, branch change or source write was made. The saved original file and patch remain available.

## Acceptance and remaining decisions

**Logs UI authentication is resolved. Overall P07 remains BLOCKED.** Remaining gates are source/runtime rollout alignment; native backend auth/RBAC/TLS and credential/CA/historical-data custody decisions; persistent quota and physical host reserve/alert enforcement; and durable migration plus consistent Fluent Bit backlog/offset/acknowledgement evidence. Earlier isolated synthetic security/recovery tests remain scoped successes, not production guarantees. P08 has not begun and is not authorized by this continuation.

No approval is needed for the completed read-only review. Future disk relocation, compaction, capacity changes, cleanup or non-logs-ui service rollout require a concrete reviewed plan and separate approval. No images, containers, volumes, databases or telemetry were deleted; no Docker resource was changed during this resume. Existing local work, submodules, shared JWKS and springboot_project were preserved; no commit or push occurred.

## Evidence

[Current scoped acceptance](p07-validation/logs-storage/evidence/acceptance.json), [resume/runtime verification](p07-validation/logs-storage/evidence/resume-verification.json), [original auth verification](p07-validation/logs-storage/evidence/runtime-verification.json), [predeploy guard/setup tests](p07-validation/logs-storage/evidence/predeploy-tests.json), [physical disk metadata](p07-validation/logs-storage/evidence/desktop-storage.json), [telemetry usage](p07-validation/logs-storage/evidence/telemetry-usage.json), [cache inventory](p07-validation/logs-storage/evidence/reclaim-review.json), [pressure proposals](p07-validation/logs-storage/evidence/pressure-recommendations.json), [Swagger review](p07-validation/logs-storage/evidence/swagger-drift-review.json), and [source preservation](p07-validation/logs-storage/evidence/source-preservation.json). All prior evidence is retained.
