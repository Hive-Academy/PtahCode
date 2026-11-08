# Code Logic Review, round 2 — TASK_2026_SUBAGENT_STOP_HANDOFF

Verdict: **APPROVE** for the live test. 0 blocking, 0 serious, 5 moderate (follow-ups).
Scope: full read of `subagent-notes-gate.ts`, `subagent-budget-hooks.ts`, the gate/stop/finish/take*/deliver/prepareHandoff
paths of `subagent-budget-monitor.ts`, `subagent-handoff-delivery.ts` (send/push), and the `subagent-hook-handler.ts` diff.
Specs and checks were not run (a scoped verify is running); SDK hook types were checked in `sdk.d.ts`.
Monitor line numbers below are as the file reads on disk.

## 1. Earlier findings: fixed in code

| Finding | Evidence | Status |
| --- | --- | --- |
| B1 deferred or failed safety stop dropped the gate | `checkNotesTool` starts the stop with `void ...catch(log)` and returns the denial at once (`monitor:756-764`). The gate is released only on a confirmed stop, at `:1591-1596`, after the `stopFailure` and `stopFired` returns (`:1527-1543`). A missing task ID returns early at `:1426-1437` and the gate stays. `stopWarnedAgent` warns when the gate remains (`:781-785`). A late task ID keeps the gate and re-posts the notice (`:861-875`). | FIXED |
| B2 normal exit lost the handoff or leaked the gate | `finishWarnedAgent` releases the gate and the idle timer in `finally` (`:880-883`) and resets `stopInFlight` in an inner `finally` (`:875-877`). It builds an in-memory handoff when the task ID is missing (`:840-849`, `skipRecord`, `prepareHandoff:1695`). It also builds one when the record write fails (`allowInMemoryOnFailure`, `:1717-1723`). | FIXED |
| S1 Windows path casing and separators | `pathKey` normalizes and lowercases on win32 (`notes-gate:9-14`). The check keeps the inside-root test and compares exact keys (`:55-58`). A different drive makes `path.relative` return an absolute path, so it is rejected (`:57`). The exact notes write passes even after expiry because the allow branch runs before the `expired` check. | FIXED |
| S2 hook rejection could lose the denial | Input is parsed with Zod (`hooks:6-14,26-28`). Callback errors are caught and logged as a real `Error` (`:62-66`). A gated agent still gets a deny (`:67-72`). Other agents continue (`:74`). | FIXED |
| S3 duplicate delivery and the normal record not marked invoked | The delivery claim (`handoffDelivered = true`) is taken before the send in four places: `:870`, `takeNormalHandoff:892`, `takeInterruptedHandoff:905`, and the stream path `:1359,1366`. `deliverHandoff` checks it (`:1792`). `markInvoked` runs at `:865`. | FIXED |
| Moderate items (pending-stop interruption, watchdog expiry, timer on release, probe noise, inferred provenance) | Pending-stop interruption: `takeInterruptedHandoff` accepts `pending` (`:899`) and `prepared` is set before `pending` (`:1481,1503`). Release clears the gate and the idle timer (`:1116,1121`). The probe logs at info only for relevant events (`hooks:29-32`). The handler warns when the monitor's hook methods are missing (`hook-handler diff`). | FIXED |

## 2. Regression hunt

