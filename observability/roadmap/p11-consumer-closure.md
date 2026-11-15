## Current Spring source migration — 2026-11-15

**P11 PARTIAL; production BLOCKED; 11/12.** [Spring migration and regression](p11-spring-migration.md) now records actual source adoption: opt-in two-path owner overlay, test-only order correction, unchanged pins and inactive rollout. Fresh Learning 25/25, User 26/26, JWKS 21/21 and Quarkus 21/21 pass. Fresh .NET is NOT PASS: Application Control blocks the Domain DLL (14 passed, 65 failed; discovery errors, expected 81 not met). Existing real-token/gateway proof remains valid without another login. Two Learning builds match and independent hashes pass; [candidate manifest](p11-validation/spring-release-manifest.json) identifies the uncommitted source and artifacts. All 52 containers, 25 volumes, three backups, schedules and revisions are preserved. Production/shared-publisher adoption and remaining authoritative gates stay open. Earlier statements below are historical and are superseded within this explicit scope.

# P11 consumer compatibility closure candidate

## Current actual-token update

[Actual development token proof](p11-live-token.md) now **PASS** after the user supplied an existing development credential file. The same unchanged .NET-issued token succeeded at .NET/Quarkus directly and through nginx; its User role was denied Admin access by both APIs. Only its own newly issued refresh session was logged out; no credentials, keys or claims changed and no token was persisted. This supersedes the earlier credential-unavailable result below, which remains historical evidence. Fresh Windows DLL execution restrictions and remaining regression/production gates are unchanged. P11 PARTIAL; production BLOCKED; 11/12.

**P11 PARTIAL; production acceptance BLOCKED; 11/12 phases complete.** This continuation prepares and verifies consumer-only corrections without adopting/deploying them in either protected repository. The user explicitly confirms no development test credentials are available and prohibits account/credential creation without approval. Real development .NET-issued-token-to-Quarkus proof remains **UNVERIFIED**. No historical acceptance or immutable release manifest is rewritten.

## Exact scope and protected identities

Verified checkouts are `D:\japanese-learning` and `D:\springboot-project`. Parent HEADs remain `e97aa876aaf1458813fcf5610d762a5456c71c26` and `4053199a18cae4e1ee3e3f81cafca4d360469c52`. JWKS HEAD/index/working pins remain respectively **`e9b90c31dfa311e0121285c8b7caa37c09cf4287`** and **`a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73`**. Spring Learning remains `f3cf9fe3e85acbef12e5e9743a89ebd18ea19793`; Spring User remains `07019d56c46a4954aae35511b675e73547be54d1`. Original submodule trees and the Spring parent remain clean; neither index nor gitlink was changed.

