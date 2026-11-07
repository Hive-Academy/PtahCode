## Changes

- Moved the exact direct-RPC budget refusal into the exported pure `buildBudgetResumeRefusal` helper; RPC now calls it.
- Added the SDK built-in `SendMessage` budget gate in `SdkPermissionHandler`. It resolves a teammate name through the existing registry, then checks `getAgentBudgetState`. Known stopped or near-limit agents are denied with guidance and `interrupt: false`; unknown state keeps the existing permission route.
- Added structured permission decision and response logs, plus a budget-stop/parent-turn correlation log. No tool payload is included in these new log objects.
- Guarded progress capture so an exception is logged once per agent while weighted counting and safety stops continue.
- Added focused specs for refusal text, SendMessage thresholds and name resolution, log fields and payload exclusion, and progress-capture failure.

## SDK SendMessage tool

- SDK built-in tool name: `SendMessage`.
- Recipient field: `to`, documented in `node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:772` as `SendMessage({to: name})` for the spawned agent's `name`. `sdk.d.ts:8865` also identifies the built-in tool. The recipient is a teammate name, so the handler uses `SubagentRegistryService.getToolCallIdByName` before monitor lookup.

## Log fields

- `[SdkPermissionHandler] Permission decision`: `sessionId`, `tabId`, `toolUseID`, `toolName`, `route`, `decisionSource`, `interrupt`, `recentSubagentBudgetStop`.
- `[SdkPermissionHandler] Permission response received`: the same correlation and decision fields, plus request ID and latency.
- `[SdkPermissionHandler] Permission response handled`: the same correlation and decision fields, plus request ID.
- `[SessionQueryExecutor] Subagent budget stop parent turn`: `sessionId`, `tabId`, `toolCallId`, `abortSignalAborted`, `pendingPermissionRequests`.
- `[SubagentBudgetMonitor] Progress capture failed`: one error log per agent, with a real `Error`, session ID, and tool call ID.

## Verification

- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- --testPathPatterns="sdk-permission-handler|session-query-executor.service.spec|subagent-resume-advice|subagent-budget-monitor.spec|subagent-rpc.handlers|chat-subagent-context-injector" | Select-Object -Last 40`: latest run `NX 2 tasks: 2 succeeded`, exit 0. Earlier run failed only `libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts` because new test options omitted required `requestId`; fixed and subsequent focused runs passed.
- `npm run verify -- -t lint,typecheck -p agent-sdk,rpc-handlers | Select-Object -Last 40`: final run `NX 4 tasks: 4 succeeded`, exit 0.
- Scoped `ptah_get_diagnostics` after edits: initial timeout, then one optional-field type error fixed, then 0 errors/0 warnings; most recent call timed out while the background check continued.

## Decisions

- Reused the existing optional monitor DI token, avoiding a registration change. Reversible.
- Resolved SDK teammate names through the existing registry rather than expanding the monitor API outside batch D's monitor scope. Reversible.
- Allowed unknown targets and unknown usage through the existing permission policy. This follows the approved plan and is reversible.
- Used in-memory timestamps with 60-second expiry for recent stop correlation; no polling or persistent event store. Reversible.

## Open risks

- The permission logs show Ptah callback decisions and parent abort state. A live incident reproduction is still needed to establish whether the SDK independently declines later Read/Bash calls when Ptah's callback is not invoked. No permission policy was changed for defect 6.
- A teammate name not present in the registry cannot be linked to monitor state; the existing permission route applies.
