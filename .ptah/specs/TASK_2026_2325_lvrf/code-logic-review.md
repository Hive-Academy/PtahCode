# Code Logic Review — `TASK_2026_2325_lvrf`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 2              |
| Moderate issues     | 5              |
| Failure modes found | 9              |

Scope read in full or in the changed regions: the backend diff (runner, router, manager stop/exit/flush, dispatcher, planner, effective capabilities, notifier verdict, outcome mapping, restore, metadata schema, output buffer), shared types and schemas, the frontend monitor store stop/successor logic, delivery store, `lane-delivery.controller.ts`, `lane-composer.component.ts`, transcript, echo-image helper, thread and dock rendering. I did not run any jest specs (memory limit). Findings come from reading the code, not from the reports.

## Five logic questions

### 1. How does this fail silently?

- A failed Stop looks like a successful one. `agent-card.component.ts:271-276` sets `stopped = result.success`. `RpcResult.success` is transport success (`claude-rpc.service.ts:197`). The `agent:stop` handler (`agent-rpc.handlers.ts:1575-1596`) catches its own errors and returns `{ success: false, error }` as data, so the transport still reports `success: true`. `cancelStopRequest` never runs, the card stays on "Stopping…" and Stop stays disabled (`agent-continue-input.component.ts` `stopBusy`). No timer is armed to end it (see Serious 1).
- A user-stopped review lane that already wrote a review file is captured as a review. `lane-completion-notifier.service.ts:1391-1405` (`capturesReview`) excludes only `failed` and `no-deliverable`. The new `stopped` verdict passes, so a partial deliverable feeds `captureReview`.
- `prepareNow` in `lane-composer.component.ts` returns `!this.delivery.error()`. The controller never clears its error on a successful refresh (`lane-delivery.controller.ts` `loadPreviews`). A stale error such as "Message was not sent" therefore makes Send now on a queued card (`requestQueuedNow`) return silently. The draft is not edited on that path, so `draftChanged()` never clears the error.

### 2. What user action produces unexpected behaviour?

- Stop on a lane that is still `starting`: `stop()` (`agent-process-manager.service.ts:3585-3603`) sets `hasExited = true` and emits one `agent:exited` with no `exitCode`. The store treats it as the first of two exits (`settleStopRequest`, `agent-monitor.store.ts` ~520) and arms the 20 s fallback. The lane is already gone, but the card shows "Stopping…" with Stop disabled for 20 s. The code comment says this is accepted; it is still a UI regression for a common action (stop right after spawn).
- Pressing Stop, then Send now on a queued card. `refreshBeforeSend` exits early when `stopped()` is true. That is fine, but the Send-now path is blocked by the stale-error case above.
- Stop pressed at the same moment the lane crashes: `cliLaneStatusWord` and `terminalStatus` read `stoppedByUser && failed` as "Stopped by you", which hides a genuine crash. This is minor and by design for old hosts.

### 3. What input data produces a wrong answer?

- Two echoes with identical body sent in the same millisecond share the `echoImageKey(sentAt, content)` key (`lane-echo-images.ts`). Images attach to both. This is practically unreachable.
- A resumed lane whose persisted `model` is a model that is no longer available: `restoreLaneIdentity` (`lane-restore.ts:99-104`) passes any non-blank string ≤256 chars. The cold resume then asks for a dead model instead of the default. No catalog check exists. If resume refuses it, the user sees a spawn failure with no hint that the stored model is the cause. Residual risk, not verified live.
- A stopped lane's outcome row stores verdict `failed` with status `stopped` (`lane-completion-outcome.ts:67-69`). Routing statistics (`outcome-figures.ts:30-40`) count `failed` as a failure, so a user Stop still lowers the model's delivery score. The change keeps the old behaviour (documented), but the new `stopped` verdict exists precisely to say it is not a failure; the stats do not follow it.

### 4. What happens when a dependency fails?

