# Code Logic Review (handoff notes) — TASK_2026_2311_3920

Status: the budget monitor paused my tools before I could write `.ptah/specs/TASK_2026_2311_3920/code-logic-review.md`.
This file holds the review so far. The coordinator should copy it to that path. I did NOT read
`parent-envelope-store.service.ts` `getBody` / `moveParentShardLocked`, and ran no spec.

Provisional verdict: NEEDS_REVISION, score 6/10. 0 blocking, 3 serious, 6 moderate/minor.
Confidence: MEDIUM (static read; no spec run).

## Serious

### S1. Hot retry loop when `rerouteReport` returns `undefined` for a row with a past `nextRetryAt`
- Files: parent-delivery-drainer.service.ts `rerouteSessionReport` (about line 483-500), `scheduleNext` (about line 617-632); parent-envelope-store.service.ts `rerouteReport` (line 437-452).
- `rerouteReport` returns `undefined` when the target parent is frozen (session deleted/tombstoned), or the row is no longer pending/blocked-retryable.
- The drainer does `if (!next) return;` with no hold: it sets no `retryNotBefore` floor and no deferral.
- Claimed path: `releaseClaim(id, 'owner-rerouted', 0)` first writes `blocked-retryable` with `nextRetryAt = now` and calls `schedule(0)`. If the reroute then returns `undefined`, the row keeps a past `nextRetryAt`.
- `scheduleNext` counts any pending/blocked-retryable row that has `nextRetryAt` as due, so it arms `schedule(0)` again. Every `retryTick` drains the parent, reads the handoff lineage (`handoffAcks.records()`), re-detects `{reroute}`, fails the reroute again and re-arms. This is an unbounded zero-delay loop with file reads each pass.
- The unclaimed path has the same effect for any `blocked-retryable` row whose `nextRetryAt` has passed.
- Fix: when `rerouteReport` returns `undefined`, call `holdAfterWriteFailure(envelope.id)` or `markDeferred` with a reason such as `owner-reroute-blocked`. Better, return a refusal reason from the store so the drainer can cancel or defer it on purpose.

### S2. Fail-open of the paused notes gate when the hook/permission session id differs from the monitor's session key
- Files: subagent-budget-monitor.ts `findGateKey` (line ~838-846), `checkNotesTool` (line ~797-813); sdk-permission-handler.ts `budgetToolDenial` (line 212-225); sdk-query-options-builder.ts (line ~1485-1490) and sdk-permission-handler.ts line 657-660 (`resolveSessionId` falls back to the tab-derived `sessionId`).
- Before: gate lookups were by agent id only. After: a lookup with a session id that is not the monitor's key (before `realSessionId` is set, or any id mismatch that `currentSessionId` aliases do not cover) returns `undefined`, so a paused agent is not denied (`return undefined` means allow).
- The same applies to `paused()` in the hooks catch path (subagent-budget-hooks.ts line 48, 107): `hasNotesGate(agentId, sessionId)` is false, so a hook failure that should fail closed fails open.
- Without a session id, the unique-match fallback returns no gate when two sessions hold a gate for the same agent id. That is fail-open on the safety enforcement (denial of work tools after the 2x ceiling).
- Fix: when the scoped lookup misses and the agent id names exactly one gate, fall back to that gate, as the no-session path does. Or fail closed when a scoped miss coincides with a gate of the same agent id in an unknown session. Add a test for a hook session id that differs from the monitor key.

### S3. Owner fence uses `ownersBefore` taken after `markSending` and `getBody`
- File: parent-delivery-drainer.service.ts (line ~322-338).
- The signature is read after two awaits (claim write and body read), so a reparent during the claim write is not seen by the "after" comparison. The `sessionOwner(sending)` check right after covers `changed` and `reroute`, but only through `recorded.includes(parentSessionId)`.
- Narrow window: the owners signature can change between `sessionOwner` and the dispatch mark while still containing the recipient id (for example `parentSdkSessionId` added); that case is benign. A swap of `parentSessionId` to a successor, with the old id kept as the SDK alias, passes `matches` both times and the report goes to the old recipient. This is the one gap the fence cannot see.
- Fix: capture the signature before `markSending` (right after the first `sessionOwner` of the unclaimed row), and compare it after the dispatch mark.
- Severity could be Moderate if the registry never keeps the old id as an alias after a reparent; I did not verify that.

## Moderate / minor

