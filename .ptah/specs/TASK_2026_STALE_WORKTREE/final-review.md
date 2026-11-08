# Final code review — stale session worktree

## Verdict: CHANGES REQUIRED

Reviewed `git diff main`, `git status --short`, the task, prior review and fix report. Source was read only. No Nx, npm, build, test, lint or typecheck commands were run, as requested.

## Findings

### MAJOR — Cleanup failure still reports a successful removal

`libs/backend/session-organization/src/lib/session-organization.service.ts:208-223` now returns `{ error }` and logs the storage failure, but `libs/backend/rpc-handlers/src/lib/handlers/git-rpc.handlers.ts:443-468` only warns, then returns/broadcasts the original successful Git result. The MCP callback at `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:1202-1205`, SDK callback at `libs/backend/cli-agent-runtime/src/lib/wiring/sdk-callbacks.ts:456-465`, and Electron watcher callback at `apps/ptah-electron/src/activation/boot-heavy-services.ts:474-477` likewise warn without exposing a failed cleanup or arranging a retry. The durable organization link can remain stale after a successful removal and reappear after reload. **Fix:** report a distinct partial-success result to callers and persist or schedule a retry of the link cleanup; keep Git removal success separate from cleanup success.

### MINOR — Fallback message can name the wrong repository

`libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:133-137` emits “Showing the main repository” whenever an excluded candidate resolves to `session-cwd` or `workspace-root`. A session cwd can itself be another worktree, so the message can contradict the repository actually shown. **Fix:** describe the selected root/source accurately, or use a neutral “Showing the session working directory” message for `session-cwd`.

## Earlier findings

1. **Cross-surface split: fixed.** The shared exclusion lives in `libs/frontend/core/src/lib/services/unavailable-git-roots.store.ts:8-24`; dock, card and inspector pass it to the shared root resolver at `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:109-115`, `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts:478-487`, and `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts:125-136`. Refused card reads mark the root at `session-git-stats.store.ts:344-352`.
2. **Permanent exclusion: fixed.** Entries expire after 60 seconds in `unavailable-git-roots.store.ts:5,28-37`; successful reads clear them at `session-git-stats.store.ts:344-347`; worktree creation clears them at `libs/frontend/git-ui/src/lib/services/worktree.service.ts:335-336`.
3. **Silent persistence failure: partially fixed.** The service returns and logs an error at `session-organization.service.ts:208-223`, but the success paths above still hide the partial failure from the user and provide no retry.
4. **Unrelated fallback banner: fixed.** `git-dock-scope.store.ts:133-137` now checks the current candidate and selected fallback source. The remaining wording issue is listed above.

## Other checks

- `worktreePath` is validated as an absolute path at `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts:186-191`, then compared using `realpathSync` against the workspace root or an existing registered `git worktree list --porcelain -z` entry at lines 714-745. The writer receives the validated root at lines 792-802. No path escape found in this route.
- Store cleanup normalizes paths and folds case on Windows at `libs/backend/session-organization/src/lib/session-organization.store.ts:509-538`. Optional Logger injection is explicit at `session-organization.service.ts:242-243`. The dock's mark effect has a root/source guard at `git-dock-scope.store.ts:269-275`; no signal feedback loop found.
- `git diff --no-index` found no differences between each modified `.claude/commands/orchestrate.md`, `.claude/skills/orchestration/SKILL.md`, `.claude/skills/orchestration/references/task-tracking.md` file and its `plugins/ptah-core` copy.