- **Claim taken, delivery then fails.** Not a loss. `SubagentHandoffDelivery.send` never rejects. It retries the push, then posts the text to the main-thread notice queue (`delivery:100-122`). A durable record stays pending. An in-memory handoff has no record, but the notice-queue fallback still carries it. No defect.
- **Hook claims the text but the SDK drops `additionalContext`.** The claim is final, and a normal hook delivery publishes no pointer (`takeNormalHandoff:887-894`). The record is pending but the pointer is not published, so the parent would never learn of it. The SDK type does define `additionalContext` for PostToolUse and PostToolUseFailure, so this holds only if the SDK ignores it. It is a live-test item (see M5), not a code defect.
- **Fire-and-forget rejections.** All covered. `checkNotesTool` has a `.catch` (`monitor:757`). The watchdog has a `.catch` and a `.finally` that reschedules (`:803-812`). The hook callback has a try/catch. No unhandled rejection path found.
- **Watchdog timer leak.** There is one timer, unref'd. It is cleared when no gate remains, via `clearIdleGateTimer` in `finishWarnedAgent`, the stop success path and `release`. The one leftover is M1.
- **Windows keys.** `path.resolve` strips trailing separators and `path.normalize` handles UNC. 8.3 short names, `\\?\` prefixes and symlinks do not match. The result is deny, then stop, then inferred notes, so it fails closed. `replaceAll('/', '\\')` is redundant after `normalize` on win32 but harmless. macOS case-insensitive volumes are not folded (minor, fails closed).
- **Zod on `tool_input`.** The `z.object` strips extra keys and requires a non-empty `file_path`. A malformed input means a denial, which counts toward the limit. Correct.
- **Concurrency.** `finishWarnedAgent` sets `stopInFlight`, so a concurrent budget stop skips. If a safety stop is already in flight, `finishWarnedAgent` skips it (`:834`) and still releases the gate. The pending stop owns the handoff, and the interruption hook can repair the parent text. If that stop then rejects, the index pointer is still published (`:1516-1518`), so the record stays recoverable.

## 3. Items (none blocking; follow-ups)

- **M1 (moderate): a given-up safety stop leaves the gate active and a no-op watchdog.** After `MAX_STOP_ATTEMPTS` failures `onStopFailed` sets `stopFired = true` (`monitor:1834`). `stopWarnedAgent` then skips the agent (`:775`) and the gate persists. The watchdog reschedules every second (`:808-812`) until `release` or `SubagentStop`. The gated agent is denied all tools, which is safe, but the timer runs for nothing and a warn is logged per tick. Fix: when `stopFired` is set by give-up, stop rescheduling for that agent, or log once.
- **M2 (moderate): the notes allowance is consumed at PreToolUse, not on success.** `wroteNotes = true` is set at approval (`notes-gate:58-60`). If the Write fails, a retry is denied and the gate stops the agent after 3 denials. The inferred-notes fallback covers it (`monitor:1681-1693`). Fix: mark it on PostToolUse success.
- **M3 (moderate): the background branch of `finishWarnedAgent` awaits `delivery.send` inside the SubagentStop hook** (`monitor:869-871`). A slow push with retries holds the SDK hook. Fix: do not await in the hook (`void` with the existing never-reject guarantee).
- **M4 (moderate): if `prepareHandoff` throws in `finishWarnedAgent`, nothing is delivered.** The error is logged by the hook wrapper, the gate is released, and there is no in-memory fallback.
- **M5 (live-test item): hook ordering.** The budget hooks are prepended to the existing SubagentStop and PostToolUse matchers (`hook-handler diff`), and SDK hooks may run in parallel. `finishWarnedAgent` reads `resolveRegistryRecord`, which requires a `running` registry status (`:1406-1408`). If the existing SubagentStop handler completes the registry record first, the agent and record lookup degrades. The task ID usually comes from `startedTasks`, so the impact is small. Check this in the foreground/background probe.
- Minor: when the session is released between preparing and marking, a prepared record is not withdrawn (`:859`). A warned agent that finishes normally always gets a "budget handoff" even if its task completed, so check that the message wording does not tell the parent to redo finished work.

## Five questions (short)

1. Silent failure: none found. Every failure path logs and either keeps the gate or falls back to the notice queue or an in-memory handoff.
2. Unexpected user action: a normal finish while a safety stop is pending (covered), and a Write retry after a failed notes write (M2).
3. Wrong answer from data: the host-generated notes are marked inferred, so they cannot pass as agent-written. A path variant the key does not normalize is denied, not allowed.
4. Dependency failure: `stopSubagent` rejection retains the gate and retries up to the cap. A record write failure gives an in-memory handoff on normal exit.
5. Missing: no cap or backoff on watchdog logging (M1), and no test that the parent hook actually surfaces `additionalContext` (M5, live).
