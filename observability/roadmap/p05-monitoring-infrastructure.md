# P05 single-file monitoring infrastructure

The latest user authorization integrates regular `prometheus` and `grafana` services into
the root [docker-compose.yml](../../docker-compose.yml), with no profiles or extra Compose files.
The intended future command is `docker compose -p jp_dev up -d`. **It was not executed.**
Root Compose is source preparation only; running that command can also start existing application
initialization services. This work authorizes no runtime migration, deployment or lifecycle action.

| Service | Host binding | Networks | Persistent volume |
|---|---|---|---|
| `prometheus` | `127.0.0.1:9091:9090` | existing project `default`, new internal `p05-monitoring` | `jp_dev_prometheus_data` |
| `grafana` | `127.0.0.1:3001:3000` | existing project `default`, new internal `p05-monitoring` | `jp_dev_grafana_data` |

No existing service gains/loses a network. Explicit `default:` normalizes identically to its
previous implicit declaration. No external network or cross-project scrape is introduced.
Prometheus can reach existing APIs through `jp_dev_default`; Grafana accesses Prometheus
over `jp_dev_p05-monitoring` and also joins the project default bridge for host port publication.
This permits Grafana to reach application-network peers; it does not join any Spring Boot network. Project-scoped volume/network names do not prove those resources
are absent or safe to adopt: inspect actual existing ownership before any future deployment.
Never reuse `springboot_project` data, credentials, datasource provisioning or volumes.

Both services inherit the existing security anchor, drop all capabilities, use no-new-privileges,
read-only root filesystems, nonroot identities, bounded local logging and tmpfs, restart policy,
30s grace, 512MiB memory/swap caps, one CPU and 128 PIDs. Images retain the pinned versions/digests
used by the repository's monitoring conventions; no image pull/run verified their availability,
architecture, filesystem permissions or bundled healthcheck executables. Healthchecks are local
HTTP readiness/health checks. Grafana waits for healthy Prometheus; Prometheus deliberately has
no application startup dependency so failed applications can be observed.

Configuration remains in `observability/p05-candidate/`; "candidate" denotes runtime acceptance,
not an opt-in Compose profile. Three root-relative bind mounts are read-only with host-path
autocreation disabled: Prometheus config/rules, Grafana provisioning, and its single health
dashboard. Data directories alone use separate writable named volumes. Alertmanager is only an
unconnected candidate configuration with an empty receiver, no service and no notifications.

## Environment and existing conventions

Required new-service inputs reuse **`GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`**.
Both must be nonempty; Compose fails closed otherwise. Generate dedicated jp_dev credentials
outside version control. The examples leave the password blank; no real secret was created/read.
Grafana uses credentials for first database initialization; changing environment values does not
guarantee rotating an existing Grafana admin account. Verify volume ownership/history first.

Optional existing inputs: `GRAFANA_LOG_LEVEL=warn`, `PROMETHEUS_RETENTION_TIME=2d`,
`PROMETHEUS_RETENTION_SIZE=512MB`. Root ports are literal loopback bindings; retained
`GRAFANA_HOST_PORT`/`PROMETHEUS_HOST_PORT` examples apply only to legacy overlays.
Both root `.env.example` and `deployment/production.env.example` explain this. Existing database,
JWT and other required environment values are unchanged. No new JP_P05_* or external-network
variables are required. Validation uses a plainly synthetic env file and bypasses real `.env`
and service env-file resolution; it does not verify actual deployment credentials.

The old `compose.observability.yml` and production overlays remain untouched. Do **not** combine
them with the new root workflow: their same-named services can override ports, mounts, security
and provisioning. Production-overlay reconciliation is unverified and outside this source task.
The P05 draft overlay was removed only after [transfer verification](p05-validation/evidence/compose-transfer.json)
confirmed all hardening/limits/healthchecks and configuration mount targets were retained.

## Scraping and security

Targets: `user-api:8080/metrics`, `vocabulary-api:8080/q/metrics`, `prometheus:9090/metrics`.
Paths/names come from P04 and actual source Compose; success in the deployed private network is
not verified. Existing endpoint authorization/security is unchanged. No shared JWKS scrape is
enabled; no Fluent Bit exporter is assumed compatible solely from its configured HTTP listener.
Host bindings expose only loopback, but internal network peers can access plain HTTP Prometheus;
loopback alone is not authentication. Do not publish this endpoint externally without separate
access-control review. Grafana anonymous access/signup/analytics/plugin auto-install are disabled.
No production TLS/security policy changes are made.

## Validation and authorized runtime plan

Native `docker compose config --no-env-resolution --format json` succeeds with synthetic
interpolation. All 16 previous normalized services and every original network/volume match the
pre-change baseline. New mount sources exist, service names/ports are unique, no profiles or
external network exist, and dependency ordering is acyclic. This is not a deployment dry-run.

Docker engine inspection is permission denied. `netstat` saw ports 3077/5677/9090 listening,
and did not list 3001/9091: snapshot only, no reservation or project ownership evidence.
Before a separately authorized startup: regain ordinary read-only Docker access without changing
permissions; inventory both projects, names/labels/mounts/volumes/networks and current ports;
review disk/memory/image/platform/healthcheck support and dedicated credentials. Halt on ambiguous
ownership rather than adopt existing monitoring data. Confirm P02/P03/P04 candidates remain
inactive. Then obtain deployment approval with exact resources and cleanup scope. After authorized
deployment, capture target UP/errors and samples, rules loaded/evaluating, controlled firing and
recovery, datasource connectivity, exemplars, capacity and springboot_project before/after equality.
Cleanup must name only proven task-owned resources; no broad Compose down/prune/volume deletion.
