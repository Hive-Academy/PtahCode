# Code logic review — round 8

**Verdict: APPROVED. Score: 8/10.** No confirmed defect in commit `5de0e3ab1` within the stated in-memory recovery limit. This is in the 7–8 band because the two round 7 failures are fixed and the guarded successor check remains in place. It is below 9–10 because recovery of a failed completion write still depends on the same service instance surviving; that is an accepted design limit, not a new finding.

## Confirmed defects

None.

## Requested checks

| Check | Result | Evidence |
| --- | --- | --- |
| Round 7: a concurrently completed record re-enters the closer | Fixed | `transition` checks the expected successor before returning `completed` for `closeCompleted` (`session-handoff-ack.store.ts:398-405`); the service returns `already-closed` before resolving the closer (`session-handoff.service.ts:398-410,432-434`). |
| Round 7: successful close followed by rejected completion write cannot settle on repeated ack | Fixed within the accepted process-lifetime limit | The rejected write adds the predecessor to `closedUnsettled` and preserves the truthful `closed` result (`session-handoff.service.ts:463-479`). A later ack passes the guarded transition, writes `closeCompleted`, and returns `already-closed` before calling the closer (`:398-430`). The recovery spec makes the closer return `absent` on the repeat and verifies one close call (`session-handoff-ack.service.spec.ts:192-215`). |
| Marker authorizes a different successor | Not found | The complete-read transition checks `expectedSuccessorTabId` first (`session-handoff-ack.store.ts:395-405`); `superseded` exits before the marker check (`session-handoff.service.ts:398-417`). Recovery CAS also supplies the expected successor (`:420-425`). `record()` cannot replace a `closePending` record (`session-handoff-ack.store.ts:294-300,318-326`). |
| Marker leaks into a later handoff of the same predecessor tab | No reachable wrong result established | The marker can remain if another instance completes the record before a repeat ack, because `completed` returns before deleting it (`session-handoff.service.ts:406-410,417-426`). A new same-tab handoff cannot replace `closeCompleted` in the store (`session-handoff-ack.store.ts:294-300`); completed records are eventually pruned (`:415-421`), but the predecessor tab was already closed when the marker was created (`session-handoff.service.ts:463-477`) and new successor tab IDs are minted by `SessionId.create()` (`:589-594`). The retained marker merits cleanup but does not establish a reachable wrong acknowledgement in this flow. |
| Same-successor `starting` reaches `acknowledgeRecord` via `already` | Not reachable in the reviewed flow | Initial lookup returns retry for `starting` before `acknowledgeRecord` (`session-handoff.service.ts:282-303,332-335`). Normal settlement moves `starting` to `recorded` (`:780-795`); `record()` rejects replacement by the same successor (`session-handoff-ack.store.ts:294-300,318-326`). A different successor is caught by `superseded` (`:398-405`; `session-handoff.service.ts:404-405`). |
| Remaining acknowledgement flow | No regression found | Identity and path checks precede transition (`session-handoff.service.ts:326-330,359-380`); missing records retry (`:411-415`); flush/stop gates still precede the closer (`:435-465`); absent first close remains refused (`session-handoff-ack.service.spec.ts:218-230`). |

## Five logic questions

1. **How does this fail silently?** A completion write rejection is reported through `reportError` and returns the actual `closed` outcome (`session-handoff.service.ts:473-479`). The record may remain `closePending` until a repeat ack; this is observable and recoverable while the service lives.
2. **What user action produces unexpected behaviour?** Repeating an ack after that rejected write now settles the record without a second close (`session-handoff.service.ts:417-430`); no confirmed unexpected result was found.
3. **What input produces a wrong answer?** A stale successor is rejected by the complete-read transition before the marker is consulted (`session-handoff-ack.store.ts:395-405`; `session-handoff.service.ts:404-417`). No confirmed wrong answer was found.
4. **What happens when a dependency fails?** An unreadable candidate rejects the complete mutation read (`session-handoff-ack.store.ts:177-198,201-216`), and the ack returns a retry through its catch (`session-handoff.service.ts:480-483`). A rejected recovery write likewise returns a retry and keeps the marker (`:417-426,480-483`).
5. **What requirement remains unspecified?** Recovery after process restart is outside the stated contract: `closedUnsettled` is instance memory (`session-handoff.service.ts:148-149`), and a restarted service cannot infer prior closure from `closePending` alone because that state precedes the first close (`:398-403,435-465`).

## Decisions

- **Approve within the stated limit.** The alternative was to request durable reconciliation across restarts. The task explicitly accepts that limit, and `closePending` cannot safely prove a past close (`session-handoff.service.ts:398-403,435-465`). Reversible if the product later requires restart recovery.
- **Do not report `starting` as a defect.** The initial state gate and store replacement rules prevent the proposed same-successor path (`session-handoff.service.ts:302-303`; `session-handoff-ack.store.ts:294-300`). Reversible if a separate writer capable of moving `recorded` back to `starting` is introduced.

## Verification and scope

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — **PASS**, 3 suites, 112 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **PASS**, exit 0.
- `ptah_get_diagnostics` was attempted for both changed source files but its TypeScript check remained unavailable after two 45-second waits; the scoped compiler command above completed successfully.

Reviewed the task context and implementation notes, round 7 findings, commit `5de0e3ab1`, the acknowledgement service/store paths and their changed specs, and repository instructions. No source or spec files were edited. The checks exercise the intended recovery path, but they do not prove behavior after a process restart, which is the explicit accepted limit.
