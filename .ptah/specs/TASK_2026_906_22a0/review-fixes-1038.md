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
- Known limits: a worktree read works only after the host listed the worktree. `settings:set` and
  `git:cancelOperation` are not scope-bound (they have no root).

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
- Known limit: the mirror does not filter by root. The Git services of the child filter by their active root.

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

## Environment note

The worktree had no `node_modules`. I made a directory junction `node_modules` to
`D:\projects\ptah-extension\node_modules`. It is git-ignored. Remove the junction (not the target) when
the worktree is removed.