- Preview refresh failures: `loadPreviews(…, background=true)` swallows the error and keeps the previous preview. Combined with the out-of-order response risk below, a stale "steer" preview can stay in place until the next activity tick.
- Steer is offered by manifest but the handle refuses it at that instant (`supportsSteer()` false, `claude-sdk-lane-runner.ts:526`). The router returns `unsupported / steer-rejected` (`agent-message-router.service.ts:356-363`) with no fallback to queue. The composer restores the text, so nothing is lost, but the user gets an error for an action the UI offered. This follows from the preview being a poll of a state that flips on every tool start and end.
- The second `agent:exited` (the one carrying `exitCode`) is a delayed emit (`GRACEFUL_EXIT_DELAY_MS`). If the webview misses it, only the 20 s fallback ends "Stopping…". The fallback is armed only after the first stopped exit is seen (see Serious 1).

### 5. What is missing that the requirements never mentioned?

- No request-sequence guard on `AgentDeliveryStore.previewMessage` (`agent-delivery.store.ts:558-569`). Concurrent refreshes (steer-change refetch, 1 s activity refresh, key change, refresh-before-send) can resolve out of order, and the older response overwrites the newer one.
- No mapping of `stopped` for the review-capture and routing paths (see above).
- No cleanup of `_agentSuccessors` on destroy; it is capped at 200 entries, so not a leak.

## Failure modes

### Stop failure leaves the lane "Stopping…" forever

- Trigger: `agent:stop` returns `{success:false}` in data (agent not found, restored record, kill error).
- Symptom: card and composer say "Stopping…", Stop disabled, `stoppedByUser` true. The lane may still be running.
- Evidence: `agent-card.component.ts:271-276`; `agent-rpc.handlers.ts:1585-1594`; `claude-rpc.service.ts:197`.
- Current handling: `stopped = result.success` (transport flag).
- Recommendation: use `result.isSuccess() && result.data.success`, and call `cancelStopRequest` otherwise.

### "Stopping…" has no fallback until the first stopped exit arrives

- Trigger: stop RPC succeeds but no `agent:exited` reaches the webview (lost event, or the backend took the `releaseSubprocess` branch for a lane that had just completed, `agent-process-manager.service.ts:3608-3611`, which emits no exit).
- Symptom: indefinite "Stopping…".
- Evidence: `agent-monitor.store.ts` `markStopRequested` arms no timer; `armStopFallback` runs only from `onAgentExited` after `stopAcknowledged`.
- Recommendation: arm the fallback in `markStopRequested`, and re-arm or clear it on exit.

### Stop on a `starting` lane shows 20 s of "Stopping…"

- Trigger: Stop while `status === 'starting'`.
- Symptom: lane already stopped, UI waits the full fallback.
- Evidence: `agent-process-manager.service.ts:3585-3603` (single exit, `hasExited = true`); `settleStopRequest`.
- Recommendation: stamp `exitCode` (or a flag) on that single exit so the store ends the stop at once.

### Stopped review lane is captured as a review

- Trigger: user stops a reviewer lane that declared deliverables and had already written one.
- Symptom: `captureReview` reads a partial file and records it as a review of the run.
- Evidence: `lane-completion-notifier.service.ts:1391-1405`, call site `:623`.
- Recommendation: exclude `stopped` from `capturesReview`.

### Out-of-order preview responses

- Trigger: steer toggles quickly while a tool starts and ends, or two composers show the lane. Each triggers refetches (`lane-delivery.controller.ts` steer effect, activity effect, key effect).
- Symptom: the older preview ("Send now steers") overwrites the newer one ("interrupts").
- Evidence: `agent-delivery.store.ts:558-569` (no sequence); `lane-delivery.controller.ts` effects.
- Recommendation: keep a per-(agent, delivery) sequence and drop stale results.

### Preview refresh runs for every streamed delta even on hosts that report steer changes

