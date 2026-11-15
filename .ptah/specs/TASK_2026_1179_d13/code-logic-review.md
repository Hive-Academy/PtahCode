# Code logic review: D13 stop-but-alive (commit 0901a4855)

**Verdict: PASS WITH CONCERNS. Score 6/10.** No blocker. The core defect is fixed on the `stop()` path. Several gaps could let it recur quietly on the background paths. The spawner spec was never executed (`test-report.md`: `marked` missing), so the spawner-side behaviour has no run evidence.

## Five logic questions
1. **Does it do what was asked?** Yes for `stop()`. `markEnded` and `releaseResources` now run only after the adapter confirms the session inactive (`session-spawner.service.ts:1210-1226`). `interruptInBackground` and `onHandoffGraceExpired` only partly meet the intent (F2).
2. **What inputs break it?** An unparseable id or a missing adapter returns `stopped: true` (`:1250`), which is unchanged from before. An `isSessionActive` that throws is not caught (F3). A `sdkSessionId` that the adapter does not know makes `interruptSession` throw or no-op (F4).
3. **Where do races live?** There is a check-then-act window between `anyActive()` and `endSession`. It is narrow and the final `anyActive()` re-check closes it. The Codex `stopRequested` early return (`codex-chat-session-controls.ts:158`) means a second stop during a busy interrupt closes nothing. The hard-end fallback covers that case, so this is acceptable.
4. **What does failure leave behind?** The refusal path resets `runtime.stopping = false`, does not call `markEnded`, and does not release resources. That is correct, and the session stays retryable. The background paths log nothing when the stop is refused (F2).
5. **Does it contradict existing contracts?** The port union gains `SessionChildStopStillActiveRefusal`. Callers that switch exhaustively on `reason` need an update (F6). The Codex `interruptSession` gains an optional `cause`, which is backward compatible.

## Findings
- **F1 (Medium) Misleading end reason.** `verifyAndHardStop` soft-interrupts both ids (`:1262-1268`). If the adapter throws "unknown session" for the SDK id (or for the tab id after the SDK id was bound), `interruptError` is set. `stop()` then records `stopped-by-parent (interrupt failed: …)` even though the stop succeeded. The log and the stored reason become noisy and untrustworthy. Suggestion: ignore interrupt errors for an id that is not active, or only record an error when the session is still active afterwards.
- **F2 (Medium) Silent still-alive on the background paths.**
  - `interruptInBackground` (`:2228-2229`) maps `stopped:false` to `false` with no log. The `.catch` only logs a throw.
  - The child is already marked terminal by then (callers at `:1425`, `:1747`, `:2396`, `:2690`). A session that survives the hard end is therefore a stop-but-alive session with no log line. This is the exact defect class being fixed.
  - Suggestion: log when `stopped` is false, and check what the consumer at `:2690` does with `false`.
  - `onHandoffGraceExpired` (`:2354-2365`) logs and proceeds with succession even when the session is still active. That is documented behaviour, but it leaves the old session alive next to its successor.
- **F3 (Low) `stop()` leaves `runtime.stopping = true` if the helper throws.**
  - Only `isSessionActive` or `SessionId.safeParse` can throw, because the other adapter calls are wrapped.
  - `stopping` is set at `:1207`, but only the refusal branch resets it.
  - Suggestion: wrap in try/finally, or reset on throw.
- **F4 (Low) Hard end of an old session in `onHandoffGraceExpired`.** It used to be a soft interrupt only. If the successor reuses the same SDK session id, the hard end would kill the successor. I did not verify whether ids can be shared. Please confirm.
- **F5 (Low) Codex `hardStop` handling.**
  - `controls.interruptSession` closes the session on `parent-stop` and `user-stop` in the idle path (`:155`) and the accepted-interrupt path (`:172`).
  - The refused-interrupt path closed the session already (`:168`).
  - The `opening` path only sets `cancelled` (`:147-149`) and does not close. If `isSessionActive` reports an opening session active, the hard `endSession` fallback has to cover it. This is untested.
  - The no-cause (soft) path is unchanged, and a test covers it.
- **F6 (Info) Port.** I did not audit consumers (MCP tool or UI) of `SessionChildStopResult` for exhaustive handling of `'still-active'`. Run typecheck on dependents.

## Test coverage
- Codex: three new tests cover idle close, soft no-cause, and busy accepted. They passed (165 tests across the two suites).
- Spawner: new tests cover the hard-end path, no-stopped-marking while still active, and a differing SDK id. They were **not executed**.
- Missing cases:
  - `interruptSession` throws.
  - `endSession` throws.
  - `isSessionActive` throws.
  - The refusal resets `stopping`.
  - A background-path refusal is logged.
  - The Codex `opening` path.
  - A refused interrupt with `parent-stop`.

## Decisions
None needed.

## Residual uncertainty
- I did not run any tests myself. The spawner spec is blocked by an environment problem.
- I did not read the Claude adapter's `interruptSession` or `endSession` for unknown ids, which F1 depends on.
