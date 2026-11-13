# P07 security test matrix

Actual execution scope is recorded in [evidence](p07-validation/evidence/test-summary.json).
Synthetic models are distinguished from native execution and from deployed acceptance.

| Check | Actual result / limits |
|---|---|
| P07 privacy/security fixtures | PASS16 tests; actual LuaJIT2.1 through lupa2.8 executes the new Lua filter; nested/header/token/body/SQL/session/encoded sentinels excluded while useful types/context/events remain |
| P03 Lua fixture | PASS229 actual Lua assertions; closes Lua-only execution gap, not Fluent Bit/MessagePack/rotation/backend validation |
| OpenSearch shape | PASS offline mapping/source allowlist fixture; no live document/index/template operation or historical sanitization |
| Queue/storage | PASS bounded arithmetic/reference fixtures and explicit rate/retention budgets; not measured queue overflow, retry timing, disk pressure or recovery |
| Collector | PASS native0.145.0 validate with link/event/scope/attribute filters; pipeline never started; actual OTTL output, diagnostics and stored privacy NOT VERIFIED |
| Prometheus config/rules | PASS native3.14.0 promtool config and48 rules; official archive checksum verified |
| P05 rule scenarios | PASS42 native promtool scenarios using unchanged P05 fixture/rules; candidate rules byte-identical; not deployed alert firing/notification evidence |
| Compose | PASS single root configuration and pre-integration HEAD comparison for20 services; networks/ports/resources and all existing active config files preserved; all named volumes/mounts preserved; no new volume |
| Grafana provisioning | PASS all P06 datasource/provider bytes preserved; no new credentials; root-source security env validated structurally |
| Current Grafana access | PASS read-only unauthenticated /api/datasources and /api/search return401; database health OK; not a full roles/session/TLS matrix |
| Current monitoring | PASS point-in-time3 targets UP,48 rules healthy; not capacity/firing/delivery acceptance |
| .NET regression | PASS151 tests, zero failures/skips, including P02/P04/P06 privacy, security and propagation fixtures; mocked DB/loopback only |
| Quarkus offline regression | PASS372 tests, zero failures/errors/skips; all Mysql fixtures explicitly excluded; no real DB setup/migrations |
| Tempo | YAML syntax and pinned2.10.3 query-config source review PASS; native image validation/startup NOT VERIFIED |
| Fluent Bit parser/plugin | JSON parser unchanged, integer keys/memory config inspected and Lua engine tested; native4.2.5 embedding/dry-run and MessagePack behavior NOT VERIFIED |
| Runtime isolation | Selective before/final Docker comparison; see preservation evidence; no lifecycle, network fault, data mutation or storage scan |

Commands: python observability/roadmap/p07-validation/test_security.py (local Lua tooling);
python observability/roadmap/p07-validation/check_config.py; native promtool test rules
observability/roadmap/p05-validation/promtool.tests.yml. The native fixtures read existing
P05 inputs without rewriting them. The Lua runtime wheel and Prometheus tools are confined
to ignored .local tooling; sandbox access to the installed Lua directory required approved
execution outside the sandbox. No ACL repair was performed.

.NET command from dotnet: dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj
--no-restore -m:1 -nodeReuse:false --logger "trx;LogFileName=p07-regression.trx".
Quarkus command: .\mvnw.cmd -o test "-Dtest=*Test,!*Mysql*" "-Dquarkus.http.test-port=0".
No prior-phase counts are reused as new executions. A first registry fixture exposed missing
operation-derived completion names; the registry was corrected and all16 tests rerun PASS.

Runtime security gates remain blocked: native store RBAC/TLS/wrong-user/expired-cert/hostname
denial, actual stored sentinel checks, collector outage/pressure, full-volume limits,
retention deletion lag, read-back compatibility, quota and restore/migration integrity.
No synthetic result substitutes for those gates, and no real credentials/user data were
used as fixtures. Existing inaccessible P03 directories were neither repaired nor deleted.

Final Docker identity preservation: FAILED (external drift; see verification). Git/source preservation evaluated separately. Final security fixture count:16 PASS.

Single-Compose follow-up: actual `docker compose -p jp_dev config --quiet` PASS. Updated config checker reviews full synthetic resolved root model and exact service differences; no overlay is used.16 security tests and229 actual Lua assertions rerun PASS. Native Collector/Prometheus checks rerun PASS. Earlier151 .NET/372 Quarkus application results remain earlier evidence and were not rerun for this Compose-only revision.

Continuation results:9 synthetic offline handoff tests PASS; actual native Windows Collector
privacy pipeline PASS (six spans in, two safe spans out); native Windows Prometheus synthetic
scrape/relabel/temporary TSDB PASS (22 private label names, three safe series retained, zero
private series). Prometheus self-scrape filtering was corrected after the first failing test.
Tempo2.10.3 native Windows config.verify PASS; Fluent Bit native configuration/plugin
validation UNVERIFIED (official artifact endpoint403). All exact Linux image/deployed stored
privacy/retention/fault/restart cases remain open. Fresh38-container before/after metadata
comparison PASS; earlier failed comparison remains historical evidence. See runtime runbook.

Current runtime audits executed: active config hashes/settings MATCH; Fluent Bit native4.2.5 ingestion/health and zero error/retry/drop counters PASS; active chunks zero at two checkpoints, but retained2x4KiB files remain unresolved. .NET synthetic gateway trace retrieval/parent/log correlation PASS after correcting Tempo base64-ID comparison. Quarkus401 synthetic trace retrieval404 remains OPEN. Latest20 stored logs key scan PASS; oldest20 original presence CONFIRMED historical privacy finding. Three Prom targets/48 rules healthy;26 ISM indices attached to30d policy. Fresh38-container metadata comparison PASS. Current Compose config and diff --check PASS; no maintenance/fault/restart or DB/client acceptance run.
