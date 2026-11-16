# Code-Logic Re-review — TASK_2026_2197_9781 (fix round)

Verdict: REVISE

Scope: only the fixes of defects 1-9 from `code-logic-review.md` plus the batch X
change, read in the working tree against `main`. Read-only; no tests were run.

## Defect verification (1-9)

| # | Status | Evidence |
| - | - | - |
| 1 | FIXED WITH NEW DEFECT | `session-control.service.ts:350-366`: `deregister()` clears the old cause (`:359-361`) and records `user-stop` only afterwards (`:362-366`), gated on `ownsTab`; the stream (`sdk-message-transformer.ts:489-493`, `:250-261`) and the hook (`stop-failure-hook-handler.ts:92`) can read it after session end. Regression: `session-control.service.spec.ts:156-167` (an earlier cause is cleared, both consumers read once). New defect N1 below: the copy that no consumer reads is never cleaned at session end. |
| 2 | FIXED | `endRecord` computes `preserveTurnStopCause = cause === 'parent-stop' && rec.turnInFlight` (`session-control.service.ts:329-331`) and `deregister` skips the clear while the record still owns the tab (`:359-361`). The parallel pair in `session-spawner.service.ts:1271-1285` is unchanged, and the cause survives both settle orders: turn interrupt first (`:150-174`, `onTurnTerminal(sessionId, true)` preserves), session end first (`registry.find(...) === rec` is then false, `:150-151`, so no terminal clear; deregister already skipped). Regression: `session-control.service.spec.ts:169-182`. Residual edge N2 below (the 3 s-timeout sub-order). |
| 3 | FIXED | Never-sent claim: `reconcile` releases on authoritative `absent` + `pending` + `attempts === 0` + `queued === null` and bumps `retryRevision` (`session-auto-handoff-coordinator.service.ts:505-508`), so `fire()` re-derives it. Below-limit cleanup: `staleQueued` now takes every `pending` entry whose tab is below `limit` (`:235-237`) and `withdrawStale` releases the non-queued one (`:246-248`). Manual unblocking: `wrapUpSent` is false for a never-sent `statusError` claim (`session-budget-actions.service.ts:136-138`) and `requestWrapUp` releases that claim before the manual send (`:273-277`). Regressions: `session-auto-handoff-coordinator.service.spec.ts:150-168`; `session-budget-actions.auto-handoff.spec.ts:85`. |
| 4 | FIXED | The resend no longer requires `clientMessageId`: `reconcile` re-sends on `absent` + `delivered` + an idle tab (`session-auto-handoff-coordinator.service.ts:509-518`) through `releaseForResend` (`session-auto-handoff.service.ts:82-86`), which re-arms `pending` with `queued: null` and keeps `attempts`. The five-send cap across claim release holds: `sentAttempts` is retained when a claim is released (`session-auto-handoff-coordinator.service.ts:104-105`, incremented `:352`, enforced `:325-328` and `:510-512`). Regression: `session-auto-handoff-coordinator.service.spec.ts:170-176` (direct send, `clientMessageId` null, second send). |
| 5 | FIXED | The claim is released before the deferral is armed (`session-auto-handoff-coordinator.service.ts:334-337`), and when compaction ends `candidates()` clears the deferral timer and re-derives the unclaimed session (`:161-166`). The timer is not re-armed while it runs (`:437`). Regression: `session-auto-handoff-coordinator.service.spec.ts:178-191`. |
| 6 | FIXED | The deferral effect's `stillTargets` failure branch now clears the sent flag and the manual mark before it drops the intent (`session-budget-actions.service.ts:160-162`, `setWrapUpSent(false)` → `clearManualWrapUp`, `session-auto-handoff.service.ts:137-139`), so the root coordinator no longer skips the session and the button re-enables. Regression: `session-budget-actions.service.spec.ts:112`. |
| 7 | FIXED | `'weighted-tokens'` is handled everywhere the first review listed: `tokensBudgetSuffix` (`session-budget-format.ts:31`), `budgetTooltip` token branch and the `Weighted session tokens` label (`:74`, `:86`), `costTooltip` (`:95`), `tokensTooltip` (`:104`); the inspector shows the token meter for both token measures with a per-measure label (`inspector-session-stats.component.ts:145`, `:150`). No other `measure === 'tokens'` check remains unpaired in `libs/frontend` except the banner's raw-mode note, which the fix report states is raw-specific by design (`session-budget-banner.component.ts:173`). |
| 8 | FIXED | `status()` returns `{ state: 'unavailable' }` for an empty `tabId`, `sessionId` or `workspaceRoot` (`session-handoff.service.ts:262-263`); a complete lookup with no record still returns `absent` (`:271-273`), and a storage failure returns `unavailable` (`:274-276`). |
| 9 | FIXED | The boundary tap stores ONE sample object under both the owner id and the raw SDK id (`sdk-agent-adapter.ts:1336-1337`); `recordBudgetCompaction` looks the sample up by every current key and `clearPendingBudgetCompaction` removes every alias of that entry (`:2477-2483`, `:2493-2499`), so a boundary recorded before the real id resolves is consumed under either id. Cleanup: `endSession` (`:1202-1203`), `releaseBudget` (`:1250-1256`), adapter disposal (`:863`). |

