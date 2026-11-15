# P11 technical remediation — 2026-11-15 local

**P11 PARTIAL; production acceptance BLOCKED; 11/12 phases complete.** The Docker, failed-backup diagnostics and five P09 discrepancy investigations are resolved for the observed development environment. Historical strict byte mismatches remain reported, with proven dispositions. No historical manifest or acceptance was rewritten. [Current machine record](p11-validation/acceptance.json) contains hashes and private evidence references. P10 remains PASS for its approved development scope; no full recovery drill repeated.

## Docker availability and failure cause

The initial P11 review observed absent engine named pipes even with approved user-context access. The failed daily backup ran at **2026-11-14T22:05:15Z**, before Desktop backend process startup at **22:12:03Z**. Backend logs record **linux/wsl starting -> running at 22:12:17.201884Z**, with its API error cleared. A Windows User32 event records a prior power-off request at **15:29:49.859Z**; that corroborates a host lifecycle interruption, not a proven Docker crash. The exact trigger for later Desktop startup is not established. This agent did not launch, restart or reconfigure Desktop, WSL or any service.

Current approved user-context diagnostics: `desktop-linux` is the selected context at `npipe:////./pipe/dockerDesktopLinuxEngine`; Docker Desktop **4.99.0**, Engine **29.9.3**, Compose **5.7.0**, WSL2 `docker-desktop` running and WslService running. No Docker/Compose/WSL override environment variable names were present. The sandbox cannot read the user's Docker context/config and is denied the default pipe; that is a separate access boundary. Do not change contexts, global permissions or application credentials to bypass it. Approved read-only execution works.

The operational failure was backup execution while Desktop's Linux API was unavailable; StartWhenAvailable does not wait for Docker readiness. The task is an interactive desktop job, not an always-on service. No remaining engine intervention is required now. If it recurs, the operator must make Desktop available; a restart or schedule/trigger redesign needs separate approval. No retry loop, hidden startup or schedule change was added.

## Failed backup, confirmed defect and successful acquisition

The retained [failed receipt](p08-validation/evidence/local-backup-2a6f7a3136ca62a1abbedd900863e05f.json) fails at the **first `r.inventory()`**, before generation authentication, telemetry export or `backup.create`. The prerequisite command is Docker project container enumeration. There are no exported sources or package in that run; staging cleanup reports zero temporary removals and zero live/backup deletions. Its lock is released by the existing finally block. This failure did not replace or create an encrypted generation.

The daily task's 8-byte UTF-16 log was truncated at `{`. Investigation reproduced a second, independent defect in [Invoke-P08Local.ps1](../p08/Invoke-P08Local.ps1): Windows PowerShell 5.1 converts redirected native stderr into `NativeCommandError`. With global Stop, invocation terminated before complete diagnostics and before `exit $LASTEXITCODE`. Before the fix, a quiet native exit 7 propagated 7, but stderr plus exit 7 became 1. The actual failed Node process also returned 1, so its task result was correctly a failure, despite lost diagnostics.

The minimal fix resolves the executable under Stop, uses Continue only around native invocation, captures the native exit code, restores Stop in finally, and fails closed when no exit code exists. The original command, `--force`, working directory and private log path remain. Both backup and drill modes now preserve stdout/stderr and exact exit codes; stderr alone does not turn native success into failure. **Nine regression tests PASS**, including warning-success, stderr-failure, quiet-failure, both modes and missing executable. No encryption, retention, policy, credential, destination, key or schedule change occurred.

Both original encrypted generations authenticated against the existing key with file checksums, inventory/completeness and payload screening: **303 and 240 files**. The newer checkpoint was about **60,205 seconds old** when checked, within the local 24-hour RPO. Keys and decrypted payloads stayed in memory; no plaintext restore tree was created.

One actual existing P08 acquisition ran from **22:16:48.733Z to 22:19:54.617Z**, exit **0**, under unchanged policy. An authenticated retention dry-run with a one-hour horizon first established no existing expiry candidates. The normal runner then reported **zero deletions**. Its [receipt](p08-validation/evidence/local-backup-229585c66aadaca21030d0c983730dc6.json) records:

| Item | Actual |
| --- | --- |
| Generation | `p08-local-229585c66aadaca21030d0c983730dc6.enc` |
| Encrypted SHA-256 | `aadf215b8b2e0f59bf175d433b68f071066d235f46c407bde66c00263a39d074` |
| Package | 14,689,981 bytes; 676 authenticated files |
| Native acquisition | 5,771 logs; 2,625,684 metric samples; 642 traces |
| Configuration/state | Three dashboards; User/Vocabulary/JWKS offset databases |
| Independent package re-verification | PASS; newest recoverable timestamp `22:16:50.069Z`, age 268.141s at verification |
| Cleanup | 663 newly owned staging files; zero live/backup files deleted |

