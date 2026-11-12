# Roadmap quality gates

> P01 supersedes future acceptance rules here: [P01 quality gates](p01-quality-gates.md). P00 design below is retained as historical evidence; P01 separates source, isolated and target-runtime acceptance.

Status: proposed acceptance design; no phase beyond P00 has been executed. Dependencies refer to accepted evidence, not merely files existing. P01 must resolve threshold/owner decisions before tests can claim success.

## Universal restrictions and evidence

For every phase: preserve pre-existing changes; no branch change, shared-resource mutation, keys/contracts changes or Spring Boot continuation by implication. P00 does not authorize later implementation/deployment. Validate resource identity before any future action. Tests that write, stop services or create load belong exclusively to the approved disposable environment. No protected-container lifecycle or persistent-volume operations. Shared JWKS changes always require [cross-project governance](shared-jwks-governance.md).

Each gate requires candidate parent/submodule SHA and dirty-state record, image digests, redacted effective topology, test commands/tool versions, timestamp, expected vs observed results, artifacts with secret screening, safety evidence, owner signoff and rollback evidence. NOT VERIFIED is not PASS. Existing fixtures/dashboards/checks must be assessed and reused before adding duplicates. Runtime checks cannot be substituted with source review; business objectives cannot be approved by passing implementation tests.

## P01: Observability Contracts & Quality Gates

- Dependencies: P00 reviewed.
- Implementation scope: Approve field/route/service registries, producer fixtures, cardinality/privacy budgets, evidence schema and owner decisions; qualify runtime denial and reconcile pins by review, not automatic update.
- Verification: Validate native-to-canonical fixtures, field types, secret exclusions, source reference consistency and missing-data reporting.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Versioned contract, decision register, runtime gaps and fixture design accepted.
- Rollback: Revert contract version/adapter proposal; retain legacy readers.
- Cross-project impact: Shared schema proposals require both consumer reviews; no JWKS edit implied.

## P02: Structured Logging & Correlation

- Dependencies: P01.
- Implementation scope: Extend existing Serilog, Quarkus JSON and JWKS encoder only for measured gaps; align identity and safe route mapping; retain headers/contracts.
- Verification: One bounded completion event, invalid/duplicate header handling, concurrent isolation, secret canaries, unsampled context and legacy query compatibility.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Three-language structured event fixtures and correlation evidence pass.
- Rollback: Restore prior formatter/config and compatibility adapter; no keys or API rollback.
- Cross-project impact: JWKS changes require mandatory dual-stack gate.

## P03: Log Collection & Rotation Reliability

- Dependencies: P02.
- Implementation scope: Improve existing Fluent Bit tail/offset/buffer behavior, archive handoff and overflow visibility; include edge logs only via reviewed safe inputs.
- Verification: Isolated restart/outage/rotation/compression/long-line/queue-full tests with sequence counts, duplicates and recovery duration.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Approved loss budget met, persistent offsets verified and disk budgets bounded.
- Rollback: Restore prior collector config/image without deleting state; document offset compatibility and duplicate risk.
- Cross-project impact: Shared JWKS file layout changes require both consumers; local pipeline otherwise independent.

## P04: Application & Dependency Metrics

- Dependencies: P01; P02 identity mapping.
- Implementation scope: Reuse prometheus-net, Micrometer and Actuator; add missing JWKS scrape safely and measured DB/gateway/host/collector coverage.
- Verification: Scrape reachability and denied public reachability; synthetic route/method floods; series/sample budgets; histogram units; dependency failure classification.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: All approved targets healthy, bounded labels, tested queries and no secrets.
- Rollback: Restore target/registry config and old dashboard queries; retain old series names through transition.
- Cross-project impact: JWKS connector changes require dual-stack gate; no borrowing Spring Boot resources.

## P05: Early Alerting & Capacity Budgets

- Dependencies: P03, P04.
- Implementation scope: Add minimal availability, error/latency, disk/queue, DB saturation and collector alerts plus approved notification routing.
- Verification: Rule evaluation fixtures and isolated fault-to-notification timing, no-data detection, deduplication, recovery and false-positive checks.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Approved thresholds, owners and delivered/resolved notification evidence for every critical rule.
- Rollback: Restore previous rules; explicit approved temporary silence with expiry; keep existing alert coverage.
- Cross-project impact: Local alert routing only; shared metric semantics reviewed across parents.