- M1 `rerouteReport` writes the new `parentSessionId` into the body record (`storage.update(bodyKey, ...)`) before `replaceLocked`. If `replaceLocked` then throws, the body and the record disagree and nothing repairs it (parent-envelope-store.service.ts line ~445-451). Order the writes the other way, or restore the body on failure.
- M2 After the new `dispatchStarted` field, `markOutcomeUnknown(sending.id, 'body-unavailable')` (drainer line ~316-320) still marks a never-dispatched claim as outcome-unknown, which then needs a user confirmation. Nothing was sent. Release it with `releaseClaim` instead.
- M3 Pre-dispatch restore (store line ~686-694) keeps `everDispatched: true`, which `toView` shows to the UI as a duplicate risk. Clear it, or add `everDispatched: false` in this branch.
- M4 `rerouteSessionReport` with `claimed=true` calls `releaseClaim(..., 0)` which does `schedule(0)`. The retry tick can win the race and re-claim the row before `rerouteReport` runs; the reroute then returns `undefined` and (see S1) nothing re-arms with a floor.
- M5 `toolUseOfTask` (subagent-budget-monitor.ts line ~1169-1177) drops a resumed `task_started` without a `tool_use_id` when two spawns share the task id. It logs at debug level only, so the generation bump, gate release and `startedTasks` update for the new run are skipped silently. Consider `warn`.
- M6 `releaseAdmission` (line ~859-867) finishes deliverables and warnings, and calls `dispatcher.withdrawSubagentNotice(agentId)`, even when the gate is absent (`owner === undefined`). `withdrawSubagentNotice` is keyed by agent id only, so it can withdraw a notice that belongs to the same agent id in another session. Guard with `owner !== undefined`.
- M7 `rekey` merge (monitor line ~1318-1346, `rekeyScopedMap`) keeps the `to` gate and drops the `from` gate independently of which `SubagentState` the merge kept. If the kept state's `invocationKey` (generation suffix) differs from the kept gate's owner, `finishWarnedInvocation` returns early on the owner check and the gate lives until session release.
- M8 `delivered-after-cancel` on a cancelled row: `recordDelivered` still invokes the `accepted` callback, which calls `markReportDelivered`. Intended, but note the completion key stays `cancelled` (writeCompletionKeyLocked), so the report is not "satisfied" for any consumer that treats `cancelled` as re-sendable. Reports use kind `report`, not `completion`, so I found no live path.
- Minor: a restart after a failed `releaseClaim` write with `dispatchStarted: true` on disk yields `outcome-unknown` for a row that was never sent (conservative, duplicate-safe, but needs user action).
- Minor: `SubagentDeliverables`/`SubagentNotesWarnings` entries for an agent that never entered a gate are only freed at session release (bounded: 50 paths per agent).

## Checked and sound

- Gate keys: `scopedAgentKey` separator `\0` cannot occur in session or agent ids; `rekeyScopedMap` and `release` use the same prefix test; the monitor rekey/release call the gate, deliverables and warnings consistently (monitor line 1311, 1378-1390).
- `releaseAdmission(sessionId, agentId, invocation)` computes `previousInvocation` before `generation++` (line ~1138-1142), so the old owner is released and the new invocation enters its own gate. The overdue timer and `finishWarnedInvocation` check the owner.
- `markDelivered` on a `cancelled` row leaves `state: 'cancelled'`, records `deliveredAt` once (idempotent), and does not re-finalize the completion key.
- Claim/dispatch mark: `markDispatching` applies only to the live `attemptId` in `sending`; restore releases `dispatchStarted === false`, keeps `outcome-unknown` for `true` and for legacy rows. `markBlocked` and `retry` clear the flag. No await sits between the post-mark claim/owner check and `adapter.sendMessageToSession`.
- Dedupe: v3 key drops the SDK alias; `storedSessionReceipt` checks v3 then v2. Enqueue and the id use v3 only.
- `task_started` forward (session-query-executor.service.ts line 311-320) passes `tool_use_id` through as optional; the monitor guards on `!sessionId || !taskId` and resolves only a unique match.

## Five logic questions (short)

1. Silent failure: S1 (loop with no user signal), M1 (body/record mismatch), M5 (dropped resumed start).
2. Unexpected user action: a user cancel during an in-flight send now stays cancelled while the message was delivered (visible only through `lastError: delivered-after-cancel`).
3. Wrong answer from input: a repeated report text under the v3 key returns the earlier receipt even when the owner is a successor in the same tab.
4. Dependency failure: a handoff-lineage read failure gives `lookup-failed` and holds correctly; a frozen reroute target gives S1.
5. Missing: no test for a hook session id that differs from the monitor key (S2); no test for `rerouteReport` returning `undefined` after `releaseClaim` (S1); child registry persistence is deliberately not built (documented in the plan).
