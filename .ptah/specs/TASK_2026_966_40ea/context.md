# Stale worktree watchers

## Causes

- `apps/ptah-electron/src/services/git-root-watcher-pool.ts:112` renews leases and `:171` reconciles their roots without checking whether a leased worktree still exists. A removed folder therefore keeps its secondary watcher until the lease expires.
- `apps/ptah-electron/src/services/git-watcher.service.ts:903` lists worktrees from the watched root. A deleted worktree can make this fail; `:907` already latches that warning per watcher, but the stale watcher continues to run.
- `libs/backend/rpc-handlers/src/lib/handlers/git-root-resolver.ts:160` accepted registered workspace folders before probing disk existence. Its former refusal path at `:205` warned before returning the missing-folder error. The watch RPC's `libs/backend/rpc-handlers/src/lib/handlers/git-watch-rpc.handlers.ts:273` retained previously watched roots on probe failure; a confirmed missing root now resolves as rejected instead.
- `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts:201` recreated an entry after release and immediately scheduled a read. Its former missing latch was entry-local (`:355`), so repeated release and track cycles for the same session could repeat RPC reads and warnings.

## Fix

- The secondary watch pool checks a root at reconciliation, stops its watcher if absent, warns once until it reappears, and resumes watching if it reappears.
- The root resolver checks registered roots before accepting them, returns the existing missing-folder error, and emits one warning until the root reappears.
- The stats store remembers a missing root across entry recreation for the same session. A new session or a status push clears the latch.

## Changed files

- `apps/ptah-electron/src/services/git-root-watcher-pool.ts` and `.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/git-root-resolver.ts` and `.spec.ts`
- `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts` and `.spec.ts`

## Verification

Command: `npm run verify -- -p ptah-electron,@ptah-extension/rpc-handlers,@ptah-extension/chat` from this worktree.

Result: the initial run passed all six lint/typecheck tasks and the Electron test project. The chat and RPC handler test projects failed on old assertions that expected concurrent replacement reads and periodic missing-folder warnings. Those assertions were updated for the new behavior. The focused rerun below passed: 18 chat tests and 28 RPC resolver tests.

`npm run verify -- -t test -p @ptah-extension/chat,@ptah-extension/rpc-handlers -- '--testPathPatterns=session-git-stats.store.spec.ts|git-root-resolver.spec.ts' --output-style=static`

At that stage, the full chat and RPC handler project test suites had not been rerun; the review verification below ran them and passed.

## Independent review fixes

- Updated the RPC handler filesystem fixtures so registered folders resolve as existing directories, preserving the missing-folder rejection contract.
- Filtered absent roots before applying the four-watcher cap and added a cap-plus-one regression.
- Added a 180-second, same-session re-probe on re-track so a restored folder recovers without a status push.
- Cached settled registered-folder existence for two seconds on read-only calls, while writes still probe each time; added a probe call-count test.
- Routed the new missing-root warning through the frontend `LoggingService` used by sibling chat services; existing warnings in this store continue using its pre-existing console pattern.
- Removed the stray `verify.log`.

Changed additionally: `libs/backend/rpc-handlers/src/lib/handlers/git-rpc.handlers.spec.ts` and `git-workflow-rpc.handlers.spec.ts`.

Review verification: `npm run verify -- -p ptah-electron,@ptah-extension/rpc-handlers,@ptah-extension/chat` — pass (exit 0). All 6 lint/typecheck tasks and all 13 test tasks succeeded. Per project: `ptah-electron` pass; `@ptah-extension/rpc-handlers` pass; `@ptah-extension/chat` pass.