## P06: Cross-Stack Distributed Tracing

- Dependencies: P02, P04, P05.
- Implementation scope: Complete .NET SDK/client/DB coverage, reuse Quarkus/Boot OTel, approve collector/storage and sampling; link logs to traces.
- Verification: Isolated frontend/gateway/API/JWKS/DB chain, parent/child IDs, unsampled/malformed context, exporter-down pressure, privacy and bounded overhead.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Approved cross-stack traces and correlation without auth/contract changes; absence of sampled trace handled.
- Rollback: Disable exporters/instrumentation independently; restore prior context/log behavior; bounded draining documented.
- Cross-project impact: JWKS tracing or dependency changes require both consumer stacks; Spring Boot remains separately scoped.

## P07: Telemetry Security & Storage Hardening

- Dependencies: P03, P04, P05, P06.
- Implementation scope: Harden selected telemetry stores, auth/RBAC/TLS, secrets and quotas incrementally; preserve current ingress restrictions.
- Verification: Unauthorized/role denial, certificate validation, exposure inventory, secret scans, quota alarms and migration reversibility.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Access matrix and encryption/storage controls verified; no exposed raw stores.
- Rollback: Keep prior secure config and certificates under approved custody; never roll back to public unauthenticated access.
- Cross-project impact: Shared service listener/TLS changes require gate; never modify parent resources together implicitly.

## P08: Backup, Restore & Failure Recovery

- Dependencies: P05, P07.
- Implementation scope: Implement approved backups and isolated restore procedures for telemetry/config; coordinate business DB backup interfaces without changing business data.
- Verification: Restore to new volumes; integrity, recent-event age, auth/queries and measured RPO/RTO; backup credential denial tests.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Off-host recoverable copy and successful drill within approved RPO/RTO.
- Rollback: Restore backup job/config; leave original stores untouched; no in-place restore as rollback.
- Cross-project impact: No use of Spring Boot volumes/backups; shared JWKS secrets are not copied.

## P09: Unified Dashboards & Incident Response

- Dependencies: P05, P06, P08.
- Implementation scope: Extend existing Grafana and Discover views with dependency/queue/capacity/trace links; add incident runbooks and owners.
- Verification: Every panel query against fixtures and isolated data; missing/unsampled data views; incident drill from notification to recovery.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Versioned dashboards, owned runbooks and evidence of useful incident navigation.
- Rollback: Restore prior provisioned dashboards/runbook version; preserve saved objects as approved.
- Cross-project impact: Local dashboards only; shared telemetry semantics follow gate.

## P10: Isolated Resilience & Performance Validation

- Dependencies: P03?P09; disposable environment guard review.
- Implementation scope: Run bounded failure/load scenarios in dedicated project: collector outage, disk/queue exhaustion, DB dependency failure, trace backend failure, recovery.
- Verification: Preflight non-sharing proof, before/after protected-resource evidence, event sequence accounting, load limits and stop conditions.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: Approved SLO/loss/overhead/RPO/RTO budgets pass or explicit blocking findings recorded.
- Rollback: Stop candidate load and clean only manifest-owned disposable resources; preserve protected projects.
- Cross-project impact: Dual-stack JWKS candidates use independent isolated environments and separately authorized scope.

## P11: Final Hardening & Production Readiness

- Dependencies: P01?P10 all accepted.
- Implementation scope: Resolve remaining findings; freeze immutable artifacts, access review, deployment/rollback plan, production-specific acceptance and ownership.
- Verification: Reproduce from reviewed pins/digests, complete security/recovery drill evidence and host-specific review; no stale historical PASS substitution.
- Safety: universal restrictions apply; fault injection and writes use dedicated disposable resources only.
- Required evidence: universal evidence bundle plus the phase-specific results listed above.
- Exit criteria: All required gates accepted, unknowns resolved or explicitly risk-accepted by owners; release approval separate.
- Rollback: Document tested per-service config/image rollback and data-format compatibility; never destructive volume rollback.
- Cross-project impact: Both parent adoption decisions explicit; shared gate complete for every adopted JWKS change.

