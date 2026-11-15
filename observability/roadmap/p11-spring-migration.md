# P11 Spring consumer source migration — 2026-11-15

**P11 PARTIAL; production acceptance BLOCKED; progress 11/12.** P10 development PASS remains valid. This report supersedes earlier candidate-only/adoption-pending statements for source adoption only. No configuration was deployed, no publisher was upgraded, and no Git commit, push or merge occurred.

## Actual Spring changes

Both retained patches passed `git apply --check` against clean checkouts before application. The installed files match the previously verified candidate after line-ending normalization. Parent/index/gitlinks and all 28 Learning production source files remain unchanged.

| Repository / exact file | Change |
| --- | --- |
| Spring parent `compose.jwks-owner-consumer.yml` | New opt-in overlay sets `JWT_JWK_SET_URI=http://jwks-api:8080/api/v1/jwks/user` and `JWKS_SERVICE_GET_PUBLIC_KEYS=/api/v1/jwks/user` |
| Learning `src/test/java/com/japaneselearning/learning/controller/JwtAuthenticationTest.java` | Owner-route fixtures, both client-path equivalence check, expected-role membership and opposite-role exclusion |
| Learning `src/test/resources/application.properties` | Both isolated test JWKS paths use `/api/v1/jwks/user` |

The existing production configuration already supports environment overrides for both paths. The base Compose model remains legacy-compatible; this new filename is not automatically loaded. Offline comparison with `docker compose ... config --no-interpolate --no-env-resolution --no-path-resolution --format json` confirms exactly those two semantic field changes. Do **not** activate this overlay against the currently pinned old publisher. A coordinated, independently approved owner-publisher adoption and deployment remains necessary. No keys, kids, issuer, audience, claims, expiration, role converter or production authorization logic changed.

The authority failure was an ordering-sensitive assertion: Spring's authentication-factor authority can precede the application role. There is no collection-order contract. The corrected assertions require the proper role and reject the opposite application role; production responses are not filtered or sorted. The full affected actual-checkout suite passes, rather than just the previously failing assertion.

## Revision and compatibility matrix

Japanese parent remains `e97aa876aaf1458813fcf5610d762a5456c71c26`; Spring parent remains `4053199a18cae4e1ee3e3f81cafca4d360469c52`. Japanese JWKS is **`e9b90c31dfa311e0121285c8b7caa37c09cf4287`**, Spring JWKS is **`a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73`**. These are substantive contract differences, not just a version label. The former partitions public RSA keys by USER/LEARNING at `/api/v1/jwks/{owner}`; the latter publishes a global set at `/.well-known/jwks.json` with private/public key-pair configuration. Public JWK fields/RS256 remain compatible. No parent pointer was synchronized.

| Producer / consumer combination | Evidence / status |
| --- | --- |
| New Japanese JWKS → .NET `bbbab2f4dc80c0275152d4bf008f52b75c5778d6` | Verified compatible in existing development runtime; unchanged issuer `JapaneseLearning.User` / audience `JapaneseLearning` |
| Same .NET actual token → Quarkus `e3836080a3214ff029d81e0676e6bb925ab4a1c5` | Verified live compatible; direct/gateway acceptance and User-to-Admin denial retained |
| New publisher → Spring User `07019d56c46a4954aae35511b675e73547be54d1` | Isolated provider/decoder evidence retained; fresh auth/refresh unit suite passes; deployed owner-publisher adoption not tested |
| New publisher → migrated Spring Learning `f3cf9fe3e85acbef12e5e9743a89ebd18ea19793` plus exact test patch / opt-in overlay | Isolated actual-publisher/security-chain candidate 44/44 retained; installed content matches; actual checkout 25/25; deployment not tested |
| Old Spring publisher → unchanged legacy base consumers | Legacy configuration retained; no running Spring rollout performed |
| Old publisher → owner overlay; new publisher → legacy route | Verified incompatible route combinations in retained contract evidence; prevent mixed rollout |
| Spring issuer → Japanese .NET/Quarkus consumers | Different issuer/role contract; cross-issuer acceptance is not supported or claimed |
| Angular `7d25cfe4830da3856661f7449260e9027c596afb` / nginx gateway | Indirect dependency only; retained authenticated gateway proof valid, browser regression not rerun |

Spring keeps issuer `japaneselearning-user-service` and numeric role mapping unchanged. Its existing lack of audience enforcement remains a security disposition, not a successful wrong-audience rejection claim. Unit tests alone do not establish deployed compatibility. Full live trusted-signature negative claim variants remain unverified; isolated positive/negative coverage is documented in [consumer closure](p11-consumer-closure.md). [Actual token proof](p11-live-token.md) was reused because the Japanese source/runtime contracts were unchanged; no new login or credential read occurred.

## Executed regression

Commands: `node observability/roadmap/p11-validation/spring-regression.cjs learning|user|quarkus`, and `... jwks user-context`; each invokes offline Maven tests with a bounded JVM and disabled MockMvc response printing. Tests are verified from fresh XML reports, not exit codes alone.

