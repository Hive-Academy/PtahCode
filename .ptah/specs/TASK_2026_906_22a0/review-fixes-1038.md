# PR #1038 — review fixes (review 5839053700)

Pull request: https://github.com/Hive-Academy/PtahCode/pull/1038
Branch: `feat/detachable-git-dock-p2b`. Start head: `f7c3cbe5a`.

Verification (all in the task worktree, under the verify lock):

- `npm run verify -- -p ptah-electron` — exit 0 (lint, typecheck, test).
- `npm run verify -- -p chat,git-ui` — exit 0 (lint, typecheck, test).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — exit 0. No baseline was raised.
- Not run: `build`, `e2e`, visual review (not permitted for this job).

## Finding 1 — Security: the Git child can use another registered repository

- Thread: inline comment 4522794916.
- Verdict: **confirmed**. `IpcBridge` asked `ChildWindowRegistry.isMethodAllowed` only. The check used the method
  name and ignored `workspaceRoot`, so the child could call `git:discard` for a different registered root.
- Correction (commit `d879c5178`):
  - `ChildViewPolicy` has an optional `authorize(method, params)` and `observeResult(method, params, data)`.
    `ChildWindowRegistry.refusal()` returns `'method'`, `'scope'` or `null`. `IpcBridge` calls it for each
    child sender and answers `Method '<m>' is outside the scope of the Git window` for `'scope'`.
  - New `apps/ptah-electron/src/windows/git-window-scope-guard.ts` holds the rules. `ElectronGitWindowHost`
    gives it the scope the host acknowledged (null when the child is closed).
  - Rules: a write needs `workspaceRoot` equal to `repoRoot`, by name. Worktree add and remove can also
    name `workspaceRoot`. A read can use `repoRoot`, `workspaceRoot`, or a worktree that the host listed
    through `git:worktrees` for a scope root. `git:watchRoots` can also lease the roots of the published
    sessions. File and editor paths must be inside the allowed roots. An omitted root is refused. A method
    that is not in a list is a write. The params are parsed with Zod. No casts.
  - The main window does not pass through the guard. It keeps support for other roots.
- Tests: `apps/ptah-electron/src/ipc/ipc-bridge.git-window-scope.spec.ts` (real bridge and real host):
  the child requests `git:discard` (and 5 other methods) for a different registered repository and is refused,
  no root is refused, the acknowledged root routes, a new scope moves the limit, a listed worktree is
  read-only, file and editor calls outside the scope are refused, a closed child is refused, the main window
  is not restricted.
- Independent review (codex lane, `scope-guard-security-review.md`): REVISE with 4 findings. All 4 are
  corrected in the follow-up commit (see the last section).
- Known limits: a worktree read works only after the host listed the worktree. `settings:set` is not
  scope-bound (it has no root). The symbolic link check runs at the IPC boundary, so a link that changes
  between the check and the file read is not covered. The file policy of the host is the second barrier.

## Finding 2 — Functional: Git pushes go only to the main window

- Thread: review body only. Answer: one PR comment.
- Verdict: **confirmed**. `IpcBridge.sendToRenderer` sent to the main `BrowserWindow` only, and
  `webview-manager-adapter.ts` sends all pushes through it.
- Correction (commit `d879c5178`): `ChildViewPolicy.pushTypes` and `ChildWindowRegistry.mirrorPush()`.
  `sendToRenderer` calls `mirrorPush` first. The Git view registers `GIT_WINDOW_PUSH_FORWARD_TYPES`:
  `git:status-update`, `file:content-changed`, `git:operationOutput`, `git:worktreeChanged`. All other
  message types stay main-only. A destroyed child gets nothing.
- Tests: same spec. Each of the four push types reaches the main window and the detached child. An unrelated
  push reaches only the main window. After the child closes, the child gets no push.
- Follow-up: the mirror now filters by scope (`ChildViewPolicy.filterPush`, see the last section).

## Finding 3 — Functional: a failed publish drops a scope change

- Thread: inline comment 4522794892.
- Verdict: **confirmed**. `publish()` set an error and did nothing more. The effect did not run again
  because the scope signal did not change.
- Correction (commit `36dc16ee6`, `git-window-sync.service.ts`): `publishFailed()` schedules a retry while
  the dock is detached. The backoff is 0.5 s doubled to a maximum of 8 s, with a maximum of 6 tries for one
  scope. The retry reads the scope when it runs, so it sends the newest scope. `restoreDock()` (attach and
  closed push) and destroy cancel the retry. A good publish cancels it. Focus always sends the current scope.
- Tests (`git-window-sync.service.spec.ts`): the retry sends the newest scope and clears the error, the
  closed push cancels the retry, Focus republishes the unsent scope.

## Finding 4 — Functional: rollback cannot restore a pin to a closed tab

- Thread: inline comment 4522794904.
- Verdict: **confirmed**. The rollback called `showSession(tabId)`, which returns when the tab has no
  candidate.
