# Review P2 lane A: agent-sdk and rpc-handlers (uncommitted diff vs HEAD)

Reviewer: independent read-only review. No source file was changed.

Scope: `git diff` of `libs/backend/agent-sdk` and `libs/backend/rpc-handlers`, checked against
`lane-A-brief.md` and `lane-brief-common.md`.

Check run: focused Jest of four specs (`no-activity-watchdog.spec.ts`, `session-control.service.spec.ts`,
`user-message.transformer.spec.ts`, `stream-transformer.spec.ts`). Result: 4 suites, 257 tests passed
(`.ptah/tmp/review-p2a-jest.log`). Jest reported an open handle after the run (pre-existing pattern,
not examined further).

Abbreviations: W = `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts`,
Q = `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/`.

---

## What is correct

- Only one forced abort path remains: the 180 s guard in `onTimer` (W:490-495), and only while
  `turnOpen`, no holds, no open tool, task or compaction, and the retry window is over. The
  `compaction-dwell` fire path and `controlsSession()` are gone. Compaction, open tools and open tasks
  produce overdue notices with back-off (W:58-61, W:476-489), never an abort.
- A turn opens only from host input (`markTurnStarted` / initial content), a root `message_start`
  (W:302) or a root `PreToolUse` (W:253-256). Task frames never open a turn (spec W-spec:492).
- Tasks survive `endTurn()` (W:172-179). Between turns `isHeld` is true, so no timer is armed (W:205, W:461).
- `background_tasks_changed` is fed raw, before the UI filter, through `observe(..., {deferResult:true})`
  at the top of the stream loop. REPLACE semantics and run-id ordering match the SDK contract
  (`sdk.d.ts`: "run ids of one task sort, by plain string comparison, in the order the runs opened").
- `api_retry` margin and cap are kept (W:380-392).
- Typed cause: `ProviderTurnEndError` carries `endCause` and `startedAt`. The message comes from
  `formatAgentActionNotice` / `formatProviderInputClosed`. Endpoint and model go only to the log
  (Q/session-query-executor.service.ts:1636-1645). The text has no "abort", "cancel" or "the user".
- Cause propagation: the stream transformer rethrows the recorded failure, also on a clean iterator end.
  The broadcaster reads the typed cause, no longer calls `endSession(..., 'provider-error')` for a
  token-owned stream, and the single `endSessionIfTokenMatches` in `finally` carries the typed cause.
  `endSessionInternal` also reads `signal.reason`, so the cause survives either order. `rec.ending`
  makes a second teardown a no-op. Specs assert one `notifyAll` and one `CHAT_SESSION_ENDED`.
- The SDK stock cancellation text is replaced only for a live root frame that the stream attributed
  through a `WeakMap`, only for `is_error` results, only on exact match, and only for tool IDs that were
  open when the Ptah failure was recorded. An explicit user stop keeps the stock text.
- `shouldQuery: false` is a supported field on `SDKUserMessage` (SDK d.ts), so the slash-command split
  in the pump is valid.

---

## Findings

### MAJOR-1: A long-lived background or ambient task disables the hang guard, and overdue notices reach only the log

- Location: W:462 (`hasWork` includes `this.tasks.size > 0`), W:490 (fire needs `!this.tasks.size`),
  W:336-347 (`ambient` flag ignored), Q/session-query-executor.service.ts:1647-1651 (`onOverdue` only
  calls `logger.warn`).
- Problem: a root turn runs concurrently with background tasks. A background Bash, Monitor or ambient
  watcher does not prove that the root provider request is alive. A Monitor or ambient watcher can live
  for the whole session. While it is open, a real provider hang in any root turn is never detected.
  The only signal is a `logger.warn` every 10, 20, 40 and then 60 minutes. Nothing reaches the session
  or the UI. This is a permanent false negative (review item 2). The SDK documents `ambient` as "tasks
  that are not activity", which conflicts with counting them as work.
- Note: the lane brief requires "Monitor, ambient and run_in_background tasks all count as open work".
  The lane followed the brief. The coordinator must decide.
