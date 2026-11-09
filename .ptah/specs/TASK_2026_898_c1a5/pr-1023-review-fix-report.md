# PR #1023 review fixes

## Fix 1: predecessor close ownership

The chat renderer now replies `closed`, `absent`, or `blocked`. A missing tab returns `absent`; only a successful close of the exact tab returns `closed`. The host validates the outcome with Zod and resolves the close request successfully only for `closed`. `absent` and `blocked` leave it pending until the existing timeout, so the CLI runtime cannot persist `closeCompleted` from a non-owning renderer.

Files: `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts`, `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts`, `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts`, `libs/shared/src/lib/types/rpc.types.ts`. Specs changed: `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.spec.ts`, `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.spec.ts`, `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts`.

Tests cover a missing tab replying `absent`, an absent reply remaining pending until timeout, a later `closed` reply succeeding, and boundary validation.

## Fix 2: carrier write retry

The open-PR reconciliation catches an `in_review` carrier write failure, logs the real error, and still registers a watch retaining the task's prior status. The next poll retries the write and continues PR checks.

Files: `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts`, `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.spec.ts`. The new spec fails the first write and confirms a successful retry on the next poll.

## Fix 3: merged PR base

The GitHub reader requests and parses optional `baseRefName`. The Electron close-out adapter treats a merged PR as merged only when its base is `main`; a merge into another base yields `unknown`.

Files: `libs/backend/vscode-core/src/services/git/github-pr-status.reader.ts`, `libs/shared/src/lib/types/rpc/rpc-git.types.ts`, `apps/ptah-electron/src/di/task-end-hook-composition.ts`. Specs changed: `libs/backend/vscode-core/src/services/git/github-pr-status.reader.spec.ts`, `apps/ptah-electron/src/di/task-end-hook-composition.spec.ts`. Tests cover parsing the base and a merged PR targeting `release`.

## Verification

`npm run verify -- -p chat,rpc-handlers,cli-agent-runtime,task-end-hook,vscode-core,ptah-electron`: lint and typecheck passed, 12/12 scoped tasks. Test phase: 15/16 Nx tasks succeeded. The sole failed target was `@ptah-extension/task-end-hook:test`, with 14/21 suites and 577/618 tests passing; its 7 failed suites and 41 failed tests match the stated Windows symlink/temporary-path baseline. No other target failed. The command exited 1 because of that target. Its terminal output is in `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\31029859624614406`.

Focused `task-pr-reconciler.service.spec.ts` run with `--coverage=false --maxWorkers=2`: 1/1 suite and 6/6 tests passed, including the new retry case.

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; 216 unsuppressed sites, within baseline. No baseline changed.

`npx ts-node --transpile-only tools/di-lint/check-injects.ts`: exit 0; 2,165 injection sites and 990 tokens validated.

## Changed file paths

- `apps/ptah-electron/src/di/task-end-hook-composition.spec.ts`
- `apps/ptah-electron/src/di/task-end-hook-composition.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts`
- `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.spec.ts`
- `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts`
- `libs/backend/vscode-core/src/services/git/github-pr-status.reader.spec.ts`
- `libs/backend/vscode-core/src/services/git/github-pr-status.reader.ts`
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.spec.ts`
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts`
- `libs/shared/src/lib/types/rpc.types.ts`
- `libs/shared/src/lib/types/rpc/rpc-git.types.ts`
- `.ptah/specs/TASK_2026_898_c1a5/pr-1023-review-fix-report.md`

The existing unrelated modification to `.claude/skills/orchestration/references/git-standards.md` was left untouched.