This was a direct execution of the existing acquisition runner, not a scheduled-task rerun. The task's last result **remains 1**; monthly last result remains 0. Both tasks are Ready and definition hashes remain unchanged. The next invocation is safe under existing exclusive-lock, authenticated/create-only packaging, bounded-budget and retention safeguards, provided Desktop is available and policy limits remain satisfied. It will still fail closed if Docker is unavailable; this review does not promise future execution success. No new restore/RTO, independent off-host recovery or production durability is claimed.

## Historical manifests and all five P09 discrepancies

The improved [classifier](p11-validation/manifest.cjs) separately reports EXACT, LINE_ENDINGS, CONTENT, MISSING and INVALID_PATH. It requires the expected SHA-256 for every line-ending reconstruction. No trimming of content or arbitrary semantic comparison can yield an exact PASS. [Tests](p11-validation/manifest.test.cjs) cover mixed trailing endings, uniform LF/CRLF, binary/content changes, removed lines, missing files and path escape. The reviewer still exits **1** when strict checkout-byte checks fail.

All **40 artifact paths** in the two originally failing manifests exist and are correctly rooted: **no missing files or incorrect paths**. P10's 11 entries have seven exact-byte matches and four LF/CRLF-only source differences. P09's 29 entries have 28 line-ending-only differences and one substantive current-file change: the intentionally evolving roadmap. All **12 P09 unchanged-reference configurations match exact bytes**, including dashboards, datasources, rules, root Compose and P08 core tools.

| Former unresolved artifact | Exact historical reconstruction / root cause | Acceptance impact and disposition |
| --- | --- | --- |
| `p09-validation/isolated.cjs` | LF body, final newline run `LF CRLF CRLF`; SHA-256 exactly equals manifest `44be67d3…`. Git's normalized P09 blob equals current normalized content | No source logic change; no P09 test invalidation. Keep original evidence and current source |
| `p09-validation/test-panels.cjs` | Same mixed trailing newline run; exact expected `a3f89007…`; current normalized content equals P09 Git blob | No query/assertion change; retain 63 native assertions and original acceptance |
| `p09-validation/verify-live.cjs` | Same mixed trailing newline run; exact expected `55074054…`; current normalized content equals P09 Git blob | No verifier logic change; retain historical result |
| `p09-implementation.md` | LF body, final newline run `LF CRLF`; exact expected `01b71c9e…`; normalized current equals P09 Git blob | Documentation line-ending difference only; no corrective content rewrite needed |
| `implementation-roadmap.md` | Git P09 version `1284a48` blob `4a19138900f352aee67d64fe0b61da63c5060eb4` is 9,521 LF bytes; converting its 77 newlines to CRLF gives **9,598 bytes** and exact historical hash `b7c2d2c…`. Current document contains that complete normalized body beneath later P10/P11 status entries | Expected later documentation evolution. Historical hash is explained; current bytes correctly differ. Do not delete later history or re-finalize P09 |

The first review's five “remaining differences” therefore were not five unexplained functional changes: four needed mixed-ending reconstruction, and the fifth needed its historical Git version. All five investigations are closed with exact-hash proofs. Immutable production release construction is still a separate gate: use the current reviewed Git/image/config identities and real build evidence, rather than declaring an old manifest equal to a newer checkout. No historical PASS was retroactively altered.

## JWKS two-parent compatibility assessment

| Parent | Root HEAD | HEAD/index/working JWKS pin |
| --- | --- | --- |
| Japanese | `e97aa876aaf1458813fcf5610d762a5456c71c26` | `e9b90c31dfa311e0121285c8b7caa37c09cf4287` |
| Spring Boot | `4053199a18cae4e1ee3e3f81cafca4d360469c52` | `a62361ab5a41fbd20f8f2f1e7ade1f57220a6a73` |

Both shared working trees and Spring Boot parent are clean; local refs do not establish remote freshness. The newer pin has **39 changed files**, including real API/configuration/security changes, not just a version label. The old controller exposes `/.well-known/jwks.json`; the new exposes `/api/v1/jwks/{owner}`, allows only User/Learning, returns 404 for unknown owners, and does not provide a compatible legacy route. The new key configuration removes private-key/active requirements and requires explicit OWNER with public-key paths; publication filters by owner. Both retain RSA/RS256 public JWK fields and five-minute public caching. DTO files are unchanged. New metrics/tracing dependencies/listeners are additional operational differences.

