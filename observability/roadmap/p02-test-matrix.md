# P02 test matrix and commands

Final counts and digests are retained in [test summary](p02-evidence/test-summary.json); source/runtime qualifications are in [verification](p02-verification.md). PASS is limited to the tested candidate and test environment. No Docker stack or existing database was used. All generated RSA material belongs to existing ephemeral test fixtures, not application signing/public keys.

## Executed groups

| Group | Executed | Passed | Failed | Skipped | Evidence / limitations |
|---|---:|---:|---:|---:|---|
| .NET focused logging (earlier final focused run) | 54 | 54 | 0 | 0 | in-memory formatter/middleware/handlers/fake HTTP, existing ephemeral HTTP fixtures; later additions included in full suite |
| .NET complete unit suite (final) | 129 | 129 | 0 | 0 | TRX counters; SQL boundaries mocked; local HTTP/key fixtures; not deployed JWT/runtime validation |
| Quarkus focused logging/correlation/component suite | 51 | 51 | 0 | 0 | nine Surefire classes; official formatter, MDC/Mutiny, business summaries and async JSON file; offline DB alternatives, ephemeral JWKS server/test keys |
| Angular correlation + existing authentication suite | 41 | 41 | 0 | 0 | two Vitest suites, mocked HTTP; valid/missing/invalid/oversized/duplicate IDs, retry identity, third-party exclusion and auth regressions |
| Cross-component reference fixtures | 3 test methods | 3 | 0 | 0 | fifty source/scenario subcases plus twelve rendered Nginx duration/template cases and a numeric-type negative case; no runtime capture |
| Angular application and spec type checks | 2 commands | 2 | 0 | 0 | local tsc --noEmit; no backend/browser rendering |
| Angular changed-file formatting | 1 command | 1 | 0 | 0 | local installed Prettier; no package/dependency download |
| Java style/source safety review | modified Java files | reviewed | 0 outstanding | 0 | R01-R19 read in full; no wildcard imports/tabs/>100-character lines; imports, braces, multiline arguments and logging-only semantics reviewed |
| Nginx actual syntax/runtime | 0 | 0 | 0 | 0 | NOT VERIFIED: no local nginx executable and Docker access denied; static format/route preservation tests are separate |
| Deployed end-to-end, collection/store/privacy | 0 | 0 | 0 | 0 | NOT VERIFIED; no protected resource access or P03 behavior exercised |

No unexecuted runtime group is called skipped/PASS. The final summary is authoritative if a command is repeated after a relevant edit; intermediate failures below remain recorded.

## Reproducible safe commands

From dotnet directory:

```powershell
dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj --no-restore -m:1 -nodeReuse:false -p:UseSharedCompilation=false --filter FullyQualifiedName~Logging --logger 'trx;LogFileName=p02-logging-final.trx'
dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj --no-restore -m:1 -nodeReuse:false -p:UseSharedCompilation=false --logger 'trx;LogFileName=p02-unit-final.trx'
```

From quarkus directory (only these selected offline tests):

```powershell
mvn.cmd -o test '-Dtest=CanonicalLoggingTest,StructuredLogTest,OperationLogTest,OperationLogBehaviorTest,VocabularyOperationLogTest,VocabularyStageLoggingTest,CorrelationIdValidationTest,ApplicationFileLoggingTest,JwksCorrelationFilterTest' '-Dquarkus.analytics.disabled=true' '-Dquarkus.http.test-port=0' '-Dquarkus.log.console.enabled=false'
```

The file-handler profile uses its own UUID directory under target/p02-logging-test. OIDC request-filter tests construct a real request object without sending/resolving it. No real MySQL test opt-in was supplied. Production async/rotation/retention settings were not edited; the test console override only avoids noisy test output.

From angular directory:

```powershell
npm.cmd test -- --watch=false --include=src/app/core/auth/auth-correlation.spec.ts --include=src/app/core/auth/auth.service.spec.ts
.
ode_modules\.bin	sc.cmd --noEmit -p tsconfig.app.json
.
ode_modules\.bin	sc.cmd --noEmit -p tsconfig.spec.json
.
ode_modules\.bin\prettier.cmd --check src/app/core/auth/auth.interceptor.ts src/app/core/auth/auth-correlation.spec.ts
```

Angular test executor initially failed to spawn esbuild with EPERM in the sandbox. Only this local mocked unit-test command was rerun with tool approval outside the sandbox; Docker permissions were never escalated. No dependencies were installed. A root-level npx attempt could not find cached Prettier; invoking the installed angular/node_modules binary from the correct directory succeeded.

From Japanese root:

```powershell
python -B observability/roadmap/p02-fixtures/verify.py
git diff --check
git -C dotnet diff --check
git -C quarkus diff --check
git -C angular diff --check
```

## Intermediate failures, corrected without weakening behavior checks

- Initial default-parallel .NET attempt produced no completion evidence; cancellation was requested and bounded serial builds were used. It is not counted as PASS.
- A focused .NET run had one old assertion expecting UserId; it was changed to assert absence, retaining token/response/persistence-mock assertions. The full run first had 19 failures associated with default Windows Event Log providers (startup failures and health-host errors/timeouts). Test hosts now explicitly clear machine-wide logging providers; all auth/configuration/health assertions remain. No Event Log permission elevation or application-host policy change was used.
- Initial Quarkus formatter test expected peer port; privacy omission assertion replaces that expectation. Five business tests expected ID-bearing messages; redaction expectations preserve counts, responses, transaction and rollback assertions. Cancellation is now WARN with outcome and a test explicitly verifies visibility plus independent subscription cleanup.
- A Java formatting pass accidentally altered a quoted empty-object fixture and qualified class-name literals; compile/tests exposed these mistakes. They were restored, semantic string changes reviewed, and the final suite rerun. Formatting did not authorize changing test behavior.
- One Maven invocation from the parent root had no POM; it ran no tests and was corrected to the quarkus directory.
- Reference template rendering initially used a variable regex without digits (time_iso8601); it was corrected. Both candidate/build log templates and fixed-point duration maps now pass the static cases. This is not nginx -t.

No failing assertion was suppressed or test silently skipped. Source fixture coverage does not prove live collector parsing, new index field searchability, retention/loss, browser rendering, production security or full shared-parent compatibility.
