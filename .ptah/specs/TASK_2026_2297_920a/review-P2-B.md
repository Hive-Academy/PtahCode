# Review P2 lane B (cli-agent-runtime, shared)

Scope: uncommitted `git diff HEAD` of `libs/backend/cli-agent-runtime` and `libs/shared` (agent-action files
excluded), against `lane-B-brief.md`, `lane-brief-common.md` and the coordinator decisions. Read-only review.
No Jest run was necessary. Prefix `S/` = `libs/backend/cli-agent-runtime/src/lib/session-children/`.

## Checks that pass

- `session-handoff.service.ts` has no change. The ack path still ends the predecessor with `parent-stop`.
- Kill paths are gone. `armHandoffGrace`, `runtimeSafetyNet`, `hostSucceed`, `interruptInBackground(..., 'runtime-cap')`
  and the `runtime-cap-interrupted` grace kill do not exist in source. `onHandoffGraceExpired` (S/session-spawner.service.ts:2652)
  only calls `pauseChild`. The remaining `interruptInBackground` calls are prestart cancel (:961), dispose (:1628) and the
  existing 60 s retire after a normal child handoff (:3040).
- Top-level Fix C keeps resume + `WATCHDOG_RECOVERY_PROMPT` + `Ptah recovery` sender, the `endedAt` cutoff
  (`startedAt` first, fallback captured before the lookup), one retry, and it requires `zeroOutwardEvents === true`.
- An unbound child replays through `startChildSession` with `formatWatchdogRetry()` + blank line + original prompt
  (spec start-guard :472-476). A bound child and a child successor use `recoverAfterWatchdogStop`.
- Reservation is synchronous in `onSessionEnd`, before `armGrace`. The 30 s end-grace (:1885), the 120 s probe (:2032),
  `onTurnFailed` and the grace cancel in `onSessionIdResolved` all respect `owns(key)`.
- Cancel on explicit stop (:1395), non-watchdog end, reparent (`registry.onReparent`, scheduled phase only) and
  `releaseResources` (`forget`). The unbound path also checks the chat abort queue.
- Historical data stays readable: `no-activity-timeout` maps to `formatProviderHang(180)` in `CAUSE_WORDS`,
  `routeSessionEndCause` and `isProviderNoResponse`. `runtime-cap-interrupted` stays in `SessionChildSuccessionCause`
  and its render paths (S/session-child-succession.ts:62, :97).
- The shared changes are additive optional fields only (`notice`, `receipt`).
- User-facing watchdog and pause text comes from the shared Ptah-labeled builders. No new text says "the user".

## Findings

### M1 (major) A paused or cap-reached child has no resume route for the parent

- Where: S/session-spawner.service.ts:1125-1138 (send refusal), :2669-2678 (`clearChildPause`), :1698 (resume clear).
- Problem: at the cap, every `ptah_session_send` gets `busy`. After cap + grace, every send gets `session-paused`.
  The pause clears only on a session end or on an SDK id re-bind with `isNewSession === false`. A paused child that
  is idle but still live never ends and never re-binds. The parent cannot send, and the host succession on the next
  message (old `hostSucceed(child, 'runtime-cap', message)`) was removed. The notice text tells the parent to
  "Continue after choosing a successor or explicitly resuming work", but no tool does either. The only remaining
  action is `ptah_session_stop`, which is a kill. This contradicts "Pause, never kill" in practice.
- Fix: give the parent one explicit route. Either treat a parent send to a paused child as an explicit resume
  (call `clearChildPause`, re-arm `armRuntimeCap`, then deliver), or start a host successor with the message for an
  idle paused child through `succeedChild` without an interrupt of the predecessor. Add a spec for the chosen route.

### M2 (major) The 120 s probe no longer settles a child whose first turn never started

