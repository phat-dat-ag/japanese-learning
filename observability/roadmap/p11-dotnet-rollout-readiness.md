# P11 .NET execution diagnosis and JWKS rollout plan — 2026-11-15

**P11 PARTIAL; production BLOCKED; roadmap 11/12.** This continuation diagnoses the blocker and prepares a source-reviewed procedure. It does not authorize or execute migration. P10 development PASS and the prior real .NET-to-Quarkus proof remain valid.

## Confirmed .NET findings

The test project targets net9.0, Microsoft.NET.Test.Sdk 17.12.0, xUnit 2.9.2 and Visual Studio adapter 2.8.2. Existing test hosts use synthetic fixtures and mocked persistence. No special runsettings, custom discovery override or established Docker test target was found. The production Dockerfile restores/builds/publishes the API, not tests. SDK 9.0.317 / MSBuild 17.14.51, runtime 9.0.19 and the installed Microsoft-signed `dotnet.exe` were already used by the failed run; its Authenticode status is Valid. SDK 9.0.315 is also installed, but changing compiler versions is not an established policy-approved remedy.

Read-only `Get-WinEvent` inspection confirms Code Integrity event **3077**, policy **VerifiedAndReputableDesktop**, policy ID `27555.1000.240208`, status `0xc0e90002`: testhost attempted to load `JapaneseLearning.User.Domain.dll` with requested signing level2, validated level1. The event's flat SHA256 is `BED1E9CA3A849B083D6A376DFBF72017AA4EB236B416118CBD9DE5066AE840AF`. This corroborates the runtime `FileLoadException` / **0x800711C7**. The exact internal reputation decision is not exposed by this evidence; it is not attributed to an invented antivirus/path rule. Earlier API/test DLL denials also exist. No policy was changed.

Independent PowerShell XML analysis and the [offline receipt analyzer](p11-validation/dotnet-diagnosis.cjs) agree:

| Evidence | Actual result / disposition |
| --- | --- |
| Historical selected security/auth/logging cohort | 81 passed, zero failures/skips; supporting historical result only |
| Latest restored selected cohort | 79 results: 14 passed, 65 failed, zero skipped; **NOT PASS** |
| Failure classification | All 65 contain the same policy DLL-load error; zero independently observed nonpolicy failures |
| Two discovery errors | `JwtContractTests.GeneratedTokenContainsExpectedContract` and `ValidTokenPopulatesCurrentUserAndAuthorizesExpectedRole` |
| Count difference | Each normally has User/Admin InlineData enum cases. Domain enum load fails during custom-attribute reflection: four ordinary cases become two discovery-error placeholders; **81 − 4 + 2 = 79** |
| Initial no-restore attempt | Exit0, no tests/reports, missing restored test assets; correctly rejected and followed by the preserved restored attempt |

The historical 81 is a **filter-selected cohort, not the full solution suite**. Project/source revisions did not change; discovery did not lose two production requirements. The blocked test bodies cannot establish absence of code regressions. No genuine assertion regression independent of the environment has been demonstrated. Full fresh selected and complete-solution regression remain unverified.

The preserved execution command was:

```powershell
dotnet test tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj -c Release --filter "FullyQualifiedName~Security|FullyQualifiedName~Logging.Authentication|FullyQualifiedName~Logging.AuthSuccess|FullyQualifiedName~Logging.Jwks" -p:UseSharedCompilation=false -p:NuGetAudit=false -m:1 --logger "trx;LogFileName=p11-adoption.trx" --nologo
```

It ran in `.local/p11-rc-20261115/dotnet-b`, a clean archive of pinned commit `bbbab2f4dc80c0275152d4bf008f52b75c5778d6`. Failed logs/TRX remain untouched. This continuation did **not** repeat an identical known-blocked run or label receipt analysis a new execution. `node observability/roadmap/p11-validation/dotnet-diagnosis.cjs` creates `diagnosis-verified.json`; the first analyzer attempt mishandled self-closing XML entries and was corrected against independent PowerShell parsing. Its incorrect `diagnosis.json` is retained and superseded, not acceptance evidence.

## Permitted execution options and required intervention