- Fix suggestion (choose one):
  1. Keep the overdue notices for tasks, but let only tasks that a current root tool waits on defer
     the verdict (a foreground task, or a task whose `toolUseId` is still in `tools`). Background and
     ambient tasks then do not block `provider-no-response` once the root turn has no open tool.
  2. If the brief stays as written, surface `formatActivityOverdue` to the session (a Ptah-labeled
     notice event), not only to the log, and add a spec that an ambient task that outlives 3 overdue
     intervals produces a visible notice.

### MAJOR-2: A long non-tool root hook fires the guard inside an open turn (false positive)

- Location: W:94-97 and W:332-410 (`hook_started` / `hook_progress` / `hook_response` for
  `UserPromptSubmit`, `SessionStart`, `Stop` and other non-tool events fall to `default: return`),
  W:222-232 (`lifecycleHooks` covers only tool, compaction, stop and session-end events).
- Problem: host input calls `beginTurn()`. The SDK then runs `UserPromptSubmit` hooks (or
  `SessionStart` hooks at startup with a queued prompt) before the provider request. A hook that runs
  longer than 180 s (a slow script, a memory or retrieval hook) is local work, not a provider hang.
  The watchdog has no open tool, task or compaction, so it fires `provider-no-response`. This breaks
  "Pause, never kill".
- Fix suggestion: track open root hooks by `hook_id` from `hook_started` until `hook_response`, and
  count them in `hasWork` (overdue notice only, like a tool). At minimum, `kick()` on each root
  `hook_started` / `hook_progress`. Add a spec: an open turn with a `UserPromptSubmit` hook that runs
  for 2 × 180 s must not fire.

### MINOR-1: Frames after the failure count as raw work and can block the first-turn retry

- Location: W:283 (`sawWork` is set before the `stopped` check), stream-transformer.ts
  `noteOutwardEvent()` calls after a failure is recorded.
- Problem: after the guard fires, the SDK can still emit frames before the iterator throws (for
  example an error `result` or a `tool_result` for an interrupted tool). `showsSdkWork` counts `result`
  and `tool_result`. Then `zeroOutwardEvents` becomes false for a turn that had no work before the
  hang, and lane B will not run the safe first-turn retry. The error is in the safe direction (no
  retry), but it can defeat the recovery that the flag exists for.
- Fix suggestion: in `observe()` and `noteOutwardEvent()`, return early when `terminalError` is set,
  before `sawWork` / `sawOutwardEvent` change. Add a spec: fire, then observe a `result`, then expect
  `zeroOutwardEvents === true`.

### MINOR-2: The watchdog records the failure before the owner accepts it

- Location: W:492-494 (`timedOut = true` and `recordFailure(...)` before `onTimeout`),
  Q/session-query-executor.service.ts:1633-1635 (callback returns early when the signal is aborted
  or the record is not current).
- Problem: when the callback rejects the verdict, the watchdog still holds `terminalError`. The stream
  transformer then rethrows a `ProviderTurnEndError` (stream-transformer.ts, the `failure` checks) for a
  stream that Ptah did not end for that reason. The window is small, because `abort` stops the
  watchdog synchronously, but the order makes attribution depend on that timing.
- Fix suggestion: have `onTimeout` return a boolean (accepted or not), and call `recordFailure` /
  set `timedOut` only when it is accepted. Or let `registry.recordProviderTurnEnd` be the only caller
  of `recordFailure`.

### MINOR-3: An explicit user stop can be re-attributed to the watchdog during the interrupt wait

- Location: Q/session-control.service.ts:129-141 (context recorded, then up to 3 s
  `Promise.race` on `interrupt()`), Q/session-registry.service.ts:700-706 (`rememberEndedStopContext`
  clears `pendingStopContext`).
- Problem: the watchdog turn stays open while `interrupt()` is awaited. If the quiet window ends in
  that wait, the guard fires. `recordProviderTurnEnd` then replaces the explicit-stop text with the
  watchdog text and the session ends as `provider-no-response`. The next input then carries the wrong
  origin.
