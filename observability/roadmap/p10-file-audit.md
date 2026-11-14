# P10 generated-file audit and approved recovery preflight

**P10 remains PARTIAL. Full recovery is BLOCKED by memory capacity, not authorization.** The user approved the full-recovery envelope; no disposable recovery resource was created because the mandatory guard failed. Prior ENOSPC correction, privacy, retention and native scenario results remain unchanged.

## File population and classification

The initial Git population was exactly **254 files**: one modified tracked roadmap file plus 253 untracked files (249 under `p10-validation` and four P10 Markdown files). Git's collapsed directory rows are not file counts. Separately, **469 ignored files** existed in nineteen manifest-named P10 `.local` workspaces. Other `.local` work, P08 staging/credentials, backups, submodules and unrelated phases were not treated as disposable P10 output.

The final physical audit population is **731 files**: **262 public-tree files** plus **469 ignored local runtime files**. This includes the new audit/guard scripts, catalog, archive, preflight, this report and scoped Git attributes. **213 public-tree files are Git candidates**; 49 raw duplicate paths are ignored because their exact bytes are retained in the version-controlled archive. No file was deleted.

| Category | Public tree | Ignored `.local` | Total |
| --- | ---: | ---: | ---: |
| Source code and validation scripts | 16 | 0 | 16 |
| Configuration | 2 | 227 | 229 |
| Documentation | 6 | 0 | 6 |
| Essential reproducible evidence | 107 | 0 | 107 |
| Historical failed evidence | 61 | 0 | 61 |
| Temporary test artifacts | 0 | 46 | 46 |
| Generated logs, metrics and traces | 70 | 0 | 70 |
| Disposable runtime files | 0 | 196 | 196 |
| **Total** | **262** | **469** | **731** |

Categories are mutually exclusive. Version-control decisions are a separate field: required historical failures and useful measured log/metric evidence can remain version-controlled even when their category is generated output. The complete path/size/hash/classification/publication decision catalog is [file-audit.json](p10-validation/evidence/file-audit.json). Its own size/hash is omitted to avoid a self-reference. No private runtime file contents or secret values are copied into that catalog.

## Retained, consolidated and ignored

- Retain source generators/validation scripts, documentation, authoritative acceptance receipts, manifests, primary results, baselines/final inventories, unique failure diagnostics and measured queue/loss/recovery/privacy evidence.
- Nine exact-duplicate groups were identified, including repeated approvals, empty diagnostics, unchanged post-test snapshots, per-assertion inventories, privacy schemas and two native-rule outputs. Primary receipts/approvals and unique failures were deliberately left readable.
- **49 duplicate diagnostic/preservation paths**, representing **three unique payloads**, were consolidated into one **12,722-byte** archive: [duplicate-evidence.json.gz](p10-validation/evidence/duplicate-evidence.json.gz). Every archived path was decompressed and its SHA-256 compared with the existing raw file before the archive was accepted.
- Raw files remain locally, unchanged. Exactly those 49 paths were added to `.gitignore`; no broad `*.json`/evidence ignore was introduced. Their history is version-controlled through the archive and path-to-digest map. Old manifests still reference the original bytes, which can be materialized safely.
- All 469 runtime files remain covered by the pre-existing `.local/` ignore. Do not stage generated CA/private/symmetric keys, signed test tokens, credentials, actual runtime Compose files, plaintext extraction or synthetic encrypted packages from those workspaces. Source generators are the reproducible configuration, not those instantiated values.
- **Zero removals**, no `git clean`, prune, reset, staging, commit, push or merge. Git candidates decrease from 254 to 213 after adding the audit work and consolidating duplicates.

Git already deduplicates identical blobs. The archive primarily reduces the number of reviewable paths; no Git pack-size or physical-disk savings are claimed. Raw files remain intentionally present for historical verification. Narrow P10 JSON `eol=lf` attributes preserve evidence hashes on Windows checkout, and the gzip archive is explicitly binary; no unrelated attributes or existing file bytes were changed.

Inspect or materialize an archived path without overwriting existing files:

```powershell
node observability/roadmap/p10-validation/audit-files.cjs show observability/roadmap/p10-validation/evidence/jp_obs_validation_20261114103330_35f14ce3/preservation-final.json
node observability/roadmap/p10-validation/audit-files.cjs restore
```