- Where: S/session-spawner.service.ts:2034-2037, S/session-child-first-turn.watchdog.ts (removed `firstTurnVerdict`).
- Problem: the old `fail` verdict ended a child with no SDK id, no settled turn and a phase other than `generating`.
  Now the probe only logs "awaiting a confirmed provider end". The lane A contract fires `provider-no-response` only
  inside a confirmed open turn. A host start that opened a stream but never opened a turn produces no end, so the
  child stays `idle`/`starting` forever and the parent gets nothing. The brief keeps the probe advisory only
  "while liveness is uncertain". Liveness is not uncertain when there is no lifecycle record, no SDK id and the phase
  is not `generating`.
- Fix: keep the log-only path for `generating` or a present lifecycle record. When `firstTurnNotStarted(probe)`,
  the phase is not `generating`, `!probe.awaitingPermission` and `!this.lifecycle.find(id)`, call
  `failFirstTurn(child, firstTurnFailureText(...))` as before (without the interrupt, which the new `failFirstTurn`
  already removed). Restore the deleted spec "fails a child with no SDK id, no turn and no running turn".

### M3 (major) A replay that ends `stopped` or `already-active` after the 30 s grace leaves the child with no timer

- Where: S/handoff-watchdog-recovery.ts:152-155 and S/session-spawner.service.ts:1885.
- Problem: `onGraceExpired` returns while `owns(key)` and does not re-arm. If `recoverAfterWatchdogStop` takes longer
  than 30 s and returns `stopped` (or `already-active` for a stale record), `replay` sets `settled` and calls no hook.
  The child keeps `endCause = provider-no-response`, has no grace timer, and never settles. The parent sees a live
  child that never reports.
- Fix: in `onGraceExpired`, re-arm the grace instead of `return` while the retry owns recovery. Or add an
  `onSettled(outcome)` callback to `FirstTurnRecoveryAttempt` that the spawner uses to `armGrace` when no grace timer
  is armed. Add a spec with a recover promise that resolves `stopped` after 31 s.

### M4 (major) `clearPause` keeps the stale notice, so later completions still carry a pause notice

- Where: S/session-child.registry.ts:492-494, S/session-spawner.service.ts:2173-2184 and the snapshot (notice kept).
- Problem: `clearPause` patches only `paused: undefined`. `notice` stays on the record. After a resume, the snapshot
  still exposes `notice: {action:'paused'}` and `deliverToParent` adds that notice to every later completion
  envelope. The parent sees a paused notice on a normal completion. Brief item 3 requires a clear difference between
  a live paused child and other states.
- Fix: `this.update(childSessionId, { paused: undefined, notice: undefined })`, or keep the old notice in a separate
  historical field. Attach the notice to the envelope only while `child.paused` is true, or only once.

### m1 (minor) Runtime cap is not re-armed after a pause clears

- Where: S/session-spawner.service.ts:2669-2678.
- Problem: `clearChildPause` sets `capReached = false`, but `runtimeTimer`, `warnTimer` and `handoffGraceTimer` are
  already undefined. A resumed child runs without a cap and never gets the handoff ask again.
- Fix: call `armRuntimeCap(runtime, id, runtime.settings.maxRuntimeMinutes)` when a live pause clears on resume.

### m2 (minor) Grace expiry pauses a child whose succession is in flight

- Where: S/session-spawner.service.ts:2652-2660.
- Problem: the old code re-armed a 60 s timer while `runtime.succeeding`. The new code pauses at once and sends
  the parent a "paused" notice while the handoff is in progress.
- Fix: if `runtime.succeeding`, re-arm a short `handoffGraceTimer` and return.

### m3 (minor) Parent notice is lost when the parent is not active or ownership moved

- Where: S/session-spawner.service.ts:2720-2728.
- Problem: `sendParentNotice` returns silently when the forwarded parent is not active or the parent id changed.
  `pausePublished` is already true, so the one notice is never delivered and nothing is logged.
- Fix: log the drop. Prefer to resolve the current parent from the registry at send time instead of a drop on a
  changed parent. Consider a held peer message for an inactive parent.

