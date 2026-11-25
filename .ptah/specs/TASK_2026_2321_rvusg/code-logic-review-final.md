# Code Logic Review (final, whole diff) — TASK_2026_2321_rvusg

Label: weaker evidence, same-family review. Static read of `git diff origin/main...HEAD`; no tests re-run (test-report.md evidence taken as given).

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Verdict | APPROVED (push) |
| Blocking | 0 |
| Major | 0 |
| Minor | 5 |

Decided items D1-D15 not re-raised.

## Cross-batch seams checked

1. **Mid-turn usage increments after the merge from main.** `agent-process-manager.service.ts:2090-2101`: the normalizer produces `step.turnTotal` and `step.increment`. `tracked.outcomeUsage` takes `turnTotal` (guarded by `outcomeUsageIsTurnTotal`). Only the card/buffer receives the increment (`shown`). `findAgentUsage` (`:2767-2777`) reads `outcomeUsage`, so the gateway captures the turn total, not an increment. OK.
   - `outcomeUsage` is reset only on a continuation turn (`:3446`). A review lane is single-turn. OK.
   - Flagged adapters: claude-sdk-lane-runner, codex, copilot, cursor, opencode, pi, provider-session. Unflagged lanes (antigravity/grok ACP) read as unknown (null, never 0). This matches the "unknown is never 0" requirement.
2. **Ledger written once.**
   - `recordLaneUsageOutcome` is the only ledger writer in the manager (`:4544`). The `workspaceKey` override is the only change (`lane-completion-outcome.ts:197`). The `eventKey` stays `agentId:completedAt`.
   - `stop()` on a completed or idle lane goes through `releaseSubprocess`, not `signalLaneCompletion` (`:3578-3600`).
   - `stop()` on a running lane stamps `completedAt` once and signals once.
   - The gateway reads usage via `findAgentUsage` and never writes the ledger. No double write.
3. **Gateway to cli-agent-runtime path.**
   - All lanes go through `doSpawnSdk` to `trackSdkHandle(..., request.usageWorkspaceRoot)` (`:1637-1652`).
   - `spawnFromSdkHandle` (`:1813`) passes no root, as D14 intends.
   - The resume path strips the key (`agent-lane-resume.service.ts:66`). Namespace `spawn` and `beginSpawn` strip it.
   - The final `readUsage` after `stop` falls back to the last poll read if the record was cleaned up (`review-lane-gateway.ts:296-298`). The status poll and usage read are synchronous back to back, so no gap loses the final segment.
4. **review-contracts to review-core to webview shapes.**
   - `ReviewUsageTotalSchema` is strict, but it is used only on the output side (`StageRecord.usage`, `ReviewRun.usage`), both `.nullable().optional()`.
   - Stored lane documents are parsed leniently (`ReviewStageLaneRecordSchema` without `.strict()`). `usage` is read separately, so an invalid usage keeps the lane part and adds one unknown partial run (`review-stage-lane-record.ts:60-77`). Pre-change documents give `runs: []` and then `usage` is undefined. Older data reads.
   - `usageOf` returns undefined when there are no runs, so `usage` is omitted rather than null. The webview handles both.
   - Stage key `lens:<x>#0` in `readStageLaneRecords` matches the query's `${stage.stage}#${stage.ordinal}`. OK.
5. **Null vs 0 in the webview.**
   - `review-usage-format.ts` returns "—" for a null total or null cost.
   - "≥" is applied independently to tokens (`tokensPartial`) and to cost (`costPartial`).
   - The template shows the sr-only sentence for unknown or partial values. The run-level `@else` shows "—" and "unknown".
