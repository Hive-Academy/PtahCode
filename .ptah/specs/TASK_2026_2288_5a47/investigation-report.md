# Investigation: handoff successor early stop and false "interrupted by user"

Task: TASK_2026_2288_5a47 · Branch: `fix/handoff-successor-early-stop` · Date: 2026-11-20
Mode: read-only investigation. No product code was changed.

Labels: **[O]** = observed in a log, a transcript or code. **[I]** = inferred from observations.

Sources:

- Successor transcript (SDK): `~/.claude/projects/-home-amun-ptah-extension/be201b72-8511-4976-86cd-4df8981ebc71.jsonl` (line numbers below are JSONL line numbers).
- Predecessor transcript: `~/.claude/projects/-home-amun-ptah-extension/dac4792d-d9d1-4195-9091-f29419bb8313.jsonl`.
- Host log (UTC timestamps): `~/.config/Ptah/logs/Ptah Electron-2026-11-20.log` (line numbers below are log line numbers).
- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.318, CLI 2.1.329 (`version` field of the transcript).

---

## Summary

| Stop | Cause | Confidence |
|---|---|---|
| Turn 1 ended with `No response requested.` | The provider sent no first byte for 180 s. The Ptah no-activity watchdog aborted the turn at 16:18:32, 2 s before the SDK's own retry could run. `No response requested.` is **not** a model reply. The SDK wrote it as a `<synthetic>` placeholder 31 minutes later, when the user's next message resumed the session. | High |
| `[Request interrupted by user]` at 17:10:43 | The user's message "thats stop that happens…" was held for 19 minutes as a queued follow-up because the turn never ended. At 17:10:43 the queued item was promoted by the **Interrupt & send** path (`chat:queued-steer` → `interruptForQueuedFollowUp` → `Query.interrupt()`). The SDK labels every `interrupt()` as "interrupted by user". No pushed completion used an interrupting path. | Medium-high (the steer path writes no log line, so the click itself is not recorded) |
| Subagent notice "was stopped by user" | Same class. The budget monitor calls `Query.stopTask()`. The SDK labels every `stopTask` as "stopped by user". | High |

The ack path, MCP tool-list changes and the cwd are **not** causes (see section 4).

---

## 1. Timeline with evidence

### Turn 1 (successor be201b72, tab 73ed5ebf)

| Time (UTC) | Event | Evidence |
|---|---|---|
| 16:14:26.3 | Handoff starts the successor query, cwd `/home/amun/ptah-extension` | [O] log 9139, 9163, 9166 |
| 16:14:27.7 | Handoff prompt is written as a human prompt | [O] JSONL 6 |
| 16:14:34.3 | `ptah_session_handoff_ack` closes the predecessor tab: `chat:abort` with `source:"tab-close"` for `dac4792d` only. "Session already ended, nothing to interrupt". "Handoff predecessor close finished: closed". | [O] log 9187-9197 |
| 16:14:36 | Successor continues normally after the ack (Bash `cd`, then text "Step 1: …") | [O] JSONL 66-81 |
| 16:14:40 → 16:15:29.9 | Foreground Bash (tsc + jest) returns normally (`interrupted:false`) | [O] JSONL 82-83 |
| 16:15:29.96 | SDK sends the next API request | [O] JSONL 86 (`api-request`) |
| 16:18:29.93 | Ptah: "produced no stream activity for 180s — recovering unaccounted silence" | [O] log 9287 |
| 16:18:31.89 | SDK: `system/api_error`, `StreamNoResponse`, "No response from API within the first-byte window", `waitedMs:181000`, `retryAttempt:1`, `maxRetries:1` | [O] JSONL 87 |
| 16:18:31.91 | SDK starts the retry request | [O] JSONL 88 |
| 16:18:32.51 | Ptah: "ended by the no-activity watchdog (no-activity)". Error: "No stream activity from the provider in time. Stopped for recovery; retry the turn." Session ended. | [O] log 9293-9311 |
| 16:18:32 → 16:49:55 | No activity in the successor. Nothing retries the turn. | [O] log, JSONL (no entries) |
| 16:49:55.2 | User sends "why did you stopped ?". Session is not active, so Ptah resumes it. | [O] log 10137-10165 |
| 16:49:58.9 | SDK writes an assistant entry: text `No response requested.`, `model:"<synthetic>"`, all token counts 0, `madeBy:"other"`, `parentUuid` = the last attachment before the hung request (2d17bd6d), cwd = main checkout | [O] JSONL 96 |
| 16:50:28.9 | The user message is written after the synthetic entry | [O] JSONL 97 |

