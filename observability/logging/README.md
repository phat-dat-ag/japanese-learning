# Application log search

Fluent Bit reads the three existing application log volumes, normalizes JSON, and
sends it to OpenSearch. OpenSearch Dashboards provides Discover and visualization.
These services are included in `docker-compose.yml` and start with the application.
This is independent of the optional Grafana/Prometheus metrics stack.

## Start locally

From the repository root, with Docker running:

```sh
python -B scripts/setup-log-access.py
docker compose -p jp_dev up --build -d
```

Use the **same Compose project name as your application containers** so their log
volumes are shared. The current local stack uses `jp_dev`; replace that name if
your deployment uses another project. A different project creates empty log volumes.

The setup script refuses to replace credentials. It generates a random password
and bcrypt hash with an isolated, pinned helper image. Read `.env.logging` locally
in your editor for `LOGS_UI_USERNAME` and `LOGS_UI_PASSWORD`; neither is printed or
committed. The file contains viewer credentials, not Compose interpolation inputs.
NGINX reads only `secrets/logging/htpasswd` (a hash, not the password).

Visit **http://127.0.0.1:5601**, authenticate, then open **Discover**. The
Combined `application-logs-*` and three per-service index patterns, using the
`@timestamp` time field, are provisioned by
`logging-ui-init`. The command above starts the complete application and logging
stack. A new installation can show no
results until applications write logs. Adjust Discover's time range for old logs.

Linux hosts require `vm.max_map_count >= 262144`; configure it in host sysctl, not
by granting containers extra privileges. Budget an additional 4 GiB RAM plus disk
headroom for this single-node stack. Heap defaults to 512 MiB inside a 2 GiB
OpenSearch container. Match heap/resource settings to measured load; this is not HA.

## Production

Provision credentials on the production host, configure the logging
section in `.env.production`, then use the existing production commands:

```sh
python3 -B scripts/production.py validate
python3 -B scripts/production.py build
python3 -B scripts/production.py deploy
python3 -B scripts/production.py verify
ssh -N -L 5601:127.0.0.1:5601 administrator@server
```

Add `--monitoring` to enable Grafana/Prometheus as well. The build action's release
tag must be fresh, as with existing application releases. To add logging without
redeploying applications, use:

```sh
docker compose --env-file .env.production -p japanese-learning-production -f docker-compose.yml -f compose.production.yml up -d --build opensearch logging-init fluent-bit opensearch-dashboards logs-ui logging-ui-init
```

OpenSearch's native Security plugin is disabled deliberately: its API is
unpublished on `log-storage`, an internal network containing only trusted logging
components. The separate internal `log-ui` network connects Dashboards and NGINX.
Applications do not join either network. NGINX authenticates all UI/API routes
except its minimal `/health` response and publishes **127.0.0.1 only**. It strips
the Basic authorization header before forwarding. Use the SSH tunnel or an
authenticated HTTPS host proxy; do not expose the HTTP listener publicly.

This is a single-operator boundary: authenticated viewer access includes Dashboards
administration and its developer console. It does not provide per-user OpenSearch
roles, tenants, internal TLS or protection against a compromised logging container
or Docker administrator. Multi-user/untrusted-network deployments require native
OpenSearch Security, managed certificates and least-privilege accounts instead.
No demo certificates or demo admin passwords are installed.

All long-running logging containers use non-root users, read-only root
filesystems, dropped capabilities, resource limits and bounded Docker logs.
Fluent Bit UID 185 has supplementary groups 0/1654/10001 to read the three mounted
volumes; it has no Docker socket, no application secrets and no root capability.
Custom application volume ownership/filenames need corresponding collector changes.

## Fields and searches

The index has explicit common mappings. Examples in Discover's DQL search bar:

```text
service_name: "user-api"
level: "ERROR"
http_status >= 500
correlation_id: "request-123"
trace_id: "0123456789abcdef0123456789abcdef"
caller_service: "vocabulary-api"
is_slow: true
```

Common fields include `@timestamp`, `service_name`, `environment`, `level`,
`event_name`, `message`, `correlation_id`, `trace_id`, `span_id`, `parent_span_id`,
`http_method`, `http_route`, `http_status`, `duration_ms`, `caller_service`,
`peer_address`, `handler_class`, `handler_method`, `operation`, `operation_class`,
`operation_method`, `outcome`, `error_code`, `error_type`, `is_slow`, and
`authenticated`. Missing source fields remain absent. Numeric fields are numbers;
Quarkus string flags and .NET booleans normalize to JSON booleans.