### m4 (minor) Duplicate end with no `startedAt` during `replaying` is counted as a second failure

- Where: S/handoff-watchdog-recovery.ts:101-109.
- Problem: `startedAt` is optional in `SessionEndPayload`. A duplicate end (SDK id and tab id) without `startedAt`
  that arrives in phase `replaying` or `used` calls `fail(true)` and settles a retry that is still running.
  The agent-sdk producer usually sets `startedAt`, so the risk is low.
- Fix: in phase `replaying`, ignore any end. In phase `used`, treat a missing `startedAt` as a duplicate unless it
  arrives after the replay start time.

### m5 (minor) Silent settle paths lose diagnostics

- Where: S/handoff-watchdog-recovery.ts:135-137 (`isCurrent()` false at fire time), :152-155 (`stopped`,
  `already-active`), and the removed success log.
- Problem: the old code logged "resumed after the watchdog stop" and "was not retried (reason)". These outcomes
  are now silent for top-level successors.
- Fix: `this.deps.log(...)` for each non-failure outcome with the reason.

### m6 (minor) The `busy` refusal at the cap uses inline copy and a misleading reason

- Where: S/session-spawner.service.ts:1132-1137.
- Problem: the text is not from a shared builder, and `busy` suggests a running turn. The child is held, not busy.
- Fix: use a shared builder (for example `formatAgentActionNotice` with action `asked-handoff`) and reason
  `session-paused` or a new `session-held` reason.

### m7 (minor) Direct `Symbol.for('ChatFollowUpQueueService')` lookup

- Where: S/session-spawner.service.ts:1866-1871.
- Problem: the spawner resolves an rpc-handlers token by string with an inline structural type. A rename in
  `libs/backend/rpc-handlers/src/lib/chat/tokens.ts:50` breaks the stop check silently (it returns "not stopped").
  It also covers only chat abort. A tab close during the 5 s delay is not checked on the unbound path.
- Fix: add an optional `stoppedSince(tabId, at)` method to `IChildChatSessionHost` and implement it in the host,
  or define a runtime-owned token. Include tab close in the check.

### m8 (minor) A cap-reached predecessor is never retired after its own handoff

- Where: S/session-spawner.service.ts:2968-2982.
- Problem: with `cooperativePause`, a child-handoff from a paused or cap-reached child arms no retire timer. The
  predecessor stays in `retiring` and keeps its SDK session until it ends by itself. A normal handoff still
  interrupts after 60 s. This is consistent with "Pause, never kill", but the behaviour differs per path and no
  spec covers it.
- Fix: record the decision in `context.md`, and add a spec that the predecessor is released when its session ends.

### m9 (minor) `measured` uses runtime minutes for non-runtime reasons

- Where: S/session-spawner.service.ts:2685-2692.
- Problem: `succession-limit` and `successor-start-failed` notices report the runtime cap as `measured`.
- Fix: set `measured`/`limit` to the succession count and `maxSuccessions` for `succession-limit`, and omit them
  for `successor-start-failed`.

### m10 (minor) Spec gaps

- No spec covers M2, M3, M4, m1 or m2.
- No spec checks that the tool disposition is cleared for both tab and SDK ids on end, dispose and resume
  (only `set` is asserted in S/session-spawner.succession.spec.ts:314).
- No spec covers the `onTurnFailed` skip for a `ProviderTurnEndError`, or a duplicate end during `replaying`.
- Fix: add focused specs for each item. The existing specs assert real behaviour and none is empty.

## Verdict

**Changes requested.** The kill paths are gone, Fix C is preserved, and the retry reservation is sound for the main
paths. Four major items remain. M1 leaves a paused child unreachable except through a stop. M2 can leave a child
that never started live forever. M3 can leave a child with no timer. M4 shows a stale pause notice after a resume.
Fix M1-M4 with specs before the push. The minor items can go in the same batch or a follow-up.
