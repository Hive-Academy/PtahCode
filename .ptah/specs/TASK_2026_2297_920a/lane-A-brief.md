# Lane A brief: agent-sdk watchdog + cause propagation + stream cleanup (batches 8, 9, 10, 22)

Read lane-brief-common.md first. Your projects: agent-sdk (libs/backend/agent-sdk) and rpc-handlers (libs/backend/rpc-handlers).
Prefixes: H = libs/backend/agent-sdk/src/lib/helpers/, Q = H/session-lifecycle/, SDK = libs/backend/agent-sdk/src/lib/,
RPC = libs/backend/rpc-handlers/src/lib/.

Write set (exclusive; include their specs):
- H/no-activity-watchdog.ts (+ spec), Q/session-registry.service.ts
- Q/session-query-executor.service.ts, H/session-lifecycle-manager.ts, H/stream-transformer.ts, SDK/message-transform/system-message.transformer.ts, specs
- H/session-end-callback-registry.ts, Q/session-control.service.ts, Q/session-stream-pump.service.ts, SDK/message-transform/user-message.transformer.ts, specs
- RPC/chat/streaming/chat-stream-broadcaster.service.ts (+ spec)
- agent-sdk `src/index.ts` only if you must export a new symbol.

## Required behavior

1. Watchdog tracking (batch 8). The 180 s watchdog stays only as a provider-hang guard inside a confirmed open turn.
   - Feed the watchdog the RAW `background_tasks_changed` message (system subtype, REPLACE semantics, tasks[] with task_id, run_id, ambient,
     parent_task_id, task_type) BEFORE the UI transformer drops ambient entries (`SystemMessageTransformer.transformBackgroundTasksChanged`
     filters `ambient`; do not change what the UI snapshot shows). Keep a session-scoped open-task level set keyed by task_id (and run_id for stale
     frames). Monitor, ambient and run_in_background tasks all count as open work. Reconcile IDs from each snapshot; update on task_started/
     task_updated/task_notification terminal. Verify event order: snapshots can arrive before the root tool-use correlation.
   - Open tools, open tasks, explicit permission wait (hold), compaction, bounded provider retry (api_retry) defer a hang verdict. Between turns
     tasks are preserved (do not clear on endTurn) and the idle hold keeps the watchdog quiet; turn-local tools are cleared.
   - 600 s quiet interval for open tasks and 300 s compaction dwell become OVERDUE NOTICES only (onOverdue, back off the frequency, e.g. double
     the interval up to a cap), never an abort. Remove the `compaction-dwell` fire path: compaction dwell alone never aborts. When the last blocker
     clears, start a full quiet window.
   - A false->true turn transition comes from host input (beginTurn) or reliable SDK evidence of a provider turn (assistant partial stream start,
     actual root PreToolUse). Task lifecycle messages update activity but never imply a provider turn.
   - Only when a confirmed open turn has no accounted work or retry and no provider progress for 180 s does the guard fire with
     cause `provider-no-response`. One watchdog per query; detach on terminal/dispose; ignore stale generations.
   - Keep the existing retry margin/cap behavior (API_RETRY_MARGIN_MS, API_RETRY_MAX_ACCOUNTED_MS).
2. Typed cause and Ptah text (batch 9). The abort error text today says "No stream activity ... Stopping for recovery" and the stream transformer
   rethrows "No stream activity from the provider in time...". Replace with a typed error (for example `ProviderNoResponseError` carrying
   `endCause: 'provider-no-response'`, plus a `ProviderInputClosedError` or equivalent for `provider-input-closed`) whose message is
   `formatAgentActionNotice({actor:'ptah-watchdog', action:'ended', reason:'provider-no-response', nextStep:'retry-first-turn', measured:180000, unit:'milliseconds'})`.
   Never include provider endpoint/model/raw error in user-facing text (log them instead). Do not use the words "abort"/"cancel" in the message
   if that still routes through string classifiers; prefer reading the typed cause. Compaction dwell only notifies (overdue notice).
   A broken input channel stays recoverable and gets cause `provider-input-closed` with `formatProviderInputClosed()`.
   Keep a real user stop working (cause `user-stop`), with the original paths unchanged.
3. Cause propagation (batch 22). The cause must survive zero-event cleanup. Today ChatStreamBroadcaster derives `endCause` from the error text and
   then, for a zero-event failure, calls `sdkAdapter.endSession(sessionId, 'provider-error')`, which overwrites the cause. Change it so the typed cause
   (`provider-no-response`, `provider-input-closed`) is passed to endSession and reaches `SessionEndPayload.cause`; the terminal end event is emitted
   once and no second teardown happens. Add `zeroOutwardEvents?: boolean` to `SessionEndPayload` and set it from the broadcaster/control path when
   no outward SDK event and no settled turn existed (this is how the runtime decides a first-turn retry is safe). Distinguish start, resume and actual
   explicit stop. Update `session-control.service.ts` endSession/ interrupt cause handling so an unattended watchdog end is recorded with origin
   and the next model input in that session carries ONE Ptah-labeled explanation (use `formatExplicitUserStopContext()` for an explicit user stop;
   use the watchdog text for a watchdog origin) before actual user/recovery work, exactly once. Associate the abort with the owned turn before
   cleanup, independent of any raw error string. If provenance is unknown, treat attribution as unknown (no explanation).
   The SDK stock text "The user doesn't want to take this action..." lives in an SDK-owned tool_result. In `SDK/message-transform/user-message.transformer.ts`
   (the Ptah-rendered event, not the persisted SDK transcript) replace the exact stock cancellation copy ONLY when it is correlated with a trusted
   Ptah-origin cause for that session; otherwise leave it unchanged. See inventory-sdk-cancel-text.md.
4. Add/adjust specs: watchdog (open Monitor/ambient task outlasts 180 s and 600 s, provider hang fires only in confirmed open turn, snapshot order,
   idle between turns, stale generation ignored), executor (typed cause, Ptah text, no endpoint/model in message), broadcaster (typed cause reaches
   endSession, zero-event flag, single terminal event), session-control (origin recorded, one-time next-input explanation), user-message transformer.

## Out of scope for lane A
cli-agent-runtime, session-spawner, handoff recovery, shared lib. Another lane edits cli-agent-runtime in parallel.
Status file: .ptah/specs/TASK_2026_2297_920a/status-laneA.md
