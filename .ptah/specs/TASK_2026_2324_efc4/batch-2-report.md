# Batch 2 report - delete superseded code

Task: TASK_2026_2324_efc4, batch 2 (decisions.md rows 1 and 2). No git actions were run.

## Deleted symbols

### `continueAgent` / `resumeAgentWithMessage` (frontend store)
- `AgentMonitorStore.continueAgent` and `AgentMonitorStore.resumeAgentWithMessage`, with their doc comments
  (`libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`).
- Spec blocks `describe('continueAgent')` and `describe('resumeAgentWithMessage')`
  (`agent-monitor.store.spec.ts`).
- The `continuationExpired` doc no longer names `agent:continue`. `continuationExpired` is kept.

### `agent:continue` RPC, end to end
- `libs/shared/src/lib/types/rpc.types.ts`: the `'agent:continue'` registry entry, its `RPC_METHOD_NAMES`
  allowlist key, and the `AgentContinueErrorCode` re-export import.
- `libs/shared/src/lib/types/rpc/rpc-agents.types.ts`: the `AgentContinueErrorCode` type. Its only consumer
  was the `agent:continue` result.
- `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`: `'agent:continue'` (precedent: dea55817c
  edited the baseline when it removed an RPC).
- `libs/shared/src/lib/types/messages/agent-messaging.schemas.spec.ts`: the `AgentContinueErrorCode` assertion.
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`: `registerAgentContinue()`, its call, the
  `METHODS` entry, the debug-log method list entry, the header line, and the imports that became unused
  (`AgentContinueError`, `AgentMessageCoordinator`, `AgentContinueErrorCode`, `AgentId`). The inline zod schema
  lived inside the deleted handler.
- `agent-rpc.handlers.spec.ts`: `describe('agent:continue account refusal (D28)')`, `ContinueResult`,
  `CONTINUE_AGENT_ID`, the harness `messageCoordinator` mock and its token branches, and the unused
  `continueConversation` mock member.
- Dead `AgentContinueError` / `AGENT_MESSAGE_COORDINATOR` keys in the `jest.mock` factories of the
  six sibling `agent-rpc.handlers.*.spec.ts` files.
- `agent-rpc.schema.ts`: comment reworded. It now names the `{ success: false, error }` shape and
  `agent-card.component.ts` `resumeAgent` as the caller.
- `apps/ptah-electron/src/replay/scenario-sanitizer.ts`: `'agent:continue'`.
- Comments that named it: `libs/shared/src/lib/types/messages/message-constants.ts` and, in cli-agent-runtime
  (allowed because they reference `agent:continue`):
  `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-delivery-planner.ts` (line 26) and
  `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` (lines 520, 539). These were comment-only edits.

Kept: `AgentProcessManager.continueConversation`, `AgentContinueError` / `AgentContinueErrorCode` in
cli-agent-runtime (the message coordinator and the continuation classifier use them), and `agent:resumeCliSession`.

### `interruptSession` / `subagent:interrupt`, end to end
- `AgentMonitorStore.interruptSession` and the `'subagent:interrupt'` member of `SubagentRpcError.method`.
  Nothing else used it. The `backgroundAgent` doc link now points at `stopAgent`.
- Spec case `interruptSession dispatches subagent:interrupt...` (`agent-monitor.store.spec.ts`) and the
  `interruptSession` store mock in `inline-agent-bubble.component.spec.ts`.
- `ClaudeRpcService.interruptSubagentSession` (`libs/frontend/core`), its augment spec case, the
  `createMockRpcService` member and the mock spec assertion.
- `libs/shared`: `SubagentInterruptParams` (`subagent-registry.types.ts`), the `'subagent:interrupt'` registry
  entry, its allowlist key and import (`rpc.types.ts`), and the baseline entry.
- `subagent-rpc.handlers.ts`: `registerInterrupt()`, its call, the `METHODS` entry, the header/example docs, and the
  `SubagentInterruptParams` / `SubagentInterruptSchema` imports.
- `subagent-rpc.schema.ts`: `SubagentInterruptSchema` and `SubagentInterruptInput`.
- Specs: `subagent-rpc.handlers.spec.ts` (`describe('subagent:interrupt')`, the dispatcher mock member, and the
  registration count from 7 to 6); `subagent-rpc.schema.spec.ts` (`describe('SubagentInterruptSchema')`, the
  import, "four" changed to "three" in the header).
- `SubagentMessageDispatcher.interruptSession` (`libs/backend/agent-sdk/src/lib/helpers/subagent-message-dispatcher.ts`),
  its header bullet, and its spec block `interruptSession - Fix 3`.
- `apps/ptah-electron/src/replay/scenario-sanitizer.ts`: `'subagent:interrupt'`.

No MCP tool or CLI listed either method. `chat:abort` and the adapters' own `interruptSession`
(SDK / Codex / provider-session Stop path) are untouched. No files were deleted. All changes are edits.

## Grep proof (after the edits)

```
grep -rnE "continueAgent|resumeAgentWithMessage|interruptSubagentSession|subagent:interrupt|SubagentInterrupt|registerAgentContinue|registerInterrupt\b|AgentContinueErrorCode" libs apps tools scripts
  -> only cli-agent-runtime's own AgentContinueErrorCode (kept, used by continueConversation callers)
