# Code-Logic Review — TASK_2026_2197_9781

Verdict: REVISE

Scope: working-tree diff against `main`, read against `implementation-plan.md` lines 11-48.
Files under `libs/frontend/ui` (table, button, instrument-band, inspector-task-section,
turn-summary-tests, db-health-panel and friends) are main-side refactors this branch predates;
they are not task work and were not reviewed as such.

## Defects

### 1. Serious — `endSession` clears the `user-stop` cause it just recorded, before any consumer can read it

- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:329-333`
  records `'user-stop'` at the start of `endRecord`. `deregister()` at
  `session-control.service.ts:361` then calls `clearStopCause(rec.tabId)` after
  `await rec.query.interrupt()` (`:377-398`).
- The consumers read the cause later than that: the stream pump settles the interrupted turn
  (`stream-transformer.ts:671-676` → `settleInterruptedTurn` → `peekStopCause`) and the Stop hook
  reads `takeStopCause` (`stop-failure-hook-handler.ts:92`), both asynchronously around the same
  interrupt.
- Scenario: user presses Stop → `chat:abort` → `interruptSession(sessionId, 'user-stop')` → the
  cause is recorded, then `deregister()` wipes it while the stream settle is still queued. The
  aborted `turn_state` event carries no `stopCause`, so per the new frontend rule the abort row is
  suppressed entirely — worse than the old bare "Interrupted" row. Spec item 6 requires the user
  stop label to be retained.
- The code contradicts itself: `interruptCurrentTurn` carefully preserves the cause at turn
  terminal (`session-control.service.ts:167`, `preserveStopCause`), while `endRecord` clears
  unconditionally.
- Smallest fix: in `endRecord`, record the `user-stop` cause after `deregister()` has run (the
  clear still removes any pre-existing stale cause), or make `deregister` skip causes recorded by
  this `endRecord` invocation.

### 2. Serious — hard stop clears the `host-stop` / `runtime-cap` cause recorded by the parallel turn interrupt

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1273-1280`
  runs `adapter.interruptCurrentTurn(candidate, stopCause)` (records the cause,
  `session-control.service.ts:122-127`) and `adapter.interruptSession(candidate, 'parent-stop')`
  **concurrently** in one `Promise.all`.
- `interruptSession` ends the session; `endRecord`'s `deregister()`
  (`session-control.service.ts:361`) clears the very cause the parallel interrupt recorded.
- Scenario: runtime cap reached → `verifyAndHardStop(..., 'runtime-cap')`
  (`session-spawner.service.ts:2373-2377`) interrupts the child turn. The abort row loses its
  cause and is suppressed; `session:turnFailed` loses `runtime-cap`. Spec item 6 requires the row
  "Runtime cap reached". The plain host-stop path (`:1211-1214`) has the same race.
- Smallest fix: sequence the two (await the turn interrupt, then `interruptSession`), or forward
  the stop cause into `endSession` so `endRecord` records it after `deregister()` (see defect 1).

### 3. Serious — coordinator: a claimed-but-never-sent auto hand-off is a permanent dead end

- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts:315-322`:
  `fire()` claims the session (entry `pending`, `attempts: 0`), then `checkBeforeSend`
  (`:437-460`) can return `false` (RPC error, `unavailable`, or `starting`). The entry stays
  `pending` with `attempts: 0` and `queued: null`.
- Recovery is impossible:
  - `candidates()` skips it (`:165`, the `!(pending && attempts > 0 && queued === null)` guard),
    so `fire()` never re-runs;
  - `reconcile()` (`:473-508`) only re-sends for
    `entry.state === 'delivered' && entry.clientMessageId !== null` (`:492`); for a `pending`
    entry it just polls 12 steps and stops (`:507`);
  - `retry()` requires state `failed` (`session-auto-handoff.service.ts:79-86`), and the banner's
    Retry button only appears for `'Handoff failed'`.
- Worse, `requestWrapUp` (`session-budget-actions.service.ts:268`) also returns early because an
  auto entry exists, and `wrapUpSent()` is true for `pending` (`session-budget-actions.service.ts:133-138`),
  which disables the manual button. Both the automatic and the manual hand-off are blocked for the
  session until an app reload clears the in-memory stores.
- Concrete scenarios: the status RPC fails once at claim time; or a `starting` record is discarded
  by a host stop (`discardStarting`) and the status turns `absent` while the entry is still the
  never-sent claim.
- Related: a `pending` entry with `attempts > 0` whose budget stage drops below `limit` is also
  never cleaned — `staleQueued()` (`:226-238`) only withdraws entries that have a queued ref —
  so the effect re-probes on every re-run and the manual button stays disabled.
- Smallest fix: in `reconcile`, treat `absent` with
  `entry.state === 'pending' && entry.attempts === 0 && entry.queued === null` as recoverable
  (`autoHandoff.release(sessionId)` + `retryRevision` bump); and clean non-queued `pending`
  entries in the stale sweep when the stage is no longer `limit`.

### 4. Serious — coordinator: a straight-away (non-queued) hand-off send can never be re-sent

- `reconcile()` gates the resend on `entry.clientMessageId !== null`
  (`session-auto-handoff-coordinator.service.ts:492`). For a direct send
  `sendOrQueueMessage` returns no `queued` ref, so `recordQueued(sessionId, null)` leaves
  `clientMessageId` null (`session-auto-handoff.service.ts:60-64`,
  `queued?.clientMessageId ?? current.clientMessageId`).
- Scenario: budget at limit while idle → the command is sent straight away → `delivered`
  (`session-auto-handoff-coordinator.service.ts:340-342`), but the child never records a hand-off
  (the skill ran, the tool call failed). Status stays `absent`; the `clientMessageId !== null`
  term blocks the resend that the spec requires ("Re-send only after a settled delivered command
  AND authoritative absent").
- Smallest fix: drop the `clientMessageId !== null` term (the direct send itself settled the
  command), or store the direct send's client message id in `recordQueued`.

### 5. Serious — coordinator: compaction deferral entered after the claim never resumes

- `fire()` claims at `session-auto-handoff-coordinator.service.ts:315`; a compaction that starts
  during the `checkBeforeSend` await is detected at `:323-326` and deferred — with the entry
  already claimed (`pending`, `attempts: 0`).
- When compaction ends, `candidates()` clears the deferral timer (`:160-164`) but then skips the
  session as "already claimed" (`:165`) — the same dead end as defect 3. The 10-minute timer's
  `else` branch (`:430-432`) never runs because the timer was cleared. The wrap-up never sends;
  the manual button is disabled as in defect 3.
- Smallest fix: when the deferral is armed after the claim (or when the timer is cleared because
  compaction ended), release the pending claim so the effect re-derives the candidate.

### 6. Moderate — manual wrap-up deferral: dropping the intent on a target change leaves the session suppressed

- `session-budget-actions.service.ts:152-162`: the deferral effect clears the intent when
  `stillTargets` fails, but `deferManual` (`:174-190`) has already called
  `setWrapUpSent(sessionId, true)`, which also sets the app-level `markManualWrapUp`.
- Scenario: user clicks "Wrap up & hand off" during a compaction; the view then re-binds (tab
  switch or session rekey). The intent is dropped without sending; `markManualWrapUp` persists,
  so the root coordinator logs "manual wrap-up" and skips the session forever, and while the same
  view instance keeps the `wrapUpSessions` entry the button stays disabled. No wrap-up is ever
  sent.
- Smallest fix: in the `stillTargets` failure branch call
  `this.setWrapUpSent(intent.sessionId, false)` before `clearDeferred()`.

### 7. Serious — chat-ui stats helpers were not updated for the new `weighted-tokens` measure

- `implementation-plan.md:16` lists `libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts`
  for modification; the file is unchanged in the diff.
- With the new default measure (`tokenMeasure: 'weighted'`, so `measure: 'weighted-tokens'`):
  - `tokensBudgetSuffix` (`session-budget-format.ts:31`) returns `null` — the `/ <limit>` suffix
    disappears from the TOKENS chip for every default profile;
  - `budgetTooltip` (`:74-84`) falls into the cost branch and formats the token figure as a
    dollar amount ("Session budget: 42% used ($1234567.00 of $30)");
  - `costTooltip` (`:94`) now attaches that garbled line to the COST chip, and `tokensTooltip`
    (`:103`) no longer shows the budget line on the TOKENS chip.
- Smallest fix: treat `'weighted-tokens'` like `'tokens'` in the four `measure === 'tokens'`
  checks (and label the measure per the plan).

### 8. Minor — `SessionHandoffService.status` answers `absent` for an unresolvable identity

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:261-263`:
  an empty `tabId`, `sessionId` or `workspaceRoot` returns `{ state: 'absent' }`. `absent` is the
  authoritative answer that authorizes a resend; an identity that cannot be resolved is not proof
  that no hand-off exists. The RPC handler currently guards the empty case
  (`session-handoff-rpc.handlers.ts:90`), so only future callers are exposed.
- Smallest fix: return `{ state: 'unavailable' }` for an empty identity.

### 9. Minor — pending compaction sample keyed by the raw SDK id, consumed by the effective id; no cleanup on session end

- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:1314-1333` records the sample under
  `message.session_id`; `recordBudgetCompaction` (`:2469-2476`) looks it up and deletes it under
  the `effectiveSessionId` that `onCompactBoundary` passes
  (`stream-transformer.ts:1154-1156`). The ids normally match, but a boundary that arrives before
  the real id is resolved (CLI path passes the tab id until then) records under one key and is
  consumed under the other: the escalation gate silently never fires for that boundary and the
  stale entry is never removed (no cleanup on session end).
- Smallest fix: key the sample by the same resolved id the callback uses (or record both ids), and
  clear the map entry when the session ends.

## Verified as correct

- **Item 1 (budget measure).** `SessionBudgetTokenMeasure` type, `sessionBudget.tokenMeasure` key
  and `'weighted'` default match the plan (`session-budget.types.ts`). The provider resolves an
  absent key to `raw` only when `tokens` or `unit` is stored, warns and falls back on invalid
  values, and never writes on read (`session-budget-config.provider.ts:106-192`). The stage picks
  `weightedSessionTokens` (weights 1 / 5 / 0.1 / 1.25, `weighted-tokens.ts:12-17`) or
  `snapshot.tokenCount`, keeps the partial-coverage lower bound, and rebuilds the limit for both
  token measures in `keepPreviousFigure`. The settings card's legacy resolution equals the
  provider's, the raw-mode recommendation switches explicitly and states the limit is unchanged
  (`session-budget-settings.component.ts:443-450`, `selectWeighted`). The chat banner labels
  `Raw session tokens` / `Weighted session tokens` and adds the weighted recommendation to the
  raw tooltip. All three `SessionBudgetConfig` literals in the repo carry `tokenMeasure`.
  `sessionBudget.autoHandoffAtLimit` default is untouched.
- **Item 2 (compaction count gate).** The escalation condition is exactly the specified five-term
  conjunction (`session-budget-stage.ts:159-167`); ordinary revisions pass `null` fields so they
  cannot escalate; the monotone floor keeps a true escalation and drops only on settings reset
  (`:168-169`). The sample comes from `compact_metadata.post_tokens` of the same boundary, and the
  window from `resolveAutoCompactControl` (claude 200k, proxied `null` → correctly no escalation
  when the window is unknown). The record/delete pair in the adapter consumes each sample once.
  The settings help explains the 50%-of-window condition.
- **Item 3 (durable handoff state).** `session:handoffStatus` is read-only: Zod-validated params,
  result carries state and successor id only, no paths, and the query never creates a successor.
  `statusForPredecessor` locates with `complete = true`, so an unreadable storage rejects and the
  service maps that to `unavailable` — never a false `absent` (double-send guard). The record
  state union matches the RPC result union. The coordinator re-sends only after a settled
  delivered command and an authoritative `absent`, caps attempts at five, sets `failed` with a
  Retry button, retains `pending` with a visible status error on `unavailable`, and never
  re-sends on `starting` / `recorded` / `closePending` / `closeCompleted` / `unavailable`.
  Reconcile and deferral timers are cleared on destroy, on unbind (rekey/tab close) and on
  cancellation. Manual and auto suppress each other's duplicate send in both directions.
  `cancelAutoHandoff` reverts to `delivered` only when the queue confirms the turn already took
  the message, which is then true.
- **Item 4 (compaction deferral).** `fire()` checks compaction before the probe, after the probe
  and after the status query; there is no `await` between the last check and
  `sendOrQueueMessage`, so no send can land in an open compaction. Both deferral timeouts are
  600 000 ms; a still-compacting timeout marks the attempt `failed` and offers the Retry button
  instead of forcing a send. The stale queued withdrawal now also releases the auto claim
  (`follow-up-queue.service.ts:442-446`).
- **Item 5 (idle compaction).** Default 150 000 with bounds and explicit values preserved
  (`advanced-settings.types.ts`). The gate fires only in `min <= context < effectiveSdkWindow`,
  requires `context >= postBoundaryBaseline + 50 000` after an observed boundary, skips with a
  diagnostic reason while the baseline is unknown, reports the gate inactive when the configured
  min is at or above the known window, and falls back to min + growth guard when the window is
  unknown. The reducer takes the first valid post-boundary `turn-context` as the baseline without
  using it to arm, and resets the baseline on every later boundary, on rekey and on release.
- **Item 6 (stop cause), wire side.** `TurnStopCause`, the `SdkTurnFailedPayload` schema/parser
  and the `ExecutionChatMessage` / `SessionTurnState` schemas all carry the optional `stopCause`;
  `session:turnFailed` and the in-stream aborted `turn_state` both receive it. The origin
  (`interruptCurrentTurn(…, cause)`, parent steer, runtime cap, host stop, `endSession`
  user-stop) records dual-keyed by tab id and SDK session id, so the transformer's `peek` and the
  Stop hook's `take` read one shot each from separate maps. The cause is cleared on timeout,
  throw, next turn start and session disposal (registry callback), which bounds leaks to a later
  turn. The frontend suppresses the synthetic row when the cause is absent or `internal-abort`
  and keeps the resumable node state when merging into the previous assistant message.
  Explicit `Send now` remains the only steer; queued delivery and host wrap-up cannot select the
  interrupt mode implicitly. Codex/other `interruptCurrentTurn` implementations still satisfy the
  interface because the cause parameter is optional.
