# P03 rollback

No deployment occurred. Existing producer/collector/gateway/Compose/bootstrap files remain
byte-identical; pre-existing producer edits remain in place. There is no runtime setting
to reverse, no image activation, and no test Docker resource to stop or remove.

For source rollback, review the exact new-file manifest against current work and preserve
the evidence first. Manually remove only confirmed P03-owned new report/candidate/test
files after checking for later user edits. Do not recursively delete p03-validation:
initial failed tempfile directories remain inaccessible and ownership must be checked
individually. [Cleanup inventory](p03-validation/evidence/cleanup.json) records exact names;
do not broaden cleanup selectors, elevate or change permissions as part of this task.
Successful harness UUID files were already cleaned individually after their runs.

Do not reset/clean/checkout/switch branches, stage or change gitlinks, restore the entire
logging/gateway directory, or reverse the pre-existing dotnet Program.cs/Quarkus properties
edits. Leave shared JWKS and springboot-project untouched. Never delete/truncate historical
logs, tail DBs, buffers, indexes, volumes, keys or database data to roll back observability.

If this candidate is adopted later, obtain a separate reviewed immutable image/config
rollback plan. Keep previous compatible mappings/readers and state format; rehearse on
new isolated synthetic state first. Preserve live offsets/buffers and count replay
duplicates. Reverting to raw-original retention is a privacy regression requiring review,
not an automatic fallback. No protected container restart/recreate/reload is authorized by
this document. Deployed rollback and crash recovery remain NOT VERIFIED.
