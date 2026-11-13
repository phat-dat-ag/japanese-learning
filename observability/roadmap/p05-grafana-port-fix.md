# Grafana host publication correction

The user supplied a healthy jp_dev Grafana container whose HostConfig requested
127.0.0.1:3001 ->3000, but NetworkSettings.Ports contained an empty list. A host curl
was refused. This is runtime evidence of missing effective publication, not proof of
successful scraping, Grafana datasource access or full P05 runtime acceptance.

Grafana was attached exclusively to an internal bridge. The source correction attaches
Grafana to the existing project default bridge as well as p05-monitoring, matching the
two-network pattern already used by Prometheus. The default bridge provides a non-internal
network for host publication; p05-monitoring remains internal. The localhost-only port,
volumes, credentials, datasource, security controls and existing service networks stay unchanged.
Grafana now also has connectivity to jp_dev application-network peers. No network belonging
to springboot_project is used. Runtime confirmation is still required; Docker inspection
from this workspace remains permission denied, and no permission escalation was attempted.

The symptom is consistent with Docker's internal-only bridge publication behavior; see
[Docker networking](https://docs.docker.com/engine/network/) and the matching
[Moby report](https://github.com/moby/moby/discussions/53256). This is a source correction,
not a claim that the repaired mapping was observed. The source regression test now rejects
Grafana attached exclusively to the internal network.

No container was restarted, recreated or connected to a network by this task. Existing
constraints prohibit applying the source change automatically. Applying it requires a separately
authorized recreation of only the jp_dev Grafana service, keeping its existing named volume:

```cmd
docker compose -p jp_dev up -d --no-deps --force-recreate grafana
docker port jp_dev-grafana-1
curl.exe --noproxy "*" --connect-timeout 5 http://127.0.0.1:3001/api/health
```

These are reviewable operator instructions, not executed commands. Do not run a project-wide
up/down, remove volumes or touch Spring Boot services. Expected validation: docker port reports
127.0.0.1:3001 and the HTTP health request succeeds. If it still fails, inspect actual network
attachments, listener health and Docker Desktop forwarding rather than resetting Docker.

Rollback this correction only: remove default from Grafana's networks (restore the prior
internal-only topology), update its matching validation/generator expectations, and retain all
data. Applying rollback also requires authorized Grafana recreation and can restore the port
failure. The log messages about absent optional plugin/alerting provisioning directories are
separate from the observed missing host publication; no JWT/database/shared JWKS changes made.
