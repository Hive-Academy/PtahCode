# Phase A backend review: predecessor close (static)

**Verdict: REVISE**

Scope: the seven named backend files. I read `acknowledge`/`acknowledgeOnce` (service lines 207-261), the record step (330-385) and `onSessionIdResolved` (715-745). I did not run anything or trace where the stop is armed. I also did not check that `SessionHandoffCloser` is registered as a singleton shared by the RPC handler and the runtime token.

What holds up:
- The caller id comes from the transport and is placed last in the spread (`session-namespace.builder.ts` acknowledge arm), so the agent cannot spoof it.
- The caller must equal the recorded successor, and the realpath of `handoffPath` must equal the recorded path.
- State transitions go through compareAndSet, and storage access is serialized.
- The `closeCompleted` fast path is idempotent.

## Findings

1. **Serious. `session-handoff.service.ts:207-213` (and 241-250).** The dedup key is `predecessor + caller + handoffPath`, not the predecessor alone.
   - **Scenario:**
     - Two concurrent acks with a different caller form (successor tab id vs SDK id) or a differently spelled path have different keys, so two `acknowledgeOnce` runs happen.
     - `stopWaiters.set(predecessorTabId, …)` is overwritten, so the first waiter never resolves.
     - `await stop` at line 246 then hangs with no timeout, and its `ackAttempts` entry never clears.
     - Later acks with the same key return that hung promise forever.
     - Two concurrent runs can also both call `closer.close`, which broadcasts twice.
   - **Fix:**
     - Key `ackAttempts` on the record's `predecessorTabId`, after the record lookup, or take a per-predecessor lock.
     - Put a timeout on `await stop` and delete the waiter on timeout.

2. **Serious. `session-handoff.service.ts:252-256` with `session-handoff-closer.ts:21`.** A retry after the close succeeded but the `closeCompleted` persist failed can never complete.
   - **Scenario:** `closer.close` returns `true` and the tab is gone, then `compareAndSet(closeCompleted)` throws.
     - The retry skips the stop (`stopped` is already set) and calls `close` again.
     - The UI's `closePredecessor` finds no tab and replies `false`.
     - The service returns `retryable-failure` forever, stuck in `closePending`.
   - **Fix:** Treat a missing tab as already closed. For example, have the UI or the closer distinguish "tab not found" from "refused/busy" and map it to success. Alternatively, record the close result as `closeCompleted` as soon as `close` returns `true`, and make the persist retryable on its own.

3. **Serious. `session-handoff.service.ts:367-379`, `session-handoff.service.ts:371` and `session-handoff.service.ts:728-731`.** There is a race that records `successorSdkId: null` permanently.
   - **Scenario:**
     - `successorSdkId` is read from `pending` before `await fs.realpath(...)` in the object literal.
     - If the SDK id resolves during that await, `onSessionIdResolved` sees `committed === false`, so it only sets `pending.resolvedSdkId` and does not touch the store.
     - The record keeps `successorSdkId: null` forever.
     - An ack whose transport caller is the SDK id (`/session/{id}`) is then refused with "caller is not the recorded successor". The predecessor never closes.
   - **Fix:**
     - Compute `realpath` before the `record(...)` call, and read `resolvedSdkId` again at write time.
     - After the record is committed, if `pending.resolvedSdkId` is set, call `compareAndSet` with it, as the post-commit branch does.

4. **Moderate. `session-handoff.service.ts:376-379`.** If the record cannot be saved after a successful start, the service returns `session-start-failed`.
   - **Scenario:** The successor session is already open and its work has been kept (`settleAdoption(...'kept')`). The caller is told the start failed.
     - The caller may retry and open a duplicate successor.
     - The pending chain is never committed.
     - No ack is possible, because there is no record.
   - **Fix:** Either persist the record before starting (the successor tab id is known), or treat this as success-without-close with an explicit refusal detail. Do not report a failure that did not happen.

