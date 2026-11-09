# Part A report

## Files changed

- `libs/backend/platform-core/src/interfaces/session-organization-recorder.interface.ts` — expose worktree removal cleanup through the existing recorder port.
- `libs/backend/session-organization/src/lib/session-organization.store.ts` — clear matching worktree paths transactionally across all workspace keys, comparing normalized paths and folding case on Windows.
- `libs/backend/session-organization/src/lib/session-organization.service.ts` — provide the never-throw cleanup API and publish organization changes for affected sessions.
- `libs/backend/session-organization/src/lib/session-organization.service.spec.ts` — cover change publication for multiple affected sessions.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts` — clear organization links when the git namespace reports a removed worktree.
- `libs/backend/cli-agent-runtime/src/lib/wiring/sdk-callbacks.ts` — clear organization links in the SDK WorktreeRemove callback.
- `libs/backend/rpc-handlers/src/lib/handlers/git-rpc.handlers.ts` — clear organization links after a successful git RPC removal, including async operations.
- `apps/ptah-electron/src/services/git-watcher.service.ts` — call cleanup for confirmed pruned agent worktrees.
- `apps/ptah-electron/src/activation/boot-heavy-services.ts` — supply the existing organization recorder to the primary Electron watcher.
- `libs/shared/src/lib/utils/session-working-root.ts` — allow refused roots to be excluded from the shared precedence resolver.
- `libs/shared/src/lib/utils/session-working-root.spec.ts` — cover fallback when both worktree candidates point to the removed root.
- `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts` — exclude a root after `GIT_ROOT_UNAVAILABLE`, select the next candidate, and expose a short fallback reason.
- `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.spec.ts` — cover dock fallback and supply the new status signal in the test fake.
- `libs/frontend/git-ui/src/lib/git-dock/git-dock-scope-header.component.ts` — show the fallback reason in the dock header.

## Removal coverage

- MCP `ptah_git_worktree_remove` and the git namespace `worktreeRemove`: the builder's worktree-change handler invokes cleanup after successful removal.
- Git RPC `git:removeWorktree`: the successful result invokes cleanup before the immediate result or async completion notification.
- SDK WorktreeRemove: the existing removed callback invokes cleanup.
- Electron watcher: each confirmed vanished worktree invokes cleanup after prune confirmation.
- Shell `git worktree remove`: the renderer detects `GIT_ROOT_UNAVAILABLE` on the dock's current worktree root and falls through to session cwd, then workspace root.

The SDK removed callback **was wired in Electron before this change**: `apps/ptah-electron/src/rpc-host-profile.ts` passes `worktree: true` at line 64; `libs/backend/cli-agent-runtime/src/lib/wiring/sdk-callbacks.ts` calls `wireWorktreeCallbacks` when that option is true, and that function already called `setWorktreeRemovedCallback` at line 451. It previously only broadcast `git:worktreeChanged`.

## Verification

Command: `npm run verify -- -p session-organization,platform-core,vscode-lm-tools,cli-agent-runtime,rpc-handlers,ptah-electron,git-ui,shared`.

Result: **failed before checks**. Nx reported `spawn EPERM` while loading its default, ESLint and Jest plugins; the verify wrapper reported exit code 1. Scoped `ptah_get_diagnostics` was also unavailable because its TypeScript worker timed out or was terminated. No typecheck or test pass is claimed.

## Decisions

- Used the existing optional platform recorder token for removal hooks. This keeps host-neutral libraries independent of the SQLite service; the change is reversible.
- Cleared all matching organization records, including records under other workspace keys, because removal callbacks carry a path but often no reliable session or workspace id. The store filters normalized paths before writing; this is reversible.

## Not done

- Card stats and the session inspector still use their own working-root reads. A shell removal can make the dock fall back before those views do, so the requirement that all three views agree after this failure is not fully met.
- Full wiring-path and store SQL integration tests were not added. The scoped verify could not run in this sandbox.
