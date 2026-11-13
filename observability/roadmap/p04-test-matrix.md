# P04 test matrix

Final extracted results and hashes: [test summary](p04-validation/evidence/test-summary.json).
Local samples/types/labels: [inventory](p04-validation/evidence/metrics-inventory.json).
PASS is limited to named local processes or fixtures. No Docker deployment, DB migration,
real application database, existing secret/key, shared JWKS test or protected runtime probe.

| Test group / scenario | Executed result | Limits |
|---|---|---|
| .NET entire unit suite | 136 PASS, zero failed/skipped | SQL boundaries mocked; existing ephemeral auth/JWKS/key fixtures; not deployed |
| .NET metrics subset within that suite | 8 cases PASS | actual local HTTP success/401/403/500; 10000 unknown path/method requests; zero in-progress after completion; no duplicate request count; security outcomes |
| .NET actual JWKS handler | included: success, 503, transport exception, timeout, cancellation | in-memory backend; one observation per handler invocation; no real service call |
| .NET SQL provider adapter | included: diagnostic connect/command success/error; approved gauge samples | synthetic DiagnosticListener/counter values; throwing payload getters prove no inspection; live native EventCounter emission NOT VERIFIED |
| Quarkus focused unit/component suite | 83 PASS, zero failed/errors/skipped | 15 classes: metrics, auth, safe errors, logging/correlation; selected offline service alternatives |
| Quarkus metrics cases within 83 | 7 PASS | 4 registry/filter cases, JWKS SPI fixture, native pool SPI fixture, actual local metrics endpoint |
| Quarkus HTTP/security regression | local 200/401/403/404/500 and 21 JWT contract tests PASS | ephemeral local JWKS server; no real MySQL |
| Quarkus actual JWKS SPI | local authenticated fetch exports attempts and response latency PASS | cache behavior remains native; network transport has no response callback |
| Quarkus 503/repeated/unanswered callback | PASS direct installed SPI fixture | 3 attempts, 1 success response, 1 failure response; repeated callbacks not double counted; third attempt unresolved |
| Quarkus native pool lifecycle | PASS direct native SPI acquire/release/reject | synthetic pool state, not real connection utilization; native client timer translation tested separately in same fixture |
| 10000 unknown routes/IDs/tags | PASS .NET actual HTTP, Quarkus real registry and source pre-match fixtures | fixed label sets; no production churn/peak capacity conclusion |
| wrapped DB failure/privacy | PASS synthetic classifier/SQL listener fixtures | no SQL data/messages/payloads in labels; no live database fault |
| P04 Python checks | 5 PASS | preservation, disjoint pre-match patterns, actual local test exports, scrape candidates, existing dependencies |
| YAML parsing/style | PASS installed Prettier, two candidate files | not promtool or Compose merged-model validation |
| Prometheus configuration/runtime target health | NOT VERIFIED / BLOCKED | no promtool executable; Docker inspection denied; no source-only UP claim |
| actual pool/DB runtime, sampler/connection loss | NOT VERIFIED / BLOCKED | no safe isolated DB environment |
| OpenMetrics exemplars with sampled Quarkus context | NOT VERIFIED | plain-text label tests do not establish every protocol's exemplar policy |
| native OIDC HTTP-client timer | NOT observed on actual local transport | JWKS SPI supplies actual fetch metrics; native timer name/types verified only via registry fixture |
| P02/P03 runtime and cleanup findings | remain open | no activation, live log test, stored _source scan or temp-directory repair |

Executed metrics-case counts are subsets of suite totals; do not add them again. No
historical P02/P03 test count is presented as a P04 rerun. No application test was run in
Angular/shared JWKS because neither source changed.
The final metrics-only follow-up reran those seven Quarkus cases after the last bounded
outcome/native-pool mapping corrections; it is not seven additional unique cases.

## Safe commands executed

From dotnet:

```powershell
dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj --no-restore -m:1 -nodeReuse:false -p:UseSharedCompilation=false --filter FullyQualifiedName~Observability --logger 'trx;LogFileName=p04-metrics-final.trx'
dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj --no-restore -m:1 -nodeReuse:false -p:UseSharedCompilation=false --logger 'trx;LogFileName=p04-unit-final.trx'
```

From quarkus:

```powershell
mvn.cmd -o test '-Dtest=ApplicationMetricsFilterTest,ApplicationMetricsTest,PoolMetricsTest,JwksMetricsFilterTest,JwtSecurityTest,ProductionErrorTest,CanonicalLoggingTest,StructuredLogTest,OperationLogTest,OperationLogBehaviorTest,VocabularyOperationLogTest,VocabularyStageLoggingTest,CorrelationIdValidationTest,ApplicationFileLoggingTest,JwksCorrelationFilterTest' '-Dquarkus.analytics.disabled=true' '-Dquarkus.http.test-port=0' '-Dquarkus.log.console.enabled=false'
mvn.cmd -o test '-Dtest=ApplicationMetricsFilterTest,ApplicationMetricsTest,PoolMetricsTest,JwksMetricsFilterTest' '-Dquarkus.analytics.disabled=true' '-Dquarkus.http.test-port=0' '-Dquarkus.log.console.enabled=false'
```

From root (finalize runs after all seven reports exist):

```powershell
python -B observability/roadmap/p04-validation/verify.py
python -B observability/roadmap/p04-validation/finalize.py
git diff --check
git -C dotnet diff --check
git -C quarkus diff --check
```

From angular (existing local tool, no install):

```powershell
.\node_modules\.bin\prettier.cmd --check ..\observability\roadmap\p04-validation\prometheus.p04.yml ..\observability\roadmap\p04-validation\compose.metrics.p04.yml
```

Normal-access Docker ps/volume ls/network ls each returned named-pipe permission denied;
no escalation, permission change, lifecycle/resource operation or alternative privileged
access. Read-only local Git metadata/history/hash checks and installed Java API/bytecode
inspection also ran. Existing mutating verification scripts were not run.

## Intermediate failures and corrections

Initial Quarkus filter test expected native clients to remain denied; replaced it with
assertions for the newly reviewed bounded client/pool labels and idempotence, retaining
unknown-meter denial. The installed SimpleMeterRegistry has close() but is not
AutoCloseable, and the extension uses io.micrometer.prometheus/simpleclient, not the newer
prometheusmetrics package: corrected fixture APIs without changing dependencies.

Actual OIDC fetch lacked native HTTP-client metrics; added the dedicated SPI view.
The initial SPI bean was removed from dynamic CDI discovery; retaining it with Unremovable
and bearer-flow restriction fixed actual local fetch observation. No expected assertion
was suppressed to call unavailable metrics PASS. .NET's OpenMetrics encoding writes
the numeric 2s boundary as 2.0; the test now accepts both equivalent encodings and still
requires that bucket. Final suites pass after corrections. Several shell quoting mistakes
affected read-only/helper commands only and were corrected; they are not test passes.
Final installed Vert.x PoolImpl bytecode review confirmed SQL pools use the sql.pool.*
prefix, not mysql.pool.*; the allowlist/native SPI fixture and inventory were corrected
before completion. MySQL client-processing metrics retain their mysql.* prefix.
