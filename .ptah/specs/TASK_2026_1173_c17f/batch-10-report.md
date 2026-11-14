# Batch 10: native Codex reload defects

## Findings and changes

- `chat-session.service.ts:2420-2466` calls `ChatHistoryReadService.readForResume`; `chat-history-read.service.ts:103-116` calls `SessionHistoryRouter.readSessionHistory`; `session-history-router.ts:74-84` selects the native full `readHistory` port and projects it. The "loaded from JSONL" log at `chat-session.service.ts:2515` is generic logging, not evidence that the legacy JSONL reader ran.
- `codex-session-history.ts:217-275` treated descendant `thread/list` as the sole way to discover child threads. A child omitted by that list leaves a root-only snapshot, so child tool events vanish. It now also reads child IDs named by root `subAgentActivity` and `collabAgentToolCall` items and hydrates the matching direct children. A process failure can still prevent child reads.
- `codex-history-projector.ts:88-108` allowed the collab `spawnAgent` item to replace a native activity card as the child's `parentToolUseId`. The native terminal branch at `:341-353` requires that link to equal the native card ID. The projector now keeps the native card as canonical, preserving child tool linkage and terminal `agent_status` when both items exist.
- `subagent-history-registrar.ts:61-121` used an unmatched `agent_start` as proof of interruption. Native Codex children terminate with `agent_status`, and cannot be resumed through the SDK registry. It now excludes cards identified by a native status or by the projected native `agent_start` marker (`agentType: codex`, `parentToolUseId === toolCallId`). `history-message-builder.service.ts:178-291` also excludes these IDs from the resumable override and from generic streaming-to-interrupted conversion.

## Regression tests

- `codex-history-projector.spec.ts`: `keeps four child tools and the terminal native card when spawn also names the child`; `projects native child tools and terminal status on the same card after reload`.
- `codex-session-history.spec.ts`: `hydrates a child named in parent activity when thread/list omits it`.
- `subagent-history-registrar.spec.ts`: `never registers native Codex children as resumable, terminal or running`; parameterized `never registers a native Codex child with %s status as resumable`.

## Focused checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts`: initial invocation stalled because this worktree has no `node_modules/.bin/jest`; stopped. Equivalent direct installed-Jest command with `NODE_PATH`, `TS_NODE_TRANSPILE_ONLY`, and `TS_NODE_COMPILER_OPTIONS` set: 25 passed, exit 0.
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-session-history.spec.ts`: equivalent direct installed-Jest command: 50 passed, exit 0.
- `npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/services/subagent-registry/subagent-history-registrar.spec.ts`: equivalent direct installed-Jest command: 13 passed, exit 0.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`, `libs/backend/codex-runtime/tsconfig.lib.json`, `libs/backend/vscode-core/tsconfig.lib.json`, and `libs/frontend/chat-streaming/tsconfig.lib.json`: equivalent direct installed-TypeScript commands all passed, exit 0. The first `npx` invocation stalled due to missing local binary and was stopped.
- `npx eslint` on the seven changed TypeScript files: equivalent direct installed-ESLint command passed, exit 0.
- `git diff --check`: passed, exit 0.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.spec.json`: passed, exit 0, after a test parameter narrowing fix.
- `npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.spec.json`: stalled without output; stopped. No spec type-check result claimed.

The passing Jest commands used this PowerShell preamble (the local `npx` resolution could not find the worktree binaries):

```powershell
$env:NODE_PATH='D:\projects\ptah-extension\node_modules'
$env:TS_NODE_TRANSPILE_ONLY='true'
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","ignoreDeprecations":"6.0"}'
node -r D:\projects\ptah-extension\node_modules\ts-node\register D:\projects\ptah-extension\node_modules\jest\bin\jest.js --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts
node -r D:\projects\ptah-extension\node_modules\ts-node\register D:\projects\ptah-extension\node_modules\jest\bin\jest.js --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-session-history.spec.ts
node -r D:\projects\ptah-extension\node_modules\ts-node\register D:\projects\ptah-extension\node_modules\jest\bin\jest.js --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/services/subagent-registry/subagent-history-registrar.spec.ts
```

TypeScript used `node D:\projects\ptah-extension\node_modules\typescript\bin\tsc --noEmit --project <project>/tsconfig.lib.json` for each of the four listed projects. ESLint used `node D:\projects\ptah-extension\node_modules\eslint\bin\eslint.js` followed by the seven changed TypeScript paths. Ptah workspace analysis did not return; targeted `rg` and source reads were the fallback. No callable CLI skill mechanism was available in this lane.

## Remaining limitation

The real session's raw Codex rollout files show a parent `spawn_agent` / `followup_task` and a child with three tool calls in the first turn and one in the second. Exact pinned `thread/read` replay and Electron renderer confirmation are still unverified. If the native process cannot read the child, the root's terminal activity can preserve completion, but its four-tool count cannot be recovered from the available history. The parent-inbox-full response prevented a progress report about concurrent edits in these files.

If the child read fails and the parent snapshot contains only a `started` activity with no completion, the existing status model still displays Running; an explicit Unknown status is not implemented. This part of the acceptance criterion remains unmet.