`original` preserves the complete application event in `_source`, including safe
stack diagnostics and business-specific fields. It is deliberately **not indexed**
to avoid incompatible schemas and unbounded field mappings. Inspect it by expanding
a record in Discover. Add explicit common mappings before indexing additional
business fields. Normalization is not a secret scrubber; retain application-level
redaction and restrict log access.

## Retention and reliability

| Root env variable | Default | Meaning |
| --- | --- | --- |
| `LOGS_UI_PORT` | `5601` | Loopback viewer port |
| `LOGS_AUTH_FILE` | `./secrets/logging/htpasswd` | Generated bcrypt file |
| `OPENSEARCH_HEAP_SIZE` | `512m` | Equal JVM minimum/maximum heap |
| `LOG_RETENTION_DAYS` | `30` | Daily index retention, 1–3650 days |
| `FLUENT_BIT_STORAGE_LIMIT` | `1G` | Collector output disk-queue limit |
| `LOG_ENVIRONMENT` | `development` | Fallback label; production example uses `production` |

Each service writes its own daily index, partitioned by **collection date**:

| Service | Index name |
| --- | --- |
| JWKS | `application-logs-jwks-api-YYYY.MM.DD` |
| .NET | `application-logs-user-api-YYYY.MM.DD` |
| Quarkus | `application-logs-vocabulary-api-YYYY.MM.DD` |

Thus a day with logs from all services has three application indexes. Internal
OpenSearch/Dashboards indexes are separate. Discover offers a per-service pattern
and the combined `application-logs-*` view. Previously collected shared
`application-logs-YYYY.MM.DD` indexes remain searchable in the combined view and
expire under their existing retention policy; they are not deleted or migrated.

Each application index has one primary shard and zero replicas. ISM deletes whole indexes after the configured
age, on its background schedule. Local application file retention is independent.
Re-run `logging-init` after changing retention. Existing managed indexes pick up
policy updates at ISM's safe transition points; deletion is not immediate. Retention
is not a disk quota. Monitor disk usage and snapshot OpenSearch data separately.

Fluent Bit stores offsets and checksummed filesystem chunks in `fluent_bit_state`.
It reads existing matching plaintext files from the beginning on first discovery,
then resumes offsets. Delivery retries indefinitely within the bounded disk queue;
oldest buffered chunks can be lost if the queue fills. Generated document IDs
reduce retry duplicates; exactly-once delivery is not promised. Lines larger than
1 MiB are skipped so one oversized line cannot stop an entire input.

Inputs: JWKS root `*.log`, .NET `user-api-*.json`, Quarkus active
`application.json.log`. Gzip archives and legacy text files are not backfilled.
If the collector is stopped long enough for unread files to be compressed/deleted,
those events can be lost; buffering protects against OpenSearch outages while the
collector remains running. Existing app async logging can also discard under load.
Collect this file pipeline only; do not also ingest the same stdout events.

Stopping/recreating containers preserves all three logging volumes. Do not use
`down --volumes` on your real project unless intentionally destroying log history.

## Checks and troubleshooting

```sh
python -B scripts/verify-logging.py
docker compose -p jp_dev ps
docker compose -p jp_dev logs --tail=100 fluent-bit logging-init logging-ui-init
```

The verifier uses fresh `jp-logging-check-*` resources and synthetic records only;
it tests all three schemas, permissions, UI authentication, bootstrap idempotency,
collector restart, OpenSearch outage recovery and rotation, then removes only that
test project's volumes. It builds current logging images and requires generated credentials.
Failures retain diagnostics under ignored `.local/`.

If Discover is empty, check the time range, application log mounts, Fluent Bit
errors, index disk watermarks and both init-job exit codes. Fluent Bit's health and
metrics endpoints are private on port 2020. Use an OpenSearch-container `curl` to
check `http://fluent-bit:2020/api/v1/health`. Docker logs contain the collector's
own diagnostics, not the collected application records.

References: [Fluent Bit OpenSearch output](https://docs.fluentbit.io/manual/4.2/data-pipeline/outputs/opensearch),
[Tail input](https://docs.fluentbit.io/manual/4.2/data-pipeline/inputs/tail),
[OpenSearch ISM policies](https://docs.opensearch.org/latest/im-plugin/ism/policies/).
