# Batch 3 report (TASK_2026_932 E / E2)

## Status
All five items are done. `npm run verify -- -p cli-agent-runtime` passed (exit code 0).

## Files changed
All files are in `libs/backend/cli-agent-runtime/src/lib/session-children/`.
- `session-child-first-turn.watchdog.ts` (new): pure helpers. `SESSION_CHILD_FIRST_TURN_TIMEOUT_MS = 120_000`,
  `SESSION_CHILD_FIRST_TURN_FAILURE`, `firstTurnNotStarted`, `firstTurnVerdict` (`started|fail|rearm|give-up`),
  `firstTurnFailureText` (evidence text). Nothing new is exported from `index.ts`.
- `session-spawner.service.ts`: items 1-4 (details below).
- `session-child.registry.ts`: a separate `pending` map with `addPending`, `removePending` and `pendingOf`.
  `add()` deletes the pending entry with the same id. `childrenOf` now uses a shared `filterByParent` helper.
- `session-spawner.port.ts`: optional `alreadyExists?: true` on the `ok: true` variant of `SessionChildStartResult`.
- `session-child-outcome.ts`: no change. The `first-turn-not-started` cause and its words were already there.
- Specs: `session-spawner.start-guard.spec.ts` (new), `session-child.registry.spec.ts`,
  `session-spawner.service.spec.ts` (new harness helper `markRan`), `session-spawner.succession.spec.ts`.

## What each item does
1. **Failed start on session end.** `onGraceExpired`: if the end cause routes to `succeed` and the child
   has 0 settled turns and no SDK id, `failFirstTurn` runs. It does not run a succession. `failFirstTurn` sets
   `stopping` and pushes a `failed` settle (completion) to the parent. It calls `markEnded('failed', reason, _, 'first-turn-not-started')`,
   releases the resources and interrupts the session in the background. The reason is
   `first turn did not start (session ended: <cause>): turn phase …, lifecycle record present: yes|no, SDK session id absent; worktree kept in <path>`.
   The outcome reason is `first turn did not start` (from the existing `CAUSE_WORDS`).
