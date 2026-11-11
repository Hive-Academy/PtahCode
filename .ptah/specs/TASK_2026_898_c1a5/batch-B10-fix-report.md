# Batch B10 fix report

## Findings

1. Electron activation scans `in_progress` rows with linked worktree and branch, so open PRs can promote them (`apps/ptah-electron/src/activation/task-end-hook.activation.ts:99`).
2. All close-out work for a run goes through the active promise chain; concurrent manual cleanup calls serialize, and `start()` joins the chain (`libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts:77,92,114`).
3. Automatic runs retain refused steps while opt-in is unchanged, cap failed attempts at five, skip terminal `done` runs before PR lookup, and coalesce scans per root (`task-close-out.service.ts:226`; `apps/ptah-electron/src/activation/task-end-hook.activation.ts:103,126`).
4. Both Git adapters map unknown merge refs (exit 128) to refused (`libs/backend/platform-electron/src/git/task-cleanup.adapter.ts:85,115`; `libs/backend/platform-cli/src/git/task-cleanup.adapter.ts:85,115`). Squash proof remains out of scope.
5. Missing, unregistered worktrees report `already-removed`; the close-out service records an `ok` worktree step and proceeds to safe `branch -d` (`task-cleanup.adapter.ts:73` in both adapters; `task-close-out.service.ts:247,261`).
6. Memory curation visits every linked session and aggregates failures and gates (`task-close-out.service.ts:127-148`).
7. Reconciler wiring checks each dependency and has its own catch, preserving the report-only hook on failure (`apps/ptah-electron/src/activation/task-end-hook.activation.ts:84-94,140-148`).
8. Added concurrency, dirty recheck, repeated execution, missing worktree, unknown ref, memory aggregation, and cancelled-merge specs (`task-close-out.service.spec.ts:88-167`; adapter specs; `task-pr-reconciler.service.spec.ts`). The Electron activation spec now scans `in_progress`.
9. Identity conflict logs at warn once per task; the reconciler suppresses a second error log for that known conflict (`task-close-out.service.ts:61-72`; `task-pr-reconciler.service.ts:85`).
10. Merged cancelled tasks stay cancelled and skip close-out. A carrier write error is logged and close-out proceeds (`task-pr-reconciler.service.ts:73-88`).

## Verification

Command: `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron,@ptah-extension/platform-electron,@ptah-extension/platform-cli`

First run: lint/typecheck 8/8 passed. Tests failed in four projects: three adapter spec failures from the new `lstat` call, one service branch retry failure, one Electron activation fixture missing the store, plus the seven known Windows symlink EPERM suites. Those new failures were corrected. Rerun: lint/typecheck 8/8 passed; test targets 3/4 passed. Only `@ptah-extension/task-end-hook:test` failed: the seven known Windows symlink EPERM suites, 41 tests. Its other 14 suites and 576 tests passed. Electron, platform-electron, and platform-cli test targets passed. Full output is in `batch-B10-verify-rerun.log`; Nx task log: `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\12830019583765264372`.

No other confirmed finding was left intentionally unfixed.
