# SDK canned "user" text — source and trigger (claude-agent-sdk 0.3.329, native CLI)

Source: `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` (bundled JS, minified names).
Also listed as a constant in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`.

## Constants
| Name | Text |
| --- | --- |
| `uI` | "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed." |
| `y0e` | "[Tool call skipped: the turn was stopped before this call ran, by the check whose denial is on another call in this batch. ...]" |
| `hbe` | "[Tool call skipped: the turn ended to deliver the message that follows before this call ran. ...]" |
| `vWe` | "A safety monitor blocked this turn, so this tool call was cancelled. ..." |
| `Nln` | "[Tool call did not complete: the plugin that made it cancelled it. Nothing refused it.]" |

## Selection (`$$e(signal)`)
```
if (gTe()) return vWe;                     // safety monitor
if (lT(signal)) return Nln;                // plugin cut
r = reason(signal)
if (r === "permission-stop") return y0e;   // canUseTool deny with interrupt:true -> sibling calls
if (r === "interrupt" && flag) return hbe; // flag tengu_fizzy_grove / CLAUDE_CODE_FIZZY_GROVE
return uI;                                 // EVERY other abort reason
```
Used by `xte({phase, cancelText})` in the tool-run pipeline at phases `permission`, `validate_input`
and `pre_call`, whenever the turn's `abortController.signal` is aborted before or while the tool runs.
Also: a `background` task cancel returns `uI` with `toolDenialKind:"cancelled"`.
Abort reason vocabulary (`W0e`): user-cancel, remote-cancel, shutdown, interrupt, turn-abort,
background, recovery-timeout, permission-stop, server_fallback_tombstone, subagent-park.

## Consequence for Ptah
- The canned text is NOT produced by a Ptah deny message. It is the SDK default cancel text for any
  tool call whose turn was aborted for a reason other than `permission-stop` / plugin / flagged interrupt.
- Ptah causes it when it aborts a turn with tool calls in flight or pending:
  - `Query.stopTask(taskId)` (budget monitor, monitor:1553) -> the subagent's open tool calls.
  - root `abortController.abort(new Error(...))` (watchdog, input-channel failure) -> open root calls.
  - `interrupt()` while a parallel batch is pending.
  - A pending `canUseTool` that Ptah resolves after abort (permission handler 1338-1348).
- Ptah cannot rewrite the SDK tool_result text. The only full fix is: do not abort while tool calls
  are open (cooperative return / PreToolUse deny with Ptah text). Where an abort stays (true provider
  hang, user stop), Ptah must add a Ptah-labeled explanation to the next model turn / parent notice
  (existing pattern: `subagent-handoff-message.ts:130-133`).
- A canUseTool deny with `interrupt:false` and a Ptah message shows the Ptah message to the model.
  With `interrupt:true`, the denied call shows the Ptah message, sibling calls show `y0e` (neutral).

## Specs and sources that reference stopTask / stopSubagent
| Count | File |
| --- | --- |
| 141 | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts` |
| 9 | `libs/backend/agent-sdk/src/lib/helpers/subagent-message-dispatcher.spec.ts` (user stop path, keep) |
| 8 | `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts` |
| 5 | `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.spec.ts` (user stop, keep) |
| 2 | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-batch2.spec.ts` |
| 1 each | session-query-executor slash-persistence / input-channel-failure specs, session-lifecycle-manager.spec.ts, frontend claude-rpc mocks (user stop, keep) |

Only budget-path caller: `subagent-budget-monitor.ts:1553` (wired `di/register.ts:718-719`).
User-driven caller stays: `rpc-handlers/.../subagent-rpc.handlers.ts:465`.
