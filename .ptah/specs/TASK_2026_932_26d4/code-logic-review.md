# Code Logic Review — TASK_2026_932 (uncommitted diff on fix/session-status-cleanup)

## Verdict: CHANGES REQUIRED — score 6/10

Fixes A, B, C and E are mostly sound and have tests. Three defects remain.
`clearFinished` can lose a held completion. It can also break a succession that is in flight.
The implicit start idempotency can report success for a start that fails later. Each fix is small.
The score is 6 and not 7: these are real data-loss and ghost-child paths at the new MCP boundary.
The score is 6 and not 4: the core lineage, stop and watchdog logic is correct and has tests.

Scope examined: `git diff HEAD` of the spawner, registry, port, outcome mapper, watchdog, the adapter,
`chat-session.service.ts`, the session tool handlers and the arg schemas. I read `settle`,
`takeHeldCompletions`, `onSessionEnd`/`onGraceExpired`, `succeedChild`/`revertSuccession` and
`releaseResources` in full. No tests or checks were run (task rule). I did not review the docs or
the compact status text in depth.

---

## Major

### M1. `clear_finished` drops undelivered held completions
- Evidence: `session-spawner.service.ts:1055-1120` removes every terminal record of the caller.
  `takeHeldCompletions` (`:1140`) reads `heldCompletion` from those same records.
  `session-tool-handlers.ts:796` runs the tool first. Then `:808` calls `takeHeld(session, ...)`.
- Scenario: a child ends (or fails its first turn, see `failFirstTurn` `:1461`) while the parent is
  not live. The completion is held on the record. After a restart, the parent's first session call
  is `ptah_session_clear_finished`. The record is removed before `takeHeld` runs, so the completion
  is lost. The parent never learns the outcome.
- Smallest fix: in `clearFinished`, skip a child that has `heldCompletion` (new skip reason
  `held-completion`). Alternatively, take the held completions before the removal and return them.
  Add a spec.

### M2. `clear_finished` races a succession that is in flight
- Evidence: `succeedChild` calls `registry.succeed(...)` at `:2187`. This marks the predecessor
  `handed-off` (terminal) before the awaited `retainMcpRoot` and `startOnHost`. On a failed start,
  `revertSuccession` (`session-child.registry.ts` ~`:424`) returns `undefined` when the predecessor
  record is missing. `clearFinished` tests only `!child.terminalStatus` (`:1097`).
- Scenario: a child hands off. The parent calls `clear_finished` during the successor start, and the
  successor start then fails. The predecessor record is already gone, so the revert is a no-op. The
  live predecessor session is untracked. The successor record stays non-terminal with no runtime,
  and it holds a cap slot (`liveCount`) until host restart. During the 60 s retire window
  (`:2264`), `retirePredecessor` still runs on a record that is gone (harmless, but no log).
- Smallest fix: treat `this.runtimes.has(id) || this.retiring.has(id)` as `live` in `clearFinished`.
  Add a spec: clear during `succeeding` skips the predecessor.

### M3. Idempotent start returns `ok: true` for a pending start that fails later
- Evidence: `existingStart` (`:401`) includes `registry.pendingOf(...)`. `guardStart` returns
  `{ ok: true, alreadyExists: true }` (`:368`). The pending record is removed in the `finally` of
  `provisionAndStart` when the model route, the worktree or the host start fails.
- Scenario: the first start times out on the client. The retry gets "Not started again ... already
  runs" with the pending id. Then the first start fails, for example because the worktree is
  refused. The only result that carried the failure went to the timed-out call. The parent holds a
  child id that `status` reports as `unknown-child`. No completion is pushed, so the parent can wait
  indefinitely.
- Smallest fix (pick one):
  (a) Keep the start promise per pending id and `await` it for the retry. Return its real result.
  (b) Keep a short-lived "failed start" tombstone that `status` reports with the refusal detail.
  (c) Reply with an explicit `starting` text: "call ptah_session_status; this start can still fail".
  Option (a) is the smallest correct fix. Add a spec: pending, second start, first fails.

---

## Minor