- Fix suggestion: call `watchdog.hold()` before the interrupt wait and `release()` in `finally`, or
  call `watchdog.endTurn()` when a `user-stop` interrupt starts. Add a spec with fake timers that fires
  the window during a pending interrupt.

### MINOR-4: `endedStopContexts` has no bound

- Location: Q/session-registry.service.ts:261, :704.
- Problem: an entry is removed only when the same SDK session yields its next input. A session that
  is never resumed keeps its entry for the life of the process. The strings are small, but the map
  grows with each stopped or failed session.
- Fix suggestion: cap the map (for example 256 entries, delete the oldest), or delete the entry when
  the session-end store records a later non-recoverable end for that SDK session.

### MINOR-5: Compaction does not count as raw work for `zeroOutwardEvents`

- Location: W:75-106 (`status` compacting, `compact_boundary`, `PreCompact` / `PostCompact` are not
  in `showsSdkWork`; W:239 counts only tool hooks).
- Problem: a compaction that finished before a first-turn hang already changed the transcript. A
  first-turn retry is then not a clean replay. Review item 5 asks for `false` when any raw work signal
  was seen.
- Fix suggestion: set `sawWork` on `compact_boundary` and on a `status` message with
  `compact_result`. Add the two frames to the `workMessages` table in the spec.

### MINOR-6: A snapshot entry with no `run_id` can reopen a finished task

- Location: W:423 (the stale guard applies only when `runId` is present).
- Problem: with an older CLI or an unregistered task, a snapshot sent after `task_notification` but
  before the removal snapshot reopens the task. The next snapshot removes it again, so this heals
  itself, but in that interval it defers the verdict (see MAJOR-1).
- Fix suggestion: keep a set of task IDs finished with no run id, and ignore snapshot entries for them
  until a `task_started` for the same ID arrives.

### MINOR-7: The pre-registration branch in the broadcaster does no work

- Location: `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts:411`.
- Problem: the branch runs only when no token exists for the session, so `endSession` finds no record
  and returns. It now also awaits that no-op. It is harmless, but the comment says it "keeps cleanup".
- Fix suggestion: remove the branch, or state in the comment that it only covers adapters with no
  token and is a no-op for the SDK adapter.

### Information (no change needed)

- For a watchdog origin, `interruptedTools` is always empty, because the guard fires only with no
  open tool (W:490). So the stock-text replacement applies in practice only to `provider-input-closed`
  and to an external `endSession(..., 'provider-no-response')`. This is correct: no replacement occurs
  without a trusted Ptah cause.
- The replacement applies only to root frames (`parent_tool_use_id === null`). Interrupted subagent
  tool results keep the stock text. This matches "Ptah-rendered root event only". Confirm that this
  scope is intended.

---

## Spec quality (review item 8)

The new specs assert real behavior: fire or no fire at exact window edges, overdue back-off counts,
stale run rejection, typed cause identity (`rejects.toBe(failure)`), no provider or model text in the
message, one `notifyAll`, one `CHAT_SESSION_ENDED`, one-time stop context, and exact-match stock-text
replacement with a negative prefix case. No empty or tautological spec was found.

Gaps:

- No spec for a long non-tool hook in an open turn (MAJOR-2).
- No spec for a guard fire during a pending `user-stop` interrupt (MINOR-3).
- No spec for frames after a fire and `zeroOutwardEvents` (MINOR-1).
- No registry-level spec that a permission hold inside an open turn still blocks the guard now that
  `markTurnStarted` no longer calls `release()` for `NoActivityWatchdog`. The unit hold specs cover the
  watchdog, but not the registry and options-builder pairing.

---

## Verdict

**Changes requested. No blocker.**

- MAJOR-2 is a real false positive that violates "Pause, never kill". Fix it before the push.
- MAJOR-1 follows the brief literally, but it leaves a hung turn undetected for as long as any
  background or ambient task is open, and the user gets no visible notice. The coordinator must
  decide between option 1 and option 2.
- The minor findings can be fixed in the same batch or recorded as follow-ups.
- Cause propagation, single teardown, typed Ptah text, the one-time next-input explanation, and the
  trust-correlated stock-text replacement meet the brief.
