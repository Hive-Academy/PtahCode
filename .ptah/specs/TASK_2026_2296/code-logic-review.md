# Code Logic Review — `TASK_2026_2296`

Scope: uncommitted diff in worktree `queued-message-flow` (branch `fix/queued-message-flow`). Read in full: `message-dispatch.service.ts`, `message-sender.service.ts` (send / continueConversation / runContinue), `chat-session.service.ts` (`continueSessionUnderIntent`), `session-stream-pump.service.ts#sendMessage`, `codex-chat-adapter.ts#sendMessageToSession`, `sdk-agent-adapter.ts#sendMessageToSession`, `tab-manager.service.ts` (abort controller, markResuming), `queued-follow-up.store.ts`, `follow-up-queue.service.ts#reconcile`, transcript and chat-view templates. No checks were run (read-only review). Note: `git diff main` also shows many unrelated deletions (64 files), so the branch base is behind `main`. Rebase before merge. Only the 17 modified files were reviewed.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 2              |
| Moderate issues     | 5              |
| Failure modes found | 7              |

## Five logic questions

### 1. How does this fail silently?

- Command Center: `session-coordinator.ts:337` calls `MessageSenderService.send` directly, not `sendOrQueueMessage`. A `TURN_IN_FLIGHT` refusal returns `{success:false, turnInFlight:true}` with no `error`. The bubble has already been removed (`message-sender.service.ts:1196-1215`). The coordinator reports "Could not send the Command Center message." and the text is not queued. Before this change the backend held the message. It is now dropped.
- `message-dispatch.service.ts:129`: if `turnInFlight` and `resolvedTabId == null`, the outcome `{success:false, turnInFlight:true}` is returned with no error text. This is practically unreachable, but it would be a silent loss.
- The `ptah-cli` path (`chat-session.service.ts:2049`, `chat-ptah-cli.service.ts:279`) sends with `{files}` only, so `admission` is silently ignored there. A busy ptah-cli session never refuses, so the "always queue first" flow does not hold for it. The behaviour is unchanged from before.

### 2. What user action produces unexpected behaviour?

- Type A, then B quickly while A is in flight. `MessageSender` sets the tab to `resuming`, which `isTabBusyGenerating` treats as busy. B goes straight to `followUps.enqueue` (`message-dispatch.service.ts:112-119`). If A is then refused, A is queued after B. Delivery order becomes B, A.
- The user changes the model or effort dropdown and sends while the renderer sees the tab idle but the backend turn runs. See failure mode 3.
- Typing "stop" with autopilot yolo: the stop-intent interrupt is now skipped for every normal send (`chat-session.service.ts:2293-2298`). The text is queued instead. This is intended per the requirement. It is a behaviour change worth a release note.

### 3. What input data produces a wrong answer?

- A fresh `autoResumeIfInactive` session whose `messageQueue` is non-empty after resume makes `assertAdmissible` throw `busy` (`session-stream-pump.service.ts:573`). An idle session then gets a refusal and the message is queued instead. This is harmless but surprising. I did not verify whether resume pushes anything into the queue.
- A Codex session with `blocked` set also counts as busy (`codex-chat-adapter.ts:1013`). That is correct for the flow.

### 4. What happens when a dependency fails?

- `SessionAdmissionRefusedError('session-ended')` (session removed between resume and send) is not mapped. It falls into the generic branch at `chat-session.service.ts:2477+`. That branch logs `RPC: chat:continue failed` and sends it to Sentry as an unexpected error. The renderer rolls back normally and keeps the failed bubble, so there is no data loss, only noise and a misleading error message.
- The RPC times out or is aborted after the backend accepted the idle send. This is unchanged from before. The renderer rolls back, and the text may still have been delivered. The new queue fallback does not apply, so there is no duplicate.

### 5. What is missing that the requirements never mentioned?

- No in-flight tracking for the idle-send window (see failure mode 2).
- No test covers the Command Center caller or the ordering inversion.
- The `admission` capability is not documented for `ptah-cli` sessions, which ignore it.

## Failure modes

### 1. Command Center loses the message on TURN_IN_FLIGHT (Serious)

