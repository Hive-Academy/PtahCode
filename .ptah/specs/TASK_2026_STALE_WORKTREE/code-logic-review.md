# Code Logic Review — `TASK_2026_STALE_WORKTREE`

## Verdict

**CHANGES REQUIRED — 5/10.** The successful Ptah removal paths clear organization links and broadcast changes, and task tools pass `worktreePath` through their schemas. The renderer fallback still fails the required cross-surface agreement and recovery cases. These are visible functional gaps, above a 3–4 foundational failure because backend removal and task routing are substantially wired, but below a 7–8 sound implementation.

## Findings

### MAJOR — Dock and card/inspector can show different repositories after shell removal

`libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:259-265` excludes a refused worktree only in the dock store. `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts:151-164` calls `resolveSessionWorkingRoot` without `unavailableRoots`; the chat scope/inspector uses the same original session candidate. After a shell `git worktree remove`, the dock moves to main while cards keep asking for the removed root and report unavailable. This directly misses Part A's one-root requirement. **Fix:** share the unavailable-root decision with card stats and inspector, or clear/refresh the session candidate centrally before all three resolve it.

### MAJOR — A recreated worktree stays excluded for the lifetime of the dock store

`libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:228,259-265` only appends to `unavailableRoots`; no path removes an entry when Git reports the root available or when a worktree is added again. `libs/shared/src/lib/utils/session-working-root.ts:67-70` will therefore skip a recreated worktree indefinitely. The dock can keep operating on main even after the session points to its restored worktree. **Fix:** scope exclusions to a failed root/session and clear them on a successful probe or worktree-added/organization change; retarget the dock when the root returns.

### MAJOR — Persistence failure is reported as successful worktree removal

`libs/backend/session-organization/src/lib/session-organization.service.ts:207-215` catches a store failure, only logs it to the output channel, and returns `void`. The RPC continuation at `libs/backend/rpc-handlers/src/lib/handlers/git-rpc.handlers.ts:440-451` and MCP notification path at `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:1200-1203` cannot know cleanup failed; they still return/broadcast successful removal. The stored link remains stale, so the original error recurs after reload. **Fix:** return a cleanup result or propagate the failure to callers, log it with the injected `Logger`, and make the user-facing result distinguish Git removal from organization cleanup failure. A failed cleanup must be retryable.

### MINOR — Fallback reason is shown for unrelated sessions and scopes

`libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:157-160,171-174` shows “Worktree removed. Showing the main repository.” whenever the global exclusion array is nonempty, even if the active/pinned session resolved to its own healthy worktree or the workspace root. **Fix:** derive the reason from the current candidate's excluded path and the actual selected fallback source.

## Five logic questions

1. **How does this fail silently?** Organization persistence errors are caught and reduced to an output-channel line while removal still reports success (`session-organization.service.ts:207-215`).
2. **What user action produces unexpected behaviour?** Removing a worktree in a shell splits dock and card/inspector roots; recreating it leaves the dock on main (`git-dock-scope.store.ts:259-265`; `session-git-stats.store.ts:151-164`).
3. **What input produces a wrong answer?** A prior unavailable root plus a different active session produces a false removal banner (`git-dock-scope.store.ts:171-174`).
4. **What happens when a dependency fails?** If the organization store throws, no durable cleanup occurs and callers cannot retry from the returned result (`session-organization.service.ts:207-215`).
5. **What is missing?** A shared, expiring unavailable-root state for dock, cards and inspector, with recovery when the path returns.

## Evidence and scope

Reviewed `git diff main`, the task and implementer reports, removal callbacks, task namespace/dispatcher/tool descriptions, shared resolver, card store, dock store, task allocator, and matching orchestration copies. MCP git removal notifies only after a zero exit (`git-namespace.builder.ts:226-245`); RPC async completion clears after `result.success` (`git-rpc.handlers.ts:440-467`); SDK callback follows completed removal (`worktree-hook-handler.ts:377-403`); Electron watcher follows successful prune and confirming list (`git-watcher.service.ts:1005-1045`). Store path comparison uses `path.resolve` and Windows case folding (`session-organization.store.ts:508-538`). Task validation resolves real paths and compares against Git's list; writer visibility scans sibling worktrees (`tasks-namespace.builder.ts:711-751`; `git-task-folder-visibility.service.ts:183-219`). No source or configuration files were edited. Tests/build were prohibited; scoped Ptah diagnostics were unavailable because the TypeScript check timed out.
