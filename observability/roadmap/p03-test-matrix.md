# P03 test matrix and commands

2026-11-13. Source/fixture status and runtime status are separate. Evidence:
[results](p03-validation/evidence/test-results.json), [preflight](p03-validation/evidence/preflight.json),
[preservation](p03-validation/evidence/preservation.json). No existing verification script
that creates/restarts Docker resources was run.

| Scenario | Local result | Collector/store runtime result |
|---|---|---|
| .NET, Quarkus, Nginx, JWKS, legacy envelopes | PASS P02 fixture inventory/3 reference methods | NOT VERIFIED; prepared Lua tests unexecuted |
| optional fields/nested JSON/numbers/booleans | source reviewed; P02 reference methods PASS | NOT VERIFIED; Lua/MessagePack unavailable |
| timestamps/correlation/trace/span/error fields | candidate source reviewed; no schema stamp | NOT VERIFIED; timestamp calendar/UTC conversion incomplete |
| disjoint inputs and persistent DB paths | PASS source check | NOT VERIFIED inode/offset behavior |
| rename rotation | PASS 100/100 local readable-spool experiment | NOT VERIFIED Fluent Bit |
| copy-truncate | FAIL loss criterion in local active-only reproducer | NOT VERIFIED actual collector |
| immediate compression | FAIL loss criterion, 100/100 locally missing | NOT VERIFIED actual collector |
| delayed compression | PASS 100/100 local precompression replay | NOT VERIFIED actual handoff |
| partial line completion | PASS bounded local reader rejects partial then reads completed line | NOT VERIFIED collector pending-line persistence |
| oversized/malformed records | PASS local bounded reader: 3 rejects, 1 valid | NOT VERIFIED 1M Fluent Bit boundary/drop visibility |
| collector process restart | local whole-file reopen produces 100 duplicates; no durable-offset model | NOT VERIFIED actual restart |
| collector container crash | no test | BLOCKED Docker denial/isolation |
| producer restart | source rotate-on-boot behavior inspected | NOT VERIFIED runtime |
| OpenSearch unavailable | 256-byte reference queue experiment only | BLOCKED Docker denial/isolation |
| slow ingestion | no timing assertion | NOT VERIFIED |
| backend recovery/backlog replay | local 25-record queue-file replay only | NOT VERIFIED actual retry/backlog/drain |
| bounded overflow | PASS model ceiling, 75 explicit evictions; loss criterion FAIL | NOT VERIFIED chunk granularity/counters |
| disk pressure/hard quota | no host-fill test | BLOCKED hard bound/isolation unavailable |
| 15-minute collector downtime | not run | BLOCKED runtime and approved workload/drain budget |
| bearer/refresh/password/cookie/Authorization/DB/query/private-key sentinels | prepared Lua fixtures; P02 reference view PASS | NOT VERIFIED actual filter/buffers/store |
| malformed fallback/original/_source | original source policy FAIL; inactive no-raw design reviewed | NOT VERIFIED stored synthetic documents |
| existing mapping field types | PASS source literals, bootstrap never imported/executed | NOT VERIFIED installed mapping/bulk rejection |
| existing readers/dashboards/search | original-dependent reader identified | BLOCKED raw-reader migration; runtime NOT VERIFIED |
| Nginx syntax current/candidate/frontend | P02 format rendering PASS | NOT VERIFIED nginx -t; no binary/Docker access |
| full application tests | NOT APPLICABLE: no producer code changed | historical P02 224 not recounted as P03 |
| resource lifecycle/cleanup | no Docker resources created | protected resource equality NOT VERIFIED |

Executed counts: **13 P03 Python methods PASS**, zero final failures/errors; **3 P02 Python
methods PASS**, zero failures. These comprise five source checks and eight filesystem/model
experiments plus P02's 50 envelope subcases and format/type reference cases. Lua assertions,
Fluent Bit validation and OpenSearch runtime tests: **0 executed**. Do not sum the 50
subcases as additional test methods or claim 224 application tests rerun.

Safe commands executed from root:

```powershell
python -B observability/roadmap/p03-validation/snapshot.py observability/roadmap/p03-validation/evidence/preflight.json
python -B observability/roadmap/p03-validation/verify.py
python -B observability/roadmap/p02-fixtures/verify.py
python -B observability/roadmap/p03-validation/snapshot.py observability/roadmap/p03-validation/evidence/final.json
python -B observability/roadmap/p03-validation/finalize.py
git diff --check
git -C dotnet diff --check
git -C quarkus diff --check
git -C angular diff --check
docker ps -a --format '{{.ID}} {{.Names}} {{.Image}}'
docker volume ls --format '{{.Name}}'
docker network ls --format '{{.ID}} {{.Name}}'
```

All Docker listings returned named-pipe permission denied. No escalation or permission
change followed. get-command found Python but no Lua/LuaJIT/Nginx/Fluent Bit. Git submodule
status failed with Win32 signal-pipe error 5; direct per-repository metadata worked.

Intermediate test failures retained as limitations: two attempts using Python 3.14
TemporaryDirectory produced 16 errors each (eight write failures plus eight cleanup
failures); five source methods passed in each attempt. The corrected ordinary inherited-
permission workspace UUID directories completed all 13 methods without elevating or
changing ACLs. Failed directories received no fixture contents; exact leftover inventory
is in [cleanup](p03-validation/evidence/cleanup.json). No assertions were weakened.
The untracked-file whitespace check initially caught one extra blank line at EOF in the
candidate profile; it was removed. Finalize also parses all new Python sources, checks
new-file whitespace, verifies seven reports/31 local links and compares 26 preservation
checks. Existing tracked root/affected-submodule diff checks pass separately.

Candidate config/Lua syntax and sentinel output tests must run against the pinned collector
in a future safe isolated environment. Standalone Lua tests, if available later, are
automatically invoked by verify.py and reported separately; they never imply OpenSearch
or protected-project acceptance. [README](p03-validation/README.md) states isolation gates.
