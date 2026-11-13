# P05 verification — source prepared, runtime blocked

## A. Summary and status

P05 adds 33 alert candidates, 15 normalized recording rules, bounded scrape/resource budgets,
runbooks and root Compose Prometheus/Grafana integration. The latest instruction supersedes the
original overlay proposal: both are regular services, included automatically by the future
`docker compose -p jp_dev up -d` workflow. That command was **not executed**. Source/offline
checks pass within their stated limits. Full P05 source acceptance remains conditional on
official Prometheus rule/schema/scenario checks; runtime acceptance and production readiness
are not claimed. No P06 implementation.

## B. Git and runtime baseline

Root branch `develop`, HEAD `b4167cd254f6715c4c7434b8c270ac3e0cc84943`.
[Preflight](p05-validation/evidence/preflight.json) records all HEADs/index hashes/gitlinks,
70 protected source/artifact hashes and the existing dirty dotnet Program.cs change. No other
initial working changes were found in accessible paths. Git warns about eight inaccessible P03
directories; P03's broader report records sixteen. No directories were repaired/deleted.
Applicable instructions and mandatory P00–P04 reports/manifests were reviewed before edits.

Docker container/network/volume read-only inventories failed with access denied. No privilege
escalation or Desktop permission change was attempted. Therefore neither the prior jp_dev
container baseline nor springboot_project resource equality could be independently reverified.
Host netstat snapshots do not establish Docker ownership. [Preservation evidence](p05-validation/evidence/preservation.json)
distinguishes source equality/prohibited-operation compliance from unverified runtime equality.

## C–G. Architecture, alerts, Prometheus and Grafana

See [inventory](p05-alert-inventory.md), [contract/runbooks](p05-alert-contract.md) and
[infrastructure](p05-monitoring-infrastructure.md). Prometheus scrapes only verified source
endpoints for User API, Learning API and itself. Application metric evidence remains local
P04 exports/provider fixtures; no deployed sample contract is claimed. Unavailable exporter
metrics are deferred, not fabricated. Shared JWKS listener/security remains unchanged.

`prometheus`: localhost 9091 ->9090, default plus private monitoring network, dedicated
`jp_dev_prometheus_data`. `grafana`: localhost 3001 ->3000, default plus private monitoring network,
dedicated `jp_dev_grafana_data`. Required existing variable names: GRAFANA_ADMIN_USER and
GRAFANA_ADMIN_PASSWORD, with dedicated jp_dev values. Defaults for optional existing log/retention
variables are documented in both env examples. Original application DB/JWT configuration is
unchanged. Grafana contains one monitoring-health panel; no P09 dashboard suite.

All 16 original normalized services and original network/volume declarations are identical
to pre-edit Compose. Transfer checks confirmed hardening/resources/healthchecks/persistent and
config mount targets before removing the new draft overlay. No existing overlay was changed.
Legacy overlays must not be combined with the new root workflow without separate reconciliation.
Alertmanager remains an unconnected file with an empty receiver. No real alerts are sent.

## H–J. Budgets, privacy and tests

[Capacity report](p05-capacity-budget.md) gives provisional thresholds/formulas and explicit
storage/cgroup/notification limitations. Source limits are not measured production capacity.
Alert outputs aggregate by bounded job and constant metadata; 10000 synthetic sensitive label
sets collapse to one sanitized aggregate. This is not a test of stored scrape/exemplar privacy.
No credentials, keys, private env files or historical telemetry were exported.

[Test matrix](p05-test-matrix.md): 15 Python test methods PASS (0 failures/errors), containing
42/42 independently expected reference-model scenarios and positive coverage for all 33 alerts;
7 YAML files parse; native Compose config and overlay transfer PASS. `promtool`/`amtool`
unavailable: official PromQL/rule/config/schema and engine scenario validation NOT VERIFIED.
No affected application code changed; P04 historical app counts are not reused as new executions.

## K–L. Runtime blockers and unresolved register

All findings below remain open; P05 does not silently resolve them:

| Finding | Status / required next evidence |
|---|---|
| P02 gateway runtime and temporary bind-source impact | NOT VERIFIED; approved read-only effective config/mount inspection |
| P03 Fluent Bit candidate activation | Inactive; no P05 activation |
| Nginx collection gaps | Unresolved; no exporter/input adoption |
| Fluent Bit Lua execution | NOT VERIFIED |
| Rotation/replay/recovery | NOT VERIFIED; source inspection is not live evidence |
| OpenSearch stored raw `original` privacy | Unresolved; no reindex/delete/migration |
| 18 historical P02 manifest hash mismatches | Unresolved; P04 read-only investigation establishes committed provenance, not exact historical transition |
| 16 reported inaccessible temp directories | Unresolved; eight Git warnings visible, no cleanup/permission change |
| P04 deployed metrics acceptance | BLOCKED; all dependent alerts carry that limitation |
| Quarkus OpenMetrics exemplar privacy | NOT VERIFIED; must inspect controlled actual format before storing sensitive exemplar content |
| Unanswered outbound/JWKS attempts | Still unresolved attempts; accounting-gap warning does not invent failures |
| Production capacity | NOT VERIFIED; no runtime/load/storage measurements |

Also open: Docker resource equality, official Prometheus validation, real scrape auth/network
access, image/platform/healthcheck compatibility, resource/volume ownership, port availability
at deployment time, alert pending/recovery on engine, notification ownership/delivery, and the
P01 two-minute critical notification budget (conservative proposed path can exceed it).
No running Prometheus can reliably detect its own total outage without an independent watchdog.

## M–O. Shared JWKS, manifest and rollback

Shared `springboot-jwks-api` source, index, HEAD, gitlink, JWT behavior and key files unchanged.
No shared metrics exposure/auth changes or cross-project scraping. All submodule states and
the pre-existing dotnet diff are preserved. [Manifest](p05-validation/evidence/change-manifest.json)
lists every task file/hash and metric/rule changes; [rollback](p05-rollback.md) reverses only
P05 source additions/hunks and preserves existing history/data/work. No migrations, DB changes,
index deletion, log truncation, Docker lifecycle operations, staging, branch changes, commit
or push occurred. No Docker resource was created, so no runtime cleanup was performed.

## P. P06 readiness recommendation

P05 is ready for source review with the explicit official-tool validation gap. Before operational
acceptance or P06 reliance: execute compatible promtool checks/tests, resolve sensitive exemplar
policy, approve threshold/owner/timing budgets, regain read-only runtime inventory, and separately
authorize deployment with exact isolated resources. Then observe targets/samples/rules,
controlled firing/recovery, Grafana connectivity, actual capacity and protected-project equality.
Preserve every P02–P04 finding until its own evidence exists. Stop at P05; no deployment/P06.

## Subsequent Grafana publication correction

User-supplied runtime inspection showed configured port 3001 with no active mapping and a
refused host connection. [Correction report](p05-grafana-port-fix.md) documents the source fix:
Grafana now also joins the existing jp_dev default network. It retains the internal monitoring
network and loopback binding. No runtime recreation was executed here. The new regression case
rejects internal-only Grafana. Supplied evidence does not establish complete P05 runtime
acceptance or resolve other blocked findings.