6. **PR comment.** `renderUsageLine` reads only tokens, never `costUsd`. A null total gives "Usage: unavailable". Partial gives "≥". Publication reads the stored lane records at publish time (`publication-stage.runner.ts:90-93`). Only one caller of `renderSummary` exists. OK.
7. **Untrusted `usageWorkspaceRoot`.** `SpawnAgentRequest.usageWorkspaceRoot` is not in an RPC or MCP schema. It is stripped in the namespace `spawn` and `beginSpawn` and in resume, and is copied onto the tracked record only, not onto `AgentProcessInfo`.
8. **Abort and fail paths (M6).**
   - Lens, triage and verification each call begin, run, then save, with a pending marker. A crash leaves `ended:false`, which counts as unknown and partial.
   - Reruns after a crash add a second marker, and merge removes the last pending one, so the stale marker keeps the total "≥". That is conservative and honest.
   - `closeRunningStage` matches on `started_at`, so a stage restarted by a new lease owner is untouched.
   - The orchestrator `interrupt()` closes the row on every abort branch.
9. **D20.** `defaultModelBlocked` flows gateway (`review-lane-gateway.ts:145`), listing service (`review-lane-listing.service.ts:52`), `ReviewLaneListingEntrySchema` (optional), and `review-lane-options.ts` (label and `unavailableReason` for pool and pins). The selection service already used the flag (`review-lane-selection.ts:74`). OK.
10. **Spend attribution.** The DI closure resolves the checkout folder lazily per spawn. `realpathUntilAborted` rejects on abort, `allSettled` turns that into "no match", and the gateway re-checks the signal before spawning (D15). The folder string is the raw registered folder, which is what the spend summary uses as its key (`usage-summary.service.ts:61-63`). `review-lane-spend.spec.ts` covers this on a real ledger.

## Minor findings

- **m1** `triage-stage.runner.ts:22`, `verification-stage.runner.ts:112`, `lens-stage.runner.ts:65`: `beginStageLaneRun` is awaited without a guard. A SQLite write failure now fails the stage before a lane starts. Previously usage bookkeeping could not fail a stage. Low probability, since a failing DB already breaks the run, and no spend is lost. Acceptable. Optional: log the failure and continue.
- **m2** `review-stage-lane-record.ts:98-104`: `parseStageLaneDocument` returns null for a document whose lane part is unreadable, so `beginLaneRun` starts from an empty document and drops stored runs. This applies only to a corrupt document, not to any shape this build writes. Note only.
- **m3** `review-run-detail.component.ts` template: a stage with a usage object whose totals are all unknown renders "— · —", plus "N runs" when `runs > 1`. It is correct, but visually noisy for lanes that never report usage (antigravity/grok). Cosmetic.
- **m4** Older builds reading a run written by this build reject `usage` under `.strict()` (D14 M3a, accepted). Stored lane documents also keep `version: 1` while gaining `family` and `usage`. An older build that rewrites such a document would drop `usage`. Rollback only.
- **m5** `review-lane-gateway.ts:300`: a clean `completed` result returns `partial: false` even if the adapter reported no counters. The aggregator then marks tokens partial because input/output are null, so the display is still right. Not a bug.

## Five logic questions

1. **Silent failure.** A usage read that throws or returns an invalid field gives null, never 0 (`fieldOf`, `readUsage`). A failed folder lookup logs a warning, and the lane's rows are stored but uncounted (D11). A failed `removePendingRun` is swallowed deliberately and leaves a partial marker.
2. **User action.** Aborting a review mid-lens leaves the row `interrupted` and the lens reruns on resume. Both runs are summed.
3. **Wrong-answer input.** Mixed lanes with and without cost give a "≥ $X" lower bound and are not reported as exact. Cache counters are summed only when every run reports them.
4. **Dependency failure.** The usage reader, the stop call, the folder lookup and the SQLite lane save are all covered. A stop failure keeps the lane outcome and attaches partial usage.
5. **Missing.** Unflagged ACP lanes record no turn usage. No test for lease-takeover double marker (D15 m4 notes it).

## Verdict

APPROVED. Confidence MEDIUM-HIGH (static, same-family). Top risk: the usage-bookkeeping write (m1) now sits on the stage-failure path. Nothing found that blocks the first push.