The JWKS service publishes keys; it does not validate consumer JWT issuer/audience claims. Consumers differ independently: Japanese .NET/Quarkus use the User route and enforce RS256, `JapaneseLearning.User` issuer and `JapaneseLearning` audience. Spring Learning still defaults to the legacy route with issuer `japaneselearning-user-service`, validates RS256/timestamps/required claims, and has no audience validator in the inspected decoder. Spring User builds its decoder from its own configured RSA keys and issuer. These configurations are compatible with their own pinned source contracts, **not interchangeable or proof of cross-project token trust**.

Japanese runtime returns three User keys, empty Learning keys, 404 for unknown owner, five-minute cache, and 401 for invalid tokens at both APIs. No valid token was minted with existing signing keys. Full valid/expired/wrong-issuer/cache-refresh/outage dual-consumer runtime testing remains NOT VERIFIED; no Spring Boot test deployment was started. No consumer or shared code, key, issuer, authentication behavior or gitlink changed.

**Automatic adoption is unsafe.** Upgrading Spring Boot to the Japanese pin would require both owner reviews, explicit per-key owner/public-only wiring and read-only mounts, coordinated Learning HTTP-client/JWK-set URI migration to the issuer's owner route, and independent JWT acceptance/rejection, cache/rotation/outage/privacy/listener tests. Keep existing signing keys, claims and issuance selection. Downgrading Japanese to the old pin would break its owner routes/configuration. Any coordinated migration is separately scoped under [shared governance](shared-jwks-governance.md); none is implemented here.

## Runtime, regression and preservation

- **52 existing containers and 25 volumes** retain identical before/after identity/image/start/restart/state/health/mount metadata during remediation. The 21 development services comprise 16 running services and five completed initializer/migration jobs, all jobs exit 0; all available Docker healthchecks are healthy. Fluent Bit, Collector and Tempo have no Docker healthcheck, so separate pipeline/datasource checks qualify their status.
- Four Prometheus targets up; eight rule groups/54 rules healthy; no firing rules at observation. Three expected Grafana dashboards remain; Prometheus and Tempo datasource checks return OK. No notification fault or external message was sent; fresh firing/resolution remains historical evidence only.
- Actual requests carrying two synthetic correlation markers were denied 401 and became searchable as one User and two Vocabulary records. This proves current API -> log collection -> OpenSearch query flow without creating business data. Actual metric and trace acquisition succeeded in the new backup; no new distributed-span-chain drill was performed.
- Ten live published bindings are loopback; deployed config-file label is exactly the root `docker-compose.yml`. Current immutable container image IDs are recorded privately. Rebuilt-source equivalence remains NOT VERIFIED.
- Original encrypted generations retain hash/size/mtime; task-definition hashes and Git/submodule revisions match before/after. Compared with the P10 finish receipt, all 52 IDs and 25 volume names remain, and task definitions match. Sixteen start times already differed at the new baseline after the external Desktop startup; they did not change during this remediation. Do not attribute uninterrupted uptime since P10 to this work.
- Regression: nine native-wrapper tests, three manifest-classification tests and eleven existing P08 package/security tests PASS (**23 total**). JavaScript syntax and final document link/whitespace/privacy-pattern checks are recorded in machine acceptance. Full security/compatibility regression and production-host checks are not replaced by these tests.

No unresolved local defect remains among the investigated Docker availability, wrapper or five P09 discrepancies. Operational dependencies remain: interactive Desktop availability, unchanged backup budgets, normal active telemetry growth and local-only durability. Native positive-JWT dual-parent compatibility, full immutable release/build reproduction, production security/privacy/certificate/custody, enforceable quotas, independent recovery, host-specific acceptance and business/release signoff remain unverified or require separate authorization. Existing P07-DEV-QUOTA and P08-DEV-LOCAL-STORAGE exceptions are unchanged. **P11 remains PARTIAL.**

## Reproduction and evidence boundaries

```powershell
node --test observability/roadmap/p11-validation/backup-wrapper.test.cjs
node --test observability/roadmap/p11-validation/manifest.test.cjs
node --test observability/roadmap/p08-validation/test-backup.cjs
node observability/roadmap/p11-validation/review.cjs
```

Reviewer exit 1 is expected for strict historical bytes. `technical.cjs baseline|verify-backups|live|pipeline|exposure|finish` uses the ignored `.local/p11-remediation-20261115/technical.json`; baseline refuses overwrite. To repeat a full session, supply a new ignored directory as its second argument and review approval scope. `pipeline` issues only two denied synthetic requests. `backup` is an actual existing-policy acquisition with authenticated no-expiry preflight, not a read-only command; it refuses existing expiry candidates and never changes policy. The original scheduled backup command remains documented in the P08 runbook. Do not repeat acquisition or tests merely to produce more evidence.