2. **First-turn watchdog.** `armFirstTurnWatchdog` runs after `armRuntimeCap` on a successful start. It uses
   `armTimer` (unref'd `setTimeout`), the same pattern as the runtime cap. It writes `runtime.firstTurnTimer`, and
   `clearTimers` clears that timer, so stop, end, dispose, failStart and releaseResources all clear it.
   - When the timer fires, it does nothing if the child has an SDK id, has settled turns or awaits permission.
   - If the child is `generating`, the watchdog re-arms one time (`firstTurnRearmed`).
   - Otherwise it calls `failFirstTurn` with the evidence `no first turn after 120s`.
3. **Early `starting` record.** `provisionAndStart` allocates `SessionId.create()` as its first line.
   - After the cheap argument checks, it calls `registry.addPending(pendingRecordOf(...))`. The record holds the caller,
     the parent SDK id, the label, the branch, the planned worktree path, the task folder, the deliverables and `startedAt`.
   - These steps occur before the model route and `provisioner.create`. They are in the new method `routeAndStart`.
   - A `finally` removes the pending entry. A successful `registry.add` already replaced it.
   - `status()` lists `childrenOf + pendingOf`. `status({childSessionId})` also finds an owned pending start through `ownedPending`.
     A pending record reads as status `starting`, because it has no phase.
4. **Implicit idempotency.** `guardStart(request)` calls `existingStart` after the MCP check and before `reserveSlot`.
   If the caller (tab id or SDK id) has a pending or live non-terminal child with the same trimmed branch, the guard
   returns `{ ok: true, child: snapshot, alreadyExists: true }`. In that case there is no reservation and no `provisioner.create` call.
   `start()` returns that result directly (`!('reservation' in guard)`). The pending record is registered in the same
   synchronous tick as the guard, so two concurrent starts also find each other.

## Tests added
`session-spawner.start-guard.spec.ts`:
- `fails a child that ends with 0 turns and no SDK id (provider-error|stream-exit|unknown) and never starts a successor`
- `still routes a child that ran a turn to an automatic successor`
- `fails a child with no SDK id, no turn and no running turn after the timeout` (fake timers: 119 999 ms is live, 120 000 ms is failed)
- `records the lifecycle record and phase as evidence`
- `leaves a child alone once its SDK id is bound`
- `leaves a child alone while it awaits permission`
- `re-arms once while the child generates, then fails it when it stops`
- `re-arms only one time and leaves a child that still generates running`
- `clears the watchdog when the parent stops the child`
- `clears the watchdog on dispose`
- `lists the start with its id as starting while the worktree is created`
- `removes the starting record when the worktree is refused`
- `removes the starting record when the host start fails`
- `registers no starting record for invalid arguments`
- `returns the pending child for a second start on the same branch`
- `returns the live child for a second start on the same branch`
- `starts a new child on another branch`
- `starts again on the same branch after the child ended`

`session-child.registry.spec.ts` (`pending starts (TASK_2026_932 E2)`):
- `lists a pending start by parent without counting it or exposing it to get`
- `replaces the pending start when the full record is added`
- `removes a pending start and refuses a duplicate id`

Existing tests that I changed: these tests model a child that ran, so they now call `h.markRan(childId)`, which binds a fresh SDK id.
- Every succession test except `adopts running lanes before starting the successor`. That test generates, so the watchdog leaves it alone.
- `never stops children when the parent ends`.

## Verification
- Scoped run `npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns="session-spawner|session-child.registry"`:
  5 suites and 371 tests. The second-to-last run had 370 passed and 1 failed. I fixed that test (see above) before the final run.
- Final run `npm run verify -- -p cli-agent-runtime`: exit code 0. Lint and typecheck: "2 tasks: 2 succeeded". Test: "1 task: 1 succeeded".
  The run covered one project, cli-agent-runtime. This verify output style does not print a "for N projects" line,
  but every phase names only `cli-agent-runtime`. I did not capture the final per-test counts, because the Nx log lookup was too slow.
- The test run printed "A worker process has failed to exit gracefully". The same warning comes from the existing
  harness pattern (spec files that import `session-spawner.service.spec`). It did not cause a failure.

## Decisions
- **A deliberate stop is not a failed start.** Item 1 applies only to end causes that `routeSessionEndCause` sends to `succeed`
  (provider-error, stream-exit, config-reinit, compaction-abort, unknown). A `user-stop`, `parent-stop`, `workspace-close`
  or `host-shutdown` end of a child that never ran stays an `ended` stop. Options: (a) fail on every end, (b) fail only on non-deliberate ends.
  I chose (b). With (a), a user who closes the tab would see "failed: first turn did not start", and existing stop semantics would break.
  This is reversible with a single condition in `onGraceExpired`.
- **The failure push uses `settle(..., 'failed', reason)`**, the same pattern as `runtimeSafetyNet`. Because of this, the turn counter
  goes to 1 and `lastRecap` holds the evidence text. Reversible.
- **The watchdog gives up after the re-arm.** When the child still generates after the one re-arm, the watchdog logs `left running` and does not fail
  the child. A running turn is evidence that the start worked. Reversible in `firstTurnVerdict`.
- **The session-end path keeps the 30 s grace.** The failed-start check runs when the grace expires, after the `activeIdOf` live-again check.
- **Pending records are in a separate map**, not in `records`. Because of this, the cap (`liveCount` plus reservations), `get`, events and handoff
  never see a child that has no worktree. Only `status` and the idempotency check read the pending records.
- **Successor children do not arm the watchdog.** Only `provisionAndStart` arms it.

## Not done / follow-up (outside this batch's file list)
- The MCP reply text in `vscode-lm-tools` `session-tool-handlers.ts` does not yet render `alreadyExists`. The parent gets the child snapshot,
  but no "already exists" sentence.
- The `session_start` tool description ("on a timeout call `ptah_session_status` first") is not changed (E2 c).
- The status text `starting (first turn not started)` for an `idle` child with 0 turns (E item 3) is not done. It is not in this batch's list.