| Option | Assessment |
| --- | --- |
| Existing trusted SDK/test runner | Already used and working through discovery of some tests; generated assembly authorization blocks the remainder. Reusing it does not fix the policy decision |
| Approved Windows build/signing directory or workflow | None established in repository policy/evidence. Security owner must provide an approved signing/build path or allowlisted artifact workflow. Do not relocate/rename/recompile to evade denial |
| Existing Docker test infrastructure | No test target/runner found. Exact repository-pinned SDK image `mcr.microsoft.com/dotnet/sdk:9.0@sha256:01fabc4758d1d74e39eda700c8463dae6241a61481f973683692ddcb59a5eeb7` is absent. Existing `jp_learning_dev-user-api` is runtime-only and must not be modified or used as a test sandbox |
| Isolated Linux/CI host | Viable proposal, **not yet an approved execution environment**. Requires security confirmation that the test workload is permitted, approved image/tool provenance, dependency access, resource limits and isolated workspace. No image pull/container/host was created |

A newly added PowerShell diagnostic script was refused by the current script execution policy. It was removed without executing it, without changing execution policy or using `-ExecutionPolicy Bypass`; the permitted Node analyzer only reads existing XML evidence. No unapproved executable was downloaded. Existing read-only shell diagnostics were successful.

After a security-approved method exists, execute the selected cohort expecting exactly81/no failures/errors/skips, then `dotnet test JapaneseLearning.User.sln -c Release` with fresh TRX and verified nonzero discovery. Reconcile full discovered count from that unfiltered run and source theory expansion; do not treat81 as the complete-suite count. Preserve all failed attempts. Any actual assertion failure then requires individual diagnosis before declaring .NET closure. Run only synthetic fixtures; no credentials/private-key reads or protected DB access.

## Contract and configuration readiness

Japanese JWKS pin `e9b90c31dfa311e0121285c8b7caa37c09cf4287` publishes owner-partitioned public RS256 keys at `/api/v1/jwks/user` and `/api/v1/jwks/learning`. Spring retains legacy pin `a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73`, which publishes a global set at `/.well-known/jwks.json`. Neither is a route-compatible replacement for the other. No pin is changed by this plan.

The existing Spring opt-in `compose.jwks-owner-consumer.yml` sets **both** Learning settings to USER: JWT decoder URL `http://jwks-api:8080/api/v1/jwks/user` and HTTP client's path `/api/v1/jwks/user`; base URL stays unchanged. Learning consumes User-issued tokens, not LEARNING-owner tokens. Base Compose stays legacy-compatible and the overlay remains inactive. Actual source matches the validated candidate. Prior 25/26/21/21 Java regressions and isolated44-test Spring integration remain valid; no source changed this continuation.

Japanese .NET and Quarkus already consume `/api/v1/jwks/user`, issuer `JapaneseLearning.User`, audience `JapaneseLearning`, User/Admin roles. .NET requires signature/issuer/audience/expiry, zero skew, exact kid selection; JWKS auto refresh15min/minimum refresh1min. Quarkus already enforces its configured Japanese contract. No Japanese config migration is needed. Spring keeps issuer `japaneselearning-user-service`, numeric role mapping and its existing skew/audience-validation behavior. No cross-issuer trust or audience weakening is proposed.

Required publisher configuration work remains **unimplemented**: reviewed mapping of every existing Spring public key/kid to its actual owner, use of public-key-only paths and removal of private-key configuration/mount exposure from the candidate publisher. Existing signing services keep their keys and claims. A security owner must validate public-key equivalence and ownership without copying private material into reports. Do not merge the two parents' key sets or redirect Spring to the Japanese publisher by assumption. Spring User's actual publication/consumer configuration also needs a paired deployment review. The current consumer overlay alone is not a deployable complete publisher migration.

## Proposed ordered cutover — approval required, not executed

