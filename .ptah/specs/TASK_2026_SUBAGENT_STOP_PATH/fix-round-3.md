# Fix round 3: subagent budget stop

## Root cause A

The streamed Task uses `toolu_01TPRv8CmPmKMwqsugXEbLY9`, while SubagentStart registered the same agent under hook UUID `ef17663d-fb86-434d-b495-1a69cd21f94d` (Dev log lines 12254-12261). The Task ID and hook agent ID are both `a9e5c49e9492dab8b`. Looking up the registry by streamed tool ID therefore returned no agent ID, producing the missing-signal warning at line 12307. The monitor stopped for handoff at 12308 and sent a parent user turn at 12310, but the SDK interrupt sentinel arrived at 12314. The parent-visible misattribution remains a delivery-order risk: the log proves the turn was submitted, not that the model consumed it before replying. The safety stop at 15787-15790 did not show a parent abort.

## Root cause B

The live run does not prove the cause of the Read denial. No `[SdkPermissionHandler]` decision/response line appears in the interval, and line 15790 reports `abortSignalAborted=false`, `pendingPermissionRequests=0`; those facts exclude a logged Ptah permission decision in that interval but do not identify the SDK's route. The installed SDK wrapper `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:37` has a `session-tool-runner` branch that logs `tool call denied; not executing` and posts a synthetic denied result; the same file at line 121 recognizes `[Request interrupted by user...]`. Its bundled code does not expose the exact parent-visible “was denied” phrase. A live tool-result trace is needed to distinguish SDK deny, interruption, and model paraphrase. The handoff record is inside the scratch workspace (`.ptah/live-test-ws/.ptah/subagent-handoffs/...`, live report scenario 1), so an out-of-workspace record path is not supported by this evidence.

## Fixes

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1100`: join streamed Task ID to the hook registry record by task ID/agent ID when tool IDs differ. The matched record supplies the stop signal's agent ID and is marked completed using its actual registry key. This removes the observed missing-agent-ID warning and preserves the stop identity for handoff and safety stops.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:288`: log the ID and classified cause of an SDK error tool result after a budget stop, without logging tool output or file contents. This is diagnostic instrumentation for defect B; it does not change permission policy.

## Tests

- `subagent-budget-monitor.spec.ts:511`: regression for hook UUID versus streamed Task ID; asserts the agent signal and completion update.
- `session-query-executor.service.spec.ts:1743`: regression for a denied error tool result after a stop; asserts the classified log.

## Verification

- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- '--testPathPatterns=subagent-budget-monitor.spec|session-query-executor.service.spec'`: final run `NX 2 tasks: 2 succeeded`, exit 0. An earlier run had `session-query-executor.service.spec.ts` FAILED because its registry fake lacked the lookup method; fixed. Another invocation exited 3221226505 before reporting any suite; retry passed. No FAILED suites in final run.
- `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers`: `NX 6 tasks: 6 succeeded, 3 cached`, exit 0. No FAILED suites.
- Scoped `ptah_get_diagnostics` after edits: 0 errors, 0 warnings.

## Open

- Re-test the Electron handoff and safety paths. Confirm the stop callback receives the agent ID, the first parent reply explicitly attributes the stop to Ptah and names the record path, and no interrupted SDK result outraces the handoff. The identity fix alone cannot prove that the model consumed the parent turn.
- Reproduce the parent Read denial and inspect the new `Tool result error after subagent budget stop` line. If no such line appears, collect the SDK transcript/tool events; the current evidence cannot establish a Ptah permission-policy defect or safely justify changing it.
- The 85% warning, background steer, stopped-agent SendMessage refusal, and Codex budget handoff were not proven in the live report and were outside this code change.

## Decisions

- Used the existing registry's agent-ID lookup because the live log shows task ID equals hook agent ID. This is reversible; the direct tool-ID lookup still takes precedence.
- Kept permission policy unchanged because the live evidence cannot distinguish an SDK denial from an interrupted result or model paraphrase. This is reversible after a correlated live trace.

## Revision (review round 3)

### Fixes

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1103`: direct tool-ID match retains precedence. The agent-ID fallback now requires the matching hook record to belong to the stopping parent session, have `running` status, and carry the Task's agent ID. An invalid fallback is ignored; existing no-registry behavior remains, with no agent-ID signal or registry completion update.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:289`: classify string or text-block-array error results after a signalled stop; cap logged tool-use IDs to 128 characters. Only ID and three-value cause are logged.

### Tests

- `subagent-budget-monitor.spec.ts:511`: join success, direct-ID precedence, another session, completed/interrupted records, no match, and two concurrent agents with only the over-budget one stopped and completed.
- `session-query-executor.service.spec.ts:1726`: string and array classifications for denied, interrupted, other, ID truncation, and no log before a stop.

### Verification

- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- '--testPathPatterns=subagent-budget-monitor.spec|session-query-executor.service.spec'`: `NX 2 tasks: 2 succeeded`, exit 0; no FAILED suites. The shared verifier waited for other worktrees before running.
- `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers`: `NX 6 tasks: 6 succeeded, 2 cached`, exit 0; no FAILED suites.
- Scoped `ptah_get_diagnostics`: 0 errors, 0 warnings.
