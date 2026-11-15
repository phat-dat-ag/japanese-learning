## Current Spring source migration — 2026-11-15

**P11 PARTIAL; production BLOCKED; 11/12.** [Spring migration and regression](p11-spring-migration.md) now records actual source adoption: opt-in two-path owner overlay, test-only order correction, unchanged pins and inactive rollout. Fresh Learning 25/25, User 26/26, JWKS 21/21 and Quarkus 21/21 pass. Fresh .NET is NOT PASS: Application Control blocks the Domain DLL (14 passed, 65 failed; discovery errors, expected 81 not met). Existing real-token/gateway proof remains valid without another login. Two Learning builds match and independent hashes pass; [candidate manifest](p11-validation/spring-release-manifest.json) identifies the uncommitted source and artifacts. All 52 containers, 25 volumes, three backups, schedules and revisions are preserved. Production/shared-publisher adoption and remaining authoritative gates stay open. Earlier statements below are historical and are superseded within this explicit scope.

# P11 JWKS compatibility and reproducible candidate artifacts

## Current live issuer-to-consumer result

[Real development .NET token -> Quarkus proof](p11-live-token.md) is **PASS** using the user-provided ignored credential file. Direct and gateway positive requests succeeded; both APIs denied the genuine User token Admin access. Credentials/keys/claims stayed unchanged, no tokens were persisted, and only the new refresh session was logged out. Prior credential-blocked and native Application Control findings below remain historical/appropriately scoped; fresh DLL execution and unexecuted live negative-claim variants are not promoted to PASS. P11 remains PARTIAL, production BLOCKED, 11/12.

## Consumer-closure update before credential provision

[Consumer closure](p11-consumer-closure.md) supersedes the earlier open Spring-regression finding **for the tested candidate only**: source-identical fresh JVMs reproduced the authority-order issue, two consumer-path patches were prepared, and the complete candidate passes 44/44 tests against the real newer publisher. Both protected Spring checkouts remain unchanged; no patch/publisher adoption or deployment occurred. Four live negative probes returned 401. The user confirms no development credentials and forbids account/credential creation without approval, so actual development .NET-issued-token-to-Quarkus proof remains UNVERIFIED. Previous native Application Control restrictions and historical failures remain recorded. P11 PARTIAL; production BLOCKED; 11/12.

