# P1 code logic review, round 2

**Verdict REVISE**

## Findings

1. **Blocking | Terminal events can disable admission for a newer SDK run.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:311`, `:326` and `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1096`, `:1133`, `:1143`, `:1909`. The installed SDK (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6714` and `:6785`) documents that a resumed task retains its task ID and gets a new run ID, and that terminal frames for older runs can arrive late. The watchdog already tests this ordering in `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.spec.ts:612`.  
   **Scenario** the monitor has paused run 2 when a late stopped or failed notification for run 1 arrives with the same task ID. It marks run 2 stopped and removes its gate. Future accounting cannot re-enact the pause because that state is now finalized. A late completed notification can instead publish a handoff while run 2 is still live. The same-tool-call reset also misses a new run with the same task ID.  
   **Suggested fix** pass SDK run IDs on both start and terminal events, treat a newer run as a generation change, and ignore outcomes for an older run. Use the notification's tool-use ID when present and preserve a fallback for older SDK payloads.

2. **Serious | A held foreground start can pick up another parent session's pause.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:744`, `:797`, `:809`, `:918` and `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:53`, `:115`. Two held starts with the same SDK agent ID under different parents are represented in `libs/backend/vscode-core/src/services/subagent-registry/subagent-state-store.spec.ts:41`.  
   **Scenario** parent A's held foreground agent reaches the ceiling and the new reconciliation path creates a gate for that agent ID. A below-budget agent with the same ID under parent B then calls Bash. The existing gate skips B's session-scoped reconciliation and denies B's call with A's reason and possibly A's notes path. If B later acquires its own latched pause, A's return can delete the shared gate, and B's enacted phase prevents it from being rebuilt.  
   **Suggested fix** key gate lookup, write tracking and cleanup by parent session and invocation as well as SDK agent ID. Bind lookup through the trusted hook or permission caller context and migrate gate ownership on session rekey.

3. **Serious | Foreground report text can suppress completion and leave a gate behind.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:885`, `:1589`, `:1595`, `:1863`, and the hook-plus-result completion case at `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts:1289`.  
   **Scenario** a paused foreground agent returns normally and includes `output_file: report.md` in its report. When the hook and tool result are the completion signals, the unanchored output-file parser reads the line as evidence of a launch placeholder. The stop hook stays unconfirmed, the normal-return handoff is missing, and the gate stays live and can produce an overdue notice about the already returned agent.  
   **Suggested fix** use SDK task background metadata or structured launch-result metadata to identify a placeholder. Exercise foreground success containing output-file text and verify the gate is cleared and the handoff is emitted once.

4. **Serious | A late usage block erases later unresolved requests.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:613`, `:638`, `:658` and `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-request-accounting.ts:28` and `libs/shared/src/lib/utils/agent-budget-policy.ts:183`.  
   **Scenario** usage-free blocks arrive for A and B, followed by the first usage-bearing block for A. Accounting accepts A and clears the entire unresolved set. If C and D then each arrive without usage, B, C and D are three consecutive unresolved requests in request order, but admission counts only C and D and lets the next work call through.  
   **Suggested fix** preserve the order in which request IDs were first seen, reconcile that ID's status when usage arrives, and derive the trailing unresolved streak from request order. Add the late-valid-A ordering to the interleaving coverage.

5. **Serious | The record-unavailable fallback can omit the returning agent's report and its available output pointer.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:326`, `:335` and `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:998`, `:1004`; the direct-to-monitor fixture at `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts:872`. The normal stream transformer has the terminal output file at `libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts:858`.  
   **Scenario** a paused read-only background agent returns findings in a text-only assistant message. The executor forwards only assistant messages that contain a tool use, so the monitor misses that report. If final scrub proof or publication then fails and the transcript lookup has no path, the fallback sends only the record-unavailable sentence. The SDK completion frame carried the output file, but the new terminal forwarding dropped it. The fallback test bypasses the executor and injects the text-only message directly.  
   **Suggested fix** forward child text-only assistant messages for progress capture even when there is no usage, and retain the terminal frame's correlated output pointer subject to the existing path policy. Exercise the executor-to-monitor path with failed scrub and unavailable transcript.

6. **Serious | The new terminal handler attributes user stops and provider failures to the budget monitor.**  
   **Evidence** `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1137` and `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-resume-advice.ts:31` and `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.ts:395`. The explicit stop entry point is at `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.ts:465`.  
   **Scenario** the user stops a paused agent via the existing RPC. The stopped notification sets the legacy budget-stop flag. The next SendMessage to the agent says Ptah's budget monitor stopped it. The interrupted-agent resume brief can explicitly say the user did not stop it. A failed SDK task also enters the same state and gets the same attribution.  
   **Suggested fix** store SDK stopped and failed outcomes separately from historical budget stops, with an actor only where supported by evidence. Use that outcome in SendMessage and the context injector while retaining gate cleanup.

## Round-1 verification