- Correction (commit `36dc16ee6`): `GitDockScopeStore.pinSnapshot()` and `restorePin(snapshot)`. The
  snapshot keeps the tab, the workspace, the name and the retained root. `applyMode` takes the snapshot before
  the change and restores it when the publish fails.
- Tests: store spec "restores a pin to a closed tab with its retained root from a snapshot". Sync spec
  "restores a pin to a closed tab when the follow-mode publish fails".

## Finding 5 — Stability: a closed push can be overwritten

- Thread: inline comment 4522794922.
- Verdict: **confirmed**. `detach()` and `restoreStatus()` set `_detached(true)` after awaited work with no
  check.
- Correction (commit `36dc16ee6`): `generation` counter. `restoreDock()` increments it. `detach()` and
  `restoreStatus()` take a token before the awaited work and call `childStillOpen()` before
  `_detached.set(true)`. If the token changed, the service asks `gitWindow:status`. If no child is open, the
  dock stays attached. If a child is open (a stale closed push), the service publishes the scope again and
  continues only if no second close arrived. Focus from a stale detached state publishes the scope again,
  because the host can open a new child there.
- Tests: closed push during an in-flight detach, closed push during the reload restore, stale closed push
  with an open child, Focus publishes again.

## Follow-up — independent security review of finding 1 (codex lane)

Report: `scope-guard-security-review.md`. Verdict REVISE, 4 findings, all confirmed and corrected in the
follow-up commit `fix(electron): close the gaps of the Git window scope guard`.

| # | Finding of the lane | Correction |
|---|---------------------|------------|
| 1 | High: `git:cancelOperation` was unscoped. The child could cancel an operation of another repository. | The guard records the `operationId` of each authorized child call. Cancel works only for these. |
| 2 | High: mirrored pushes were not filtered by repository. | `filterPush`: a status push needs a root of the scope, a file push is reduced to paths in the scope, operation output needs an operation of the child, a worktree push needs an operation of the child or a path in the scope. Other pushes are dropped. |
| 3 | High: a symbolic link in the repository could name a file of another registered repository. | File and editor paths are checked again after `realpath` of the path and of the roots. |
| 4 | Medium: `git:addWorktree` accepted an absolute `path` outside the scope. | An absolute target must be inside a scope root. The main window keeps the free path. |

Tests: `ipc-bridge.git-window-scope.spec.ts` (push filter, cancel, worktree target) and the new
`git-window-scope-guard.spec.ts` (real directories with a link). `npm run verify -- -p ptah-electron` exit 0.

## Second review of the guard (review 5839749608, head `f4bf7f6e8`)

The `PtahCode` review bot gave 7 findings on `git-window-scope-guard.ts`. All 7 are confirmed and corrected
in the commit `fix(electron): bind Git window operations and worktree paths to the scope`.

| Thread | Finding | Verdict | Correction |
|--------|---------|---------|------------|
| 4523319377 | A scoped read can claim the operation ID of another window. | Confirmed | Only `git:commit`, `git:addWorktree` and `git:removeWorktree` record an `operationId`. A read records nothing. |
| 4523319390, 4523319427 | The operations stay after a scope change (output and cancel). | Confirmed | The record belongs to the scope roots. A change of the roots and a closed child remove all records. The end of an operation (a result that is not `pending`, or the `git:worktreeChanged` push of the operation) removes its record. |
| 4523319431 | `git:addWorktree` target through a symbolic link. | Confirmed | An absolute or relative target is checked with the real-path helper against the scope roots. |
| 4523319440 | `git:removeWorktree` does not check `path`. | Confirmed | `path` is necessary. It must be a worktree that the host listed for the scope, or physically inside a scope root. |
| 4523319369 | The push for a new adjacent worktree is dropped. | Confirmed | An uncorrelated push is forwarded when its `sessionId` is a session of the published scope that runs in a root of the scope. |
| 4523319452 | A file name that starts with two dots is refused. | Confirmed | The containment check compares path segments (`..` or `..` + separator). |

- Design: the path helpers moved to the new `git-window-scope-paths.ts`. One helper (`isPhysicallyInside`)
  checks the file, editor, worktree add and worktree remove paths. The guard file is smaller than before.
- Tests: `git-window-scope-guard.spec.ts` (two-dot name, add and remove through a link, listed worktree,
  session push) and `ipc-bridge.git-window-scope.spec.ts` (read does not claim, end of an operation, scope
  change revokes, removal outside the scope).
- Verification: `npm run verify -- -p ptah-electron` exit 0. Degradation audit exit 0. No baseline raised.
- Known limits: the record is made at authorization, because the output arrives before the result. A child
  that knows the operation ID of another window could send it with its own `git:commit`; the IDs are random
  and the push filter does not show them to the child. An uncorrelated push of a worktree operation of the
  main window (it has the `operationId` of the main window) is not forwarded; the child lists the worktrees
  again with its next `git:worktrees` call.

## Environment note

The worktree had no `node_modules`. I made a directory junction `node_modules` to
`D:\projects\ptah-extension\node_modules`. It is git-ignored. Remove the junction (not the target) when
the worktree is removed.
