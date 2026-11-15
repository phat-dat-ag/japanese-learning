# P11 actual development issuer-to-consumer proof

**Actual .NET-issued token -> existing Quarkus: PASS. P11 remains PARTIAL; production acceptance BLOCKED; 11/12 phases complete.** The user supplied an existing development credential file after the earlier credential-blocked attempt. This authorizes using that account, not creating accounts, changing credentials or modifying signing material.

The [live proof runner](p11-validation/real-token.cjs) confirmed the supplied file is ignored/untracked, mapped its `username` field to the existing API's Email login parameter, and performed one successful login against the existing `jp_learning_dev` .NET service. It made no credential guesses or retries. The real access token remained unchanged and in process memory. Its RS256 signature verified against the actual User JWKS; its kid was present, issuer/audience matched the existing Japanese contract and it was unexpired at use. No existing private key file was read.

| Actual request | Expected / actual | Result |
| --- | --- | --- |
| .NET `POST /api/auth/login` | 200 / 200 | PASS; existing development account |
| Direct .NET `GET /api/auth/me` | 200 / 200, success envelope | PASS |
| Direct Quarkus `GET /api/v1/jlpt-levels` | 200 / 200, success envelope | PASS with the same unchanged .NET-issued token |
| Gateway `GET /api/auth/me` | 200 / 200, success envelope | PASS; gateway forwards authentication to .NET |
| Gateway `GET /api/v1/jlpt-levels` | 200 / 200, success envelope | PASS; gateway forwards authentication to Quarkus |
| .NET User principal -> `GET /api/auth/admin-test` | 403 / 403 | PASS; trusted real User token denied Admin access |
| Quarkus User principal -> `GET /api/v1/admin/kanji-quiz/questions?page=0&size=1` | 403 / 403 | PASS; trusted real User token denied Admin access |
| Logout of only the newly issued refresh session | 204 / 204 | PASS |

This closes the missing positive live issuer-to-consumer proof and demonstrates User-to-Admin denial at both APIs. It also verifies the gateway's indirect bearer forwarding. It does **not** verify a browser/Angular login flow, fresh release-candidate DLL execution or production acceptance. The existing HTTP service is a permitted alternative to native Windows execution; Application Control was neither bypassed nor changed.

Prior four live signature/unknown-kid negative probes and the isolated Quarkus/Spring negative cohorts remain separately qualified. No trusted-signature live token with incorrect issuer/audience/expiry/role was manufactured: no signing-key access, claim rewriting, account-role change, clock change or service reconfiguration occurred. Those unexecuted live variations remain NOT VERIFIED; previous isolated rejection evidence is not relabelled as live coverage.

Credentials, bearer/refresh tokens, personal claims and API business-response contents were not printed or saved in reports. The supplied credential file is unchanged; its pre-existing Git ignore rule was preserved. The runner records only status codes, nonpersonal contract booleans and User role classification. Normal login creates its own refresh-token record; normal logout revokes only that record. No other account/session was changed. The access token is discarded with process exit and expires normally; logout is not falsely described as access-token revocation.

Read-only before/after checks preserve all **52 containers, 25 volumes, three backup generations (hash/size/mtime), P08 task definitions and Git revisions/gitlinks**. Health remains as before: four scrape targets up, 54 rules healthy, three dashboards retained, Prometheus/Tempo datasources OK and logs searchable. Active telemetry and the explicitly authorized login/logout state naturally advanced; no byte-identical database-content claim is made. No existing service or Desktop/WSL restart, recreation, cleanup, deployment, publication or full P10 recovery occurred. Both protected Spring trees and all submodules remain unchanged.

Actual commands:

```powershell
git check-ignore -- observability/local-test-credentials.json
node observability/roadmap/p11-validation/technical.cjs baseline .local/p11-live-token-20261115
node observability/roadmap/p11-validation/real-token.cjs observability/local-test-credentials.json
node observability/roadmap/p11-validation/technical.cjs live .local/p11-live-token-20261115
node observability/roadmap/p11-validation/technical.cjs finish .local/p11-live-token-20261115
```

The unique ignored `.local/p11-live-token-20261115/proof.json` and `technical.json` contain actual results without token/credential values; hashes are recorded in [current acceptance](p11-validation/acceptance.json). Existing evidence paths refuse overwrite. The [44/44 Spring candidate](p11-consumer-closure.md) and [immutable release manifest](p11-validation/release-manifest.json) remain unchanged. Remaining owner adoption, full regression/negative scope, release/image/toolchain qualification, production security/recovery/host authorization and named business/release signoff requirements still block P11 acceptance.
