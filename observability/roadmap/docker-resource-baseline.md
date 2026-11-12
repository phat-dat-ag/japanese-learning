# Docker resource baseline

## Runtime evidence: NOT VERIFIED

On 2026-11-12 all three read-only commands failed:

```text
docker ps -a --format '{{json .}}'
docker volume ls --format '{{json .}}'
docker network ls --format '{{json .}}'
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

No escalation, Docker Desktop setting change or alternative privileged access attempted. `jp_dev` and `springboot_project` are user-designated protected projects, not verified engine project labels. No containers were started/stopped/restarted/recreated/deleted. No volumes or databases were modified.

| Required runtime evidence | Status |
|---|---|
| Compose project labels/names, container IDs/names | NOT VERIFIED |
| Images/digests, start times, health/status | NOT VERIFIED |
| Network IDs/memberships, published bind addresses/ports | NOT VERIFIED |
| Volume names/IDs, bind/named mounts, read/write mode | NOT VERIFIED |
| Log driver/options, CPU/memory/swap/PID limits | NOT VERIFIED |
| Restart policies, effective retention/capacity | NOT VERIFIED |

## Source-only resource expectations

CONFIGURED BUT NOT VERIFIED. See [architecture inventory](architecture-inventory.md) for ports, networks and every persistent mount. Physical names normally depend on Compose project prefix; no engine names are asserted here.

| Services | Memory / swap cap | CPUs / PIDs | Restart |
|---|---|---|---|
| jwks-api, user-api | 512m / 512m | 2 / 256 | unless-stopped |
| vocabulary-api | 1g / 1g | 2 / 256 | unless-stopped |
| mysql | 1g / 1g | 2 / 256 | unless-stopped |
| sqlserver | 3g / 3g | 2 / 512 | unless-stopped |
| flyway-user, flyway-vocabulary | 512m / 512m | 1 / 128 | no |
| sqlserver-init | 256m / 256m | 1 / 64 | no |
| frontend, gateway | 256m / 256m | 1 / 128 | unless-stopped |
| opensearch | 2g / 2g | 2 / 512 | unless-stopped |
| fluent-bit | 512m / 512m | 1 / 128 | unless-stopped |
| opensearch-dashboards | 1g / 1g | 1 / 256 | unless-stopped |
| logs-ui | 128m / 128m | 1 / 64 | unless-stopped |
| logging-init, logging-ui-init | 128m / 128m | 1 / 64 | no |
| prometheus, grafana (optional) | 512m / 512m | 1 / 128 | unless-stopped |

Base logging services declare Docker local driver 10m x 5 files. Other base application services do not explicitly declare a logging driver: daemon default is NOT VERIFIED. Production overlays set local 10m x 5 for application/job/metrics containers. Bounds are per container and not total host storage budgets. Source has read-only roots, bounded tmpfs and capability restrictions; enforcement NOT VERIFIED. Compose volume declarations do not impose disk quotas.

Logical base volumes: jwks_api_logs, mysql_data, sqlserver_data, user_api_logs, vocabulary_api_logs, opensearch_data, dashboards_data, fluent_bit_state. Optional: prometheus_data, grafana_data. Base named networks: log-storage/internal, log-ui/internal, log-access, implicit default. Production adds edge, frontend/internal, api/internal, mysql/internal, sqlserver/internal; metrics production adds monitoring/internal and monitoring-access.

## Future safe recapture procedure

With normal authorized Docker access, list project labels via container listing; capture IDs before selectively inspecting each container. Serialize only allowlisted fields: Id, Name, Config.Image, image ID, State.StartedAt/Status/Health.Status, Compose project/service labels, NetworkSettings.Networks/Ports, Mounts type/name/source/destination/RW, HostConfig.LogConfig, memory/swap/CPU/PIDs, RestartPolicy. Never serialize Config.Env, full labels, healthcheck command/output, container logs, full inspect output or resolved Compose configuration. Record all containers including exited jobs and both protected projects. Compare before/after IDs, starts and mounts; unrelated autonomous state changes must be distinguished from operator actions. No exec, builds, migrations or lifecycle commands are needed. P00 cannot prove before/after runtime equality because access was denied.
