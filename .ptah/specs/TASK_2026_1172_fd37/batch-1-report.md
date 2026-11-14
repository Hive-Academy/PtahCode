# Batch 1 report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts`: Shared parent lookup resolves Codex tab IDs to live sessions and keeps unknown bound IDs capped to plan.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts`: Covers tab, thread, absent/blank, fallback, unknown, and ask cases.
- `libs/backend/cli-agent-runtime/src/index.ts`: Exports the shared resolver.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts`: Delegates to the shared resolver without changing its caller signature.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts`: Covers tab resolution through the wrapper and loads the required reflect polyfill.
- `libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts`: Resume parent lookup uses the shared resolver.
- `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts`: Binds the callback level and SDK mode to a resolved lane level.
- `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts`: Covers global ask, yolo, and plan under lane auto-edit, plus no lane policy.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`: Passes the resolved lane permission into the options builder.
- `libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts`: Covers plan/ask lane under global yolo and auto-edit lane under global ask.

## Tests

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts`: 1 suite passed, 1 suite failed at test TypeScript compilation; 8 tests passed. The logger fixture compilation error was fixed.
- Same runtime Jest command rerun: interrupted after several silent minutes; no result.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts`: 1 suite failed before tests ran; 0 tests run. Jest maps `marked` to the absent worktree file `node_modules/marked/lib/marked.umd.js`.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts`: first attempt 1 suite failed before tests ran for missing reflect polyfill; fixed in spec. Rerun 1 suite failed before tests ran for the same absent `marked` mapping; 0 tests run on both attempts.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts`: 1 suite passed, 66 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed, 0 errors.
- `npx eslint` over the 10 changed source and spec files: passed, 0 errors, 30 warnings. Warnings are existing non-null assertions in sdk-permission-handler.spec.ts and max-lines in ptah-cli-registry.ts. The Nx module-boundary rule also reported no cached ProjectGraph and skipped itself.

## Decisions

- A missing or blank caller ID has no parent cap. An unknown bound ID remains capped to plan. A Codex tab resolves through the adapter before permission lookup.
- When a lane policy is resolved, its effective level controls the callback and SDK mode. This prevents a plan or ask lane under global yolo from auto-approving and allows an auto-edit lane under global ask to use auto-edit behavior. With no lane policy, the global behavior remains.
- The SDK handler already accepts a level resolver, so no production change to it was needed. Only yolo lane level selects bypassPermissions.
- Other writers changed files outside this write set in the same worktree while this lane ran. Those files were left untouched.

## Open issues

- The runtime Claude options and vscode-lm-tools wrapper Jest suites could not execute because Jest's `marked` mapper targets an absent file in this worktree. The package exists in the parent repository's node_modules, but the verification commands must run unchanged. These suites need rerun when the worktree dependency mapping is repaired.
- The shared worktree has unrelated edits in agent-process-manager, lane-reporting-contract, MCP formatter/protocol/namespace, frontend settings, shared types, and rpc-handlers files. They belong to other writers and were not reverted.
- Progress report to parent was not delivered: ptah_agent_report returned parent-inbox-full; this deliverable and completion signal carry the result.
