# Code Logic Review — `TASK_2026_961_f230`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 3/10 |
| Assessment | NEEDS_REVISION |
| Blocking issues | 2 |
| Major issues | 2 |
| Minor issues | 0 |
| Failure modes found | 4 |

The score reflects a syntax error in the changed spec and a remaining global write in the scope fix. The exact-rule approach covers the initial gitignore case, but its update path has two behavioral gaps. This is below the sound 7–8 band because two of the three requested defects remain possible; it is above the foundational 1–2 band because the new workspace install path and most store paths are wired correctly.

## Five logic questions

1. **Silent failure:** Legacy adoption places a workspace skill in the global store before the scoped install (`harness-skill-install.service.ts:76`, `skills-sh-legacy-adoption.ts:121-127`). A zero-pattern reconcile reports `unchanged` while keeping an obsolete managed rule (`gitignore-writer.ts:206-213`).
2. **Unexpected user action:** Applying a harness with a legacy skills.sh lock can expose the adopted skill to other workspaces. Removing the last synced skill leaves its ignore rule. Adding a project re-inclusion after the managed block can make the synced skill visible again (`gitignore-writer.ts:226-229`).
3. **Wrong-answer input:** An existing block followed by `!.claude/skills/**` defeats an exact rule kept in the earlier block; the evaluator models the later negation, but the block is not moved (`gitignore-writer.ts:408-413, 226-229`).
4. **Dependency failure:** If `git ls-files` fails or times out, no new per-skill rule is written (`gitignore-writer.ts:449-463`), a conservative result. With an existing block, the empty-pattern branch retains stale rules (`gitignore-writer.ts:206-213`).
5. **Missing requirement:** A single, workspace-scoped destination for legacy adoption is required to fully prevent cross-workspace leakage (`skills-sh-source-root.service.ts:1021-1029`, `skills-sh-legacy-adoption.ts:121`).

## Findings

### Blocking — Changed spec has a malformed string literal

- **Evidence:** `libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.spec.ts:408-414` has `.join('` on line 413 and the closing `');` on line 414, with a literal line break inside a single-quoted string.
- **Impact:** TypeScript cannot parse the spec. The changed project cannot complete its normal test/typecheck gate.
- **Fix:** Use an escaped newline in the string literal and rerun the scoped gate when the concurrent verification has finished.

### Blocking — Legacy adoption still leaks a workspace skill globally

- **Evidence:** `libs/backend/rpc-handlers/src/lib/harness/io/harness-skill-install.service.ts:73-76` adopts before the workspace install. `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.ts:1021-1029` passes the global `pluginsBasePath` to adoption. `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-legacy-adoption.ts:120-127` copies the legacy skill there and removes the workspace copy.
- **Trigger/impact:** Apply a harness in a workspace with a valid legacy skills.sh lock and skill directory. The adopted root becomes globally discoverable, so another workspace in sync mode `all` can see it, contrary to defect 1's intent. The later workspace-scoped install does not remove the global adopted root.
- **Fix:** Adopt into the workspace plugin root for this flow, or migrate the adopted global root to workspace scope before propagation. Keep the existing global adoption behavior only for callers that explicitly request global scope.

### Major — Last unsynced skill leaves its managed ignore rule

- **Evidence:** `libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts:206-213` returns `unchanged` whenever the desired pattern list is empty, even when `existing.kind === 'found'`. By contrast, a nonempty replacement is spliced at lines 226-229. The added test at `gitignore-writer.spec.ts:473-482` removes only one of two skills, so it does not cover the final-rule case.
- **Trigger/impact:** Unsync the last skill in a re-included skills directory, or have a git-tracked check make the last exact rule unnecessary. The old block continues to ignore that path and the result says `unchanged` with no patterns.
- **Fix:** Remove or empty the existing managed block when the computed patterns become empty, while recording state so the automatic removal is not mistaken for a user deletion on the next pass.

### Major — A later project negation overrides exact rules in an existing block

- **Evidence:** `libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts:190-204` evaluates rules outside the block; lines 226-229 replace the block at its prior position. Gitignore uses the last matching rule. A project rule such as `!.claude/skills/**` added after the block overrides `.claude/skills/<slug>/` within it. The new test at `gitignore-writer.spec.ts:431-449` only covers a block appended after the negation.
- **Trigger/impact:** Ptah writes a block, then the project adds a re-inclusion below it. Reconcile selects an exact rule but writes it before the re-inclusion; the synced skill remains visible in `git status`.
- **Fix:** Place generated exact rules after the relevant outside re-inclusion, or use a placement strategy that checks the effective final gitignore result after writing.

## Data flow and requirements

| Path | Result |
| --- | --- |
| Harness apply → `installSkills` → scoped `sourceRoots.install` → `installedPaths` | Scoped location and reported root path agree (`harness-skill-install.service.ts:94-132`). |
| Harness apply → legacy adoption → source root | Global destination remains (`skills-sh-legacy-adoption.ts:121-127`). |
| Dev Electron setting → `resolvePtahHomeDir` → content download, source roots, user mirror | The changed writers/readers use the settings directory (`file-settings-manager.ts:88-90`, `content-download.service.ts:98-101`, `user-layer-mirror.service.ts:392`). Plugin loader receives the content-download plugin path through Electron activation (`apps/ptah-electron/src/activation/plugin-activation.ts:336-370`). |
| Reconcile → manifest skill paths → writer → managed block | Manifest paths are passed (`harness-reconciler.service.ts:573-584`); empty desired rules and rule position remain incorrect (`gitignore-writer.ts:206-213, 226-229`). |

`skillsSh:install` passes an explicit location (`skills-sh-rpc.handlers.ts:410-420`), so its global default is not implicated by this diff. CLI and VS Code retain the default store when `PTAH_SETTINGS_DIR` is unset (`file-settings-manager.ts:65-90`). Constructor home overrides in the source-root and migration services still join the supplied home with `.ptah` (`skills-sh-source-root.service.ts:219-223`, `install-scope-migration.service.ts:336-340`). No additional split of `plugins/` or `user/` was established in the inspected runtime paths; this does not cover every unrelated home-based cache or settings path.

## Decisions

- **Severity:** Treat the malformed spec and remaining cross-workspace leak as blocking because they prevent verification and violate the primary isolation requirement. The gitignore gaps are major because they affect ordinary edits to project rules and sync state. These are reversible fixes based on cited code.
- **Verification:** Per the request, no build, test, diagnostics, or other verify command was run. Evidence comes from `git status`, `git diff`, whole-file inspection, and call-path reading.

## Verdict

**NEEDS_REVISION.** Fix the four findings, then verify the changed projects after the concurrent verification finishes. Confidence: high for the cited control-flow and syntax defects; medium for the breadth of home-store isolation outside the inspected paths.