| Prior finding | Result | Evidence |
| --- | --- | --- |
| 1 | Partial | With a task ID matching a held SDK agent ID, same-parent evidence now admits the gate before the tool result, including a late start. Both tool surfaces call the reconciliation. The gate itself remains unscoped, as in finding 2 above. `subagent-registry.service.ts:926`, `subagent-budget-monitor.ts:704`, `:797`, `:815`, `subagent-budget-monitor.spec.ts:1054`, `sdk-permission-handler.ts:219`. |
| 2 | Partial, parent notices deferred by coordinator | The ceiling denial now provides the reason and a notes or inline-return instruction. Pause and overdue notices still rely on the parent's next PostToolUse, including while it is blocked on a foreground agent. `subagent-notes-gate.ts:124`, `subagent-budget-monitor.ts:725`, `:859`, `post-tool-use-hook-handler.ts:97`, `:227`. Task `decisions.md` assigns live parent delivery to P3/P5. |
| 3 | Partial | Matching stopped, killed and failed notifications clear admissions. A matching completed notification or hook plus recognized foreground success confirms a normal return. The old hook-first and notification-first cases are covered. Execution correlation and an ordinary foreground result still have gaps in findings 1 and 3. `session-query-executor.service.ts:318`, `subagent-budget-monitor.ts:885`, `:1128`, `:1595`, `subagent-budget-monitor.spec.ts:1268`, `:1289`. |
| 4 | Partial | A different task ID creates a fresh state and file key. Generation checks fence the old writer and its cleanup after awaits. A newer SDK run with the same task ID does not get that protection, as in finding 1. `subagent-budget-monitor.ts:907`, `:927`, `:957`, `:984`, `:1096`, `:1904`. |
| 5 | Fixed for asked, paused and settled routing | Asked agents accept SendMessage, paused agents get the latched cause, finalizing agents get wait guidance, and settled agents give their record pointer. Incorrect attribution of external terminal outcomes is a new path, as in finding 6. `subagent-budget-monitor.ts:1178`, `:1896`, `subagent-resume-advice.ts:32`, `:38`, `:44`, `chat-subagent-context-injector.service.ts:391`. |
| 6 | Partial | The request key survives a late task-ID join and repeated missing A, B, A blocks count twice. A late valid block can still erase newer unresolved requests, as in finding 4. `subagent-budget-monitor.ts:613`, `:638`, `subagent-request-accounting.ts:24`, `subagent-budget-monitor.spec.ts:563`, `:1137`. |
| 7 | Partial | Failed scrub proof and failed ownership publication now reach a redacted inline fallback with any captured report or resolved transcript path. The executor can leave both missing even when there is a final report and an SDK output pointer, as in finding 5. `subagent-budget-monitor.ts:984`, `:993`, `subagent-budget-monitor.spec.ts:865`, `session-query-executor.service.ts:326`, `:335`. |
| 8 | Fixed | Both surfaces use the dedicated paused-session allowlist. TaskStop, KillShell, TaskCreate and TaskUpdate are denied, with `interrupt: false` on canUseTool and a reason-only deny in PreToolUse. `sdk-permission-handler.ts:83`, `:233`, `:736`, `sdk-query-options-builder.ts:1482`, `sdk-permission-handler.spec.ts:2219`. |
| 9 | Fixed | Immediate unattended policy refusals use Ptah formatting and `interrupt: false`. A failed prompt send retains its own host cause in the returned reason. `sdk-permission-handler.ts:470`, `:489`, `:1060`, `:1124`, `:1203`, `:1481`, `system-abort-permission-message.ts:46`. |

## Five logic questions

1. **Where does it fail silently?** A stale SDK terminal frame can remove the live gate and leave the execution running without ceiling enforcement, as in finding 1.
2. **What user action produces unexpected behavior?** The explicit stop followed by SendMessage or resume falsely attributes the stop to Ptah's budget monitor, as in finding 6.
3. **What input gives a wrong answer?** A foreground report containing an output-file label prevents completion detection, and a late valid usage block changes the unresolved streak, as in findings 3 and 4.
4. **What happens when a dependency fails?** Failures to scrub or publish a handoff with no resolved transcript can produce only an unavailable notice, even when the provider supplied report content and an output pointer, as in finding 5.
5. **What contract needs to be explicit?** A gate key needs its owning parent and a resumed task needs its SDK run ID, as in findings 1 and 2.

## Scope and verification

- Inspected the uncommitted diff and worktree status, including the untracked source and specs. The P1 threshold-to-admission path has no stopTask, stopSubagent or abort call. The user stop dispatcher remains at `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.ts:465`. The acknowledgement still ends the predecessor with `parent-stop` at `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1200`. General query recovery is outside this phase.
- The focused Agent SDK Jest run passed 334 tests across the monitor, executor, permission and unattended permission suites. The focused RPC handlers and context injector suites passed 96 tests. `git diff --check` passed.
- Ptah file search returned zero rows for the task folder and backend instruction files. I used native reads for the named docs and `rg` for instruction-file discovery. Ptah AST analysis returned clean parses for the principal modules. The host exposed no skill-loading tool for this lane.
- Scoped Ptah diagnostics timed out after 45 seconds on both attempts. The findings are based on source tracing and the SDK contract. The focused suites did not exercise the six failure scenarios.

## Decisions

- Treated the live parent notice gap as a deferred part of round-1 finding 2, following the coordinator's P3/P5 assignment in `decisions.md`. The alternative was to treat delivery as part of P1 based on the binding user context. The phase assignment is reversible.
