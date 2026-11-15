# P11 independent .NET test environment specification

## Current locked test-package inputs — final local review

The [definitive acceptance matrix](p11-readiness.md#definitive-p11-acceptance-matrix--final-local-closure-review-2026-11-15) supersedes the earlier missing-lock finding below: SDK9.0.317 is now pinned in `dotnet/global.json` with roll-forward disabled, and all five solution projects have NuGet lockfiles. Only six new configuration files were added; original application/test sources and Git revisions are unchanged.168 existing packages were staged without download, restored from an isolated local feed, and re-restored in locked mode with identical content hashes/lock bytes. This is Windows dependency-lock qualification, not approved Linux execution or a vulnerability assessment.

The **minimum updated test package** is the original `dotnet.tar` (SHA256 `a6acda64b859a80d9ed79df42cabf680149cbf4edb944391e8c1b6e85a191b2a`) plus create-only `.local/p11-final-acceptance-20261115/dotnet-pins.tar` (SHA256 **`a641542bb8599111d239a430d9b884f9e54d6697c88a8141d0b0af1a2a970d98`**). On an explicitly approved independent agent, verify both hashes and extract the six pin files into the fresh source with `tar -xf dotnet-pins.tar -C source`; verify all six individual file hashes against current acceptance. Record the base commit and overlay hashes. Before testing, restore with `--locked-mode` against the owner-approved feed and SDK9.0.317. Do **not** regenerate locks to make a Linux mismatch disappear: stop and review/revise the candidate if platform dependencies differ. The earlier scratch lock-generation checkpoint below describes how locks were initially proposed, not permission to change these current reviewed-input candidates.

The companion review patch SHA256 is `cd0a3eba04b20d1e4e65989004ff3839ef4bfdabf264cdbdaf9358d874b3f52d`; use the tar for exact-byte transfer because Git line-ending settings can change file bytes. Initial nested scratch application silently skipped paths through parent repository discovery; the helper was corrected to bound Git discovery. A subsequent patch attempt matched text but changed global.json line endings. Both failed checks are preserved and superseded by the successful six-file tar extraction/hash check. No failing patch attempt is treated as an exact reproduction PASS.

Then use the documented build, unfiltered151-case discovery/execution and fail-closed TRX verifier sequence below. An independent environment, actual contained SDK/platform identity, package security provenance and execution approval remain absent. No test image/workload was started; static inventory remains151 and fresh regression remains BLOCKED. A/B locked Windows publishes reproduce101 files with202 independent hashes but do not change that regression status. Security-owner approval must now reference these exact base-plus-lock-overlay inputs.

**Status: specification prepared; security-owner approval pending. P11 PARTIAL; production BLOCKED; 11/12.** No independent environment is qualified or executed by this report. P10 development acceptance and the existing actual .NET-to-Quarkus proof remain unchanged.

## Available infrastructure and approval boundary

Tracked-file inspection in Japanese parent, .NET submodule and Spring parent found no GitHub/GitLab/Azure/Jenkins workflow, trusted remote test agent definition, approved internal test/artifact registry or Linux test-container target. The .NET README explicitly says it has no CI/CD workflow. No external agent/account was contacted. This is a repository-evidence finding, not a claim that the organization has no CI infrastructure elsewhere.

The .NET Dockerfile pins a production build SDK image, but its stages restore/build/publish the API only. Its digest is **not** an approval to execute tests. Prior read-only image inspection established the exact SDK image is absent locally; no pull/start was attempted. The existing running .NET service image is runtime-only and is not a test host. The installed signed Windows SDK/test runner was already used by the policy-blocked execution; neither its trust nor an available Docker daemon authorizes the generated test assemblies. No approved alternate directory or signing workflow was found. Reusing older compilers or moving files to avoid the policy is not proposed.

**Available approved independent test environments: none established.** Security-owner approval must identify the environment, operator and trusted artifact/dependency provenance. Do not execute the sequence below merely because this specification is checked in.

## Exact candidate inputs

| Input | Required identity / qualification |
| --- | --- |
| Japanese parent | `e97aa876aaf1458813fcf5610d762a5456c71c26`; P11 working docs are not represented as committed release inputs |
| .NET source | Clean `bbbab2f4dc80c0275152d4bf008f52b75c5778d6` |
| Existing committed-source archive | `.local/p11-rc-20261115/dotnet.tar`, 430,080 bytes; SHA256 `a6acda64b859a80d9ed79df42cabf680149cbf4edb944391e8c1b6e85a191b2a` |
| Solution / test project | `JapaneseLearning.User.sln`; one `tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj`; four application projects |
| Required SDK / target | SDK **9.0.317**, target **net9.0**; Windows reference runtime **9.0.19**, MSBuild **17.14.51**; Linux versions must be captured and reconciled before testing |
| Repository SDK image candidate | `mcr.microsoft.com/dotnet/sdk:9.0@sha256:01fabc4758d1d74e39eda700c8463dae6241a61481f973683692ddcb59a5eeb7` |
| Image qualification | **Not authorized / not executed.** Linux/amd64 platform and actual contained SDK version are not verified offline. Require SDK9.0.317; stop on mismatch and obtain a revised exact approved digest rather than silently changing the plan |
| Test dependencies | Microsoft.NET.Test.Sdk17.12.0; xUnit2.9.2; xunit.runner.visualstudio2.8.2; AutoFixture4.18.1; AutoFixture.Xunit2 4.18.1; Moq4.20.72; coverlet.collector6.0.2 |

[Machine specification and full method inventory](p11-validation/dotnet-environment.json) includes all five projects' direct dependency versions and source-file hashes. Exact direct versions exist, but no `global.json`, `packages.lock.json`, approved NuGet-source config or complete locked transitive closure is checked in. A pinned SDK image alone does not make dependency restoration reproducible. Existing Windows assets/cache are supporting inputs, not a qualified Linux feed. Generate/review candidate lock files in the isolated scratch checkout, record every resolved package/version/hash and repeat locked restore against an approved immutable offline feed; do not modify parent/submodule source or silently adopt those locks.

## Complete source-derived inventory

There are **151 expected cases, 62 methods, 16 classes**: 39 Facts plus 23 inline-data Theories with 112 rows. No MemberData/ClassData/AutoData, conditional compilation or skipped test attribute was found. Static inventory is **not runtime discovery**. Independent PowerShell attribute counting corroborates 39/23/112. Generated files/old P11 overlays are excluded; only tracked committed tests are intended.

| Class | Cases |
| --- | ---: |
| HealthEndpointTests | 2 |
| AuthSuccessContractTests | 2 |
| AuthenticationLoggingTests | 7 |
| CanonicalLoggingTests | 14 |
| CorrelationIdTests | 22 |
| DetailedLoggingTests | 5 |
| JwksLoggingTests | 2 |
| SerilogLoggingTests | 4 |
| ApplicationMetricsTests | 1 |
| DependencyMetricsTests | 7 |
| TracingTests | 15 |
| DatabaseConfigurationTests | 8 |
| JwtContractTests | 24 |
| JwtRsaStartupTests | 19 |
| RetiredJwksEndpointTests | 1 |
| SigningKeyListTests | 18 |
| **Total** | **151** |

The existing selected security/auth/logging cohort totals81. Latest Windows execution still has14 passes/65 policy-related failures and two theory discovery placeholders (79 results); no fresh execution occurred here. The [diagnostic report](p11-dotnet-rollout-readiness.md) explains the policy and count discrepancy. No independent assertion failure is proven, and blocked test bodies remain unverified.

## Proposed isolated environment — requires approval

Prefer a security-owner-provided disposable **independent Linux/amd64 agent**, rather than adding pressure or trust exceptions to the protected Windows/Docker host. Proposed ceiling for review: 2 vCPU, 2GiB RAM, 4GiB hard-bounded scratch storage and20 minutes; these are **proposed limits, not approved budgets or measured sufficiency**. Obtain capacity/isolation approval before provisioning. A local container alternative requires separate explicit image/workload/resource approval and protected-host headroom checks; do not infer it from P10's consumed recovery budget.

Use the exact owner-approved SDK image digest or an owner-attested equivalent host SDK9.0.317. Record immutable platform image identity, provenance/signature policy, `dotnet --info`, installed runtimes, OS/libc/architecture, runner/operator and approval reference. No workload on existing containers, no privileged mode, Docker socket, host network, production network, ports published to host, protected volume mounts or signing-key/credential access. Source arrives as the reviewed archive, not a whole-repository mount. Scratch/evidence are new manifest-owned paths, with unique run ID and hard limits. Use an owner-approved nonprivileged UID with writable isolated HOME/NuGet/temp directories.

Stage only explicitly approved dependencies into an isolated immutable feed before execution; approve any download/source access separately. Deny network egress during tests, while allowing process-local ephemeral loopback listeners. Existing tests generate disposable synthetic RSA fixtures under their own temp directory; never mount or copy development/production key material. Persistence and SQL failures use mocks; no business DB is required. Preserve all unrelated environment variables/host state by running on the dedicated agent, not by modifying the current host. Test evidence is private by default; raw fixture logging may include synthetic sentinel/token-like values and must not be published.

## Command sequence — approved agent only, not executed here

Prerequisites: operator has recorded approval for the environment/image/dependency feed/limits; an empty manifest-owned workspace exists; reviewed `dotnet.tar` and its checksum are staged; `/approved/nuget-feed` is a complete owner-approved local package feed. No image-pull or host provisioning command is authorized by this document.

Run in that fresh workspace using Bash and the image's existing SDK (no new executable installation):

```bash
set -euo pipefail
umask 077
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
export DOTNET_CLI_UI_LANGUAGE=en-US DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER=1
export DOTNET_CLI_HOME="$PWD/home" NUGET_PACKAGES="$PWD/packages"
export TMPDIR="$PWD/tmp"
mkdir source evidence home packages tmp
printf '%s  %s\n' a6acda64b859a80d9ed79df42cabf680149cbf4edb944391e8c1b6e85a191b2a dotnet.tar > evidence/source.sha256
sha256sum -c evidence/source.sha256
tar -xf dotnet.tar -C source
dotnet --info > evidence/toolchain.txt
test "$(dotnet --version)" = 9.0.317
dotnet --list-runtimes > evidence/runtimes.txt
cd source
dotnet restore JapaneseLearning.User.sln --source /approved/nuget-feed \
  --packages "$NUGET_PACKAGES" -p:RestorePackagesWithLockFile=true \
  -p:NuGetAudit=false > ../evidence/restore.log 2>&1
find . -name packages.lock.json -type f -print0 | sort -z | \
  xargs -0 sha256sum > ../evidence/dependency-locks.sha256
test -s ../evidence/dependency-locks.sha256
```

**Review checkpoint before proceeding:** reconcile generated lock versions/content hashes with the owner-approved dependency baseline, source direct pins and intended Linux dependency closure. Save generated locks and all resolved dependency identity metadata in private evidence. If the feed/baseline is incomplete, SDK/runtime differs, locks cannot be approved, or limits are insufficient, stop as infrastructure BLOCKED. Audit was disabled above only to avoid implicit online vulnerability-database access during isolated restore; owner-approved dependency security review is still required and this is not a vulnerability-scan PASS.

After that dependency checkpoint is explicitly satisfied on the approved agent:

```bash
dotnet restore JapaneseLearning.User.sln --locked-mode \
  --source /approved/nuget-feed --packages "$NUGET_PACKAGES" \
  -p:NuGetAudit=false > ../evidence/restore-locked.log 2>&1
dotnet build JapaneseLearning.User.sln -c Release --no-restore \
  -p:UseSharedCompilation=false -p:ContinuousIntegrationBuild=true \
  -m:1 > ../evidence/build.log 2>&1
dotnet test JapaneseLearning.User.sln -c Release --no-build --no-restore \
  --list-tests > ../evidence/discovery.log 2>&1
awk '/The following Tests are available:/{found=1;next} found && /^    /{n++} END{exit !(n==151)}' \
  ../evidence/discovery.log
dotnet test JapaneseLearning.User.sln -c Release --no-build --no-restore \
  --logger 'trx;LogFileName=p11-full.trx' --results-directory "$PWD/../evidence" \
  > ../evidence/tests.log 2>&1
```

Record the actual exit code and stage for every command in the agent run receipt even on failure; `set -e` stops the sequence, it does not by itself produce that receipt. Do not rerun into the same evidence directory. If this runner formats discovery output differently, retain it and reconcile names explicitly; do not suppress the count check. Require all151 runtime cases, all62 methods with exact per-method row counts and zero failures/errors/skips. Timeout/OOM/restore/build/discovery/policy/network failures are infrastructure failures, not assertions; assertion failures require individual security-preserving diagnosis. Mixed failures must be classified individually, never all inferred to be environment failures.

Import the private TRX through an approved evidence-transfer method to the existing reviewer workspace. Verify with the already installed Node reviewer, without installing Node inside the candidate SDK image:

```powershell
node observability/roadmap/p11-validation/dotnet-environment.cjs verify-trx <private-path-to-p11-full.trx>
```

The gate reuses existing nonzero count validation and additionally requires Completed status, all Passed outcomes and exact method/count membership. Nine offline checks pass, including accepting real historical81 against its correct subset and rejecting the policy-failed79; those are **verifier tests**, not .NET regression. Hash sanitized summary, source archive, approved locks/feed metadata, build artifacts and private raw reports with SHA256. Publish only versions/identities/counts/status and evidence hashes, never raw logs, credentials, tokens, key fixtures or arbitrary failure payloads. An external approval reference is metadata only; do not place credentials in it. No publishing/deployment is included.

## Offline release qualification results

`dotnet-environment.cjs integrity` verified **443 checks, zero mismatches**: the two immutable full manifests, eight source archives, the431 recorded original candidate artifact files and both new Learning JARs. This rechecks the frozen manifests' recorded artifact selection, not an assertion of870 current checks (the earlier870 check run covered both build directories). Both original manifest bytes and later Spring manifest bytes remain intact. Same-host Learning A/B output remains SHA256 `a0314c68cd015789707ed84f443e46244a86f697c1b218d51a7c8f95ffdb69bd`.

The manifests record source revisions, submodule identities, tool versions, commands, selected artifact bytes/hashes and working-patch qualification. They do not establish signed/WORM custody, clean-cache/independent-host/Linux OCI reproduction, dependency security closure or deployed-image equivalence. Root P11 work and Spring consumer/test edits are uncommitted and identified separately. Remaining reproducibility gaps include missing .NET SDK/package locks, Maven complete lock closure/wrapper checksums, floating JWKS image bases/apt inputs and the recorded npm declared/actual mismatch. No package/project/toolchain pin was silently changed in this task.

Japanese owner-publisher pin remains `e9b90c31dfa311e0121285c8b7caa37c09cf4287`; Spring legacy publisher remains `a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73`. Spring parent remains `4053199a18cae4e1ee3e3f81cafca4d360469c52`, Learning `f3cf9fe3e85acbef12e5e9743a89ebd18ea19793`, User `07019d56c46a4954aae35511b675e73547be54d1`. Japanese .NET/Quarkus already expect `/api/v1/jwks/user`; the Spring opt-in overlay remains inactive. Old-global/new-owner route combinations are not interchangeable. The [paired rollout/rollback proposal](p11-dotnet-rollout-readiness.md) remains gated by .NET closure, reviewed public-key owner mapping, shared adoption approvals and explicit runtime authorization. No issuer/audience/role/key change is proposed.

## Required approval and final disposition

Security owner must approve **the exact independent environment/operator, immutable platform SDK identity, package feed and resolved closure, workload/isolation and resource limits, evidence handling and test-only ephemeral fixtures**. Provide a named approver and review/ticket reference, or an already approved environment with equivalent documented controls. Image digest/actual SDK mismatch requires a revised reviewed specification. This approval is for tests only; it does not approve shared publisher adoption, local/production deployment, pin changes or credential use.

Full fresh .NET regression remains BLOCKED pending that approval. No test environment, image, workload or new test account was started. Final runtime preservation is recorded in current acceptance from this session's before/after comparison. P10 development PASS and P07/P08 development exceptions are unchanged. Production host/TLS/capacity, access/key/certificate custody, off-host recovery/retention, qualified artifacts, independent reviews, rollback execution and named business/release signoffs remain open. **P11 PARTIAL; production BLOCKED.**