- Trigger: any running lane with output.
- Symptom: up to 2 RPCs per second per mounted composer (inspector plus canvas = 4 per second).
- Evidence: `lane-delivery.controller.ts` activity effect labelled "Fallback for hosts that do not report steer availability" but not conditional on that.
- Recommendation: gate the fallback on the lane lacking `steerAvailable` reports, or lengthen the interval.

### Stale delivery error blocks Send now

- Trigger: any earlier send error, then Send now on a queued card or Ctrl+Enter.
- Symptom: nothing happens apart from the old error text staying.
- Evidence: `lane-composer.component.ts` `prepareNow`; controller `error` is cleared only by `draftChanged` and new sends.
- Recommendation: have `refreshBeforeSend` report its own success or failure instead of reading the shared error.

### Recovered FIFO messages re-fold into one draft

- Trigger: two held messages for a lane; composer mounts.
- Symptom: the drain effect (`lane-delivery.controller.ts`, recovered effect) restores both into one draft joined by newline. A later message's model or effort pick is dropped because `restore` keeps the earlier pick (`restore`, `current.model === undefined` check).
- Evidence: `restore()`.
- Recommendation: acceptable, since the user sees and edits the draft. Note it so nobody expects per-message turns after recovery.

### Image echoes vanish after reload

- Trigger: restart or reload.
- Symptom: echo text without thumbnails. Documented in `agent-process.types.ts:761-766`, and bytes are not logged or persisted: `agent-output-buffer.service.ts:105-107` strips them from `accumulatedSegments`, and the log lines count only. I found no other sink: `agent-events.ts:398` broadcasts the live delta only.
- Recommendation: none; recorded as a known limitation.

## Blocking issues

None.

## Serious issues

### S1. Failed Stop RPC is treated as success

- File: `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card.component.ts:271-276`
- Scenario: the stop handler returns `{ success: false, error }` inside a successful RPC envelope.
- Impact: the lane card reads "Stopping…" permanently with Stop disabled while the lane may still run. `stoppedByUser` is also set, so a later real failure would render as "Stopped by you".
- Fix: `const result = await call(...); stopped = result.isSuccess() && result.data.success;`. Add a spec where the data carries `success: false`.

### S2. "Stopping…" is only bounded after the first stopped exit

- File: `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` (`markStopRequested`, `onAgentExited`, `armStopFallback`)
- Scenario: stop accepted, exit event not seen, or lane in the non-running release branch.
- Impact: the same stuck state as S1 without the RPC error.
- Fix: arm the fallback when the request is recorded. Also have the single exit of a stop on a `starting` lane end the stop at once.

## Moderate and minor issues

- M1. `lane-completion-notifier.service.ts:1391-1405`: `stopped` passes `capturesReview` (see above).
- M2. `agent-delivery.store.ts:558-569`: no sequence guard on preview responses.
- M3. `lane-delivery.controller.ts` (activity effect): refetch up to 1 per second per composer even when `steerAvailable` is reported; `scheduleActivityRefresh` clears its timer on destroy, so no leak.
- M4. `lane-composer.component.ts` `prepareNow`: reads the shared error, so a stale error blocks Send now. After the await, `imagesBlocked()` and `attachmentLimitText()` are not rechecked.
- M5. `lane-completion-outcome.ts:67-69` plus `outcome-figures.ts:30-40`: user stops still count as failures in routing stats.
- m1. `claude-sdk-lane-runner.ts:473-498`: the new `logResultUuids` doc block was inserted between the `reconcileSteers` doc block and its function, so the long steer docblock now sits above the wrong function. Style only.
- m2. `session-metadata-store.ts:987-1026`: the manifest schema stays `.strict()`. The new sections are optional and an old manifest parses; an older build reading a new manifest drops it. On a parse failure `restoreQuotaOwner` silently drops `potentialCapabilities` with no log. `blocked` is capped at 200 entries of 200 chars, which is fine for the current lists.
- m3. `lane-echo-images.ts`: DOMPurify is not needed; only four raster types are rendered and base64 is validated once per segment via a WeakMap. Validation runs a regex over the whole string, linear in size. OK.

