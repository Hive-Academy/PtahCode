# Batch 6 report

## Files changed

- `libs/frontend/chat-execution-tree/src/lib/builders/agent-node.fn.ts`: derive native card status from native agent events for the canonical Task id.
- `libs/frontend/chat-execution-tree/src/lib/builders/builders.spec.ts`: add native lifecycle, replay, and v1 regression coverage.

## Status derivation rules

The node id remains `agent:<canonical tool id>`. For a card with native status events, the highest `cycleOrdinal` controls status. Within one cycle, `failed` wins over `completed` even if a completion is replayed later. Running maps to `streaming`, completed to `complete`, paused to `interrupted`, and failed to `error`; only a structured `errorMessage` appears on the error node. With no native status, Task `tool_result` retains its existing authority. Child tool nodes continue to nest beneath the same agent node. No usage or duration is synthesized.

## Tests added

| Case | Coverage |
| --- | --- |
| 1 Initial running | Native lifecycle spec checks one `agent:<card>` node with `streaming` status. |
| 2 Completed | Same node becomes `complete`. |
| 3 Reopened | Higher ordinal running interaction returns same node id to `streaming`. |
| 4 Silent later parent turn | New parent message without child activity leaves node `complete`. |
| 5 Structured failure and ordering | Same-cycle failure yields `error` and structured message; older failure cannot override a newer running cycle; replayed completion cannot override failure. |
| 6 Duplicate starts | Replayed Task `tool_start` and `agent_start` still produce one node. |
| 7 v1 regression | Claude-style researcher and v1 Codex Task agents stay `streaming` until `tool_result`, then `complete` even for an error result. |

## Verification

- `npx jest --config libs/frontend/chat-execution-tree/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-execution-tree/src/lib/builders/builders.spec.ts`: three attempts produced no output and were interrupted after prolonged startup; result unverified.
- `npx tsc --noEmit --project libs/frontend/chat-execution-tree/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/chat-execution-tree/src/lib/builders/agent-node.fn.ts libs/frontend/chat-execution-tree/src/lib/builders/builders.spec.ts`: exit 0.
- `ptah_get_diagnostics` scoped to edited files: zero errors in requested files; five BigInt target errors in shared sibling files.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Select native status by ordinal and failure precedence | Event arrival order; highest cycle with failure precedence | Plan contract and shared native union | Yes |
| Preserve Task result fallback | Replace all agents' status derivation; native-only branch | Batch contract requires v1 authority | Yes |
| Map failed to `error` and paused to `interrupted` | Use `complete`; use existing node vocabulary | `ExecutionStatus` union in `libs/shared/src/lib/types/execution/node.ts` | Yes |


