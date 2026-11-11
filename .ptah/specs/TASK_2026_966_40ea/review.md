# Independent review: stale worktree watchers

**Verdict: changes needed.**

## Findings

1. **High — The scoped test gate fails in existing handler cases.** `libs/backend/rpc-handlers/src/lib/handlers/git-root-resolver.ts:166-170` now rejects a registered folder based on a directory probe. Four existing handler tests that expect a registered folder to resolve fail with `This worktree folder no longer exists on disk.` The test fixtures or probe behavior need updating without weakening the valid existing-folder contract; see verification below.

2. **High — A missing root consumes a watcher slot.** `apps/ptah-electron/src/services/git-root-watcher-pool.ts:177-187,229` builds and caps `desired` before removing missing folders. With four leased roots and one missing root, only three healthy roots can run watchers; the healthy root behind the cap is never considered. Filter existence before applying the cap, or refill after filtering. The new spec covers only one root, so this regression is untested.

3. **High — A same-session root can remain latched after it reappears.** `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts:209-232,305-307,372-379` records a missing session and suppresses all later reads for that session, even after release and re-track. Recovery requires a different session ID or `GIT_STATUS_UPDATE`; if the folder returns without a push, the stats never probe it and remain unavailable indefinitely. The changed spec at `session-git-stats.store.spec.ts:81-88` asserts the suppressed retry but does not test folder recovery in the same session.

4. **Medium — Every registered-folder RPC now performs a directory read.** `libs/backend/rpc-handlers/src/lib/handlers/git-root-resolver.ts:166-172` awaits `isConfirmedAbsent` before returning *any* registered folder, including ordinary existing workspace roots and hot read-only calls. This adds filesystem latency and potential contention to the previous direct resolution path; the new test covers absence but does not cover the common existing-folder call count. Consider limiting the probe to roots that can be stale or caching settled existence with invalidation.

5. **Medium — New missing-root warning uses `console.warn`.** `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts:374` adds another direct console warning instead of routing it through the project's Logger. The other warnings in this file predate this diff, but the new branch should meet the requested Logger behavior.

## Verification

`npm run verify -- -p ptah-electron,@ptah-extension/rpc-handlers,@ptah-extension/chat` — **failed (exit 1)**, run once. The verify header lists all three requested projects. Lint/typecheck: all 6 tasks passed. Tests: `ptah-electron` passed; `@ptah-extension/chat` passed; `@ptah-extension/rpc-handlers` failed (2 suites, 4 tests; 241 suites and 6,462 tests passed in that target).

Failing tests in `@ptah-extension/rpc-handlers`:

- `git:info handler › matches registered folders ignoring slash direction and trailing slashes, and runs on the registered one` (`git-rpc.handlers.spec.ts`)
- `GitWorkflowRpcHandlers › git:generateCommitMessage › accepts a registered folder written with other separators and runs on the registered one` (`git-workflow-rpc.handlers.spec.ts`)
- `GitWorkflowRpcHandlers › git:operationAbort › acts on the named registered folder and returns the result as is` (`git-workflow-rpc.handlers.spec.ts`)
- `GitWorkflowRpcHandlers › git:operationContinue › acts on the named registered folder and returns the result as is` (`git-workflow-rpc.handlers.spec.ts`)

No source files were edited. Nx's failed target output was in the local Nx cache under `<home>`. All findings were fixed afterwards; see context.md.

Skill discovery: no locally installed review skill was available; used native Git/source inspection.