## Data flow

1. Stop click: `agent-card.stopAgent` marks the card stopping, then calls `agent:stop`. Gap: the result is read from the transport flag (S1).
2. `AgentProcessManager.stop()` stamps `stopped`, emits turn-settled and a first `agent:exited` (no `exitCode`), kills the process. OK. For `starting`, a single exit is emitted (gap above).
3. `handleExit` takes the already-terminal branch, stamps `exitCode`, signals completion once, and emits a second `agent:exited` after the grace delay. OK. Late output after stop flushes as plain deltas with `steerAvailable: false`. OK.
4. `settleStopRequest` ends "Stopping…" on the exit that carries `exitCode`, or on any non-stopped terminal status. OK. The 20 s fallback runs only after the first stopped exit (S2).
5. Completion signal: `verdictOf` gives `stopped` for status `stopped` with no `stopReason`. Envelope text, parent-envelope schemas and the monitor schema accept it. Outcome row maps it to `failed`. Gap: review capture (M1).
6. Steer: runner `supportsSteer()` (`toolInFlight`), flush stamps `steerAvailable` on change, handler calls `onSteerAvailability` unbatched, controller effect refetches. OK, with the unordered-response gap (M2).
7. Queue: one message per settle, `echoDelivered` takes `input.turn.images`, the live delta carries them, and the persisted copy strips them. OK. Restart: queued messages live in the backend body store and recover through `holdForComposer`, one entry each, FIFO. OK.
8. Resume with images: planner `onResume` plus `restoredImages` (named account refuses with its own text), the adapter refuses again for `accountAdmission`. Consistent. OK.
9. Raw command: `noSteer` skips the held warning and keeps it on `tracked.heldBudgetWarning` for the next ordinary message; the completion signal still carries `heldBudgetWarning`. OK. A lane that only ever gets raw commands never delivers it, which is acceptable.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Claude steer on, availability signalled and refetched | PARTIAL | out-of-order preview responses; refetch cadence (M2, M3) |
| `stopped` verdict end to end | PARTIAL | review capture, routing stats (M1, M5) |
| "Stopping…" until process exit, 20 s fallback | PARTIAL | S1, S2, starting-lane case |
| Queued messages per message, echo, FIFO, no loss on restart | COMPLETE | recovery re-folds into one draft by design |
| Images: onResume, named refusal, echo thumbnails, no bytes persisted | COMPLETE | thumbnails lost on reload (documented) |
| Raw command skips held warning | COMPLETE | none |
| Resumed model restore | COMPLETE | no catalog check on the stored model |
| Persisted manifest schema | COMPLETE | unknown keys still rejected |

Implicit requirements not addressed: a stop result check on the frontend; sequence guard for polled state.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Stop on running lane, exit event delivered | YES | two-exit logic | none |
| Stop on `starting` lane | PARTIAL | single exit, fallback | 20 s stale label |
| Stop RPC returns failure data | NO | transport flag read | S1 |
| Stop, exit event lost | PARTIAL | fallback only after first stop exit | S2 |
| Output arriving after stop | YES | flush stamps steer false, status stays stopped | none |
| Steer flips during tool start/end | PARTIAL | refetch on change | response order |
| Two queued messages, restart | YES | per-message bodies, FIFO | none |
| Image-only message | N/A | text is required by the composer | none |
| Old persisted manifest without new sections | YES | optional fields | none |
| Stopped reviewer with a deliverable | NO | captured as review | M1 |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH. Findings come from code reading; no specs run.
- Top risk: a failed Stop RPC is read as success, leaving a possibly running lane stuck on "Stopping…" with Stop disabled.
- What a robust implementation would add: read `result.data.success` in the card; arm the stop fallback when the request is recorded and end it on the single `starting` exit; exclude `stopped` from review capture; add a per-key sequence guard to `previewMessage`; have `refreshBeforeSend` return its own result instead of reading the shared error; gate the activity refresh when the host reports `steerAvailable`.