### m1. Host shutdown reads `Stopped`, not `Interrupted` (spec deviation)
`dispose` marks children `stopped` with cause `host-shutdown` (`:1180-1185`).
`session-child-outcome.ts:96` returns the status as the kind for every non-`ended` status.
`context.md` section C maps host-shutdown to `interrupted`. The reason text is "host exit or restart",
which is correct. The kind label disagrees with the model and with the transcript ("Interrupted").
Fix: in `kindOf`, map `host-shutdown`/`workspace-close` to `interrupted` before the status
short-circuit. Alternatively, mark them `ended` in `dispose`.

### m2. `completed` can label a stop in the middle of a turn (unconfirmed)
`session-child-outcome.ts:98`: `user-stop`/`parent-stop` plus `lastCompletion.delivered` gives
`completed`. That flag belongs to an older turn. A user who stops turn 2 while it runs, after turn 1
was delivered, sees `Completed`. Fix: also require that the child was idle at the end. For example,
record `endCause` only when phase is not `generating`, or pass `wasWorking` to the mapper.

### m3. A failed first turn reports 1 settled turn
`failFirstTurn` (`:1452-1470`) calls `settle`, and `settle` increments `turnsSettled`. Snapshots of a
child that never ran show `turnsSettled: 1`. The kind is correctly `failed`. Only the counter
misleads. Fix: push the completion without the increment, or document it in the status text.

### m4. The lineage error tells the user to retry, but a retry cannot succeed on a tab id
`chat-session.service.ts:558` says "Retry after its first turn settles". Metadata rows use the SDK id
as the key. When the source id is still the parent tab id (the case that fix A(b) cannot resolve),
no row ever appears under that id, so a retry fails again. Fix: name the id kind in the message, or
say "start the child again after the parent session has an SDK id".

### m5. A parent cannot stop a pending (`starting`) child
`stop` uses `resolveOwned` only (`:976`). A pending id gives `unknown-child`, but `status` lists the
same id (`ownedPending`). A start that hangs in the worktree step cannot be cancelled. Fix: refuse
with a clear `starting` reason, or support cancel through an abort flag on the pending record.

### m6. The watchdog never fails a child that is held on a permission prompt (by design, note)
`firstTurnVerdict` returns `started` when `awaitingPermission` is set, and nothing re-arms the timer.
A child whose permission is denied and that then goes idle with 0 turns stays `idle` with no signal.
This is low risk. Fix: re-arm instead of `started` when the only reason is the permission prompt.

---

## Checked with no defect
- A: the spawner successor uses `parentSdkSessionId ?? sdkIdOf(parentSessionId)` (`succeedChild`
  ~`:2150`) and `descriptorOf`. The adapter resolves `lifecycle.find(tabId)?.realSessionId` for both
  start and handoff. Specs: succession after parent reparent, and 3 adapter cases.
- B: `stop` uses `resolveOwned(..., false)`. It refuses `handed-off` without `followHandoff` and
  names the latest successor. A follow sets `requestedSessionId`/`followed`. The `endCause`
  `parent-stop` is recorded. Spec at `session-spawner.service.spec.ts:1540`.
- Pending vs concurrent start: `guardStart` and `addPending` run in the same synchronous tick (no
  `await` before `addPending` in `provisionAndStart`). `registry.add` deletes the pending entry, so
  `status` never lists one child twice. Pending records do not count toward the cap, and the
  reservation does.
- Watchdog timers: `clearTimers` clears `firstTurnTimer`. Stop, end, dispose and release clear it.
  The watchdog and the grace path are idempotent through `terminalStatus`/`runtime` checks.
- A session end with 0 turns and no SDK id routes to `failFirstTurn`, never to `succeedChild`. A
  deliberate stop stays a stop.
- Zod: `followHandoff`, `includeFinished` and `sessionIds` (1..50, strict) are validated. No new
  `any` or `as unknown as` in the production diff. No `vscode`/`electron` imports were added. The
  spawner logs through the injected logger.
- `clearFinished` ownership: it matches the tab id or the SDK id, and it skips foreign, unknown and
  live children. It never touches a worktree, a branch or a transcript.

## Decisions
- I used `git diff HEAD` instead of `git diff main`, because `main` moved and `git diff main` shows
  269 unrelated files. Evidence: `git diff main --stat`. This is reversible.
- I ranked M3 as Major and not Blocker, because a retry only follows a client timeout. The failure
  path is silent, but it is not common.