## Batch X change

Verified correct. `isStaleAutoHandoff` matches the pending claim by client
message id (`follow-up-queue.service.ts:462-466`) and the pump withdraws a stale
queued command and releases its claim (`:442-448`); the released claim makes the
`watchQueued` 'withdrawn' outcome a no-op, so no retry loop follows
(`session-auto-handoff-coordinator.service.ts:384-388`). The unused second
default is gone from `idle-compaction.types.ts` (line 11 now
`IDLE_POST_BOUNDARY_GROWTH_TOKENS`), and the `fired` union member is gone from
`AutoHandoffState` (`session-auto-handoff.service.ts:4`). No defect found.

## New defects

### 1. Moderate — a stop cause recorded at session end is never cleaned when no consumer reads it, and can label a later turn of a resumed session

- Severity: Moderate.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:362-366`
  records `user-stop` after `registry.remove(rec)`, unconditionally on
  `cause === 'user-stop' && ownsTab` — it does not check `rec.turnInFlight`, and
  removal has already run, so no disposal path can clear it. The only bound on
  such an entry is the registry's cause-clear callback, which is wired as the
  TURN-START callback and fires by tab id only
  (`session-lifecycle-manager.ts:454`,
  `session-registry.service.ts:685-686`); record removal does not clear causes
  (`session-stream-pump.service.ts:88-100` fails only queued items), and nothing
  clears on `bindRealSessionId` (`session-registry.service.ts:411-481`). The
  first review's "verified" item 6 called this a disposal callback; it is not.
- Scenario: the user stops a running turn. The stream consumes its copy
  (`sdk-message-transformer.ts:489-493`); an aborted CLI fires no StopFailure
  hook, so the hook copy stays keyed `[tabId, sdkId]`
  (`sdk-adapter-events.service.ts:148-155`). The tab closes without another
  turn, so the turn-start clear never fires. The session is resumed in a new tab
  under the same SDK id — the resumed session's turn start clears by ITS tab id,
  which is not a key of the stale entry. The first turn that fails fires
  StopFailure and `takeStopCause(resolvedSessionId)`
  (`stop-failure-hook-handler.ts:92`) returns the stale `user-stop`, so
  `session:turnFailed` labels an unrelated provider failure as a user stop; a
  causeless interrupt settle reads it the same way
  (`sdk-message-transformer.ts:260`, `:492`). The same stale window exists for a
  `user-stop` recorded while no turn was in flight (both copies then survive).
- Smallest fix: make the turn-start clear reach the effective id too — in
  `SessionRegistry.markTurnStarted` pass `rec.realSessionId ?? rec.tabId` to the
  callback in addition to `rec.tabId`, and have the callback at
  `session-lifecycle-manager.ts:454` clear both ids. The resumed session's first
  turn start then removes the stale entry under the SDK id
  (`clearStopCause` already deletes every alias of the entry).

### 2. Minor — residual: the 3 s-timeout sub-order of the parallel stop loses `host-stop` / `runtime-cap`

- Severity: Minor (not introduced by this fix; the first round's timeout rule
  applied to a session that then stayed alive, which required the clear).
- `session-control.service.ts:133-141` races the turn interrupt against 3 s; on
  timeout `:145-149` clears the cause the same call recorded and retires the
  record, so in `verifyAndHardStop` (`session-spawner.service.ts:1271-1285`) a
  child whose SDK interrupt takes longer than 3 s loses the `runtime-cap` /
  `host-stop` label: `endRecord`'s later `deregister` finds `ownsTab` false and
  the aborted row is suppressed.
- Both normal completion orders keep the cause (see defect 2 above); only this
  sub-order does not.
- Smallest fix: let the teardown caller mark the interrupt as terminal — an
  optional `preserveOnTimeout` argument to `interruptCurrentTurn` that skips the
  `clearStopCause` when the record's session is ending, passed by
  `verifyAndHardStop`. Sequencing the two interrupts instead would change the
  host-stop timing the fix report says must stay parallel.

## Regression checks requested

- Stop-cause leak into a later turn or a resumed session: yes — new defect 1.
  Who clears an unread cause: only a turn start in the SAME tab, or a later
  record under the same keys; nobody at session end.
- Parallel `interruptCurrentTurn(cause)` + `interruptSession('parent-stop')`:
  both settle orders keep the cause (defect 2 row); the >3 s timeout sub-order
  does not (new defect 2).
- Handoff invariants, all verified:
  - No re-send on `starting` / `recorded` / `closePending` / `closeCompleted` /
    `unavailable`: `checkBeforeSend` returns only on `absent`
    (`session-auto-handoff-coordinator.service.ts:460-472`); `reconcile`
    transitions and stops or keeps polling without sending
    (`:488`, `:494-503`, `:524`).
  - At most five sends per session, across claim release: `sentAttempts`
    survives releases and both cap checks enforce it
    (`:104-105`, `:325-328`, `:352`, `:510-512`).
  - Manual and automatic never double send: `requestWrapUp` refuses a live auto
    claim and recovers only the unsent `statusError` one
    (`session-budget-actions.service.ts:273-277`); the coordinator refuses
    manually wrapped-up sessions (`:176`, `:315`, `:333`).
  - No send into an open compaction: the last `compacting` check has no await
    before the send (`session-auto-handoff-coordinator.service.ts:334-339`).
  - Automatic hand-off only at the authoritative stage `limit`:
    `candidates` (`:146`) and `stillQualifies` (`:413`) read `tab.sessionBudget.stage`,
    never the live estimate.
  - No un-paced release/re-claim loop: the `absent` release re-enters through a
    full send cycle, and every resend waits for the previous hand-off turn
    (`tab.status !== 'streaming'`, `:509`) or the send failure gate
    (`deferAttempt`, `:531-560`); the compaction deferral releases the claim
    once and the running timer is never re-armed (`:437`).
  - Timers: deferral and reconcile timers are cleared on unbind and cancel
    (`clearObsoleteTimers`, `:420-433`; `:163-172`) and on destroy
    (`:113-118`); the manual deferral timer is cleared on destroy, target
    change, compaction end and its own timeout
    (`session-budget-actions.service.ts:156-197`).

## Checks not run

None of the focused Jest runs were executed; this re-review is code reading
only, as allowed. The two spec-TypeScript failures reported by the fix lanes
(`mock-rpc-service.ts` signatures, BigInt target errors) remain outside this
task's write set.
