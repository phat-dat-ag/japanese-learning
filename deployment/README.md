# Step 8.9 — Single-server production deployment

## Architecture and exposure

Browser -> HTTPS host reverse proxy -> frontend NGINX (compiled Angular)
-> NGINX API Gateway -> .NET / Quarkus -> SQL Server / MySQL.
Quarkus continues to fetch JWKS directly from .NET on the internal API network.
Angular uses the existing same-origin `/api` root. No database URL, backend hostname,
secret, or deployment environment file is compiled into the frontend. The multi-stage
Angular Dockerfile runs `npm ci` and the existing Angular `production` configuration;
only static output enters the non-root NGINX runtime. `npm start` and its dev proxy
remain unchanged. Deep links fall back to `index.html`; missing assets and
infrastructure paths return 404. API errors never become the SPA document.

`compose.production.yml` overlays the existing stack, preserving its pinned images,
readiness gates, init/Flyway jobs, writable mounts, capability restrictions, resource
limits and restart policies. Compose >= 2.24.4 is required for `!override`/`!reset`.
Never omit the production overlay: the base file is explicitly a development stack.
See [Docker merge semantics](https://docs.docker.com/reference/compose-file/merge/).

| Network | Members | Host exposure |
| --- | --- | --- |
| edge | frontend | **127.0.0.1:8088**, configurable port; host TLS proxy only |
| frontend (internal) | frontend, Gateway | none |
| api (internal) | Gateway, .NET, Quarkus; optional Prometheus | none |
| mysql (internal) | MySQL, vocabulary Flyway, Quarkus | none |
| sqlserver (internal) | SQL Server, initializer, user Flyway, .NET | none |
| monitoring (internal, optional) | Prometheus, Grafana | none |
| monitoring-access (optional) | Grafana | **127.0.0.1:3000**, SSH tunnel only |

No backend, database, Gateway or Prometheus host ports are published. Only the host
TLS proxy should accept public 443 (and 80 for redirect/certificate validation).
Restrict SSH to administrators. Verify both IPv4 and IPv6 host firewall rules.
Docker administrators and root remain trusted: they can inspect environment values,
attach networks, and read volumes. Internal bridges are not encryption or protection
against a compromised Docker host. The API bridge permits trusted service peers to
reach metrics/health/JWKS; the frontend and Gateway do not route those paths publicly.

The Gateway deliberately retains TCP-peer identity for rate limiting and ignores
untrusted forwarded IPs. Consequently all traffic through this single frontend
shares its Gateway IP budgets, including **10 auth requests/minute**. This is a
conservative, potentially restrictive limit, not per-browser rate limiting. Capacity
must be reviewed before launch. The TLS edge can add per-client limits, but cannot
remove that shared bottleneck. Do not globally trust X-Forwarded-For to bypass it;
restoring client identity requires a separately reviewed exact-proxy trust boundary.

## Fresh Linux host

Use an x86-64 Linux VM supported by the pinned SQL Server image, Docker Engine with
Compose plugin >= 2.24.4, Git, Python >= 3.10, Bash and OpenSSL. Budget at least 12 GiB
RAM plus build headroom (16 GiB recommended), several CPU cores, and SSD space for
both databases, image builds, retained releases, logs and external backups. Existing
limits are starting budgets, not measured production capacity. SQL Server requires
a production-permitted edition/license: **Developer/Evaluation are rejected** by the
operations script. Set `MSSQL_PID` to Express (within its limits) or your licensed
edition/product key. Check current [vendor platform requirements](https://learn.microsoft.com/sql/linux/install-upgrade/setup) and [container guidance](https://github.com/microsoft/mssql-docker) before launch.

```sh
git clone --recurse-submodules <ROOT_REPOSITORY_URL> japanese-learning
cd japanese-learning
git submodule update --init --recursive
umask 077
cp deployment/production.env.example .env.production
chmod 600 .env.production
# Edit .env.production locally with an editor; never paste it into tickets/logs.
sudo bash scripts/generate-production-keys.sh
python3 -B scripts/production.py validate
python3 -B scripts/production.py build
python3 -B scripts/production.py deploy
python3 -B scripts/production.py status
python3 -B scripts/production.py verify
curl --fail --silent --output /dev/null http://127.0.0.1:8088/
```

Run from a clean, reviewed release checkout. Root release commits must pin the intended
submodule commits; `git submodule update --remote` is unsuitable for repeatable releases.
No local application SDK is needed. Docker access is effectively root access.

The key script refuses an existing `secrets/jwt` directory and never overwrites keys.
It creates a 3072-bit RSA pair, owned by root with group 1654 read access (0640) and
0750 directory access, matching the existing .NET runtime UID/GID. Provision an
existing unencrypted PEM pair instead when restoring a deployment. Back up the pair
securely; never regenerate it during updates. Check traversal permissions on parent
directories and bind mounts on the actual Linux host, including SELinux/rootless UID
mapping if applicable. Do not solve permissions by making the private key world-readable.
A failed generation leaves its directory for administrator inspection, not automatic deletion.

## Configuration contract

Use `deployment/production.env.example`; blank values are deliberate placeholders.
The actual `.env.production` and `secrets/` are ignored. Do not use real credentials
in command arguments, image build arguments, source, or resolved Compose artifacts.
Do not run `docker compose config` without `--quiet` in a terminal or CI log.
The operations script captures resolved configuration in memory and suppresses raw
Docker diagnostics. It reuses Step 8.7 source/secret auditing and service startup validation.
Run Python with `-X utf8` on Windows if using the scripts with Docker Desktop.

- Set separate random `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `MSSQL_SA_PASSWORD`
  (at least 24 characters). MySQL passwords must contain no whitespace, quotes or
  backslashes. SQL Server requires at least three character classes; a locally
  generated `Aa1!` prefix plus random hex is one option. Use single quotes around
  dotenv values containing `$`. Do not print generated values through automation.
- `MYSQL_DATABASE`/`MYSQL_USER` retain existing safe identifier restrictions.
  SQL database is `JapaneseLearningUser`. The application currently uses `sa`, and
  the MySQL app account also runs migrations. Separate runtime/migration principals
  need coordinated database administration; network isolation does not remove this risk.
- `MSSQL_PID` selects the permitted production edition. SQL Server license acceptance
  remains in the base Compose file. Confirm entitlement before starting.
- Set bounded `JWT_ISSUER`, `JWT_AUDIENCE`, unique `JWT_KEY_ID`, and token lifetimes.
  Both backends share the contract; key paths remain `/app/secrets/jwt/{private,public}.pem`.
  URLs remain internal: `mysql://mysql:3306/<database>`, `sqlserver,1433`,
  `http://user-api:8080`, and `http://user-api:8080/.well-known/jwks.json`.
  No browser-specific backend URL is needed. Public hostname and certificates belong
  to the host TLS proxy; `FRONTEND_PORT` controls only the loopback HTTP binding.
- Use a unique `RELEASE_TAG` for each build. Never reuse a tag or use `latest`.
  Build refuses an already-existing application tag to preserve rollback images.
  If a build partially succeeds, select a new tag for the retry.
- Optional `GRAFANA_ADMIN_PASSWORD` must be at least 24 characters. Existing Grafana
  accounts require password rotation inside Grafana; changing dotenv is not rotation.
- Existing database passwords must match persisted data. Editing dotenv alone does
  not rotate database credentials. Back up configuration securely before changing it.
- Avoid ambient shell variables with these names: Compose gives them precedence over
  the dotenv file. Do not share an environment containing unrelated deployment values.

## HTTPS boundary

The shipped HTTP entry point is **loopback only**. It is suitable for a host-managed
NGINX/Caddy/other reverse proxy terminating TLS with real certificates for your domain.
No certificate/domain is fabricated. Before allowing public traffic, configure the edge:

1. Obtain a trusted certificate and configure renewal, filesystem permissions and
   expiry monitoring. Bind public 443 and proxy to `http://127.0.0.1:8088`.
2. Redirect HTTP to the canonical HTTPS hostname; reject unexpected Host values.
   Overwrite forwarded headers rather than appending browser-controlled chains.
3. Preserve request URI, Host, Authorization and valid X-Correlation-ID. Keep the
   10 MiB body limit; upstream read timeout should exceed the frontend's 65 seconds.
4. Add HSTS only after HTTPS and certificate renewal work. Disable raw request/body/
   header/error logging at this edge or use the same safe fixed-field logging policy
   as the included proxies; default request logs may capture sensitive query values.
5. Keep 8088 and 3000 on loopback. Verify HTTPS login/refresh/logout and deep links
   externally, plus certificate chain, redirects and forwarding on the real host.

Backend HTTP and the existing SQL certificate-trust configuration remain inside the
trusted single-host networks; public TLS does not encrypt internal bridge traffic.
Do not expose the HTTP listener publicly as a substitute for TLS. The application
still handles bearer tokens in its existing client authentication design.

## Operations and monitoring

The default project name is `japanese-learning-production`. Keep it and the checkout
location stable: changing the project name selects different named volumes and can
look like data loss. The scripts support `--project` and `--env-file` for deliberate
isolated deployments; do not casually change either. Do not run concurrent deployments.

```sh
python3 -B scripts/production.py status  # init/Flyway must show exited, exit=0
python3 -B scripts/production.py verify # readiness, jobs, exposure, nginx -t
python3 -B scripts/production.py logs   # bounded application/proxy logs, known secrets redacted
python3 -B scripts/production.py stop   # graceful stop; volumes preserved
python3 -B scripts/production.py deploy # start again and recheck migrations
```

For full internal health details, use `docker compose --env-file .env.production
-p japanese-learning-production -f docker-compose.yml -f compose.production.yml exec
-T user-api curl -fsS http://127.0.0.1:8080/health/ready` and the equivalent
`vocabulary-api ... /q/health/ready`. Never dump container environments. For a failing
migration, inspect restricted database/job logs locally with authorized administrators;
they can contain SQL diagnostics. Do not publish raw output. Compose health only gates
startup: an unhealthy running container is not automatically restarted or removed
from traffic. Observe health and disk/memory usage during operation.

Enable optional monitoring by filling the Grafana password and consistently supplying
`--monitoring` to operations (including stop/status/deploy):

```sh
python3 -B scripts/production.py --monitoring validate
python3 -B scripts/production.py --monitoring deploy
python3 -B scripts/production.py --monitoring verify
ssh -N -L 3000:127.0.0.1:3000 <administrator>@<server>
```

Visit `http://127.0.0.1:3000` locally through the SSH tunnel. Prometheus has no host
port. Grafana's provisioned dashboard queries it internally. Scrape health is not DB
readiness. Existing two-day/512 MB retention limits and persistent monitoring volumes
are retained. To disable monitoring, stop its two services with the same four-file
Compose combination before omitting `--monitoring`; omitting an overlay alone does
not stop existing containers. Logs use bounded Docker `local` rotation (10 MB x 5 per
service); check storage separately for database engine logs, WAL and backups.

## Updates, maintenance and rollback

This is a single-server **maintenance-window deployment**, not zero downtime.
Before an update, record root/submodule commits, current image IDs/tags, project name,
protected configuration version and migration history. Keep previous images; do not
prune them. Take application-consistent backups and verify restore procedures.

1. Review release migrations for backward compatibility and the restore plan.
2. Fetch/pull the intended reviewed root release while preserving configuration/keys;
   e.g. `git pull --ff-only` on the deployment branch, then
   `git submodule update --init --recursive` to use pinned submodule revisions.
3. Securely archive old configuration; select a fresh `RELEASE_TAG` in `.env.production`.
4. Run `python3 -B scripts/production.py build` (add `--monitoring` consistently).
   Build completes before service shutdown. Unchanged layers use Docker's build cache.
5. Run `python3 -B scripts/production.py deploy`. It stops frontend/Gateway/APIs,
   ensures DB readiness, explicitly recreates SQL init, user Flyway and vocabulary
   Flyway jobs, checks each exit, then starts APIs/Gateway/frontend in readiness order.
   Completed old jobs cannot mask a new migration. Init and Flyway remain one-shot
   idempotent jobs with restart disabled. A migration failure keeps traffic stopped;
   investigate before retrying, never blindly repair Flyway history.
6. Run verify/status and external HTTPS smoke checks. Check logs privately.

For code/image rollback, stop application traffic, restore the old release checkout
and pinned submodules, and restore its protected configuration including the previous
`RELEASE_TAG`. Keep current compatible database credentials and signing keys unless
performing a separately planned credential/key rotation. Do not rebuild/overwrite old
images. Only redeploy the old version when its migration files and code are compatible
with the current schemas. Flyway may reject a database containing newer migrations;
never bypass that check automatically. Prefer a compatible forward fix. An incompatible
rollback requires coordinated, tested restoration of **both** databases to the chosen
recovery point, with traffic stopped and explicit acceptance of writes lost since the
backup. This workflow does not automate schema downgrades or backup restoration.

`stop` preserves every volume. `restart` only restarts existing containers; it does not
apply new configuration/images or rerun migrations. Use `deploy` for changes. Never use
volume-removal flags, Docker volume pruning, or database reinitialization as deployment
or permission troubleshooting steps. No provided script deletes a volume.

## Backups and verification

Back up SQL Server with its native database backup/restore workflow, MySQL with a
consistent logical/physical backup appropriate to its tables, and protect the matching
configuration and RSA key material separately. Include migration history and release
metadata. Encrypt backups, restrict access, retain off-host copies and test restoration
on an isolated host. Coordinate cross-database recovery points during maintenance if
business data spans services. Docker volumes are persistent storage, **not backups**.
Do not copy live database files and assume they are a consistent backup. Optional
Grafana/Prometheus state needs its own retention/backup decision.

`python3 -B scripts/verify-production.py` is a maintainer regression test, not a command
to run against production data. It expects three application images tagged
`step89-check`; it resolves both production overlays with generated credentials,
starts a randomly named isolated project, and retains its database/monitoring volumes
when stopping. It checks migrations, hardening, SPA/API behavior, JWT/roles/refresh/logout,
imports, limits, internal metrics, dashboard queries and persisted data across database
recreation. It never changes the development project's database. Retained test volumes
contain generated test data only and are reported by project name. Actual TLS renewal,
Linux bind ownership/SELinux/firewall, backup restoration, sizing and licensed SQL Server
edition behavior must still be accepted on the target host.

## Final fresh verification (Step 8.10)

Run `python3 -B scripts/verify-final-e2e.py` from the root for the fresh-source
acceptance suite; on Windows use `python -X utf8 -B scripts/verify-final-e2e.py`.
Prerequisites are the production build prerequisites above plus a running Docker
Linux engine. This maintainer workflow also expects the existing local development
SQL Server/MySQL environment and its ignored local configuration, solely to record
read-only data fingerprints before and after testing. Keep that environment idle
while verifying so unrelated user writes do not invalidate the comparison.

The runner records protected resource identities in ignored
`secrets/final-e2e/baseline.json`, generates an independently protected temporary
environment/RSA pair, builds all three application images with `--no-cache` and
unique tags, then boots a new `jp-final-e2e-*` project with fresh volumes. Only
loopback test ports and test key mount paths differ from production. It exercises
the production operator workflow with optional monitoring and captures diagnostics
privately. Never run Python with optimization (`-O`), which disables assertions.

It stops only its own containers/networks and retains every volume, test image and
protected test fixture, including on failure. It does not reset databases or delete
volumes. Repeated runs consume disk; inventory retained test resources separately.
The baseline deliberately fails closed if a protected resource or database changed;
review that change before intentionally creating a new baseline for a later session.
No generated credentials, keys or runtime configurations belong in Git.
See [the acceptance report](FINAL-E2E-VERIFICATION.md) for exact results and limits.
