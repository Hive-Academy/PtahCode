# Batch B1 report

## Files changed

- `libs/backend/task-end-hook/src/lib/ports/pr-status.port.ts`: added close-out PR status and lookup while preserving the existing open-PR exports.
- `libs/backend/task-end-hook/src/lib/ports/git-cleanup.port.ts`: added guarded write-capable Git cleanup contract.
- `libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts`: added the default-off opt-in key and typed settings value.
- `libs/backend/task-end-hook/src/lib/config/task-end-hook-config.spec.ts`: covered false default, true, and invalid-value fallback.
- `libs/backend/task-end-hook/src/lib/di/tokens.ts`: added `GIT_CLEANUP_PORT`.

## Exported types

- `TaskCloseOutPrStatus`: discriminated `open | merged | closed-unmerged | unknown`; known PRs have number and URL, merged PRs may have merge commit.
- `CloseOutPrStatusPort`: `prStatus(mainRoot, branch)` returns `TaskCloseOutPrStatus`.
- `TaskWorktreeInspection`: canonical path, branch, clean including untracked, and merged-into-main boolean.
- `GitCleanupResult<T>`: `ok` with value, `refused` with reason, or `failed` with reason.
- `GitCleanupPort`: inspect task worktree, remove worktree without force, and delete branch with `-d`.
- `TaskEndHookSettings`: optional `taskCloseOut.autoRemoveMergedWorktreeAndBranch` for compatibility with existing fixtures; the reader always supplies it.
- Existing `TaskEndPrStatus`, `PrStatusPort`, and `TaskEndDIToken` remain exported; the latter now includes `GIT_CLEANUP_PORT`.

## Verification

- `ptah_get_diagnostics` after edits: 0 errors, 0 warnings in the changed project.
- Ran exactly once: `npm run verify -- -p @ptah-extension/task-end-hook 2>&1 | Select-Object -Last 40`.
- Lint and typecheck: `NX 2 tasks: 2 succeeded`.
- Tests: `NX 1 task: 0 succeeded, 1 failed`; Jest: 9 failed, 10 passed suites; 44 failed, 557 passed tests (601 total). Exit code 1.
- One failure is caused by this batch's added token: `di/register.spec.ts` classifies all tokens absent from its `HOST_PORTS` list as library tokens, so it expects `GIT_CLEANUP_PORT` to be registered. That spec is outside B1's allowed files and needs a follow-up fixture update.
- Other failing suites exercise unchanged code. Among their failures are Windows `EPERM` symlink creation and path-resolution expectations.

## Decisions

- Added a separate `CloseOutPrStatusPort` instead of changing `PrStatusPort`: existing adapters implement only `openPrStatus`, so changing its required contract would break them. Reversible when adapters are updated.
- Made `TaskEndHookSettings.taskCloseOut` optional while the reader always returns the new value: four existing test fixtures in files outside B1 construct settings directly. Reversible after those fixtures are updated.
- Kept the new Git token in the host-port section of the token registry; the registration spec needs its host-port list extended in a later batch. Reversible.

## Clarifications Needed

None. The registration-spec follow-up is identified above; no product decision is needed.
