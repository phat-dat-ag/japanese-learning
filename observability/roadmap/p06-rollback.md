# P06 rollback

No P06 runtime deployment occurred. Source rollback is a reviewed reverse patch using
the machine manifest, never reset/clean/checkout or submodule updates. Preserve the initial
Program.cs commented Swagger guard and any subsequent user work. Remove only P06 tracing
registrations/dependencies/classes/tests, tracing env-example entries, new Compose services/
network/volume declarations and Grafana source/network changes. Restore the previous
Grafana provisioning source while retaining its original datasource/dashboard files.
Existing P02–P05 sources, evidence and JWKS gitlinks must remain unchanged.

Re-run logging/security/metrics regression and Compose preservation checks after a reviewed
source reversal. Do not remove generated or ignored files by broad recursive patterns.
No database migration, key operation, telemetry purge or volume cleanup is part of rollback.

For a future authorized deployment: first prefer disabling only trace exporters through
reviewed configuration and service-specific recreation approval. Preserve Activity/context
and P02 log correlation where possible. A later instrumentation rollback must select the
prior immutable API images and resource configuration; review all application startup
dependencies before any Compose command. Do not use broad compose up/down commands, which
can recreate existing services or execute initialization jobs.

Removing Collector/Tempo containers/networks or deleting traces requires separate approval
and proof of exact task-owned IDs. Preserve the dedicated Tempo volume and stored data by
default. Never operate on springboot_project resources. After an authorized rollback,
verify JWT behavior, API responses, health, logs, metrics, existing monitoring and both
projects' resource identities. Runtime rollback has not been tested.