5. **Moderate. `session-handoff-closer.ts:21-35` and `session-handoff-closer.ts:38-47`.** Multiple renderer windows and late replies.
   - **Scenario:** A broadcast reaches every window. The first reply wins, so a window that does not own the tab replies `false` and resolves the request as `false`. The owning window's later `true` is dropped as stale, with only a warning. The tab stays open and the service returns `retryable-failure`, which is a false negative.
   - **Fix:** Only count a `false` from a window that has the tab. For example, the UI could not reply when it has no match, or the closer could wait for a `true` or for all windows. Also make `complete` verify the reply came from a known window if the transport exposes the sender.

6. **Moderate. `session-handoff-ack.store.ts:40`.** Corrupt state is fatal and records grow without bound.
   - **Scenario:** `DocumentSchema.parse(raw)` throws on any malformed or older document. Every `find*` and `record` call then throws.
     - Every ack becomes `retryable-failure`.
     - New handoffs fail at the record step.
     - Records are never pruned, so `closeCompleted` entries accumulate in workspace state.
   - **Fix:**
     - Treat an invalid document as recoverable. Log it and start from an empty list, or quarantine the old one.
     - Prune `closeCompleted` records beyond a bound or age.

7. **Moderate. `session-handoff.service.ts:241-250`.** The `closePending` write result is ignored, and the ordering is only partly enforced.
   - **Scenario:** `compareAndSet(recorded→closePending)` returns `false` when a concurrent ack already advanced the state. That is harmless here. But a `false` caused by a vanished record is also ignored, and the flow continues to stop and close.
   - **Fix:** Reload or check the result, and refuse when the record is missing.

8. **Minor. `session-handoff.service.ts:237-239`.** An unregistered `HANDOFF_PREDECESSOR_CLOSER` returns `retryable-failure` after the state is already `closePending`. The caller retries forever in hosts that never register it, such as the CLI or TUI.
   - **Fix:** Return `refused` with a clear reason, or register a no-op closer in those hosts.

9. **Minor. `session-handoff-closer.ts:23-35`.**
   - **Scenario:**
     - A synchronous throw from `broadcastMessage` inside the executor rejects the promise but leaves the timer and `pending` entry until the timeout.
     - With no webview attached, the broadcast resolves and the caller waits the full 30 s.
     - The timer is not `unref`'d.
   - **Fix:** Use try/catch around the broadcast and call `complete(requestId, false)`. Call `unref` on the timer.

10. **Minor. `session-handoff.service.ts:228-232`.** If the successor deletes or moves `HANDOFF.md` before the ack, `fs.realpath` fails and the ack is `refused: handoff file missing`, which is permanent. The predecessor never closes.
    - **Fix:** Consider matching on the recorded path string when the file is gone, or return a retryable result.

11. **Minor. `session-handoff-ack.tool.ts:26-28`.** The catch drops the error with no log, and the audit comment is present. Log the error kind so persistent failures can be diagnosed.

## When does the backend send `predecessorSdkId = null`?

The schema allows `predecessorSdkId` null, and `record.predecessorSdkId` comes from `record.realSessionId` (`session-handoff.service.ts:369`). I did not trace where `realSessionId` can be absent. If it can be null or undefined, the service sends null to the closer. If it is `undefined`, `RecordSchema.nullable()` rejects it and the record save fails (finding 4).

Sending null is **not safe** with the current UI. The UI closer treats null as "match any session" (`auto-handoff-source-closer.service.ts:45`, `tab-manager.service.ts:1637`), so a tab rebound to a different session could be closed by id alone. The fix belongs in the UI (see the UI review, finding 1). The backend should also avoid recording a null SDK id where it can instead wait for the session id to resolve.

## Not checked (outside the file list)

- Spec coverage for the paths above.
- Where the stop is armed. This review did not verify "never at handoff time".
- DI registration of `SessionHandoffCloser` and its token.
