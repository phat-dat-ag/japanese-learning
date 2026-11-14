# P09 verification — local development

**P09 PASS for `jp_learning_dev` local development only.** Final machine disposition is recorded in [acceptance](p09-validation/evidence/acceptance.json). [Implementation](p09-implementation.md) records authority, inspected prerequisites, inventory, criteria mapping and limitations. [Incident runbooks](p09-incident-runbooks.md) record owners, investigation, recovery and rollback. [Manifest](p09-validation/evidence/manifest.json) records artifact SHA-256 checksums.

## Executed checks

| Check | Result / evidence |
| --- | --- |
| Actual exported names and bounded labels inspected before queries | PASS; `evidence/baseline.json` and initial aggregate label discovery |
| 20 panel queries: data/no-data/counter-reset | PASS, 63 native assertions including golden p95/ratio/reset checks; `evidence/panel-tests.json`, `panels.tests.json`; installed Prometheus image and isolated `promtool` |
| Sampled/missing/zero/legacy/unsafe trace context and safe URLs | PASS, five context cases and three Discover definitions; `evidence/navigation-tests.json` and `observability/p09/discover-views.json` |
| Live instant/range queries and service selectors | Final `evidence/live.json`: 20 instant + 20 range + 10 single-service queries; units, expressions, values and gap dispositions recorded |
| Provisioning and previous dashboard | Final live canonical JSON comparison; both new UIDs provisioned, original P05 panel content retained; provider unchanged |
| Prometheus and Tempo datasource connectivity | Both health endpoints PASS; actual trace retrieved privately, with no trace payload exported |
| Existing alert engine | PASS, 54 rules/recordings across eight groups healthy; original definitions/config unchanged |
| Authorization | PASS; isolated Viewer read succeeds and write/admin denied; anonymous denied. Live anonymous Grafana/log ingress denied and existing reader log search succeeds |
| Incident workflow | PASS; synthetic native notification -> provisioned dashboard query -> Tempo storage measurement error -> recovery -> resolved notification; `evidence/isolated.json` |
| Persistence | PASS; candidate Grafana restart retains synthetic saved dashboard and source provisioning on its dedicated volume |
| Runtime preservation | All 21 existing container IDs, start times, restart counts, states and mounts match; baseline/live/isolated evidence. All manifest-owned fixture containers/volumes/networks removed |
| Privacy screening | Final acceptance `checks.privacy`; known real/generated secret values and private-key sentinels compared without exporting values |

Reproduction from repository root under approved Docker access:

```powershell
node observability/roadmap/p09-validation/build.cjs
node observability/roadmap/p09-validation/test-navigation.cjs
node observability/roadmap/p09-validation/test-panels.cjs
node observability/roadmap/p09-validation/isolated.cjs
node observability/roadmap/p09-validation/verify-live.cjs
node observability/roadmap/p09-validation/verify-cleanup.cjs
node observability/roadmap/p09-validation/finalize.cjs
```

The live verifier compares with this run's baseline. A future intentionally redeployed environment needs a fresh reviewed selective baseline. Existing file provisioning polls every 60 seconds; no live restart is needed.

## Observed gaps and limited claims

Live scrapes cover User/Vocabulary APIs, Prometheus and storage monitor. All three API log services are searchable. JWKS has no metrics scrape. DB-server and direct Fluent Bit/Collector/Tempo/OpenSearch metrics are absent; dashboards expose supported client/store observations and gap guidance. Tempo/Grafana storage measurements emit errors and are missing from coverage; P09 exposes this finding without changing monitoring permissions. Idle latency can be NaN and 5xx series absent. No active alerts does not prove healthy telemetry.

Logical owners inherit P05 roles and the local development operator. Named human contacts, production on-call and external paging remain unassigned/unverified for production. P08's development off-host exception and P07's development quota exception are unchanged. P09 introduces no new waiver.

Navigation uses existing Discover patterns and Tempo Explore with manual validation of actual OTel IDs. Correlation IDs are never converted into trace IDs. Browser-rendered screenshots and automatic datasource log-to-trace linking were not implemented/verified; provisioned API equality, HTML route loading and actual backend queries provide reproducible loading evidence. No production/browser visual acceptance is claimed.

Earlier fixture attempts failed on scratch permissions, internal-only port publication, cold-start resource limits, an incorrect admin GET endpoint, missing synthetic exposition Content-Type and ephemeral port reassignment after restart. Fixture tooling was corrected. Available run-specific failure evidence is retained beside the final successful run; failed results are not reused as PASS.

## Preservation and progress

No application logic, JWT/JWKS contract, signing keys, Git submodules, Spring Boot resources, datasource/provider/rule/security/retention config, P08 job or backup destination changed. Grafana's existing provider added two new definitions without replacing existing saved objects. No live container was recreated or restarted. Only exact manifest-owned disposable verification resources had lifecycle operations.

No commit, push or merge. P00–P08 acceptance evidence remains unchanged. P00–P09 are complete for applicable development scopes: **10 of 12 phases**. P10/P11 remain unstarted; the overall production roadmap is unfinished.
