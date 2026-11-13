# P06 test matrix

Only actual executions are PASS. [Evidence summary](p06-validation/evidence/test-summary.json)
records result counts/hashes; generated test outputs remain in their normal ignored paths.

| Check | Result / scope |
|---|---|
| .NET full regression | PASS, 151 tests; includes P02 logging/security and P04 metrics plus fifteen tracing cases. |
| .NET loopback HTTP | PASS: exactly two SERVER spans and one CLIENT in the synthetic trace; real header injection, child parentage and independent correlation. |
| .NET W3C | PASS malformed, all-zero, combined/separate duplicate rejection; valid extraction/injection; baggage/state exclusion. |
| .NET exporter | PASS actual OTLP serialization through an in-memory HTTP handler retains service resource identity and excludes sentinels/events. Loopback HTTP remains successful when the fixture exporter reports failure. |
| Sampling | PASS cross-stack common vectors, remote sampled/unsampled, local sampled children, deterministic fixed-window budget. |
| .NET DB privacy | PASS synthetic SqlClient-named Activity; SQL/parameter/user/error-message stripping and fail-closed event handling. Real SQL Server spans NOT VERIFIED. |
| Quarkus focused selection | PASS, 19 tests: tracing, real HTTP propagation/auth failure/duplicates, P02 file logging and P04 metrics/provider fixtures. |
| Quarkus offline regression | PASS, 372 tests, zero failures/errors/skips; all Mysql fixtures explicitly excluded. The unrestricted suite is blocked during discovery by its dedicated-DB profile requirement. |
| Quarkus W3C | PASS real inbound duplicate rejection, unsampled 401 lineage/correlation; existing managed Vert.x outbound loopback propagation. |
| Java DB privacy | PASS actual SDK synthetic span snapshot; IDs/status retained, SQL/parameters/events/status description excluded. Real MySQL commands NOT VERIFIED. |
| Collector | PASS native 0.145.0 validate including OTTL parsing/type checks; no receiver/export pipeline started. |
| Tempo | PASS YAML syntax and version-specific source-key review; native binary/config startup NOT VERIFIED on Windows. |
| Grafana | PASS YAML/provisioning structure and byte-identical Prometheus/provider preservation; actual datasource loading/query NOT VERIFIED. |
| Compose | PASS native synthetic config rendering and explicit preservation comparison for all 18 prior services and existing networks/volumes. |
| Deployed cross-stack chain | BLOCKED pending explicit deployment/isolated test approval. Separate loopback tests are not a deployed cross-stack trace. |
| Stored privacy, retention, export outage/backpressure | NOT VERIFIED; no Collector ingestion, Tempo writes or faults were performed. |

Commands from dotnet: dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj
--no-restore -m:1 -nodeReuse:false --logger "trx;LogFileName=p06-regression.trx".
From quarkus: .\mvnw.cmd -o test "-Dtest=*Test,!*Mysql*" "-Dquarkus.http.test-port=0"
for the offline suite. Unrestricted discovery requires a dedicated MySQL profile and was blocked;
focused selection uses -Dtest=TracingTest,TracingHttpTest,CorrelationIdTest,
ApplicationFileLoggingTest,ApplicationMetricsTest,ApplicationMetricsFilterTest,
PoolMetricsTest,JwksMetricsFilterTest. No real-MySQL opt-in flags were supplied.
From root: python observability/roadmap/p06-validation/verify.py.

Early failures were corrected: unsupported .NET package evaluation, vulnerable exporter
evaluation, a Java Context type collision, and a .NET fixture capturing unrelated parallel
test traffic. Final fixture isolates process-wide instrumentation and asserts its exact
trace span count. Interrupted sandbox/server-restart runs are not counted as PASS.
