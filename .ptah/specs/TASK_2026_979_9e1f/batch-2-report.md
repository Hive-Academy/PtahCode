# Backend implementation — `TASK_2026_979_9e1f`, batch 2 (#1469 linked-worktree guard, C7)

**Tasks completed**: 2.1, 2.2, 2.3. The one spec that 2.2's new removal proof broke is fixed; the coordinator added it to the write set (see "Follow-up fix").

## Files

- CREATED `libs/backend/harness-sync/src/lib/workspace/linked-worktree.ts`: `isLinkedWorktreeRoot(root): Promise<boolean>`, true only when `lstat({root}/.git)` is a regular file. An error, or an empty root, returns false. It also exports `isLinkedWorktreeRootSync`, which the synchronous planner uses.
- CREATED `libs/backend/harness-sync/src/lib/workspace/linked-worktree.spec.ts`: four cases. `.git` is a file, `.git` is a directory, `.git` is missing (including a missing root and `''`), and lstat throws (a real NUL-byte path, no mock).
- MODIFIED `libs/backend/harness-sync/src/index.ts`: exports `isLinkedWorktreeRoot`.
- MODIFIED `libs/backend/harness-sync/src/lib/targets/mcp/mcp-facet-planner.ts`:
  - `planMcpFacet` returns `emptyMcpFacetPlan()` for a linked-worktree root, before it reads anything. Writes, removals and `ownedKeys` are all empty, so the manifest's MCP rows pass through unchanged.
  - `applyMcpFacet` and `applyRetiredMcpRemoval` return without touching the facet in a linked worktree and record nothing, so every row stays owned. This backstop also covers the `runRemove` uninstall sweep, which builds its removals from the manifest itself.
  - New `applyOwnedMcpRemoval` sends every non-retired removal through a proof:
    1. Key already gone: recorded in `removed`.
    2. Hash differs from the manifest: kept on disk and recorded in `releasedTracked`.
    3. Workspace config: git `tracked`, or `unverifiable` inside a git checkout, is kept and recorded in `releasedTracked`. A `~/` home config skips the git check.
    4. Otherwise `facet.remove`.
    5. No context, no owned hash, or an I/O failure: `writeFailed`, and the key stays owned.
- CREATED `libs/backend/harness-sync/src/lib/targets/mcp/mcp-facet-planner.linked-worktree.spec.ts`: regression 3, harness half.
  - Setup: a real `git init` repo with a commit, a real `git worktree add`, a tracked `.vscode/mcp.json` with `zernio`, and a tracked `.agents/mcp_config.json` with a `ptah` `/workspace/` entry. The manifest owns `zernio`, there are no other intents, and one new intent targets `vscode` and the home `antigravity` config.
  - The sync runs through `WorkspaceHarnessTarget` plan and apply. Afterwards no file has changed, no `.bak` exists, no home config was created, and `git status --porcelain` is empty.
  - Further cases: the planner reads nothing in a worktree; apply calls neither `write` nor `remove` for a plan built elsewhere.
  - Main-checkout cases: a git-tracked owned key is kept and in `releasedTracked`; a hand-edited key is kept and released without asking git; an untracked, unchanged key is removed while the hand-added sibling stays; with no proof context the removal is `writeFailed` and nothing is deleted.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.ts`:
  - `removeUnowned` (the `facet.remove` call) and `reconcileTargets` (the `:718+` reconcile) now check `isLinkedWorktreeRoot(resolveHarnessWorkspaceRoot(workspaceRoot))` first.
  - In a linked worktree they skip, record the skip through `options.warn` (`serverKey`, `reason`, `targets`), and return `{ success: false, deferred: true, error: MCP_LINKED_WORKTREE_SKIP_COPY }` per target.
  - The intent change is still saved.
- MODIFIED `libs/backend/harness-sync/src/lib/sources/plugin-config-source-resolver.spec.ts` (approved by the coordinator): the control test at `:460` now runs `git init -q` in `wsA` before the reconcile. The expected result is unchanged (`readMcpJson(wsA)` equals `{}`).
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.spec.ts`: three cases.
  - Install in a worktree: reconcile is not called, the intent is recorded, the result is deferred with the fixed copy, no `.mcp.json` is created, and the warning is logged.
  - Force uninstall in a worktree: the file is byte-identical, there is no `.bak`, and the skip is logged.
  - Control: with `.git` as a directory, force uninstall still removes the key.

## Stack observed

- Plain functions and classes, no DI: the harness-sync targets take options objects (`workspace-target.ts:122-161`), and `McpInstallService` takes constructor args.
- Fallible paths follow the result-record convention (`HarnessApplyResult`, `harness-target.port.ts:194-231`).
- Git proof comes from `retirement-proof.ts` (`GitTrackingProbe`).
- The "unverifiable inside a git checkout" rule copies the command-removal rule at `workspace-target.ts:335-343` and `claude-target.ts:414-422`.
- Catch suppressions use the `degradation-audit:` kinds from `tools/degradation-audit/check-degradation.ts:107`.

## Verification

All checks are focused, and the logs are under `.ptah/tmp/`. I did not run `npm run verify` or `nx`, per the brief.

- `npx jest --config libs/backend/harness-sync/jest.config.ts --runInBand --coverage=false --runTestsByPath <new planner spec> <linked-worktree spec> <retirement spec>`: 3 suites, 21 tests passed (`b2-jest1.log`).
- `npx jest --config libs/backend/harness-sync/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 31 harness-sync specs that mention mcp>`:
  - First run: 30 suites passed, 1 failed; 432 tests passed, 1 failed, 2 skipped (`b2-jest2.log`).
  - After the follow-up fix: 31 of 31 suites passed; 433 tests passed, 2 skipped, 0 failed (`b2-jest4.log`). This run includes `plugin-config-source-resolver.spec.ts`.
