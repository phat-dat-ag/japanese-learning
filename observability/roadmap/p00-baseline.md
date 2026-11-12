# P00 baseline

Audit date: 2026-11-12 (Asia/Bangkok). Scope: Japanese Learning only. P00 is documentation and read-only inspection; implementation stops here for review.

## Evidence classification

- **VERIFIED**: directly observed local Git metadata or file contents during this audit. A source observation never verifies runtime behavior.
- **CONFIGURED BUT NOT VERIFIED**: behavior declared by inspected source/configuration; no runtime confirmation.
- **HISTORICAL EVIDENCE**: prior report, not rerun here.
- **NOT VERIFIED**: inaccessible, unmeasured, or insufficient evidence.
- **NOT APPLICABLE**: field does not apply to that component (not equivalent to missing evidence).

All runtime versions, health, exposure, volumes, effective overrides and telemetry delivery are NOT VERIFIED. Docker returned permission denied. This is a qualified source baseline, not a runtime acceptance certificate.

## Reproducible source identity (VERIFIED)

Root HEAD: `a07b5553df91e470fd55a218da9757fd4930b51c`.

| Submodule | Parent index gitlink | Working HEAD | Local status |
|---|---|---|---|
| angular | 5c2114b7b0273e2fe29ff6ea2406c9c5fe6d6a4b | b66e4434a1e0021b0fefcc63b5c50d020d763e43 | clean internally; pointer differs |
| dotnet | 5d6c1af8aab4ba3d48d748698b13cbaa95dd5732 | 5d6c1af8aab4ba3d48d748698b13cbaa95dd5732 | clean |
| quarkus | e964cc391dae768ca69e875946d0e4eab26b7500 | 2f15c159e272eecd18e690df40feb4f669d95b40 | clean internally; pointer differs |
| springboot-jwks-api | 53d50ba151d04d7ee7d4f7ea01beba524262c3d9 | 7879d155eddb45fb079800709f49a3c3a1566120 | clean internally; pointer differs |

Initial root status: ` M angular`, ` M quarkus`, ` M springboot-jwks-api`. These pre-existing differences must be preserved. A root-only checkout does not reproduce the inspected service trees. Future reproduction must record both parent gitlinks and actual service HEADs, lockfiles, image digests, Compose overlay order, and redacted override names; do not resolve the pointer differences during P00.

## Executive assessment

Existing structured logging and metrics should be extended rather than replaced. Current checkout includes shared JWKS observability features newer than the Japanese parent pin. No runtime inventory can be certified. Missing end-to-end tracing, alert delivery evidence, capacity measurements and restore evidence prevent readiness claims.

[Architecture](architecture-inventory.md), [Docker](docker-resource-baseline.md), [JWKS governance](shared-jwks-governance.md), [contract](telemetry-contract-proposal.md), [objectives](security-reliability-objectives.md), [gates](quality-gates.md), and [roadmap](implementation-roadmap.md) are the authoritative P00 outputs.

## Existing evidence and limitations

[Logging guide](../logging/README.md), [deployment guide](../../deployment/README.md), [JWKS guide](../../docs/JWKS.md), and [secret guide](../../docs/SECRETS.md) provide existing operational detail. [Final E2E verification](../../deployment/FINAL-E2E-VERIFICATION.md) dated 2026-09-24 is HISTORICAL EVIDENCE only: it describes Quarkus retrieving keys from .NET, whereas current Compose points to independent jwks-api. Its PASS is not evidence for this checkout or protected projects. Existing verification scripts were inspected by name, not executed: several create environments or mutate resources.

## Verification and preservation

Read-only checks: Git status/rev-parse/ls-tree/ls-files/remote/branch/log; scoped file inspection; Docker ps/volume ls/network ls (denied). `git submodule status` failed because Git sh could not create its signal pipe (Win32 error 5); direct per-repository commands supplied metadata instead. No privilege escalation attempted. Documentation links and required filenames checked locally without builds, tests, migrations, HTTP requests or Compose rendering that could reveal secrets.

No application code or configuration changed. No Docker containers or existing volumes modified. No database contents or JWT/JWKS keys modified or regenerated. No submodule updated, branch changed, fetch/pull/reset/checkout performed. springboot-project was read only and its Phase 6B work was not continued. No commit or push performed.

## Remaining unknowns and review

Runtime service/image identity, resource IDs, effective configuration, telemetry contents, live access controls, loss/lag, disk capacity, database saturation, external TLS termination, backup validity and recovery times remain NOT VERIFIED. Business SLOs, privacy retention, owners and notification destinations require approval. P01 must record these qualifications and obtain runtime evidence through normal authorized access; Docker denial is not permission to escalate. Stop after P00; recommended next task: P01.

Final documentation validation: PASS ? exactly eight expected deliverables, 17 relative Markdown links resolved, and all P01?P11 gate sections present. Final Japanese root status retained the same three pre-existing pointer differences plus only the new roadmap directory; all four service working trees remained internally clean. No application build/test or runtime probe ran.

During the read-only audit, Spring Boot parent status for springboot-user-api changed from lowercase `m` (internal dirtiness) to uppercase `M` (gitlink/checkout difference). This agent performed no writes there; the snapshot therefore cannot certify that external project remained globally unchanged during the audit. Treat it as concurrent external state and recapture metadata before any future shared compatibility work. The no-modification statement describes this agent's actions, not control over other processes.