### Interrupt marker (same session, later)

| Time (UTC) | Event | Evidence |
|---|---|---|
| 16:50:28.9 | Turn 2 starts ("why did you stopped ?"). It runs until 17:10:43 (`duration:1214393` ms). | [O] JSONL 97, log 11806 |
| 16:51:57.1 | User sends a 157-character message. Ptah: "Message held … turn in flight, will send at turn end". | [O] log 10484-10486 |
| 17:08:45.7 | `ptah_agent_wait` returns "WAIT CAPPED at 45 s". The SDK sends the next request at 17:08:46. | [O] JSONL 409, 414 |
| 17:09:50.3 | Subagent a0827475903d5b5d6 finishes. The SDK **enqueues** its task-notification (no interrupt). | [O] JSONL 415, log 11716-11719 |
| 17:10:09.5 | A peer message (1722 characters, the Codex lane completion) arrives. Ptah: "Message held — turn in flight, will send at turn end" (no interrupt). | [O] log 11754-11755 |
| 17:10:43.097 | SDK writes `[Request interrupted by user]` | [O] JSONL 416 |
| 17:10:43.121 | Turn result arrives (session stats) | [O] log 11806 |
| 17:10:43.124 | SDK dequeues | [O] JSONL 417 |
| 17:10:43.154 | SDK enqueues the held user message "thats stop that happens seems like an error …" | [O] JSONL 418 |
| 17:10:43.222 | The task-notification is delivered with `origin.kind:"task-notification"` | [O] JSONL 419 |
| 17:10:50.8 | The `<agent-lane-completed>` push is delivered after the next turn ends (queued, not interrupting) | [O] JSONL 433-434 |

In the window 17:09:40-17:10:52 the host log has **no** line from any logged interrupt path for this session: no "Interrupting current turn", no "Interrupting session", no `chat:abort`, no "Ending session", no "stop intent detected", no budget stop. [O] log 11693-11828.

---

## 2. Cause of turn 1

**Cause (high confidence).** A provider stall, then a race between two timers:

1. [O] The API request at 16:15:29.96 got no first byte.
2. [O] The SDK's own first-byte window is 181 s (`waitedMs:181000`), followed by one retry.
3. [O] Ptah's watchdog is `NO_ACTIVITY_TIMEOUT_MS = 180_000` (`libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts:431`). It fired at 16:18:29.93, about 2 s before the SDK's window ended.
4. [O] The abort reached the stream at 16:18:32.51, 0.6 s after the SDK had started its retry. The retry was killed.
5. [O] The watchdog aborts the query (`session-query-executor.service.ts:1669-1722`). The stream rethrows a "No stream activity…retry the turn" error (`stream-transformer.ts:1240-1257`). The broadcaster publishes `CHAT_ERROR` (`chat-stream-broadcaster.service.ts:420-431`).
6. [O] Nothing retries the turn automatically. For an unattended handoff successor, the task stops until a human types.

**Why the user saw `No response requested.` (high confidence).**

- [O] The entry has `model:"<synthetic>"`, zero tokens, and the timestamp 16:49:58.9. That is 2 s after the resume query started (log 10160) and before the user message entry.
- [O] The string is a constant in the CLI binary, declared next to the `<synthetic>` model name (`var CG="No response requested.",Ai="<synthetic>"`).
- [I] On resume, the CLI repairs the open turn (last entry was a user-role attachment with no assistant reply) with this placeholder, so the turn alternates correctly.
- [O] Ptah does not filter or relabel `<synthetic>` assistant messages (no match for `'<synthetic>'` in `libs/**/*.ts`). The webview shows it as an ordinary assistant reply, so it looks like a model decision to stop.
- [I] The `CHAT_ERROR` text from 16:18:32 is not in the JSONL. After a reload or resume, only the synthetic text is left as the visible end of turn 1.

