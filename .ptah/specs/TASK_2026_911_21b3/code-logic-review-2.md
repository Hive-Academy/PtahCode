# Code logic review 2 — commit 4f76db2a6 (recover a child that ends in a failed handoff)

Verdict: **APPROVED** — 1 Minor finding; the fix closes review finding 1 for both event
orders, keeps user stops as stops, and adds no double-succession or leaked-timer path.

## Findings

1. **Minor — a stale `endCause` can be routed when the final session-end event is lost.**
   `session-spawner.service.ts:974` (cause read), `:968-973` (harmless expiry).
   Scenario: end #1 (`provider-error`) arms the grace; the session revives; the grace
   expires "live again harmlessly" and `runtime.endCause` stays set. The session later
   dies with a user stop whose end event is never delivered; its in-flight handoff then
   fails; `recoverDeadCaller` arms the grace and `onGraceExpired` routes the stale
   `provider-error`, so a successor starts after a user stop. The reverse stale case
   (stale `user-stop`, real `provider-error`) ends the child instead of succeeding it.
   Impact is bounded: it needs a lost end event plus an earlier harmless grace, and a
   lost event already routes as `unknown` elsewhere. Smallest fix: in the "live again"
   branch of `onGraceExpired`, clear `runtime.endCause`, so `recoverDeadCaller` routes
   `unknown` (recovery still runs; the log already prints `unknown`).

## Checked and correct

- **Both orders of finding 1 are closed.** End during the flight: `onSessionEnd`
  keeps the cause (`session-spawner.service.ts:949-953`), the flight fails,
  `succeed` calls `recoverDeadCaller` (`:1538`), which arms the grace (`:1552`), and
  `onGraceExpired` routes it. End before the flight (the original finding): the normal
  grace expires into `succession-in-progress` and returns without re-arming
  (`:980`); the failed flight then reaches the same `recoverDeadCaller`. No variant of
  the scenario still waits for the runtime cap.
- **No successor for a live session.** `activeIdOf` (`:1270-1277`) checks both session
  ids against the adapter; `recoverDeadCaller` returns when it is non-null (`:1551`),
  so the refusal reaches the live tool caller instead.
- **A user stop stays a stop.** The kept cause routes through
  `routeSessionEndCause` (`session-child-succession.ts:99-101`): stop causes take
  `endOutside` (`:984`), which marks the record ended and adopts lanes to the parent
  (`:987-1007`). The new spec pins both classes
  (`session-spawner.succession.spec.ts:245-275`).
- **No double successor.** `succeedChild` refuses a running succession and a terminal
  record (`:1568-1570`); `onGraceExpired` defers to a running succession (`:980`);
  the runtime-cap path (`:1014-1030`) converges on the same guards.
- **No timer left armed on a terminal child.** `armGrace` clears a prior timer
  (`:1670`); every terminal path (`endOutside`, `runtimeSafetyNet`,
  `retirePredecessor`, the `session-ended` settle) reaches `releaseResources`, which
  deletes the runtime and clears all timers (`:1343-1354`, `:1416-1425`); and
  `onGraceExpired` bails on a terminal record (`:967`). Timers are `unref`-ed
  (`:1681-1683`).
- **An `endOutside` during a live flight cannot resurrect the record.**
  `revertSuccession` only reverts a `handed-off` predecessor
  (`session-child.registry.ts:368`), so a record already `ended` stays ended, and
  `recoverDeadCaller` then returns on `terminalStatus` (`:1550`).
- **Other paths.** Ends on terminal records without a flight in progress are
  intentionally ignored; every `stopping` setter pairs with a terminal mark or
  `releaseResources`. The only remaining live-record-with-dead-session case is a
  never-delivered end event, which the runtime cap still bounds (pre-existing,
  out of scope).

Review method: full read of `onSessionEnd`, `onGraceExpired`, `endOutside`, `succeed`,
`recoverDeadCaller`, `succeedChild`, `armGrace`, `activeIdOf`, `releaseResources` and
`clearTimers` in the current file, plus `routeSessionEndCause` and the registry guards.
No commands were run (scoped `npm run verify -- -p cli-agent-runtime` passed before
this review). Read-only; only this deliverable was written.
