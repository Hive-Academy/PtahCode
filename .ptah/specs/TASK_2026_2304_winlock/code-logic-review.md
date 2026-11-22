# Code Logic Review — `TASK_2026_2304_winlock`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | APPROVED (with follow-ups) |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 3              |
| Failure modes found | 4              |

Scope: whole of control-endpoint.ts, the acquire/bind/dispose paths of kernel-session-driver-lock.ts, both spec diffs. Static read only; nothing was run.

## Five logic questions

1. Silent failure: `dispose()` racing `acquire()` can leave a registered endpoint behind (S1). `closed` never rejects, so the new `closing` promise cannot turn a failure into a hang or poison later starts.
2. Unexpected user action: an operator `release` request in flight when the last lock disposes gets a dropped connection, not a response (M1).
3. Wrong answer from input: none found in the production change.
4. Dependency failure: `server.close()` on an already-closed or non-listening server calls the callback with an error; the code ignores the argument and resolves, so the promise settles in that case. With every accepted socket destroyed, the callback does fire. No deadlock path found.
5. Missing: no test covers unregister then register in one process, which is the very bug being fixed (M2).

## Failure modes

### Dispose during an in-progress first acquire leaks the endpoint (pre-existing, now more visible)
- Trigger: `acquire()` passes the `disposed` check (kernel-session-driver-lock.ts:79), `bind` awaits `controlPending` (:109-112), and `dispose()` runs meanwhile.
- Symptom: `dispose()` sees `this.control === undefined` (:312), skips `unregister`, and returns. `bind` then resumes: `register` adds the disposed lock as a source (control-endpoint.ts:75), the pipe stays bound, the 'exit' listener stays, and the key file stays. A later in-process lock reuses a stale endpoint with a dead source. On Windows it also blocks pipe-name reuse after dispose, the very thing this fix is about.
- Recommendation: re-check `this.disposed` after the await in `bind` and call `unregister(this)` if set. `dispose()` could also await `controlPending` before unregistering.

### Operator release dropped at shutdown
- Trigger: the last source calls `unregister`; `connections` holds a socket mid-`respond` (control-endpoint.ts:118, 142).
- Symptom: the operator CLI sees ECONNRESET or close, not `{ok:true,result}`. `socket.end` on a destroyed socket is harmless, so there is no crash. By the time dispose reaches `unregister` all entries are closed, so the dropped reply is an acceptable loss, but the client must treat a reset as "unavailable". I did not check the client for this.

### Multi-lock sharing
- With two locks on one endpoint, `unregister` of the first leaves `sources.size > 0` and returns `closing ?? Promise.resolve()` (:110). `closing` is normally undefined here, so it resolves immediately. No sockets are destroyed. Correct.
- A second `unregister` on an already-closed endpoint returns the current `closing`, which may belong to a different, newer endpoint. This is harmless.

### start while closing
- `await closing` (:82) happens before `writeControlKey`. `active` is cleared synchronously in `unregister` (:112), and `starting` dedupes concurrent registers. A new `closing` cannot appear while `start` waits, because no active endpoint exists to unregister. The `closing === current` guard (:120) is correct. The chain cannot be poisoned, because `closed` only ever resolves.
- Residual: `await closing` is unbounded. It relies on destroyed sockets reaching 'close'. A server handle that never closes would hang every later `acquire`, which returns "unavailable" only after retry logic, not on a timeout. Consider `Promise.race` with a timeout of about 2 s.

## Blocking issues
None.

## Serious issues

### S1: the dispose/acquire race above
- File: kernel-session-driver-lock.ts:109-114, 306-312
- Scenario: shutdown during the first acquire.
- Impact: leaked listener, key file and source; the pipe name stays bound on Windows.
- Fix: a post-await disposed check in `bind`.

## Moderate and minor issues

- M1: the in-flight reply is dropped on the last unregister (control-endpoint.ts:118). Documented in the comment; acceptable.
- M2: no regression test for register, unregister, register in one process on any platform. The existing specs only exercise the already-working Linux path, so the Windows fix is unguarded on CI. Suggest a spec that opens a client connection, disposes, and asserts a new `acquire` returns `ok`.
- M3: spec weakening. `reset.destroy()` (kernel-session-driver-lock.spec.ts:155) on a Unix socket or pipe sends a clean FIN, not an abort. The "resetting peer" no longer differs from a graceful close, so the test no longer proves that a reset during the holder-line write is survivable. Node's `resetAndDestroy` throws ERR_INVALID_HANDLE_TYPE for non-TCP handles, so a real RST is not available; the comment should say the case is now covered only as "peer drops". Consider writing data first and destroying with unread inbound data, or accepting the weaker claim.
- Minor: `dispose()` awaits `unregister`, so Electron's shutdown chain waits on `server.close`. The sockets are destroyed first, so the wait is a few ms. The shutdown chain has a hung-dispose guard (shutdown.ts:154), so this is safe.
- Minor: Linux abstract sockets: the unregister path is identical, and `close()` on a Unix socket does not hold the name after destroy. Behaviour is unchanged except that `await closing` adds one microtask.

## dashboard-budgets.spec.ts
`recursiveJsonBytes` is a faithful recursive counter. The sanity test, "measures like the real counter on an ordinary spec", checks parity. `overflowingDepth` doubles until a RangeError, so on Node 24 the depth of 5000 and 200000 overflow, and on Node 26 it escalates. It still proves the outer-catch path, because it injects the counter through `validateDashboardSpec(spec, counter)`. The tests keep the claim on Linux/Node 24. Concern: the `hosted` assertions are conditional, so on a runtime where the host counter measures, the "could not be validated" branch is covered only by the injected counter. That is fine.

## Data flow
Operator client -> pipe -> `handle` (socket tracked) -> `respond` -> `socket.end`. Unregister: sources empty -> `active` cleared -> `server.close` -> sockets destroyed -> callback resolves `closing` -> next `start` proceeds. Gap: S1 (control registered after dispose).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Re-register in same process succeeds on Windows | COMPLETE (not run here) | no regression test (M2) |
| Dispose awaits unbind | PARTIAL | does not cover an in-flight register (S1) |
| Linux behaviour unchanged | COMPLETE | none |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Start while closing | YES | `await closing` | no timeout |
| Concurrent registers | YES | `starting` | none |
| Callback with error | YES | arg ignored | none |
| Dispose during acquire | NO | | S1 |
| Two locks, one disposed | YES | sources.size check | none |

## Verdict

- Recommendation: APPROVE with the S1 follow-up
- Confidence: MEDIUM (no execution, no Windows run)
- Top risk: dispose racing the first acquire leaves a bound endpoint, which blocks the pipe name on Windows.
- What a robust implementation would add: a disposed re-check after the control await; a bounded wait on `closing`; a register/unregister/register regression spec; a real abort case in the idle-peer test.