**Correction to the reported evidence.** [O] The tool-list change and the cwd change did not arrive "right before" the reply in time. They are in the request blob of 16:50:29 (JSONL 103), after the resume, because the resumed process had a different tool set and cwd. The real gap between the Bash result and the reply is 34 minutes.

---

## 3. Cause of `[Request interrupted by user]`

**Cause (medium-high confidence).** The **Interrupt & send** path of a queued follow-up.

1. [O] The user message of 16:51:57 was held for 19 minutes, because Ptah holds a follow-up until the turn ends (log 10486). Turn 2 ran autonomously for 20 minutes (subagents, lane waits) and did not end.
2. [O] For a Claude session, the queued item shows a button labeled **Interrupt & send** (`libs/frontend/chat/src/lib/components/molecules/queued-follow-ups/queued-follow-ups.component.ts:56-66`). It is the only caller of `chat:queued-steer` (`libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:336-369`).
3. [O] That path is `ChatFollowUpQueueService.steer` (`chat-follow-up-queue.service.ts:467-485`) → `SessionStreamPump.steerQueuedFollowUp` (`session-stream-pump.service.ts:141-178`) moves the item to the queue head and calls `interruptForQueuedFollowUp` (`session-control.service.ts:203`) → `rec.query.interrupt()`.
4. [O] `interruptForQueuedFollowUp` writes no log line and records no stop cause. `interruptCurrentTurn` (`session-control.service.ts:110-130`) logs and calls `recordStopCause`. This is why the host log has no trace.
5. [O] The trace matches this path exactly: interrupt (.097), then result (.121), then the held item is the first to enter the SDK queue (.154).
6. [O] The SDK writes the fixed sentinel `[Request interrupted by user]` for every `interrupt()` (Ptah constant `SDK_INTERRUPT_SENTINEL`, `libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts:494`).
7. [I] The user most likely clicked **Interrupt & send** to deliver the message that waited 19 minutes. The user does not think of that as an interrupt. The SDK label does not tell the difference.

**Excluded paths (observed).**

| Path | Why excluded |
|---|---|
| Lane completion push (`<agent-lane-completed>`) | Held with "will send at turn end" (log 11755) and delivered after the turn (JSONL 434) |
| Subagent task-notification | Enqueued by the SDK (JSONL 415) and delivered as a separate prompt (JSONL 419) |
| `ptah_agent_wait` 45 s cap | Returned normally at 17:08:45 (JSONL 409). It is an ordinary tool result. |
| Stop-intent auto interrupt (`chat-session.service.ts:2188-2214`) | Would log "stop intent detected". The message is longer than 60 characters, so `hasStopIntent` is false (`chat-stop-intent.ts:27-40`). |
| Stop button / tab close (`chat:abort`) | Would log `[RPC] chat:abort`. Not present. |
| Budget monitor, runtime cap, session end, watchdog | Each logs a line. None present for this session in the window. |
| Permission timeout | YOLO mode. No pending permission. |

**Remaining doubt.** [I] I cannot prove the click, because the steer path logs nothing. I found no automatic caller of `sendNow` in `libs/frontend`. An unknown caller inside the SDK (for example a priority prompt) is possible but has no evidence.

---

## 4. Answers to the specific questions

- **1(a) Ack path.** Not a cause. [O] The ack closed only `dac4792d` through `chat:abort source:"tab-close"`. That session had already ended (log 9191-9197). The successor ran a 50 s Bash after the ack and stopped 4 minutes later for a different reason.
- **1(b) Synthetic message.** Yes, but at resume time, not mid-turn. [O] The SDK wrote the `<synthetic>` placeholder when the user's message resumed the dead session. The host injected no handoff, close-out or "continue" prompt.
- **1(c) MCP reconnect / tool-list change.** Not a cause. [O] The `tool_addition` / `tool_removal` blobs ride on ordinary requests (JSONL 56, 103, 119). The turn continued after each of them. [O] This session saw a live example too: the `claude.ai Claude Docs` tools were added in the middle of a turn, and the turn continued.
- **1(d) cwd / session linkage.** Not a cause. [O] The successor starts in the tab's workspace root `/home/amun/ptah-extension` (log 9139). The predecessor also started there and used `cd` (its transcript has both cwds). The cwd follows `cd` and resets on resume. That is SDK behavior and is not related to the stop. It is a separate quality issue: a handoff from a worktree task could start the successor in the worktree.
- **2.** See section 3.
- **3. "stopped by user" for budget-monitor stops.** Same mislabel class. [O] `SubagentBudgetMonitor` calls `dispatcher.stopSubagent` (`compaction/subagent-budget-monitor.ts:1554`) → `session.query.stopTask(taskId)` (`subagent-message-dispatcher.ts:291`). The SDK then emits `<status>killed</status>` and "Agent … was stopped by user" (predecessor JSONL 706/709, log 8404 `reason:"handoff"`). The SDK owns that text. Ptah cannot change it at the source.