1. **Keep the rollout gate closed until fresh .NET selected and full regressions pass.** Obtain shared-JWKS independent review and both-parent adoption decisions, named operator/security owners, an approved environment, exact immutable images/config hashes and publisher key-owner mapping. Capture prior publisher and consumer image/config identities, public JWK fingerprints and recoverable reader-compatible rollback artifacts. Pin/source changes require separate explicit approval.
2. Review the full effective Compose model without printing resolved secrets. Validate both consumer paths, existing issuers/audiences/kids/roles/expiry, public-key equivalence/uniqueness, publication owner boundaries, service DNS, health checks, resources and telemetry. Confirm backups and protected resource inventory. Validate with fresh isolated candidate tests first in an approved environment.
3. **Explicit user deployment approval is required before the first runtime action**, including starting a new candidate service, changing ingress/maintenance mode, replacing a publisher, recreating/restarting a consumer or activating the overlay. Approval must cover exact services/images/configs, maintenance window, expected authentication interruption, resources, rollback operations and credential use. This task provides none of that approval.
4. Under an approved maintenance window, pause relevant Spring authentication traffic using an approved mechanism; do not improvise gateway changes. Replace only the approved Spring publisher with the reviewed owner-partitioned candidate and public-only key configuration. Verify health/public contract before moving consumers. The new publisher does not serve the old route: this procedure deliberately requires maintenance and is **not zero-downtime**.
5. Activate the opt-in owner paths for the approved Learning candidate, and any separately reviewed affected Spring User consumer config. Do not touch Japanese services or alter issuers/claims. Verify real issuer-to-consumer positive and negative checks below before restoring traffic. Recheck after consumer JWKS cache refresh; a warm cache must not mask a bad endpoint. Record exact deployed identities and telemetry, then reopen traffic only after all acceptance checks pass.

A parallel-publisher/blue-green approach could avoid route outage but introduces extra runtime/resources/routing and requires a separately approved design; it is not silently added here. Do not stage a publisher-only or overlay-only mixed-contract rollout.

## Post-deployment checks and rollback — proposal only

Check USER JWKS200 with expected public-only fields/kids/fingerprints, LEARNING publication matches its approved owner set, unknown owner404 and no private parameters. Validate valid existing development .NET/Quarkus and Spring issuer-consumer flows separately, directly and through their gateways. Verify wrong signature, unknown kid, wrong owner and issuer, expiry/missing expiry and insufficient roles reject; wrong audience must reject where currently enforced. Do not claim Spring audience enforcement it does not implement. Use sanctioned synthetic fixtures for trusted-signature negative cases; changing an untrusted signature does not prove issuer/audience enforcement. Do not alter real signing keys or claims for probes; tokens stay in memory and logs remain redacted. Verify cold-fetch and refresh behavior with a separately approved test method; do not flush existing runtime caches by restarting services without approval. Preserve prior real-token evidence where unchanged.

Rollback triggers: unexpected auth denial/acceptance, key/owner mismatch, private-field exposure, health/telemetry failure or incomplete acceptance within the approved window. Keep traffic paused. Restore the **paired** prior consumer config/image (both legacy paths) and prior legacy publisher image/config with exactly the original key material and no key edits; interim mismatch is contained by maintenance. Verify the legacy public-key fingerprints and genuine issuer-consumer authentication/authorization, then restore traffic. Do not revert only one side and reopen traffic. Japanese consumers must never be redirected to the legacy global endpoint. No DB/volume restore or signing-key rotation is part of this configuration rollback. Cache propagation and any reader compatibility must be checked before reopening. Exact commands/service selectors must be finalized against the approved deployment identity; no `compose up/down`, destructive cleanup or broad rollback command is authorized by this document.

## Evidence, preservation and status

New private evidence: `.local/p11-dotnet-closure-20261115/diagnosis-verified.json` and `technical.json`. Read-only checks used `dotnet --info`, Authenticode, original TRX comparison, Code Integrity events, Docker image inventory/exact-image inspect and scoped Git status. No test assembly was loaded by the diagnostic analyzer. No source/keys/credentials/pins were changed in either submodule/parent. The previous Spring source migration remains uncommitted and inactive.

Final runtime preservation results are recorded in current acceptance after comparison. Existing telemetry naturally advances. No live-token test, backup job, full P10 recovery, service lifecycle operation, registry operation or publication was repeated. Current readiness is **blocked for runtime rollout by .NET execution and missing coordinated deployment approval**. Production-specific host/TLS/capacity, critical-risk/access/custody ownership, off-host recovery/retention, rollback validation and business signoff remain open; no names/signoffs are invented. P07/P08 approved development exceptions are unchanged.
