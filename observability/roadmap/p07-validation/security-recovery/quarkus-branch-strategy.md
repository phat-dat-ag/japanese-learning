# Quarkus branch-alignment strategy (plan only)

Quarkus remains detached at `815b637a799cab8009d154ee9c97cec0f1dce734`, matching the parent's pinned gitlink. `origin/develop` also points there. Local `develop` remains at `d6642616abf0d3373c4ebe1f514d69ec9b669f2a` and is an ancestor of HEAD. No branches, refs or commits were changed during this acceptance task.

At the earlier checkpoint, both dirty files matched the previous tracing-resolution hashes: the local Swagger addition in `src/main/resources/application.properties`, and the reviewed OTLP build-argument change in `Dockerfile`. Root Compose changes are also still uncommitted. A detached HEAD is not itself losing those files, but they are not protected by a new commit.

Recommended future sequence, for the operator to authorize separately:

1. Recheck the parent gitlink, Quarkus HEAD, staged/unstaged/untracked files and branch name availability. Keep the saved original file/patch and an external copy of current reviewed diffs. Do not stash, clean, reset or discard local work automatically.
2. Attach a new review branch at the current HEAD, for example `git -C quarkus switch -c p07/vocabulary-tracing-acceptance HEAD`. At the same commit this should carry the working tree without a revision transition. Stop if Git reports any collision or unexpected change. This is a proposal, not a command executed here.
3. Review the Dockerfile change separately from the pre-existing Swagger preference. Any commit/push requires explicit authorization. Never make an automatic commit to preserve work.
4. If the operator later wants to update `develop`, first make the working tree clean through explicitly approved review/preservation. Then switch to `develop` and use a fast-forward-only update to the already-inspected desired revision. Re-evaluate remote state first; do not fetch/pull/rebase blindly or force the ref.
5. Update the parent gitlink only after a separately approved Quarkus commit exists and is available to collaborators. The current pinned commit remains unchanged by this task.

Evidence: `evidence/quarkus-branch-state.json`. No branch-alignment command above was run.

Final source drift: after that checkpoint, the Swagger addition became absent and application.properties now matches its index. This task did not write Quarkus source. The cause is unexplained; the operator instructed recording the drift for review, so no restoration was performed. The original backup/patch remains available. Dockerfile hash and branch refs are unchanged. See evidence/quarkus-final-drift.json. Re-inspect current edits before any future branch operation.