- Trigger: a Command Center send (`session-coordinator.ts:337`) when the renderer sees the tab idle but the backend turn runs. Examples are a turn started in another window, or a background-resumed turn.
- Symptom: error toast "Could not send the Command Center message.". The bubble is removed and nothing is queued. Before the change the backend held the message and delivered it.
- Evidence: `session-coordinator.ts:337-346`; `message-sender.service.ts:1096-1104`; the `turnInFlight` outcome is consumed only in `message-dispatch.service.ts:122-131`.
- Current handling: `!result.success` is treated as a plain failure.
- Recommendation: route the Command Center through `ChatStore.sendOrQueueMessage` (the git-ui and subagent-lane paths already do via `ChatAgentFeedbackSender`). Alternatively, handle `turnInFlight` in `MessageSender.send` itself, or in the coordinator, by queuing it. Check that the send-lock `ownerToken` still works through `enqueue`.

### 2. Refusal restores a stale tab status (Serious)

- Trigger: the backend turn is running but the renderer thinks it is idle. During the `chat:continue` await, a `turn_state: generating` event arrives. `applyTurnState` sets `status=streaming` and adds the tab to the spinner set. The refusal then runs `withdrawRefusedPrompt`.
- Symptom: `setStatus(tabId, previousTabStatus)` (`message-sender.service.ts:1224-1225`) overwrites `streaming` with the captured `loaded`/`null`→`loaded`. The status/spinner pair is now inconsistent. `isTabBusyGenerating` still sees the spinner, so Stop likely stays, but `status` and `sessionManager.setStatus(status)` can show the wrong state. If the spinner set was not updated, Stop is lost. `sessionManager.setStatus` also acts on the active tab's session manager even if `tabId` is a background tab.
- Evidence: `message-sender.service.ts:1050` (status captured before the await), `1218-1226`.
- Recommendation: restore the status only if the tab status is still `resuming` at refusal time. Otherwise leave whatever `turn_state` wrote. Gate `sessionManager.setStatus` on the tab being the active one.

### 3. Live model and effort applied before the refusal (Moderate)

- Trigger: a refused idle-only send where the tab has a model or effort override that differs from the live session.
- Symptom: `applyLiveTurnSettings` (`chat-session.service.ts:2373-2378`) runs before `sendMessageToSession`. It calls `setSessionModel`/`setSessionEffort` on a session that is mid-turn, and then the send is refused and the message is queued. Queued follow-ups skip that apply (`!followUp`), so the queued message never gets its own settings applied. Net effect: the running turn's model changes without a delivered message.
- Evidence: `chat-session.service.ts:2373`, `2388`.
- Recommendation: when `requireIdle`, either check idleness first (a cheap `sdkAdapter.isSessionBusy` check) before applying settings, or apply settings after admission succeeds.

### 4. Ordering inversion when two messages are sent during the idle-send window (Moderate)

- Trigger: A is sent (tab goes `resuming`, which is busy). B is typed and queued immediately. A is then refused and queued after B.
- Symptom: the delivery order is B, A. `followUps.hasPending` (`message-dispatch.service.ts:113`) does not see the in-flight A.
- Evidence: `message-dispatch.service.ts:106-119`, `122-131`.
- Recommendation: when queuing the refused message, insert it ahead of entries enqueued after the send began. This is simpler if the queue is ordered by a send sequence number. Alternatively, hold B behind the in-flight send until A resolves.

### 5. Other idle-send side effects before the refusal (Moderate)

- `sdkAdapter.notifyActivity(sessionId, 'user')` fires before admission (`sdk-agent-adapter.ts:1955`). A refused send counts as user activity for idle timers (a documented choice).
- `beginDrive`, the account gate and `.mcp.json` registration run before the refusal. They are released correctly (`abandonDrive` at `2445`, `injection.release()` at `2415`). `admitHostRoutingTurn` runs only after a successful send, so there is no host-routing leak.
- `autoResumeIfInactive` runs before the idle check, but it only runs on an inactive session, which is idle by definition. OK.

### 6. `session-ended` refusal not mapped (Moderate)

- `chat-session.service.ts:2447-2462` maps only `busy`. A `session-ended` refusal from `assertAdmissible` (`session-stream-pump.service.ts:561-571`) is logged as an unexpected error and captured in Sentry. Map it to the existing `SESSION_ENDED` code or a plain user-facing error.

### 7. `ptah-cli` sessions do not honour `require-idle` (Moderate)

- `chat-ptah-cli.service.ts:279` ignores `admission`, so the new flow depends on the session type. This is a pre-existing behaviour. Mark it as a known limitation or pass `admission` through.

## Blocking issues

None.

## Serious issues

1. Command Center drops the message (failure mode 1): `session-coordinator.ts:337` / `message-sender.service.ts:1096`.
2. Stale status restore after refusal (failure mode 2): `message-sender.service.ts:1218-1226`.

## Moderate and minor issues