**P11 PARTIAL; production acceptance BLOCKED; 11/12 phases complete.** Authority: user instruction “P11 — JWKS Compatibility and Reproducible Release Artifacts.” [P01 P11 gate](p01-quality-gates.md#p11-final-hardening--production-readiness) still requires complete regression, immutable release identities, host validation, ownership and business signoff. This continuation builds/tests isolated committed snapshots; it does not deploy or modify authentication contracts. P10 development acceptance and historical receipts remain unchanged.

## Fresh identities and contract differences

`C:\Personal\springboot-project` is **not accessible/present**. The known accessible fallback is `D:\springboot-project`; evidence below applies to that checkout, not an assumed C: copy. Root HEADs are Japanese `e97aa876aaf1458813fcf5610d762a5456c71c26` and Spring `4053199a18cae4e1ee3e3f81cafca4d360469c52`. Both shared submodule trees and the Spring parent remain clean. Japanese root retains its existing P11 working changes; no branch, gitlink or shared source changed.

| Contract | Japanese JWKS pin | Accessible Spring JWKS pin |
| --- | --- | --- |
| HEAD/index/working SHA | `e9b90c31dfa311e0121285c8b7caa37c09cf4287` | `a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73` |
| Supported public routes | `/api/v1/jwks/user`, `/api/v1/jwks/learning` | `/.well-known/jwks.json` |
| Other routes, actual isolated fixture | Unknown owner 404; legacy route 401 | Owner routes 401 through authenticated fallback |
| Ownership/publication | Required USER/LEARNING per key; route filters publication by owner | No owner field/filter; publishes every configured key |
| Required key configuration | `kid`, public-key path, owner; shared service needs no private key | Matching private/public pair, kid, active flag; exactly one active |
| Wire format | Same six public JWK fields: kty, use, alg, kid, n, e; RSA/RS256 | Same fields and algorithm; DTO source unchanged |
| Key identifiers | Configured kid preserved, globally unique; no automatic rename | Configured kid preserved, unique; no automatic rename |
| Cache | `max-age=300, public` | Same |
| Claim verification | Key publisher does not validate consumer JWT issuer/audience | Same distinction |

These pins differ in **39 files**, including route, configuration, ownership and observability behavior; this is not a version-only difference. Current Japanese development public kids are `jp-user-1`, `jp-user-2`, `jp-user-3`; Learning returns no keys. The Spring deployment's current configured kids and deployed image identity are NOT VERIFIED: no corresponding live Spring stack is present in the protected inventory. No existing key file was opened for this comparison. Synthetic fixtures use unrelated `p11-user`/`p11-learning` identifiers and fresh RSA pairs; no existing private material was copied or changed.

## Consumer compatibility matrix

Compatibility below is qualified by **current consumer configuration**. A matching JWK wire format does not make different URLs, issuers, key custody or role conventions interchangeable.

| Known consumer | Trust and token expectations | New pin `e9b90c3` | Old pin `a62361a` | Actual evidence |
| --- | --- | --- | --- | --- |
| Japanese .NET User issuer/API verifier (`bbbab2f4…`) | Issues RS256 with active local private key; verifies remote `/api/v1/jwks/user`; issuer `JapaneseLearning.User`, audience `JapaneseLearning`, zero skew, required expiry; User/Admin roles | Correct configured route/key-owner contract | Default configured route returns 401; not a drop-in downgrade | 81 original security/logging checks PASS; extended real-producer cohort BLOCKED by Application Control (0/8 executed) |
| Japanese Quarkus verifier (`e3836080…`) | RS256, same User route/issuer/audience; User/Admin roles; cached JWKS, no issuer discovery | Correct; real producer positive/negative checks PASS | Default owner route returns 401; global endpoint cannot supply equivalent owner isolation | 21 original JWT checks plus eight actual-producer security HTTP cases PASS; test services replace DB operations |
| Spring Learning verifier and JWKS HTTP-client configuration (`f3cf9fe3…`) | Legacy global route; issuer `japaneselearning-user-service`; RS256, expiry/iat/sub/kid validation, 60s skew; role 1/2 maps to ROLE_USER/ROLE_ADMIN; no audience validator in inspected decoder | Requires owner-aware key configuration and **both** JWK-set URI and HTTP-client path migration to `/user`; nine-case decoder fixture proves cryptographic compatibility after explicit URL configuration | Correct configured route; legacy global set lacks owner partitioning | Nine real-producer decoder cases PASS; original 22-case API suite has one role-array-order failure per attempt |
| Spring User issuer/local verifier (`07019d56…`) | Own RSA key provider and private signing selection; RS256 and Spring issuer; local public-key set, not remote shared JWKS; no audience validator in inspected decoder | Local verifier independent of shared route; publisher deployment still needs new configuration | Local verifier independent of shared route | Seven real decoder/key-provider cases PASS; no DB or Spring deployment |
| Japanese Angular (`7d25cfe4…`) | Forwards bearer token and uses client session/role state; no JWKS cryptographic verifier | Depends on server APIs; no direct shared-route dependency | Same indirect dependency, not proof that APIs support old routes | Clean production bundle built twice; no browser or full frontend regression claim |
| Japanese nginx gateway | Forwards requests/headers; no JWT verifier | Depends on API enforcement | Same | Source inspection; no gateway configuration change |

Spring User also retains its own `/.well-known/jwks.json` controller in source; this is separate from the shared service and is not the configured Spring Learning fallback. Do not accidentally change which publisher a consumer trusts. Japanese roles are strings User/Admin; Spring's issuer/consumer uses numeric role 1/2 and its own issuer. There is no cross-project token-trust approval.

## Targeted tests and actual boundaries

All producer and consumer fixtures are loopback-only native processes or framework test hosts under ignored `.local/p11-rc-20261115/`. Source snapshots come from recorded Git revisions. Test-only source overlays live only in those snapshots; original submodules remain unchanged. Fresh fixture keys and tokens remain private and are unrelated to deployed signing material. Consumer tests use real authentication/decoder code with offline DB doubles or no database context. No business account, DB content or existing key was used.

| Check | Result |
| --- | --- |
| Both compiled JWKS producers, eight route/version combinations | PASS; new User/Learning each publishes only its exact expected key; old global publishes both fixture keys; public modulus/exponent/fields, key IDs and cache checked in memory |
| Existing .NET selected security/auth/logging suite | **81/81 PASS**, zero skipped, before the later extended assembly was blocked; includes issuance/validation/refresh/outage coverage from existing fixtures |
| Existing Quarkus JWT suite | **21/21 PASS**, zero skipped; positive roles, malformed/expired/wrong issuer/audience/signature/kid/algorithm and cache/outage behavior |
| Existing new-JWKS endpoint/key/listener suite | **21/21 PASS**: one endpoint, 17 key-provider, three listener cases |
| Existing new-JWKS privacy/logging/tracing suite | **38/38 PASS** across seven additional classes; no repeats of the 21 key/endpoint/listener cases |
| Existing Quarkus privacy/tracing/JWKS-correlation suite | **14/14 PASS** across five additional classes; no repeat of the 21 JWT cases |
| Extended Quarkus with real newly compiled owner-scoped producer | **8/8 PASS**: valid, malformed, expired, wrong issuer, wrong audience, unknown kid, wrong signature, Learning-owner key against User endpoint |
| Extended Spring Learning against real old/new producers | **9/9 PASS** against unchanged decoder; correct issuer tokens accepted; wrong issuer/expiry/kid/signature rejected; Learning-key token rejected by new User endpoint but accepted by old unpartitioned global set |
| Extended Spring User local key provider/decoder | **7/7 PASS**: valid, issuer, expiry, kid, signature, different owner key, audience boundary |
| Wrong audience in both Spring decoders | **Observed ACCEPT**, matching current absence of audience validators; this is a documented security/contract gap, not an audience-enforcement PASS |
| Existing Spring Learning complete selected API suite | **FAIL: 21/22 PASS, one failure** in each of two retained attempts. Positive JWT response is 200 and contains the correct ROLE_USER/ROLE_ADMIN alongside FACTOR_BEARER; positional `authorities[0]` assertion fails (different role case between attempts). No source/assertion was weakened |
| Native freshly published .NET application | **NOT VERIFIED/BLOCKED**: Windows Application Control denies DLL load, `0x800711C7`; policy unchanged |
| Extended real-producer .NET component cohort / actual .NET-issued token -> Quarkus | **NOT VERIFIED/BLOCKED**: extended test DLL also denied; VSTest exits 0 but executes **0/8** tests. No actual .NET-issued token was produced for the cross-service fixture; Quarkus's extended positive case uses the synthetic issuer token |

The first extended aggregate driver incorrectly trusted native exit zero and emitted PASS. Its raw private receipt is retained unchanged. [Independent count verification](p11-validation/verify-compatibility.cjs) rejects it: expected nonzero test cohorts must execute with no skips/errors/failures. `.local/p11-rc-20261115/compatibility-count-validation.json` is **PARTIAL**, superseding that exit-only aggregate. The driver now uses the same fail-closed [count validator](p11-validation/test-results.cjs); two regression tests PASS for zero/missing/incomplete/skipped/failed/error reports. This post-run guard correction is not misrepresented as code loaded during the already-completed fixture.

Spring Learning's role response/test mismatch requires its owner's disposition: clients should not depend on collection position; determine whether FACTOR_BEARER belongs in the public response contract, then review a stable response or membership-based assertion without weakening role/authorization checks. That is not silently fixed in another parent. Completing the blocked .NET cohort needs a security-approved executable/build-signing or test-host solution; do not disable or evade Application Control. Original 81-test evidence does not substitute for the missing extended producer/issuer-to-consumer proof.

## Backward-compatible migration proposal — not implemented

No upgrade is necessary merely to keep each existing parent on its own pin. For a future coordinated shared-service adoption:

1. Both parent/security owners inventory each legacy kid's actual issuer, public component identity, consumers and custody. Do not infer signing ownership from the name of the API consuming a token: **Spring Learning consumes User-issued tokens, so its destination is `/user`, not `/learning`**. Preserve all existing kids, signing keys, active issuer selection, issuers and audiences.
2. Validate the new publisher with public-only read-only mounts and explicit USER ownership for the Spring User issuer's public keys. Keep Spring User's own private key loader unchanged. Run a separate candidate alongside the old publisher; keep current consumers/legacy endpoint working until reviewed cutover. No deployment of that parallel service is authorized here.
3. Migrate Spring Learning's JWK-set URI **and** HTTP-client route together, retain its existing trusted issuer, and test cold/warm cache, rotation, unavailable JWKS, malformed/expired/wrong issuer/kid/signature/owner and permission cases. Japanese consumer URLs already use the new API and must not be repointed to Spring's unrelated signing trust.
4. If a compatibility alias is proposed, it may map the legacy URL to the User set only after owners prove that this exactly preserves its approved legacy key set/trust boundary. Do not publish a User+Learning union or silently drop legacy keys to make a migration appear compatible. Mixed/unknown legacy ownership requires an explicit consumer migration plan, not a universal alias.
5. Resolve Spring's existing role-response regression and .NET execution blocker. Any audience enforcement or claim/role change is a separately approved issuer-and-consumer contract migration: existing Spring tokens need not contain an audience. Do not bundle it into a route upgrade.
6. Require both independent consumer matrices, immutable candidate identities, both owner reviews and independent adoption/rollback decisions under [JWKS governance](shared-jwks-governance.md). Keep old image/config and compatible public key sets for rollback; never restore/regenerate signing keys or data as observability rollback. No automatic gitlink update, alias or contract edit was performed.

## Reproducible artifact results

The [release manifest summary](p11-validation/release-manifest.json) identifies the create-only, content-addressed full manifest under ignored `.local/p11-rc-20261115/release-manifest-<SHA256>.json`. That full manifest includes every candidate file SHA-256, source archive, Git revision, command, toolchain and resolved dependency evidence. It is locally reviewable and checksum-pinned; it is not signed, WORM-protected or published to a registry.

Eight Git source archives (root, four Japanese submodules, old JWKS, Spring Learning/User) were generated twice independently with identical SHA-256. Builds ran in fresh A/B extraction directories, outside protected working trees. The root archive is exactly `e97aa876…`; uncommitted P11 wrapper/documentation/tool changes and later test overlays are **not** mislabelled as committed application release inputs.

| Component / recorded pin | Two-build result |
| --- | --- |
| .NET `bbbab2f4…` | **101/101 published files byte-identical** |
| Quarkus `e3836080…` | **254/254 fast-jar runtime files byte-identical** |
| Angular `7d25cfe4…` | **74/74 production distribution files byte-identical** |
| New JWKS `e9b90c31…` | Byte-identical executable JAR; SHA-256 `558f1824d5dd7128984d9284455c92611102a3e388e6d3bcce94245d03aa5678` |
| Old JWKS `a62361ab…` | Byte-identical executable JAR; SHA-256 `da1bfe34531c085e4314dce7ff73d2289a83c71767cc9a143cfda1782baa5c7f` |

All **862 candidate output files plus eight source archives** were independently SHA-256 verified using PowerShell Get-FileHash: **870 checked, zero mismatches**. The selected release candidate has 431 files; the other 431 are independent comparison outputs. .NET uses Release/CI build, explicit SourceRevisionId, canonical PathMap and no apphost/shared compilation. Maven uses each commit's timestamp as `project.build.outputTimestamp`; Quarkus OTLP build export remains false. Angular uses unchanged lockfile and production configuration. These are recorded build flags, not production source changes.

Actual toolchain: Node **24.20.0**, npm **11.19.0**, .NET SDK **9.0.317**, Temurin Java **17.0.20.1+1**, JWKS Maven wrapper **3.10.0**, Quarkus wrapper **3.9.16**. Angular's declared npm is **11.12.1**, so actual tooling differs from its declaration; same-host equality does not close that qualification gap. Angular core/build and lockfile integrity, 74 resolved .NET package identities/checksums, Maven wrapper URLs/checksum availability and Spring JAR dependency names are recorded in the manifests. Missing offline dependencies required approved public-registry resolution; initial network/PowerShell-quoting/offline failures are retained. No dependency was upgraded in source.

**Limits:** this proves same-host/same-cache clean-source binary reproducibility, not independent-host or empty-cache/offline rebuilds, native image behavior or Linux OCI-image reproducibility. No images were rebuilt/published. Shared JWKS Dockerfile base tags float and its Maven distribution has no pinned checksum; apt package resolution is not snapshot-pinned; .NET lacks a global SDK/package-lock pin; Maven resolution lacks a complete locked closure. Windows candidate execution has the policy blocker above. Final release approval also requires deciding how to record/adopt the current uncommitted P11 work; nothing was committed by this task.

## Preservation, remaining requirements and reproduction

Final before/after comparison preserves all **52 containers, 25 volumes, three backup generation hashes/size/mtime, P08 task definitions and parent/gitlink revisions**. No existing service lifecycle, Desktop/WSL restart, direct live-data mutation, backup job, registry mutation or shared-source edit occurred. Four scrape targets remain up, eight groups/54 rules healthy, three dashboards present, Prometheus/Tempo datasource health OK, current log search succeeds, invalid tokens still return 401. Selective live inspection confirms Japanese issuer/audience/JWKS settings match the matrix; no full environment dump occurred. Active telemetry naturally advanced; no claim of byte-identical live database/telemetry contents. No P10 full recovery repeated. New fixture processes were scoped to recorded owned PIDs and stopped; temporary inputs/artifacts remain ignored.

Remaining technical gates are full .NET extended execution/actual issuer-to-Quarkus proof, the Spring role-response regression, declared-toolchain/locked-input and independent build/image qualification, and full target-specific security/privacy/compatibility regression. Wrong-audience acceptance in the Spring stack requires explicit security/contract disposition. Production remains separately blocked on a named host and authorized validation/cutover/rollback plan, enforceable quotas, independent backup/key recovery, historical privacy/certificate/secret custody review, named human service/security/platform/data/incident owners, both shared-parent adoption reviewers, and business/release signoff. Logical roles are not named signatories; none is invented. Development exceptions P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE remain unchanged.

Key commands (each actual command/result is retained in private build/validation receipts):

```powershell
node observability/roadmap/p11-validation/release.cjs prepare
node observability/roadmap/p11-validation/release.cjs build <component> <fresh-a-or-b-label>
node observability/roadmap/p11-validation/release.cjs test <component> <built-label>
node observability/roadmap/p11-validation/release.cjs verify
node observability/roadmap/p11-validation/release.cjs independent-hashes
node observability/roadmap/p11-validation/compatibility.cjs compatibility-2 --skip-blocked-native
node observability/roadmap/p11-validation/verify-compatibility.cjs
node --test observability/roadmap/p11-validation/test-results.test.cjs
```

Do not rerun against existing labels or overwrite immutable receipts. The compatibility fixture must run after its producer builds and uses create-only private paths; overlays are not applied to original repositories. The preserved current run names are occupied. Count-verification exit **1** is the correct PARTIAL result. Builds need cache/registry and OS permission, adequate host memory and separately reviewed execution context; none of these commands authorizes production or policy changes.
