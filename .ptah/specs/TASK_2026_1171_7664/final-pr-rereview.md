# Final re-review — commit 555efd364 (TASK_2026_1171_7664)

**Verdict: APPROVED.** Score 8/10. Blocking 0, Serious 0.

Scope: `git show 555efd364` only, plus the callers of `store.cancel`. I ran no checks.
The lane reports passing focused Jest, `tsc` and `eslint` runs (`lane-F2-fix-report.md`).
The coordinator gate is still required before the push.

## Status table

| Item | State | Evidence |
| --- | --- | --- |
| S-NEW-1 state guard | Fixed | `lane-completion-notifier.service.ts:557` and `:594` cancel only when `find(key)?.state` is not `delivered` or `cancelled`. |
| S-NEW-1 callback cleared | Fixed | `lane-completion-notifier.service.ts:586` calls `clearPendingCompletionRead(key)` when the result is `delivered`. `completion-read-ack.ts:54-56` adds the function. The second registration occurs only on `!delivered`, so the clear cannot remove it. |
| S-NEW-1 store no-op | Fixed | `parent-envelope-store.service.ts:300` returns the existing entry for `delivered` / `cancelled`. Callers: the notifier, the drainer (`parent-delivery-drainer.service.ts:118`) and the RPC `agent:cancelParentDelivery` (`agent-message-rpc.handlers.ts:124-128`). All get the unchanged entry. None needs a delivered entry to become cancelled. |
| A2 consumed-key failure | Fixed | `parent-envelope-store.service.ts:381-388` logs and returns before `removeCompletionOutboxLocked`, so the outbox entry stays until the key is durable. No loop retries the write. A retry occurs only on a later read, replay or backfill. The dedupe marker is not lost: the outbox entry stays, and `backfillCompletionKeys` writes the key from the index entry later. `settleSatisfied` uses the best-effort `consumeAcknowledged` (`lane-completion-notifier.service.ts:859`), so restore and durability replays no longer throw. |
| m1 per-entry wait ack | Fixed | `protocol-dispatcher.ts:1730-1741` puts the `try` inside the loop. |
| m2 report wording | Fixed | `lane-completion-notifier.service.ts:1236` now says "N report attempts failed". |
| m3 JSDoc / indent | Fixed | `ptah-api-builder.service.ts:1198-1206` moves the method above the JSDoc. `:1084-1087` has the correct indentation. |
| m4 attempt expiry | Fixed | `mcp-attachment-observer.ts:39-48` expires each map separately, then returns the authenticated attempt first. The m4 residual (a local caller can overwrite a rejected reason when no authenticated attempt exists) is still present by design and has low impact. |
| m5 double consume | Fixed | `lane-completion-notifier.service.ts:555-561`: the early-read callback no longer consumes. The post-checkpoint skip path (`:567-570`) consumes once. |

## Traced races

- **Read before checkpoint:** the callback finds no envelope, the checkpoint writes the outbox entry, and the skip path consumes it and removes the entry. Correct.
- **Read after enqueue, before settle:** callback 1 cancels the pending envelope. `settleEnqueue` then cancels again, which is now a no-op, and returns `already-signalled`. The outbox entry stays until `backfillCompletionKeys` runs. This is the behavior from before round 2 and is not a defect.
- **Read after delivered push:** callback 1 is cleared. If a read runs before the clear, the state guard prevents the cancel. Correct.

## Remaining minor items (not blocking)

- `parent-envelope-store.service.ts:381-388`: during a shard outage, a host restart before backfill loses the in-memory acknowledgment. Replay can then push a notice the parent already read. This is a degraded case only, with no data loss. A durable retry is a possible later change.
- `parent-envelope-store.service.ts:377`: `readCompletionKeysLocked` can still throw on an unreadable shard. All callers catch it (`consumeAcknowledged`, and the second callback rethrows into a logged and kept retry). No crash path remains.
- `parent-delivery-drainer.service.ts:118-120` emits an update event for the unchanged entry. This is harmless.
- `protocol-dispatcher.ts:1737` has an extra indentation level (style only).

## Decisions

- APPROVED with the minor items above. Options: APPROVED, REVISE. Evidence: every item in
  the table is fixed at the cited lines, and no new Blocking or Serious defect exists.
  Reversible.
