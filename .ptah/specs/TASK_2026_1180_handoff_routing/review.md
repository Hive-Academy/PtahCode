Head: 9fdb39af41ff4286be9e909a3d45e66677b3cbfa
Reviewer: antigravity

Paths are under `libs/backend/cli-agent-runtime/src/lib/`. Points 1-8 below were verified at 2c4b7e443; 9fdb39af4 touches only the ack store and its spec (see re-review), so those line numbers stand except ack.store `record()` (now :150-172). Review was read-only (diff + source reads, grep, `prettier --check`). I did not re-run the test suites; the coordinator's gate covered them.

## 1. Ownership goes backward only: PASS
- `session-children/session-handoff.service.ts:888-895`: `adoptWork` reparents every child from `fromIds` to the successor tab. The old `if (child.terminalStatus && !child.heldCompletion) continue;` was removed, so terminal children move too.
- `session-children/bind-adopted-child-owner.ts:4-11`: reparents the children of the successor tab with the successor SDK ID.
- It is called at `session-handoff.service.ts:707` (kept start) and `:1145` (SDK ID resolves later, only when `pending.committed`).
- Nothing grants the predecessor any child. `resolvedSuccessorIds` (`:153`) is only used for ack-caller matching (`:302-307`).

## 2. P's ID gets no authority over S's children: PASS
- `session-children/session-spawner.service.ts:2099-2103`: `ownerIds(caller)` uses only the caller's own lifecycle record (`tabId`, `realSessionId`) plus `sdkIdOf(caller)`.
- It is used at `:1071`, `:1288-1289`, `:1383`, `:1948` and `:1970`.
- `git grep` for `callerSuccessors|recordCallerSuccessor|resolveCaller\b` finds only the unrelated `resolveCallerWorkspaceRoot`.

## 3. Delivery goes forward only: PASS
- `session-children/session-handoff-lineage.ts:20-30`:
  - Only committed records count (`committed()` at `:6-8` excludes `'starting'`).
  - The walk matches either the predecessor tab ID or SDK ID.
  - There is a hop limit (`MAX_HOPS = 64`) and a cycle guard (`seen`).
- Restart survival: `deliveryTarget` (`:37-49`) reads the persisted `store.records()` (`session-handoff-ack.store.ts:137`).
- Fallback: a store read failure calls `onError` and returns the recorded target (`:45-47`). Both callers log through `logger.error`.
- Callers (delivery only):
  - `cli-agents/agent-report-router.service.ts:287-292`, used at `:358-359` and `:694`.
  - `cli-agents/lane-completion-notifier.service.ts:~405-411`, used at `:~486-488` and `:~1054`.
- Ownership paths (`ownerIds`, registry) never call it.

## 4. Provisional 'starting' record: PASS
- `session-handoff.service.ts:550-566`: the `'starting'` record is written (`ackStore.record`) after `adoptWork` and before `this.start` (`:569`).
- `:300-301`: an early ack on a `'starting'` record returns `retry(...)`, which is `retryable-failure`.
- Kept start: `:727-732` calls `compareAndSet(tabId, 'starting', {state:'recorded', successorSdkId})`.
- Late completion: `:1227-1233` also uses `compareAndSet`, with `keepPredecessor` carried through the widened patch type (`ack.store:175`).
- Failed start: `discardStartingRecord` at `:607`, `:685` and `:698` calls `ackStore.discardStarting` (`ack.store:141-148`). It filters only `'starting'` entries and never throws (`:1192-1198`).
- Reading this carefully, I found `record()` (`ack.store:150-170`) refuses to overwrite a non-`'recorded'` record, which includes a stale `'starting'` one. N1 is resolved in 9fdb39af4.

## 5. #1291 behaviour kept in the 4 conflicted files: PASS
- `git diff 2c4b7e443^2 2c4b7e443` shows only the PR's own changes in these files.
  - Router: the `-` lines are the old `candidates[0]` owner logic and the `ownerChanged` block, which was reshaped. The first-recorded-owner rule is kept via `candidates[0]` (`:694`).
  - Router spec: the removed lines are mock plumbing only.
  - Ack store: only the `state` enum and the `compareAndSet` patch type changed.
  - Handoff service: `recordSaved` moved earlier and `keepPredecessor` handling stays in `recordLateAck` (`:1219-1235`). The in-flight reservation, `ackAttempts` and timeout paths are untouched.
- `keepPredecessor` is kept: schema `ack.store:23`, patch type `:175`, `recordLateAck`.
- I found no dropped main-side logic. I did not re-execute the specs.

## 6. 'starting' vs 200-entry pruning: PASS
- `ack.store:190-197`: `prune` counts and trims only `closeCompleted` records. `'starting'` records are never counted and never pruned, so there is no conflict with the 200-entry cap.
- A leaked `'starting'` record is now replaceable (N1 resolved).

