# P06 implementation

The authoritative file/hash inventory is [change manifest](p06-validation/evidence/change-manifest.json).
All changes are source preparation. The initial .NET Program.cs Swagger guard comment is
preserved; its only P06 addition is AddServiceTracing. Authentication, HTTP contracts,
business logic, migrations, schemas and JWT/JWKS behavior were not intentionally changed.

.NET pins Hosting/OTLP 1.15.3 and ASP.NET/HTTP/SQL instrumentation 1.15.0 for net9.0.
The initially evaluated 1.21 dependency set warned about unsupported framework libraries;
1.15.0 OTLP auditing reported advisories. Neither is the final exporter selection.
[The exporter patch advisory](https://github.com/advisories/GHSA-mr8r-92fq-pj8p) identifies
1.15.3 as a fixed version. Final build/test output has no such warnings. No existing
application package was intentionally upgraded or framework target changed.

Tracing.cs owns provider registration, shared sampling semantics, privacy processing and
the fail-closed OTLP exporter subclass. TraceContextPropagation.cs configures framework W3C
extraction/injection without baggage/vendor state. ASP.NET Core/HttpClient/SqlClient each
have one instrumentation registration. SqlClient metrics remain passive P04 observers;
no SQL context-injection roundtrip or new query is enabled. Production experimental SQL
parameter/context options must remain disabled; exported attributes are scrubbed regardless.

Quarkus retains its BOM-managed OTel extension (SDK 1.62.0 observed locally), rather than
adding another dependency. TraceConfiguration customizes the existing SDK exporter/sampler;
W3cOnly and TracePropagation customize propagation using the installed Quarkus SPI.
BoundarySampler shares the .NET probability/budget algorithm. Existing reactive SQL support
is retained; this application does not use blocking JDBC. No Spring properties are copied.
Runtime export hooks use a version-specific Quarkus runtime interface, so upgrades must
rerun compilation and integration tests rather than assuming SPI compatibility.

Quarkus limits attributes to 16, values to 160, and events/links to zero; queue is 1024 spans,
batch 128, delay 1s, export timeout 3s. .NET exported span fields are reconstructed from a
small bounded set; native exception recording is disabled and event/link-bearing spans are
discarded. .NET uses a 1024-span batch queue, 128 batch, 1s delay and 3s exporter deadlines.
Existing logging exporters and prometheus-net/Micrometer configuration remain intact.

Root Compose adds normal otel-collector and tempo services, one internal network and one
new Tempo volume. Collector has 256MiB/0.5 CPU/64 PIDs; Tempo 512MiB/1 CPU/128 PIDs; swap is
capped to memory. Both inherit read-only filesystem, capability drop and no-new-privileges,
with bounded local logs. Neither image is assumed to contain healthcheck shell utilities;
no unsupported healthcheck is added. Validate readiness after authorized deployment.

Grafana's future provisioning directory is a new P06 directory. Its Prometheus datasource
and dashboard-provider files are byte copies checked against P05; the existing dashboard
bind and UID stay unchanged. This avoids editing active provisioning or mounting a missing
file beneath its read-only directory. Tempo datasource uses http://tempo:3200 and UID
jp-dev-tempo. Explore and a P04 API request-rate navigation query are prepared. No span
metrics generator, OpenSearch/Loki integration or P09 dashboard suite is introduced.

Root and production env examples keep export false, ratio 0.1 and root budget 10. Real env
files/secrets were not read or edited. Legacy Compose overlays remain unreconciled and
must not be combined with this root workflow without review. No deployment command ran.
