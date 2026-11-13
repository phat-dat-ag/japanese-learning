# P05 test matrix

Executed offline on 2026-11-13; [machine results](p05-validation/evidence/test-results.json).
No application source changed, so P04 app suites were not rerun or counted as P05 tests.

| Check | Actual result | Evidence/limit |
|---|---|---|
| Python validation suite | PASS: 15 test methods, 0 failures/errors | Includes 42 separately asserted synthetic scenarios; do not sum methods and scenarios |
| Reference scenarios | PASS: 42/42; all 33 alerts have positive coverage | Actual rule expressions parsed/evaluated by limited independent model, not Prometheus |
| Privacy/cardinality | PASS: 10000 synthetic input label sets collapse to one job output | Alert aggregation only; not stored raw source/exemplar privacy |
| Unsafe Compose fixtures | PASS: 7 rejected mutations | Wrong project, public bind, profile, writable root, external network, internal-only Grafana, shared volume name |
| Native root Compose config | PASS: 16 existing services preserved; 2 additions | Synthetic env, no engine/lifecycle commands; original network/volume equality |
| Overlay transfer | PASS; draft removed after proof | Images, identities, controls, limits, healthchecks and mount targets retained |
| YAML syntax | PASS: 7 YAML files plus malformed syntax rejection | Installed Prettier YAML parser; not schema/PromQL validation |
| Grafana provisioning/dashboard | PASS source consistency | Datasource UID/URL, loopback/security/network/volume checks; runtime not verified |
| Prometheus/PromQL official syntax | NOT VERIFIED | `promtool` unavailable |
| Prometheus official scenario execution | NOT VERIFIED | Fixture generated for all 42 scenarios x33 alert expectations; not executed by engine |
| Alertmanager schema | NOT VERIFIED | `amtool` unavailable; receiver configuration not connected |
| Deployed scrape, alert loading/firing/recovery, Grafana connectivity | BLOCKED | Docker engine access denied |
| Actual storage/cardinality/CPU/notification timing | NOT VERIFIED | No runtime/load/receiver validation |

Synthetic scenarios cover both APIs' success/5xx and latency, zero/low traffic, missing jobs and
optional/native metrics, missing buckets, stale samples, startup pending, critical recovery hold
and clear, counter reset, negative heap max, auth rejection/denial, observed JWKS failures/slow
responses/unanswered attempts, DB failures, pool pressure, memory/heap/CPU and scrape sample limits.
Expectations are authored explicitly in [scenarios.py](p05-validation/scenarios.py); they are not
generated from the reference evaluator's answers. Model limitations: float vectors only, no
native histograms/subqueries/group_left/right, no complete Prometheus regex/staleness/scheduling
parity. Unsupported syntax fails closed. Passing the model does not prove engine correctness.

Reproduce from repository root (source-only):

```powershell
python -B observability/roadmap/p05-validation/verify.py
python -B observability/roadmap/p05-validation/compose_check.py
node observability/roadmap/p05-validation/validate-yaml.cjs
git diff --check
```

`build_candidates.py` regenerates only P05 candidate configurations and rule manifests;
`scenarios.py` regenerates promtool fixtures. Do not run `compose_check.py baseline` again;
it refuses to overwrite evidence. `transfer_check.py` verifies/removes only the task-created
draft if present. Neither script invokes up/down/exec/build/pull or resolves real env files.

When a compatible official tool is available, `verify.py` also runs `promtool check rules`,
`promtool check config`, `promtool test rules` and `amtool check-config`, records their real
outputs, and fails on errors. No tool was downloaded or Docker permissions changed. Use a
tool version compatible with the pinned Prometheus version. YAML success is not a substitute.