| Service / check | Actual result this continuation |
| --- | --- |
| Spring Learning complete affected suite | **25/25 PASS**, 23 JWT/client plus two controller tests; zero failures/errors/skips |
| Spring User complete existing unit suite | **26/26 PASS**, 16 authentication plus ten refresh-token tests |
| New JWKS key/endpoint/listener suite | **21/21 PASS**; sandbox wrapper initially failed before tests, preserved; user-context retry passes |
| Quarkus JWT authentication/authorization | **21/21 PASS** |
| .NET selected authentication/security/logging | **NOT PASS / environment blocked**: restored run executes 79, passes 14, fails 65; Application Control `0x800711C7` blocks Domain DLL and causes discovery errors; expected 81 not met |
| .NET initial no-restore attempt | Exit 0 with no reports/tests; rejected, preserved; missing test assets diagnosed and restored on retry |
| Existing real-token / gateway checks | Prior six authenticated acceptance/role-denial checks retained PASS; not repeated |

The .NET restriction was not bypassed or disabled. Required fresh .NET regression remains open despite prior selected 81-test evidence. Existing isolated owner/incorrect-signature/kid/issuer/expiry/role results remain supporting evidence; the fresh Java cohorts and source equivalence do not expand their scope.

## Release candidate and integrity

`spring-release.cjs build a` and `build b` build isolated Git archives plus the exact working test diff, with recorded commit timestamp and offline Maven `package -DskipTests`. Tests passed separately on installed source. Both produce the same **66,322,391-byte** `learning-api-0.0.1-SNAPSHOT.jar`:

`a0314c68cd015789707ed84f443e46244a86f697c1b218d51a7c8f95ffdb69bd`

Independent PowerShell `Get-FileHash -Algorithm SHA256` verifies both artifacts. Base source archive SHA-256 is `40756fe1195797655c37631f79bb7067a21853dcd447d285944ad64618d69c86`; test patch SHA-256 is `43755010b011e510c076b31135226e9afa377cce33b3d9b83378fb05e900900f`. The opt-in overlay SHA-256 is `61499e890f664b08d382698e4286887fdf4918b369d038845bc2b8b9315a3e38`. This is an identified **uncommitted** local candidate, not an approved immutable production release.

[New release manifest summary](p11-validation/spring-release-manifest.json) references the create-only content-addressed full manifest SHA-256 `93b6a61989c0a1a5e4bb6d0c25ff2de05a6f459c7ed2652fc7ba75e8009aff73`. Original [release manifest](p11-validation/release-manifest.json) is untouched. JDK 17.0.20.1, existing Maven wrapper 3.10.0 and cached dependencies were used. Same-host/cache reproducibility does not close unlocked dependencies, floating OCI bases/apt inputs, missing independent-host/Linux image qualification, npm/toolchain mismatch, signed artifact custody or deployed-image equivalence. Prior release evidence retains other toolchain versions.

## Preservation, evidence and outstanding gates

Private evidence is under ignored `.local/p11-spring-adoption-20261115/`: `adoption.json`, fresh regression JSON/logs, `compose.json`, build receipts, independent hashes, content-addressed manifest and `technical.json`. The prior acceptance bytes are archived create-only as `acceptance-before-0efc57a2bf989b6d5a53bcc00c6dcb99c193b0b9ab4cdca883db17c435a16ade.json`. No historical manifest, immutable receipt or P10 recovery result was rewritten. No bearer token or credential is included.

`technical.cjs live` passes targets, 54 rules (none firing), three dashboards/datasources, searchable logs, public USER keys, empty LEARNING keys, unknown owner404 and malformed-token401 at both APIs. `technical.cjs finish` confirms **all 52 containers / 25 volumes / three original encrypted backups / task definitions / revisions unchanged**, with zero added backups. Telemetry continues to advance normally. No backup/recovery drill, Docker/WSL restart, service recreation or cleanup occurred.

Remaining technical findings: fresh .NET policy-approved execution; full release/OCI qualification; deployed Spring owner-consumer validation after separately reviewed publisher adoption; existing audience/security dispositions and remaining full regression gaps. No approved security exception is inferred. Existing P07/P08 local development exceptions and P10 loss/recovery boundaries remain unchanged.

Production remains blocked on authoritative P11 host/TLS/capacity/ingestion/alert acceptance, access/certificate/key custody owners, independent shared-component reviews and coordinated adoption, approved rollback and compatible-reader execution, off-host backup/recovery/retention evidence, critical-risk disposition and named business/production signoffs. Those owners/approvers are not supplied; no names or signoffs are invented.

Git changes: Spring has exactly the three files listed above, represented by one new parent overlay and a dirty Learning submodule at the unchanged pin. Japanese has new P11 adoption/regression/build/evidence utilities, this report and manifest summary, updated readiness/verification/compatibility/acceptance/roadmap references; earlier `.gitignore`, P08 fix/evidence and P11 preparation changes remain present. Neither repository is committed, staged by this work, pushed or merged.
