# Phase A fix re-review (commit e8b9321e6)

Static review only. I read the diff and the surrounding hunks and ran no checks. I did not re-read the per-finding spec bodies.

**Verdict: REVISE.** The fixes are mostly sound. One fix interaction is Serious: UI "missing tab ⇒ closed:true" combined with the backend "first true wins" rule (N1).

## Per-finding table

| Finding | Fixed? | Note |
| --- | --- | --- |
| UI 1: null SDK id matched any tab | Yes | The closer and `closeHandoffPredecessor` now require an unbound tab for null. See N2 for the permanent-false side effect. |
| UI 2: processingRequests stuck | Yes | Cleared in `finally`. The inner try/catch also covers lookup and close throws. |
| UI 3: RPC failure result | Yes | `RpcResult.success` is checked and logged. One attempt per requestId is kept, and the backend 30 s timeout covers a lost reply. |
| UI 4: invalid payload while in flight | Yes | Ignored when the requestId is in `processingRequests`. An invalid payload with an already answered id still hits `replyOnce`, which dedups. |
| UI 5: dispatch throw | Yes | The handler catches the injector/dispatch throw. The async rejection is handled inside `closePredecessor`. |
| UI 6: closeTab caller contract | Yes | Documented. The only caller is the blocker-checking service. |
| UI 7 | Kept, as intended | Decision 16. |
| BE 1: concurrent acks hang | Yes | The lock is keyed on `predecessorTabId` from the record, so aliases coalesce. The stop is bounded by `withDeadline` (30 s), and `stopWaiters` is deleted on timeout. The "stop already pending" retry is effectively unreachable and harmless. See N3. |
| BE 2: retry loop after lost persist | Partly | The backend side is right: a retry skips the stop, calls close, and gets true from a missing tab. The UI true for a missing tab is unsafe, so see N1. |
| BE 3: successor id race | Yes | The id is read after the realpath. `committed=true` is set before the reconcile, and `onSessionIdResolved` then writes late ids. See N4 for the stale-state CAS. |
| BE 4: save failure reports a failed start | Yes | The failure is logged and the success result is kept. `pending.committed=true` is still set, so the chain commits. The ack flow is lost silently apart from the log, which is acceptable. |
| BE 5: multi-window first reply wins | Mitigated, with a regression | A false reply no longer resolves the close, but a missing-tab true from a non-owning window does. See N1. |
| BE 6: corrupt state | Yes, with a caveat | `safeParse` returns `[]` and logs. Pruning keeps the newest 200 `closeCompleted` records, and the filter logic is correct. See N5. |
| BE 7: closePending CAS ignored | Yes | A failed CAS reloads the record, and a missing record gives refused. |
| BE 8: no closer retries forever | Yes | The closer check now runs before the closePending write, and the result is refused. |
| BE 9: broadcast throw leaks | Yes | The timer is cleared in the pending callback and `unref`'d. Synchronous and async failures both call `finish(false)`. |
| BE 10: deleted HANDOFF.md | Yes | The realpath falls back to `resolve(path)`. This does not weaken the check: it is still compared to the recorded canonical path, and the caller must still be the recorded successor. A symlinked path with a deleted file still refuses, which is safe. |
| BE 11: tool catch logging | Deferred (Minor) | Accepted. |

## New findings

### N1 (Serious): a non-owning or not-yet-restored renderer can falsely complete the close
- Location: `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts:~46-48` (`if (!lookup) closed = true`), with `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts:46-49` (`complete(true)` resolves immediately).
- The close request is broadcast to every renderer. Any renderer without the tab replies `closed:true`. That covers a second Electron window, and also a renderer that has not yet restored its tabs after a reload.
- The backend resolves on the first true and persists `closeCompleted`.
- The owning window can still be blocked (dirty input, streaming, a permission prompt) and replies false later, which is ignored. The predecessor stays open while the record says it is closed. After a reload the tab can also reappear.
- Fix: stop equating "absent here" with "closed". Reply with a tri-state (`closed`, `absent`, `kept`) and have the backend treat `absent` like false, leaving it to the timeout. Alternatively, have the backend send true only when the record state shows the close was already attempted (`closePending` with `stopped` set), and add a `closeAttempted` marker for the lost-persist retry. A narrower fix is for the UI to reply true for a missing tab only after the tab store reports it has loaded and the request carries a `retry` flag.

### N2 (Minor): a null predecessorSdkId never converges
- Location: `auto-handoff-source-closer.service.ts` null branch, and the recorded `predecessorSdkId` in `session-handoff.service.ts:386`.
- The record stores null when the caller's SDK id was unresolved at handoff time. If the tab binds the id afterwards, every retry replies false forever, so the predecessor never closes. This is safe because it never closes the wrong tab, but the handoff never completes.
- Fix: the backend can re-read `record.predecessorSdkId` from the lifecycle at ack time, before calling `closer.close`.

### N3 (Minor): a joiner on the per-predecessor lock gets another caller's result
- Location: `session-handoff.service.ts:~220-224`, where the lock lookup precedes the caller check in `acknowledgeRecord`.
- A request from an unauthorized caller that arrives mid-flight is returned the in-flight attempt's result (`closed`) instead of `refused`. The impact is limited to leaking the result status.
- Fix: do the caller check before joining, or re-validate the caller after the shared promise settles.

### N4 (Minor): CAS with a stale state drops the late successor SDK id
- Location: `session-handoff.service.ts:406` and `:760`, which call `compareAndSet(..., record.state, {successorSdkId})`.
- If the state moves (`recorded` to `closePending`) between the read and the CAS, the CAS returns false, unchecked. The record then keeps the old `successorSdkId`, and an ack by SDK id is refused. The ack by tab id still works.
- Fix: retry the CAS once after reloading the record, or have the store patch the successor id without a state guard.

### N5 (Moderate): a corrupt or partially invalid document wipes all records on the next write
- Location: `session-handoff-ack.store.ts` `read` (`safeParse` fail returns `[]`), and `record`/`compareAndSet` write `prune(records)`.
- A single bad record, or a future `schemaVersion` after a downgrade, discards every valid `closePending` record. Logging happens only on a read and repeats on every read. After recovery, in-flight handoffs report "record missing" (refused).
- Fix: parse the records individually, keep the valid ones and drop only the bad ones. Alternatively, back up the raw document under a second key before overwriting.

### N6 (Minor): worst-case ack latency is about 60 s
- Location: `session-handoff.service.ts:259` (30 s stop deadline) followed by `session-handoff-closer.ts:16` (30 s closer timeout). A false reply waits for the full timeout (`complete(false)` returns without resolving). The MCP tool call can be held about 60 s. This is acceptable, but the tool-call timeout should be at least 70 s.
