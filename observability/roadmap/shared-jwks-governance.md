# Shared JWKS governance

> P01 drift comparison and mandatory before-edit evaluation are recorded in [P01 plan](p01-implementation-plan.md#shared-jwks-drift-and-compatibility) and [P01 gates](p01-quality-gates.md). The SHA/dirty-state table below remains the historical P00 snapshot; do not treat it as current metadata.

Evidence: VERIFIED local Git metadata on 2026-11-12; remote server freshness and deployed commits NOT VERIFIED. No network Git operations performed.

| Property | Japanese Learning | Spring Boot parent |
|---|---|---|
| Parent path | C:/Personal/japanese-learning | C:/Personal/springboot-project |
| Submodule path | springboot-jwks-api | springboot-jwks-api |
| .gitmodules URL / origin fetch and push | https://github.com/phat-dat-ag/springboot-jwks-api.git | same URL |
| .gitmodules branch preference | develop | absent |
| HEAD gitlink and index gitlink | 53d50ba151d04d7ee7d4f7ea01beba524262c3d9 | 7879d155eddb45fb079800709f49a3c3a1566120 |
| Submodule working HEAD | 7879d155eddb45fb079800709f49a3c3a1566120 | 7879d155eddb45fb079800709f49a3c3a1566120 |
| Branch / detached HEAD | develop / not detached | develop / not detached |
| Local tracking ref | origin/develop at same SHA | origin/develop at same SHA |
| Local modifications inside submodule | none | modified .env.example, MetricsEndpointConfiguration.java, logback-spring.xml, LoggingConfigurationTest.java; untracked MetricsListenerAddressTest.java |

**The parent pins differ. Working HEADs match, but working trees differ.** Japanese Learning's exact source checkout is 7879d155eddb45fb079800709f49a3c3a1566120; its recorded dependency is 53d50ba151d04d7ee7d4f7ea01beba524262c3d9. Neither proves the runtime image SHA. Local tracking agreement does not establish current remote HEAD.

Spring Boot parent has existing tracked edits in environment examples, .gitignore, Compose and observability documentation/configuration, dirty learning/user/JWKS submodules and numerous untracked Phase 6 artifacts. Only status and JWKS metadata were inspected; no Phase 6B implementation or resources changed.

## Compatibility differences

Local log between Japanese pin and checked-out HEAD includes environment metadata, structured logging, protected Prometheus metrics, safe OpenTelemetry instrumentation and Java style documentation. Thus log schema, listener behavior, resource identity, sampling, dependencies and runtime cost may differ on a fresh pinned checkout. Spring Boot's uncommitted listener and Logback edits add another difference; compatibility is NOT VERIFIED. Do not copy those edits into Japanese Learning. Current Japanese Compose exposes health only and does not enable the optional 9091 metrics connector or OTLP exporters.

Both parents reference one remote repository but separate local working trees. Editing one tree does not edit the other, and pushing a shared repository commit does not move either parent's gitlink. Rebuilding from a changed tree can change one deployment without updating its parent's pin. A later explicit gitlink update can affect either consumer and must be reviewed independently.

## Mandatory future cross-project compatibility gate

1. Record both parent HEADs, index/HEAD gitlinks, submodule HEADs, dirty paths, local tracking refs and image identities; preserve existing changes. Use a separate authorized candidate checkout for changes, never reset either protected tree.
2. Define affected interfaces before implementation: owner-scoped JWKS routes, key IDs/algorithms and public-key material, issuer/audience validation, health/readiness, caching/rotation semantics, headers, logging schema, metrics listener isolation and tracing privacy. Observability work must not alter signing or public keys.
3. Run contract and security tests against both consumer stacks in separate disposable environments: .NET/Quarkus and Spring Boot User/Learning. Verify unchanged JWKS responses, JWT acceptance/rejection, cache refresh, unavailable-JWKS behavior, listener reachability, sensitive-data exclusion and resource overhead. Capture immutable candidate SHA and independent evidence per parent; neither stack's PASS substitutes for the other.
4. Require explicit review from owners of both projects. Spring Boot implementation remains stopped at Phase 6B; any future test/change there needs separately authorized scope. If unavailable, mark its gate NOT VERIFIED and block shared-change release.
5. Publish a reviewed immutable shared commit only when separately authorized; update each parent's gitlink through its own reviewed change and deployment decision. Never assume coordinated automatic adoption or use branch preference as a release pin.
6. Keep previous gitlink/image digest and compatible telemetry mappings. Roll back each parent independently using a reviewed deployment plan; no key rollback/regeneration, database restore or destructive volume action as an observability rollback. Validate auth, health and telemetry after rollback.

No fetch, pull, checkout, reset, submodule update, commit or push occurred in P00.