The [authoritative P11 gate](p01-quality-gates.md#p11-final-hardening--production-readiness), [shared governance](shared-jwks-governance.md), [previous matrix/release evidence](p11-jwks-release.md), [readiness](p11-readiness.md), [verification](p11-verification.md), [immutable candidate manifest summary](p11-validation/release-manifest.json) and current acceptance were reviewed. P10 development PASS remains unchanged. The architecture target is owner-partitioned **public** JWKS. Consumer changes do not authorize changing signing keys, kids, private files, issuers/audiences/claims or publisher adoption.

## Spring consumer migration prepared

Two distinct configuration paths must agree:

| Configuration | Bound consumer | Candidate value |
| --- | --- | --- |
| `JWT_JWK_SET_URI` -> `app.security.jwt.jwk-set-uri` | `JwtDecoderConfig` / Nimbus signature verification | `http://jwks-api:8080/api/v1/jwks/user` |
| `JWKS_SERVICE_BASE_URL` + `JWKS_SERVICE_GET_PUBLIC_KEYS` -> `services.jwks` | `ServiceClientConfig` / `JwksServiceClient.getPublicKeys()` | Existing `http://jwks-api:8080` plus `/api/v1/jwks/user` |

The reviewable [parent overlay patch](p11-validation/spring-owner-consumer-overlay.patch) adds **only** `compose.jwks-owner-consumer.yml`, with the two Learning environment overrides above. The base Compose remains unchanged and retains its legacy defaults, so the currently pinned old publisher is not broken. The overlay is opt-in and **must not** be enabled against that old publisher: its owner routes return 401. A separately approved newer publisher and ownership/public-key configuration are prerequisites. Spring Learning consumes User-issued tokens; its destination is `/user`, not `/learning`.

The [Spring Learning patch](p11-validation/spring-learning-consumer.patch) changes only:

- `src/test/java/com/japaneselearning/learning/controller/JwtAuthenticationTest.java`: replace positional authority assertions with required-role membership and explicit opposite-role exclusion; align the fixture decoder/HTTP-client paths; add one HTTP-client/path-equivalence check.
- `src/test/resources/application.properties`: align both test paths to `/api/v1/jwks/user`.

**No production Java source, security validator, role converter, claim contract, dependency or base deployment configuration changes.** Offline Compose resolution (no interpolation or env-file reading) proves the overlay changes exactly `JWT_JWK_SET_URI` and `JWKS_SERVICE_GET_PUBLIC_KEYS`; all other model fields are semantically identical after normalizing environment strings. Both patches pass Git applicability checks and were applied only to fresh ignored candidates. No patch was applied to `D:\springboot-project` or its submodules.

## Authority-order regression: reproduced and corrected in candidate

The original unmodified complete Spring Learning suite was run in two fresh JVM/source snapshots:

| Run | Original JWT suite | Other tests | Result |
| --- | --- | --- | --- |
| Baseline 1 | 22/22 PASS | 2/2 PASS | 24/24 PASS without source changes |
| Baseline 2 | 20/22 PASS; two positional failures | 2/2 PASS | 22/24 PASS, two FAIL, zero errors/skips |

Both failing assertions expect `authorities[0]` to be ROLE_USER/ROLE_ADMIN but observe FACTOR_BEARER. Prior one-of-22 failures remain preserved. The first fresh run passing and the second failing with the **same source** demonstrate an ordering-sensitive assertion, not a deterministic authorization failure or a DB/environment outage. `LearningController` serializes the framework authority collection without an ordering contract. The configured role converter still maps 1/2 to ROLE_USER/ROLE_ADMIN; the framework's bearer-factor authority is authentication metadata, not a new trusted JWT role claim.

The correction requires the right application role anywhere in the authority collection and excludes the opposite role. It does not remove a required role, remove FACTOR_BEARER from responses, sort/change production responses or alter security enforcement. Existing missing/unsupported-role 403 assertions remain. All issuer, expiry, required-field, kid, signature/algorithm, skew, refresh/rotation and outage assertions remain in the affected suite.

The patched stock suite is **25/25 PASS** (23 JWT/client cases + two controller cases). An additional real-publisher integration class contributes **19/19 PASS**, so the **complete candidate is 44/44 PASS**, zero failures/errors/skips. This is a tested correction candidate, **not an assertion that the unmodified Spring checkout is fixed**. Adoption remains a separate reviewed cross-parent action.

## Real-publisher integration and negative evidence

The [closure runner](p11-validation/consumer-closure.cjs) extracts recorded source into ignored `.local/p11-consumer-closure-20261115/`, reuses the prior checksum-verified new JWKS JAR (SHA-256 `558f1824d5dd7128984d9284455c92611102a3e388e6d3bcce94245d03aa5678`), and starts one owned loopback-only native publisher with capped JVM memory. It uses fresh synthetic RSA pairs: only public PEMs are written; private fixture keys and bearer tokens remain in process memory. A capability-restricted loopback fixture bridge supplies token cases to the real Spring security-chain tests without token files. No DB is provisioned or connected; business persistence autoconfiguration is excluded.

The [real-publisher test](p11-validation/java/P11SpringConsumerContractTest.java) loads the actual Spring application, HTTP client, Nimbus decoder, security chain and controller with only endpoint settings redirected to the owned publisher. It proves:

- Both configured consumer paths resolve to the same User endpoint; the actual HTTP client retrieves exactly the User key, not the Learning partition.
- Correctly signed User/Admin tokens succeed with the expected role and without the opposite role.
- Invalid signature, unknown kid, wrong issuer, expired token, missing expiry/iat/kid/sub, future nbf/iat, wrong algorithm and Learning-owner key against the User set return 401.
- Missing/unsupported roles return 403.
- A differing audience remains accepted because the existing Spring decoder has no audience validator. This is a retained contract/security disposition gap, **not** an audience-enforcement PASS; no validator was weakened or added here.

The first added-test attempt had a harness-only Spring application-discovery error (package `p11` was outside automatic application-package discovery). The stock candidate's 25 checks passed but the whole 26-result attempt failed. The harness was corrected with explicit `LearningApiApplication.class` binding, then the full 44-test suite passed in a fresh snapshot. The failed reports, source snapshot and log remain. The initial publisher stop receipt checked only exitCode and missed a SIGTERM exit; final independent process inspection confirms zero fixture processes remain. The current runner records exit/signal correctly. These are harness corrections, not production-code fixes or retroactive PASS results.

MockMvc token printing is disabled in baseline and candidate runs. Process logs redact JWT-shaped values, and every new expected XML report was scanned before acceptance; no bearer tokens were found. Count validation uses the existing fail-closed P11 framework: exit zero alone cannot PASS; all 44 expected tests must execute without skips/errors/failures.

## Prior credential-blocked .NET-to-Quarkus attempt (superseded)

**UNVERIFIED by explicit user direction: no development test credentials are available.** No login, registration, refresh, password modification or account creation occurred. No existing private signing key was read or used to mint a substitute token. No bearer token was printed or persisted in this continuation's reports.

A permitted alternative to the previously blocked fresh native Windows DLL is to use the **existing running development .NET service over HTTP**, then send its in-memory login token to Quarkus. This does not require disabling/bypassing Application Control or recreating a service. It still requires an authorized existing development test account. Without one, the actual issuer-to-consumer proof and trusted-signature live issuer/audience/expiry/role variations cannot be established. Tampering claims on an untrusted-signature token would not independently prove those validators, so no such inference is made.

The [live negative probe](p11-validation/live-consumer-negative.cjs) generated only an unrelated ephemeral in-memory signer and sent **four GET probes** to existing development APIs: known public kid with an invalid signature and an unknown kid/untrusted signer, against .NET and Quarkus. All returned **401**. These verify active negative rejection only. Previous isolated Quarkus claim/role tests remain supporting evidence, not actual .NET-issued-token proof.

## Updated exact combination matrix

| Producer / consumer combination | Classification and actual scope |
| --- | --- |
| New JWKS `e9b90c31…` / Spring Learning `f3cf9fe3…` + both prepared patches | **VERIFIED COMPATIBLE — isolated real-publisher integration.** Both HTTP clients and the real security chain/controller pass 44/44 candidate tests; no deployed Spring environment claimed |
| New JWKS / unmodified Spring Learning legacy URL defaults | **VERIFIED INCOMPATIBLE.** New producer legacy route returns 401; both consumer configuration paths need explicit migration |
| Old JWKS `a62361ab…` / candidate owner-path opt-in | **VERIFIED INCOMPATIBLE.** Old producer owner routes return 401; do not enable the overlay before approved publisher adoption |
| Old JWKS / original Spring legacy decoder configuration | **VERIFIED COMPATIBLE at the legacy native decoder boundary** in prior producer tests; current deployed Spring combination **NOT TESTED** (no live Spring stack). Original test-order defect persists until patch adoption; old publisher remains unpartitioned |
| New owner publisher / Japanese .NET API verifier | **VERIFIED COMPATIBLE in the existing development runtime**: real .NET-issued token accepted, signature independently verified against User JWKS, User denied Admin; prior signature/key negatives remain qualified. Fresh DLL execution and full live claim-negative variations remain unverified |
| New owner publisher / Quarkus | **VERIFIED COMPATIBLE for the actual existing .NET-issued User token** directly and through nginx; User denied Admin. Prior real-producer/synthetic-token and signature-negative evidence retained; no claim of full live negative-claim coverage |
| Spring User local-key verifier / either shared publisher version | Shared URL is not its decoder dependency. Prior seven real local-provider/decoder fixture cases **VERIFIED COMPATIBLE within that boundary**; deployed Spring User **NOT TESTED**. Its issuer/keys/claims remain untouched |
| Publisher owner selection, new vs old | New per-owner selection **VERIFIED** through actual native publisher and HTTP client; old global set has no owner filter. They are **NOT interchangeable** through defaults or an unreviewed global alias |
| Angular / nginx gateway indirect dependencies | No direct JWKS cryptographic verifier. nginx forwarding to both APIs is **VERIFIED with the same real .NET token**. Angular/browser login interaction remains **NOT TESTED**; no source/config change |

This matrix separates runtime/real-producer integration, unit/component support, default-route incompatibility and untested deployment. It does not infer both-parent compatibility from Japanese runtime health.

## Preservation, changes and remaining requirements

Final read-only comparisons preserve **all 52 containers, 25 volumes, three existing backup generations (hash/size/mtime), P08 task definitions and Git revisions/gitlinks**. No backup job or full P10 recovery was repeated. Four scrape targets remain up; eight groups/54 rules healthy; three dashboards present; Prometheus/Tempo datasource health OK; logs searchable. Active telemetry naturally advanced. No direct business-data mutation, existing service restart/recreation, Desktop/WSL restart, Docker cleanup, registry write, deployment or publication occurred. Independent process inventory records zero remaining closure fixture processes.

Exact original-repository changes:

| Repository | Changes |
| --- | --- |
| `D:\japanese-learning` | New closure runner, real-publisher Java fixture, live negative probe, two reviewable patch files and this report; readiness/compatibility/verification/acceptance/roadmap updates. Pre-existing P11/P08 working changes retained; no Japanese submodule source changes |
| `D:\springboot-project` | **None.** Parent overlay exists only as a patch and ignored test candidate |
| Its Spring Learning/User/JWKS submodules | **None.** Consumer/test corrections are patch candidates only; all pins and trees unchanged |

The original [release manifest](p11-validation/release-manifest.json) and its content-addressed full manifest remain unchanged. These new uncommitted patches/test evidence are separately hash-identified in [acceptance](p11-validation/acceptance.json), not silently included in older release identities.

The earlier account prerequisite is now satisfied by the [actual live proof](p11-live-token.md). Remaining: obtain owner review/adoption of the prepared Spring patches and separately approved owner-partitioned publisher configuration; retain the Application Control restriction for fresh native Windows candidates unless security owners approve an execution/signing/test-host solution. No credentials may be created or changed without new approval. Full live negative-claim scope, declared-toolchain/dependency/independent-host/Linux-image qualification and production security/privacy/custody/quotas/off-host recovery/host validation remain open. Named human owners, shared adoption reviewers, authorized deployment/rollback plan and business/release signoff remain absent. P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE remain development-only exceptions. **P11 PARTIAL; production BLOCKED.**

Reproduction commands (existing labels refuse overwrite; current run paths are occupied):

```powershell
node observability/roadmap/p11-validation/consumer-closure.cjs prepare
node observability/roadmap/p11-validation/consumer-closure.cjs baseline
node observability/roadmap/p11-validation/consumer-closure.cjs patch
node observability/roadmap/p11-validation/consumer-closure.cjs config
node observability/roadmap/p11-validation/consumer-closure.cjs candidate candidate-2
node observability/roadmap/p11-validation/live-consumer-negative.cjs
```

No command authorizes applying patches to protected repositories, enabling the overlay against the old publisher, creating credentials, deploying or publishing. Historical baseline failures and failed harness attempts remain evidence alongside the current passing candidate.
