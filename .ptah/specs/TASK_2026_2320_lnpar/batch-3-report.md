# Backend implementation — `TASK_2026_2320_lnpar`, batch 3 (B1b shared RPC and permission types)

**Tasks completed**: 3.1 (permission and question types) and 3.2 (RPC types). The
`turn-options-refused` code from executor-notes.md is included.

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\agent-permission.types.ts`. Adds `LanePermissionResponse { requestId; decision: PermissionResponse['decision']; reason?; modifiedInput? }`. `AgentPermissionDecision` is unchanged (`allow | deny`, E54).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\permission.types.ts`. Adds `AskUserQuestionRequest.agentId?: string`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\rpc\rpc-agents.types.ts`. Changes:
  - `AgentGetQueuedMessageBodyResult` gains `turn?: LaneTurnRequest`.
  - New types `AgentGetLaneComposerOptionsParams { agentId }`, `LaneComposerCommandOption { name; description?; group: 'command' | 'skill' }` and `AgentGetLaneComposerOptionsResult { models: CliModelOption[]; efforts: string[]; currentModel?; currentEffort?; commands; error? }`.
  - `AgentContinueErrorCode` gains `'turn-options-refused'`.
  - Re-exports `LanePermissionResponse`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\rpc.types.ts`. Changes:
  - The method map gets a new `agent:getLaneComposerOptions` entry, and `RPC_METHOD_ENTRIES` gets the matching allowlist entry.
  - `agent:permissionResponse` params are now `LanePermissionResponse`.
  - The unused `AgentPermissionDecision` import is removed.
  - Prettier also re-wrapped one existing unformatted line (`tasks:getDigest`).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\messages\agent-messaging.schemas.spec.ts`. Changes:
  - The method-registration check now includes the new method.
  - Two new contract tests: `AgentPermissionDecision` can be assigned to the new params, the widened decision and `modifiedInput` compile, the lane-options result shape compiles, a text-only queued body still compiles, and `turn-options-refused` compiles.
  - Prettier reformatted existing lines in this file, which was not prettier-clean before. lint-staged would make the same change at commit.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| I renamed the planned RPC `agent:getLaneTurnOptions` to **`agent:getLaneComposerOptions`**, and its types to `AgentGetLaneComposerOptions{Params,Result}` and `LaneComposerCommandOption`. | (a) rename; (b) edit `host-source-registry.baseline.ts` | `host-source-registry.contract.spec.ts` rejects any new RPC name that matches `/turn\|recap\|...\|usage/i`. With the planned name, the first `--related` run failed: `does not add host-source RPC methods`, received `["agent:getLaneTurnOptions"]`. The batch acceptance forbids editing the baseline (TASK_2026_610 Gate 2). No code uses the name yet. | yes |

**Orchestrator action needed**: batches.md still uses the old name in Batch 7 (lines ~462, 472)
and Batch 22 (line ~1022), and implementation-plan.md uses it at lines 231, 678 and 797. Change
them to `agent:getLaneComposerOptions` before those batches start.

## Stack observed

- This is a type-only contract change in `libs/shared`.
- The method map is `RpcMethodRegistry` and the allowlist is `RPC_METHOD_ENTRIES: Record<RpcMethodName, true>` (`rpc.types.ts`).
- `registerMethod<TParams, TResult>` has free generics (`libs/backend/vscode-core/src/messaging/rpc-handler.ts:173`). So `agent-rpc.handlers.ts:1381`, which declares `AgentPermissionDecision` explicitly, still compiles without change.

## Verification

- `npm run verify -- --related -p @ptah-extension/shared` → exit 0. Test Suites: 19 passed, 19 total. Tests: 545 passed, 545 total. Log: `.ptah/tmp/b3-related.log`. The first run, before the rename, failed 1 of 545 tests as described above.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/rpc-handlers,@ptah-extension/agent-sdk,@ptah-extension/chat-streaming,@ptah-extension/chat` → exit 0. `10 tasks: 10 succeeded`. Log: `.ptah/tmp/b3-lint-typecheck.log`.
  - This was the batch's own command. It ran while Batch 4 may have been editing `chat`, so the `chat` result reflects that moment only.

## Risk handling

- **Existing callers**: all new fields are optional. The new params type accepts everything the old one did. Typecheck passes for rpc-handlers, agent-sdk, chat-streaming and chat.
- **Host-source baseline**: `host-source-registry.baseline.ts` is not edited. I renamed the method instead.
- **Strict `LanePermissionResponse` zod schema**: not written in this batch. The plan (implementation-plan.md:680-686) and Batch 22 put it in `agent-rpc.handlers.ts` (rpc-handlers), which is outside this write set. The shared type is what that schema will check against.
- **`rpc-surface.spec.ts`**: the new method has no handler until Batch 22. If `apps/ptah-electron/src/di/rpc-surface.spec.ts` asserts that every registry method has a handler, it will fail until then. I did not run it; it is outside this batch's commands.

## Plan deviations

- The RPC name and its type names changed, as described under Decisions.

## Out-of-scope observations

- **`agentId` would be dropped on the way to the renderer.** `parseAskUserQuestionRequest` (`libs/shared/src/lib/types/permission.parsers.ts:116-167`) copies only the fields it knows. So does `AskUserQuestionRequestSchema` (`permission.schemas.ts:71`), which strips unknown keys. The renderer receives questions through this parser (`libs/frontend/chat/src/lib/services/chat-message-handler.service.ts:1006`). So `AskUserQuestionRequest.agentId` will not reach the question card until the parser and schema accept an optional string `agentId`. No batch in batches.md or implementation-plan.md names those files. Recommendation: add them to Batch 6 (B11) or Batch 5 (F6a lane label).