The restore command validates allowed evidence paths and digests, creates only missing files and rejects conflicting existing bytes. Restore raw archive members before verifying a historical full-file manifest in a fresh checkout. No Docker resource is involved.

## Large files and future output

The largest file is the original native run's `results.json`, **1,236,153 bytes**. Other large primary results are **746,176**, **625,175**, **623,619** and **493,063 bytes**. These sizes largely come from repeated unchanged 52-container inventories, not business payload dumps. They are retained as historical results; larger-than-256-KiB files are listed individually in the catalog.

Future `integrated.cjs` assertions now retain a UTC result, protected count and baseline inventory digest; complete inventories remain in the baseline/final files, with full mismatch details only on failure. `dependencies.cjs` now records intermediate preservation checks in one result and writes one final inventory instead of one permanent inventory file per assertion. Historical files were not reformatted or shortened. This source-only reporting change was syntax-checked; native resilience tests were not repeated for it.

## Secret and sensitive-data audit

All public candidates were screened against known disposable/live credential values, JWT/private-key shapes and the declared synthetic input exception. No real credential/token/private-key values were detected in the public candidates. Required evidence does contain operational container/image/volume identities and local paths.

Sensitive material was detected in **100 ignored runtime files**: generated test credentials, signed test JWTs, PEM private keys and symmetric-key files. These remain ignored and are not recommended for Git. This is a file count, not a count of distinct secrets. Public `native-agent.py` contains deliberate invalid-JWT/private-key marker templates; this exact controlled synthetic fixture is identified separately rather than mislabeled as a real credential leak. No real signing-key file was read as a substitute for the privacy test.

The archive only contains bytes that passed the public-file screen and the exact round-trip comparison. Earlier acceptance receipts and required historical failed evidence remain intact. The separate prior native privacy passes are not replaced by a text scan.

## Recovery authorization and failed guard

Approved limits are recorded in [development policy](p10-development-policy.md) and [full-recovery-preflight.json](p10-validation/evidence/full-recovery-preflight.json): 4 GiB storage, 512 MiB test data, 1,500 requests, 3,424 MiB Docker RAM, 768 MiB host Node RAM, six cores, 20 minutes, no additional swap; prior client/rate/fault/drain limits unchanged.

| Resource guard | Actual / criterion | Result |
| --- | --- | --- |
| Docker Engine available capacity | **3,435.576 MiB /at least 3,680 MiB** | **FAIL**, short **244.424 MiB** |
| Host memory | 2,867,630,080 bytes available /at least 1 GiB (768 MiB process plus reserve) | PASS |
| Physical workspace | D: free exceeds 4,352 MiB (4 GiB plus reserve) | PASS |
| CPU | 16 available /six requested | PASS |
| Required cached native images | Six candidate images identified; no pull | PASS |
| Existing P10 runtime collision | None | PASS |
| Branch | `develop` | PASS |

The memory guard uses the minimum of VM `MemAvailable` and engine total minus all running container working sets. Docker's working-set display is rounded; the receipt retains all operands and the method. Both estimates are below the required threshold. It is not treated as a PASS based on rounding or on reclaiming live resources.

**Full recovery was not executed.** Actual full-drill peak storage/RAM/CPU and new full-drill RPO/RTO are **NOT MEASURED**, represented as null in the receipt. Prior synthetic/logical timings and historical P08 RTO were not relabeled as current full-recovery measurements. The file-audit process's own memory/CPU measurements are separately scoped in its catalog.

Complete before/after inventories confirm all **52 original containers**, original volume identities, backup hashes/size/mtime, scheduled-task XML hashes, Git HEAD and submodule revisions are preserved. The guard entry point has no Docker creation/lifecycle commands and records an empty list of resources created. The only exec into an existing monitor reads `/proc/meminfo`; it does not change configuration or state.

The current blocker is capacity. No further budget approval is requested; the supplied authorization is recorded. A later attempt must retain this failed guard receipt and run a fresh complete preflight. Do not stop/restart/recreate/delete live resources or change Docker Desktop settings to obtain headroom. **Overall progress remains 10/12, P10 PARTIAL, P11 unstarted.**
