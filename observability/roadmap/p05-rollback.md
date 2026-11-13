# P05 source rollback

No runtime deployment occurred; there are no P05-created containers, volumes or networks to
stop/remove. Existing historical monitoring data must remain. Never run broad cleanup,
`docker compose down -v`, prune, volume deletion, Git reset/clean/checkout or submodule update.

1. Review [change manifest](p05-validation/evidence/change-manifest.json),
   [preflight](p05-validation/evidence/preflight.json) and current working changes.
2. Reverse only the P05 `prometheus`/`grafana` service additions, new `prometheus_data`/
   `grafana_data` volume declarations and `p05-monitoring` network declaration in root Compose.
   The explicit empty `default:` declaration may be removed to restore implicit default behavior.
   Preserve all 16 existing services and original volumes/networks byte-for-byte where possible.
3. Reverse only the monitoring comment/port-example hunks in `.env.example` and
   `deployment/production.env.example`; leave DB/JWT values and private `.env` untouched.
4. Archive P05 new reports/fixtures/configuration if desired. Do not restore the redundant
   P05 overlay: it was an uncommitted task-created draft. Never remove P03 directories/evidence.
   Preserve the pre-existing dirty `.NET Program.cs` change and every submodule/gitlink.
5. Validate source with explicit synthetic Compose interpolation and `git diff --check`.
   Compare the original 16 normalized service hashes/network/volume values with compose-before.json.

Once deployed under a future authorization, source rollback alone does not stop services.
Prepare a separate reviewed runtime plan with actual project/resource IDs, proven ownership,
mounts and data-retention requirements. Retain named monitoring volumes and history; do not infer
ownership from a service name or use this report as authorization to modify running resources.
Shared JWKS source, keys, behavior and springboot_project are outside rollback scope.
