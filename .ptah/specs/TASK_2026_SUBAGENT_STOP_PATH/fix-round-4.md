# Fix round 4: subagent budget stop path

## Root cause 1

The live SubagentStart hook registered its record under a hook UUID, while forwarded messages and `task_started` used the streamed Task `tool_use_id`. `warnNearBudget` and the agent budget/transcript lookups read the registry only by the streamed ID, so the warning returned without an agent ID. The stop path already had a guarded join by `taskId === agentId`.

## Root cause 2

The live SendMessage produced no `SdkPermissionHandler` permission-decision log, and the stopped-agent message reached the SDK's own “no transcript” failure. The builder supplied `canUseTool` in default permission mode but no `PreToolUse` guard. The installed SDK's documented hook contract includes `PreToolUse` for each tool and a deny decision; the repository's named-account gate explicitly records that auto-allow and bypass paths may skip `canUseTool`. A permission callback alone cannot enforce the budget rule for those paths.

## Fixes

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1098`: one guarded `resolveRegistryRecord` join, used by the warning, budget state, transcript lookup and stop path. Direct-ID precedence and parent-session/running/agent-ID guards remain. Missing warning prerequisites now produce a debug log.
- `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:149`: share the SendMessage budget refusal computation between permission callback and hook.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1314`: SendMessage `PreToolUse` hook denies stopped or near-limit targets and logs the existing decision fields. Allowed messages return no hook decision; other tools are unaffected.

## Tests

- `subagent-budget-monitor.spec.ts:432`: hook UUID differs from streamed Task ID; warning fires, running budget state resolves, and stopped state remains findable.
- `sdk-query-options-builder.spec.ts:376`: invokes the SendMessage PreToolUse hook for denied and running targets and checks the decision log.
- `sdk-permission-handler.spec.ts:147`: checks the shared refusal and hook denial log.
- Existing stop join guards and permission callback regressions remain in the scoped suites.

## Verification

- `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers`: final run `NX 6 tasks: 6 succeeded, 2 cached`, exit 0. The first run failed `agent-sdk:typecheck` and `rpc-handlers:typecheck` on a nullable return type; fixed.
- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- '--testPathPatterns=subagent-budget-monitor.spec|sdk-permission-handler.spec|sdk-query-options-builder.spec'`: initial run FAILED `sdk-query-options-builder.spec.ts` and `sdk-permission-handler.spec.ts` at compilation on the nullable return type, plus `subagent-budget-monitor.spec.ts` on the new debug log. The next run FAILED `sdk-query-options-builder.spec.ts` at compilation on an optional session ID; the other two suites passed. The third run passed `subagent-budget-monitor.spec.ts` but FAILED `sdk-permission-handler.spec.ts` at compilation on an optional fixture ID and `sdk-query-options-builder.spec.ts` on a fixture lacking a session ID. All were fixed.
- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- '--testPathPatterns=sdk-query-options-builder.spec|sdk-permission-handler.spec'`: final focused rerun `NX 2 tasks: 2 succeeded`, exit 0. Together with the preceding passing monitor suite, all changed paths have passed.
- Scoped `ptah_get_diagnostics` was requested after source edits; it returned `unchecked` because its TypeScript check remained running past 45 seconds. The scoped Nx typecheck above completed successfully.

## Live re-test checks

1. In Electron Dev, run an agent past 85% and confirm `Near-budget warning queued` before a stop, delivered to the SDK agent ID despite distinct hook and Task IDs.
2. After a budget stop, SendMessage to the stopped agent must produce Ptah's refusal guidance and a `Permission decision` log with `route=deny`, `decisionSource=subagent-budget`, and `toolName=SendMessage`, before any SDK transcript error.
3. Steer a running agent below 85%; it should remain allowed, with no budget denial. Check the first parent reply still attributes the stop to Ptah and names the handoff path.

## Decisions

- Kept the existing direct registry-key precedence and guarded agent-ID fallback, following round-3 review. Reversible.
- Applied refusal in `PreToolUse` because the SDK can skip `canUseTool` on auto-allowed tools; the hook returns no decision for allowed targets. Reversible.