- After the follow-up fix: `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.spec.json` exits 0. `npx eslint` and `npx prettier --check` on `plugin-config-source-resolver.spec.ts` are clean.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.spec.ts`: 63 tests passed (`b2-jest3.log`).
- `npx tsc --noEmit --project` for harness-sync `tsconfig.lib.json` and `tsconfig.spec.json`, and cli-agent-runtime `tsconfig.lib.json` and `tsconfig.spec.json`: all exit 0 (`b2-tsc.log`).
- `npx eslint` on the 7 changed files: 0 errors and 1 warning (`b2-eslint.log`). The warning is `no-useless-assignment` at `mcp-install.service.ts:665` (`stillPresent` in `verifyRemoved`); that code predates this batch.
- `npx prettier --check` on the changed files: clean.
- `npx tsx tools/degradation-audit/check-degradation.ts`: no site in the batch's files. It exits 1 on 2 sites in `libs/backend/vscode-lm-tools/.../protocol-dispatcher.ts:741,785`. That file is outside this batch and is modified in the working tree by another executor.

## Follow-up fix (write set extended by the coordinator)

`plugin-config-source-resolver.spec.ts:460-466` ("control: a store that truly records nothing does remove the entry") failed after 2.2.

- Cause: its `workspace()` helper creates an empty fake `.git` directory, so `git ls-files` exits 128 and the probe returns `unverifiable`. Under the new proof, that keeps the owned `.mcp.json#github` key.
- Fix: the test now runs `git init -q` in `wsA`, with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` cleared, the same way the linked-worktree spec runs git. The probe can then prove `.mcp.json` untracked, and the key is removed.
- The expectation is unchanged and the test passes.

## `rg -n "facet\.(write|remove)\(" libs/backend/harness-sync/src libs/backend/cli-agent-runtime/src` (non-spec hits)

| Hit | Status |
| --- | --- |
| `cli-agent-runtime/.../mcp-install.service.ts:631` `facet.remove` (removeUnowned) | Guarded: `inLinkedWorktree` check at the top of `removeUnowned`, skip recorded |
| `harness-sync/.../mcp-facet-planner.ts:247` `facet.write` (applyMcpFacet) | Guarded: `isLinkedWorktreeRoot` early return in `applyMcpFacet`, and the planner emits no writes |
| `harness-sync/.../mcp-facet-planner.ts:340` `facet.remove` (applyRetiredMcpRemoval) | Guarded: `applyMcpFacet` returns first, and `applyRetiredMcpRemoval` has its own backstop |
| `harness-sync/.../mcp-facet-planner.ts:424` `facet.remove` (applyOwnedMcpRemoval) | Guarded: reached only through `applyMcpFacet` after its worktree check |
| `cli-agent-runtime/.../antigravity-cli.adapter.ts:1231, 1265, 1267` | Excluded (Decision D2): the agy adapter's per-spawn `ptah` entry in `~/.gemini/config/mcp_config.json`, not harness sync |

Spec-file hits (6 files) are test fixtures that seed and remove keys directly.

## Decisions

- **The planner uses a sync form of the helper.**
  - Options: make `planMcpFacet` async, which changes `workspace-target.ts` and `claude-target.ts` outside the write set; or export a sync twin.
  - Evidence: `planMcpFacet` is synchronous, and its callers are outside the batch.
  - Choice: `isLinkedWorktreeRootSync`, kept next to the async contract function. Reversible.
- **How an `unverifiable` git answer is handled for non-retired removals.**
  - Options: strict (only `untracked` deletes), or the command-removal rule (`unverifiable` keeps only inside a git checkout).
  - Evidence: `workspace-target.ts:335-343` and `claude-target.ts:414-422`. Under the strict rule, no owned key would ever be removed in a non-git workspace.
  - Choice: the command-removal rule. Reversible.
- **Missing proof context for a non-retired removal is `writeFailed`.**
  - The key stays owned, which mirrors the retired path. Releasing it was the other option, but that would drop ownership because of a caller bug.
  - Both real callers supply the context. Reversible.
- **Install service skip result.**
  - Choice: `deferred: true`, `success: false`, and a local fixed copy `MCP_LINKED_WORKTREE_SKIP_COPY`, with no `code`.
  - Evidence: `McpInstallResultCode` lives in `@ptah-extension/shared`, which is off-limits for this batch.
  - The skip is recorded through `options.warn`. In a worktree, `reconcileTargets` skips the whole reconcile, so the result never reads as a silent success.

## Plan deviations

- The acceptance says `isLinkedWorktreeRoot` returns a Promise and the planner is synchronous, so a sync twin was added (see Decisions).
- There is no separate "server-start sweep" step in the spec. The uninstall-style sweep (an apply with removals built from the manifest) is covered by the `applyMcpFacet` backstop case.

## Out-of-scope observations

- `hasGitMarker` now exists three times: `workspace-target.ts:112`, `claude-target.ts:95`, and the new `insideGitCheckout` in `mcp-facet-planner.ts`. A third use is enough to justify extracting it to `retirement-proof.ts`, but both targets are outside the write set.
- A dedicated `McpInstallResultCode` (for example `skipped-linked-worktree`) in `@ptah-extension/shared` would let the webview render the skip by code. It was not added because that lib is off-limits here.
- The reconciler logs every `releasedTracked` path as "Released tracked command" (`harness-reconciler.service.ts:340, 711`), and that list now also carries MCP keys.
- A workspace-scoped MCP intent recorded from a linked worktree is keyed to the worktree path, so it is never applied anywhere. This follows from decision 7 and is worth a line in the PR.