grep -rnwE "agent:continue" libs apps tools scripts --include=*.ts --include=*.js --include=*.mjs --include=*.json
  -> no output
git grep -lnE "agent:continue\b|subagent:interrupt|continueAgent|resumeAgentWithMessage|interruptSubagentSession" -- '*.md' ':!.ptah/specs/**'
  -> no output
```
The remaining `interruptSession` hits are the adapter Stop paths (agent-sdk adapters, chat-session.service,
session-spawner). They are a different symbol and stay.

## Checks

| Check | Result |
|---|---|
| jest shared: agent-messaging.schemas.spec, host-source-registry.contract.spec | 2 suites, 29 tests passed |
| jest rpc-handlers: 7 agent-rpc.handlers*.spec, subagent-rpc.schema.spec | 8 suites, 330 tests passed |
| jest rpc-handlers: subagent-rpc.handlers.spec | did not run, environment (see below) |
| jest agent-sdk: subagent-message-dispatcher.spec | 1 suite, 20 tests passed |
| jest core: claude-rpc-augment.spec, mock-rpc-service.spec | 2 suites, 20 tests passed |
| jest chat-streaming: agent-monitor.store.spec | 1 suite, 223 tests passed |
| jest chat: inline-agent-bubble.component.spec | did not run, environment |
| jest ptah-electron: scenario-sanitizer.spec | 1 suite, 58 tests passed |
| jest ptah-electron: rpc-surface.spec | did not run, environment. Static read: it derives expectations from `RPC_HANDLER_MANIFEST` / `METHODS`, which this batch changed consistently |
| tsc --noEmit libs/shared/tsconfig.lib.json | exit 0 |
| tsc --noEmit libs/frontend/core/tsconfig.lib.json | exit 0 |
| tsc --noEmit libs/frontend/chat-streaming/tsconfig.lib.json | exit 0 |
| eslint on the 31 batch files | 0 errors, 12 warnings, all already present (max-lines, non-null assertions in specs, unused SkillSynthesisEnhanceNow* imports in rpc.types.ts) |
| degradation audit | exit 1: one site in `libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts:94` (orphaned suppression). This is agent C's area, not this batch. No site in the batch's directories |

Environment note: three suites failed at module resolution, before any test ran. The `marked` moduleNameMapper
resolves to `<worktree>/node_modules/marked/lib/marked.umd.js`, but the worktree has no `node_modules`.
The file exists in the main checkout. Nothing was out of memory. CI will run these suites.

## Out of scope
- When eslint ran across the whole diff, it reported an error in
  `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:264` (`no-fallthrough`). That file
  belongs to another agent's change.