- Failure modes 3 to 7 above.
- `message-dispatch.service.ts:129`: the `resolvedTabId == null` case returns `{success:false, turnInFlight:true}` with no error text. Add an error string.
- `message-sender.service.ts:1086`: the slash-command path always sends `admission: 'require-idle'`. It is ignored by the backend slash branch (`chat-session.service.ts:2169`). Harmless, but the send of `/compact` and similar commands never produces `TURN_IN_FLIGHT`, so `FollowUpQueueService.sendCommand` (`follow-up-queue.service.ts:675`) is unaffected.
- The superseded abort controller: the refused send calls `createAbortController` (`message-sender.service.ts:887`), which aborts the running turn's controller with the SUPERSEDED reason and installs a new one. The new controller stays installed after the rollback with no `clearAbortController`. Tab close still aborts correctly through it, so this is benign. It is worth a test.
- `markResuming` also sets `hasLiveSession: true`. The rollback does not revert it. Benign.
- `chat-transcript.component.ts:487-492`: the card is keyed on the tab's own `claudeSessionId`, while the reconcile effect in `chat-view.component.ts` uses `resolvedSessionId()`. In main-panel mode that is `chatStore.currentSessionId()`. They are normally equal. A divergence would reconcile entries under a session the card filters out.

## Data flow

1. `sendOrQueueMessage` computes busy from status, spinner and tree. Busy, a pending start, a lock or a pending queue entry goes to `queue()`. OK, no permission denial any more.
2. Otherwise `MessageSender.send` → `continueConversation` → `wireAbortDispatch` (supersedes the old controller). OK.
3. `runContinueConversation` sets `resuming`, appends the bubble, records the boundary. Gap: the status snapshot goes stale (failure mode 2).
4. RPC `chat:continue` with `admission:'require-idle'`; the zod schema rejects a combination with `queueIntent`. OK.
5. Backend: `beginDrive`, account gate, resume, subagent injection, `applyLiveTurnSettings`. Gap: settings applied before the refusal (failure mode 3).
6. `sendMessageToSession` → Claude: `assertAdmissible` runs twice (before and after `createUserMessage`), with no interleave from the second check to the push. OK. Codex: the check is synchronous. OK. Provider sessions share the Codex adapter path (`routing-agent-adapter.ts:178`). OK.
7. The refusal maps to `TURN_IN_FLIGHT`. The driver lock is abandoned and the injection released. OK.
8. The renderer withdraws the bubble and boundary, restores the status, returns `turnInFlight`. Gap: failure modes 2 and 1.
9. The dispatcher queues the message. OK for the chat store; other direct callers are not covered (failure mode 1).
10. Card: `forView` → transcript card. Reconcile runs in `ChatViewComponent` for every view (main and tiles). OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| One flow: always queue first | PARTIAL | Command Center bypass; `ptah-cli` ignores admission; ordering inversion |
| Queuing never answers permission prompts | COMPLETE | Deny loop removed (`message-dispatch.service.ts`) |
| Card in the transcript, not above the composer | COMPLETE | Mounted at the end of the transcript; compact-card mode hides it |
| "Interrupt & send" (Claude) / "Send now" (Codex) / Withdraw | COMPLETE | Not re-verified end to end |
| Codex keeps steering | COMPLETE | `steerQueuedFollowUp` untouched |
| Refused send leaves no duplicate or lost message | PARTIAL | Lost in Command Center; reordered in the fast double send |

Implicit requirements not addressed: tab status integrity after the refusal; ordering guarantees; observability for a refusal (the backend logs at info only).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Idle renderer, busy backend | YES | Refusal → queue | Status restore race |
| Two quick sends | NO | Second goes to queue directly | Order inversion |
| Session ended mid-send | PARTIAL | Generic error | Sentry noise |
| Model override on a refused send | NO | Applied before refusal | Live model changed |
| Command Center send | NO | `success:false` | Message lost |
| Slash command | YES | Bypasses admission | None |
| `ptah-cli` session | NO | Ignores admission | Flow differs |
| Reload with a backend queue | YES | Reconcile in `ChatViewComponent` | None |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (static reading; no tests run, so the claims about event timing in failure mode 2 are not confirmed)
- Top risk: Command Center sends that hit a busy backend now lose the message instead of holding it.
- What a robust implementation would add:
  - Route the Command Center through the queue fallback.
  - Restore the tab status only when it is still `resuming`.
  - Check idleness before `applyLiveTurnSettings`.
  - Preserve ordering for sends made during the idle-send window.
  - Map the `session-ended` refusal.
  - Add tests for the Command Center caller, the ordering case, and a `turn_state` event arriving during the refused RPC.
