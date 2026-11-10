# Detached Git window scope guard review — e64019eda

**Verdict: REVISE**

1. **High — `apps/ptah-electron/src/windows/git-window-scope-guard.ts:205-212`.** Request `git:addWorktree` with `{workspaceRoot: R, branch: "new", operationId: "x"}` and no `path`, after `R/.claude-worktrees` has become a symlink/junction to a directory outside the scope. The guard checks only a supplied path; the backend constructs `R/.claude-worktrees/<branch-name>` (`libs/backend/vscode-core/src/utils/worktree-path.ts:47-52`) and creates the worktree there. Smallest correction: derive the backend's default target before authorization and run `isPhysicallyInside` on it as for an explicit path.

2. **Medium — `apps/ptah-electron/src/windows/git-window-scope-guard.ts:106-115`; `apps/ptah-electron/src/windows/git-window.ts:138-145`.** Start a long-running `git:commit` with operationId `x`, close the child, then reopen and publish the same roots before any guard call occurs while the scope is null. `current()` sees the same owner key and keeps `x`; the new child can call `git:cancelOperation` for `x` or receive its output. The close handler clears `scope` but never calls the guard. Smallest correction: explicitly clear guard state on child close/unregister, rather than relying on a later `current()` call to observe the null interval.

**Claims**

1. **Holds** — only `git:commit`, `git:addWorktree`, and `git:removeWorktree` record IDs; reads do not.
2. **Does not hold** — non-pending results and correlated worktree pushes drop IDs, and an observed root change does too; a close/reopen on identical roots can preserve them (finding 2).
3. **Does not hold** — explicit absolute and relative targets receive a physical check, but an omitted target can escape through the default directory (finding 1).
4. **Holds** — removal requires `path`, then a previously host-listed path or physical containment in a scope root.
5. **Holds** — an uncorrelated worktree push with a published-scope session whose candidate root is inside a read root is forwarded.
6. **Holds** — `isInside` rejects `..` and `../x` by segment while accepting `..notes`; Windows drive case is folded and UNC paths use `path.relative`.

Source review only; no tests or other checks run. No invokable review skill was exposed by this CLI.