---

## 5. Fix proposal (not implemented; waiting for the parent's answer)

### Fix A — watchdog must not kill the SDK's own retry (turn 1, small)

- Raise `NO_ACTIVITY_TIMEOUT_MS` above the SDK first-byte window plus one retry, or count an SDK `system/api_error` / `api_retry` event with `retryInMs` as activity and give a new window for the retry. The simplest form: `NO_ACTIVITY_TIMEOUT_MS = 240_000` (SDK window 181 s plus margin). Trade-off: a real stall surfaces 60 s later.
- Tests: in `no-activity-watchdog.spec.ts`, pin that the timeout is greater than the SDK first-byte window. In the stream-transformer spec, pin that an `api_error` system message with `source:"request_retry"` kicks the watchdog.

### Fix B — do not show the SDK placeholder as a model reply (turn 1 visibility, small)

- In the history reader and the live message transformer, treat an assistant message with `model === '<synthetic>'` and text `No response requested.` as a system marker. Show "The previous turn stopped: no response from the provider" when the prior turn has no result, or hide it.
- Tests: a JSONL history fixture with the synthetic entry gives no assistant text bubble. A live stream fixture gives the same.

### Fix C — an unattended session must not stay dead after a watchdog stop (turn 1 impact, medium)

- For a session with a non-human owner (handoff successor, child session), retry the turn one time after a watchdog stop, or notify the parent session / the handoff record with a clear "stopped: provider no response" state.
- Tests: session-query-executor spec — a watchdog stop on a handoff successor schedules one retry and reports the cause.

### Fix D — record why a turn was interrupted (marker 2, small)

- In `interruptForQueuedFollowUp` (`session-control.service.ts:203`), log one info line with the session id and `cause:"send-now"`, and call `recordStopCause(..., 'send-now')` as `interruptCurrentTurn` does. Then render the interrupt sentinel as "Interrupted to send your queued message" instead of "interrupted by user" when that cause is recorded.
- Tests: session-control spec — `interruptForQueuedFollowUp` records the cause before `interrupt()`. Stream transformer spec — the sentinel with cause `send-now` maps to the new label.

### Fix E — label budget-monitor stops (question 3, small)

- When the budget monitor calls `stopSubagent`, record the cause by task id. When the SDK task-notification with `status:killed` for that task id arrives, add a Ptah note ("stopped by the Ptah budget monitor, reason: handoff") in the parent-visible event, or include it in the parent message the monitor already sends.
- Tests: subagent-budget-monitor spec — a stop records `{taskId, cause:'budget-handoff'}`. Transformer spec — the matching `killed` notification gets the note.

Recommended order: **A + B** first (one small PR, they fix the reported turn-1 symptom), then **D + E** (labels), then **C** (behavior change for unattended sessions).

---

## 6. Unknowns

- Whether the user saw the `CHAT_ERROR` toast or banner at 16:18:32. The renderer log does not record it.
- Whether the **Interrupt & send** button was clicked (no log on that path). An unlisted SDK-internal interrupt cannot be excluded fully.
- Why the second request (17:08:46 → 17:10:43) produced no stored output for 117 s. It was under the 180 s watchdog, and the transcript does not store partial stream events.
- The exact CLI code that inserts the synthetic placeholder. The constant is found in the binary. The call site is minified and not traced.
- The cause of the provider stall itself (Anthropic API side, `StreamNoResponse`, `isNetworkDown:false`).
