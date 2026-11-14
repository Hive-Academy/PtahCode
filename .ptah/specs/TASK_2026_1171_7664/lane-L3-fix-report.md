# Lane L3 fix report

## Changes

- `libs/backend/vscode-lm-tools/src/lib/code-execution/types.ts:314-317`: optional `resolveCallerParentId` on the agent namespace.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:347-374`: one resolver shared by namespace callers and spawn. It applies `resolveSessionId?.(raw) ?? raw`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1452-1460,1725-1733`: resolve the transport-bound `_callerSessionId` before acknowledging read and wait results. Missing resolver retains the raw ID. Tool arguments never supply the reader ID.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts:333-350`: verifies namespace resolution agrees with the ID stored at spawn.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts:208-244,262-281`: verifies a tab alias can acknowledge, a different resolved parent cannot, and wait resolves the alias. Tests stay in the existing acknowledgment block.

The completion acknowledgment store was not changed. The new tests use distinct agent IDs, so no reset helper was needed. No DI registration was added. `agent-process-manager.service.ts` was untouched.

## Checks

1. `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts` — **incomplete** on two attempts; 0 tests reported, 0 passes/failures available. Each remained active without test output after a Node ES-module configuration warning; the retry was interrupted after about 3 minutes. Logs: `.ptah/tmp/l3-fix-jest.log`, `.ptah/tmp/l3-fix-jest-retry.log`.
2. `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` — **pass**, exit 0, 0 reported errors. Log: `.ptah/tmp/l3-fix-tsc.log`.
3. `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/types.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts` — **pass**, exit 0, 0 errors, 4 warnings in existing code/config (three file-local and module-boundary rule unavailable). Log: `.ptah/tmp/l3-fix-eslint.log`.
4. After removing unnecessary type casts from the new spec cases, `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts` — **pass**, exit 0, 0 errors, 1 existing warning. Log: `.ptah/tmp/l3-fix-eslint-final.log`.

## Open issue

Focused Jest execution has not produced a test verdict in this worktree. The code passed the requested library TypeScript check and lint, but the tests remain unverified.

## Decisions

- Expose the existing spawn resolver on `AgentNamespace` rather than duplicate the tab/session mapping in the dispatcher. The builder already owns this mapping; the change is reversible and keeps the dispatcher hook small.
