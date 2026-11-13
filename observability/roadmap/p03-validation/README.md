# P03 isolated validation artifacts

Inactive source candidates. No deployment command is provided. Read [verification](../p03-verification.md)
and [test matrix](../p03-test-matrix.md) before interpreting results.

Run from the repository root:

```powershell
python -B observability/roadmap/p03-validation/verify.py
python -B observability/roadmap/p02-fixtures/verify.py
```

The first command runs source checks and small, bounded Python filesystem/queue reference
experiments. It writes only its evidence JSON and newly owned flat `run-<UUID>` directories
inside this directory; it removes only its own synthetic files. Maximum workload is 100
records per experiment and less than 64KiB input per experiment. It uses no Docker or network.
The measurements named `delivered` mean **read by the local replay model**, never searchable
OpenSearch delivery. The queue drops individual records; Fluent Bit drops chunks, so its
capacity/loss behavior cannot be extrapolated from this model.

If `lua` or `luajit` is already on PATH, the first command also executes `test_adapter.lua`
against the actual candidate adapter. Otherwise it records NOT VERIFIED. No dependency
download or privilege change occurs. Standalone Lua execution does not prove Fluent Bit
MessagePack conversion, parser failure handling, config acceptance or stored `_source`.

`fluent-bit.p03.conf` is a proposed isolated 64M output profile, using independent
`/p03-state` DB/buffer paths, `/p03` read-only candidates and synthetic `/logs` mounts only.
`p03-opensearch` must resolve solely inside a future dedicated test network. No Compose
model/image is activated. The current pinned 4.2.5 collector must validate this profile
before any use; no local Fluent Bit binary was available. Keep the parser intentionally
without Time_Key so producer event time and collector time stay distinct.

A future Docker harness must first inventory protected resources using normal access,
validate exact new project/run ownership and nonsharing of every mount/network/volume,
verify hard backing-storage quotas and host headroom, reserve ports (prefer no published
ports), and set memory/CPU/PID limits. Use no Docker socket or protected credentials.
No lifecycle or cleanup command is safe until these gates pass. This directory does not
offer an unchecked `up` or `down` shortcut.

Candidate loss/privacy changes are review proposals: 32 up chunks, 8M backlog memory, 64M
isolated output cap, unchanged 1M input line skip, infinite retries within bounded output,
fail-closed allowlisted adapter without original/free text. Up-chunk count is a soft
memory control, not a hard RSS/disk quota. Raw input chunks may precede Lua filtering.
No P01 64KiB encoded-event guarantee is claimed.

Initial Python 3.14 TemporaryDirectory experiments created directories but their restrictive
permissions prevented file creation/cleanup. Eight such workspace directories and eight
OS-temp directories could not be removed with normal access. They received no fixture
content. They are inventoried in [cleanup evidence](evidence/cleanup.json); no permissions
were changed. The corrected harness uses normal inherited workspace permissions and
removes only its fresh UUID directories. Do not recursively clean this directory.