## 7. LaneCompletionNotifier factory passes the ack store: PASS
- `di/register.ts:~339-345`: the `instanceCachingFactory` now passes `SESSION_HANDOFF_ACK_STORE` as the trailing argument.
  - It uses `c.isRegistered(..., true) ? c.resolve(...) : null`.
  - It resolves lazily, so registration order is fine.
- The constructor parameter is `handoffs` (`lane-completion-notifier.service.ts:~398`).
- `di/register.ptah-cli-registry.smoke.spec.ts` ("gives the lane completion notifier the acknowledgement store...") asserts `Reflect.get(notifier,'handoffs')` is the same singleton as `container.resolve(SessionHandoffAckStore)`.

## 8. No weakened checks, no `any`, `@ts-ignore`, `as unknown as`, or console: PASS
- `git grep` for `console.`, `@ts-ignore` and `as unknown as` in the new production files found none. The only `as never` is in specs.
- Errors are logged (`reportError` / `logger.error`) rather than swallowed. `discardStartingRecord` logs.
- Ownership checks are not loosened:
  - The owner is still matched against the caller's own IDs.
  - The router's stale-owner snapshot check now runs unconditionally (`router:715-719`), which is stricter than before.
  - `binding.state !== 'starting'` is required for the SDK-ID fallback (`:703`).

## Re-review of 9fdb39af4
Diff vs 2c4b7e443 is two files: `session-children/session-handoff-ack.store.ts` (+6/-4) and `session-handoff-ack.store.spec.ts` (+18).

1. **N1 resolved: PASS.** `ack.store.ts:~155-165`: `replaceable = existing.state === 'recorded' || existing.state === 'starting'`; the record is replaced when `successorTabId` differs. A stale `'starting'` record left by a host stop no longer blocks a new handoff of the same predecessor, so its acks no longer stay retryable. The new spec ("replaces a starting record left by a stopped host, but not its own") covers a restarted store: same-successor retry throws 'already recorded', a new successor replaces it, `findBySuccessor('lost')` is gone, and the new record settles via `compareAndSet('before','starting',...)`.
2. **Cannot overwrite a live in-process 'starting' record: PASS.** In `session-handoff.service.ts`, `inFlight.get(key)` (`:534`) is checked and `inFlight.set(key, tabId)` (`:546`) follows with no `await` in between, so two concurrent handoffs of one predecessor cannot both pass; the second gets `already-handed-off`. `key` is the predecessor record's tab ID (`:525`), so tab-ID and SDK-ID callers share one reservation. The `'starting'` record is written only after the reservation (`:550-566`). After the #1291 start timeout (`:587-694`) the reservation and `'starting'` record deliberately stay until the attempt settles. `inFlight.delete` runs only after settlement (`:609`, `:618`, `:687`, `:700`, `:712`), and the reconcile timer (`:590-600`) does not release it. So a timed-out but still-live start is never overwritten. Only a record with no in-process reservation (a prior host run) can be replaced. Residual assumption: one process owns the store. Two hosts sharing one store could race, which is out of scope and unchanged in kind.
3. **Guards unchanged: PASS.** Same-successor still throws (`existing.successorTabId === value.successorTabId`). `closePending` and `closeCompleted` are not replaceable and still throw. The pre-existing spec assertion (`record({...old, successorTabId:'third'})` rejects after `closePending`) is still in place. `prune` is untouched.
4. **No regressions: PASS.** No other production files changed, so design points 1-8 from above are unaffected. I did not re-run tests; the coordinator's full gate passed on this head.

## Findings
- **N1 (RESOLVED)** stale `'starting'` record blocking later handoffs (`ack.store.ts:~155-165`).
- **N2 (non-blocking)** `cli-agents/lane-completion-notifier.service.ts:~1054`: the session-child completion path forwards by tab ID only, with no tab-to-SDK fallback like the router (`router:699-707`). It degrades to the existing `parent-session-not-active` refusal.
- **N3 (non-blocking)** `prettier --check` warns on the changed `.ts` files, possibly a repo-wide baseline. The coordinator reported lint passing.
- **N4 (non-blocking)** `session-handoff.service.ts:300-308`: the `compareAndSet` result is ignored when patching `successorSdkId`. The re-read falls back to the old record, which is safe.
- **N5 (non-blocking, informational)** `ack.store.ts:~158`: the replace-`'starting'` safety depends on the service's in-process reservation. Nothing in the store itself distinguishes a live `'starting'` from a stale one, so keep that comment accurate if the reservation logic changes.

No blocking findings.

Verdict: APPROVED
