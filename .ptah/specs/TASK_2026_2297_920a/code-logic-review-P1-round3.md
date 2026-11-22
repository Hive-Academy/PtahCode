# P1 code logic review — Round 3

**Verdict REVISE**

## Findings

1. **Serious — A resumed run's terminal frame is discarded if its start omitted the tool-use ID.**  
   **Evidence** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6785` documents that a resumed task keeps its task ID and gets a new run ID. The start's tool-use ID is optional at `sdk.d.ts:6788`. The executor only forwards starts with that field at `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:313`. The monitor compares terminals against the retained start before accepting the outcome at `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1145`–`:1150`.  
   **Scenario** The monitor records task T, tool U, run 1. The SDK sends a start for T and run 2 with no tool-use ID. The executor drops it, leaving run 1 as the observed generation. When run 2's completed or failed terminal arrives for T, with U or with the tool-use ID omitted, the monitor rejects it because it still expects run 1. A pause gate under U remains in place, and completion cannot deliver the handoff or its output pointer. The stream still processes the frame through its ordinary transformer.  
   **Suggested fix** Forward the start and resolve a missing tool-use ID from the existing session-local task association when it is unambiguous. Apply the same generation update and stale-frame checks through that route. Add an executor-to-monitor regression for a tool-less newer start, followed by a stale terminal for run 1 and a matching terminal for run 2.

## Round 2 fix verification

Agent SDK helper paths below are relative to `libs/backend/agent-sdk/src/lib/helpers/`.

| Round 2 finding | Result | Evidence |
| --- | --- | --- |
| 1. Run generation | Partial | With explicit start IDs, a newer run resets state, preserves the original tool-result delivery route and rejects stale starts. Tagged terminal mismatches are rejected before mutating state. An untagged terminal can fall back to a matching task and optional tool-use ID for a single known invocation. See `compaction/subagent-budget-monitor.ts:1094`, `:1100`, `:1111` and `:1145`, and `compaction/subagent-budget-monitor.spec.ts:749`. The missing tool-use ID on a newer start is the finding above. |
| 2. Cross-parent gate keys | Deferred | `decisions.md:12` records the deferral. |
| 3. Foreground completion | Verified for the reported `output_file:` case | The executor forwards SDK background metadata at `session-lifecycle/session-query-executor.service.ts:313`. The monitor classifies the result before parsing any output path. Successful nonempty foreground text sets `foregroundReturned`, and the hook/result pair finalizes in either order at `compaction/subagent-budget-monitor.ts:881` and `:1610`–`:1624`. The fixture at `compaction/subagent-budget-monitor.spec.ts:1327` also calls explicit completion at line 1336, so its final assertions alone cannot establish that the hook/result pair finished the handoff. |
| 4. Request order | Verified | The first-seen position stays fixed and usage advances the resolved position only to the highest resolved request. Admission uses the trailing difference, so late usage for A leaves B, C and D unresolved. See `compaction/subagent-request-accounting.ts:12`, `:47`–`:50`, `compaction/subagent-budget-monitor.ts:622`, `:653` and `compaction/subagent-budget-monitor.spec.ts:1173`. |
| 5. Child report and terminal output | Verified for a correlated terminal | The executor forwards child text before filtering the parent stream, and the monitor captures it before checking usage for admission. The executor omits the terminal pointer for `skip_transcript` frames. The monitor checks for an absolute path and rejects traversal, CR/LF and NUL. In the scrub/publication failure fallback, a validated transcript takes precedence and the terminal path is included as text. See `session-lifecycle/session-query-executor.service.ts:264`, `:330`–`:332`, and `compaction/subagent-budget-monitor.ts:603`–`:623`, `:994`–`:1007`, `:1145`–`:1157`. The transcript lookup separately validates the canonical session location at `compaction/subagent-budget-monitor.ts:279`–`:306`. The executor-to-monitor test at `session-lifecycle/session-query-executor.service.spec.ts:1562` exercises a usage-free report, failed scrub proof and unavailable transcript. |
| 6. Stop/failure attribution | Verified for correlated SDK outcomes | `compaction/subagent-budget-monitor.ts:1159`–`:1165` records the SDK outcome separately and releases the gate. SendMessage uses actor-neutral wording at `compaction/subagent-resume-advice.ts:31` and the interrupted-agent context does the same at `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.ts:395`–`:399`. |

## Stop paths and validation

- The P1 budget, pause and handoff paths only gate work, clear gate state and deliver notices or handoffs. The permission denial uses `interrupt: false` at `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:736`. No automatic call to `stopTask`, `stopSubagent` or `abort` is reachable from these P1 paths. The existing general watchdog recovery abort is at `session-lifecycle/session-query-executor.service.ts:1687` and belongs to the P2 scope.
- The only production `stopSubagent` call is the explicit `subagent:stop` RPC at `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.ts:465`, which delegates to `Query.stopTask` at `subagent-message-dispatcher.ts:291`. The RPC source is byte-for-byte unchanged against HEAD.
- Focused Jest passed 199 Agent SDK tests across the monitor and executor suites and 98 RPC tests across the subagent RPC and context injector suites. `git diff --check` passed. The finding was established by tracing the supported payload through the source. The focused tests use an explicit tool-use ID on resumed starts.
- Scoped `ptah_get_diagnostics` timed out after 45 seconds. `ptah_search_files` returned zero task-folder hits, so I used `rg --files` to list it and Ptah file reads for the named documents. The host exposed no skill-loading tool.

## Five logic questions

1. **Silent failure.** The monitor silently ignores the current terminal after a tool-less start while ordinary stream processing continues. See finding 1.
2. **User action.** Explicit Stop still dispatches the same RPC operation. For a correlated frame, the resulting message reports the SDK outcome without assigning an actor.
3. **Input data.** A start with a task ID and newer run ID but no tool-use ID leaves the older run current in the monitor. A foreground report containing an ordinary `output_file:` line follows the completion path.
4. **Dependency failure.** The focused executor test verifies in-memory delivery of the child report and validated terminal pointer when transcript lookup yields no path and scrub proof fails.
5. **Implicit requirement.** The SDK's optional start correlation field calls for a task-ID lookup on the start path as well as the terminal path. See finding 1.
