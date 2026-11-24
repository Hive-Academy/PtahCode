# Code logic review P2 — TASK_2026_2321_rvusg

Weaker evidence: same-family review. Read-only; no tests were run, findings come from reading the code and the existing specs.

Scope: commits 6f3a072ea (B4), c64e6d5fb (B3), 01daa2bfc (B5a), f041e6fc5 (B6), 533db7b30 (B5b). Paths under `libs/backend/review-core/src/lib/` unless noted.

## Verdict

Score 8/10. Verdict: APPROVE. Blocking: 0. Major: 0. Minor: 4.

Why not 9-10: one understated-total path (m1) and one abort race in the gateway (m2). Why not 6-7: every path the brief names (lost usage, pending marker, `running` rows, double count, transaction boundary, `closeRunningStage` guard) holds when traced.

## Open item: `Lane mutated source` loses usage — NOT a real gap

The implementer's premise is wrong. `Lane mutated source` is thrown at `lanes/review-lane.runner.ts:191`, inside the `try` that opens at `:179`. The catch at `:219` handles it. It returns `{ status: 'partial', reason: 'source-mutated', lane, ...(run ? { run } : {}) }` at `:225-228`. `run` is assigned at `:189`, before the checksum call, so it is set whenever the lane was spawned. The error never reaches the stage runners' catch, so `saveStageLane(null, undefined)` is not reached on that path; the normal `saveStageLane(result.lane, result.run)` runs.

Existing tests confirm it: `lanes/review-lane.runner.spec.ts:189` and `:361-364` ("carries the run when the lane mutated the source").

What actually escapes `run()` after spawn: nothing I can find. The `finally` at `:229-239` swallows the triage cleanup error, and `lease.release()` is synchronous. The throws that do escape are all before the spawn call (validation `:151-154`, `choose()` list failures `:158`, `environment.settings()` `:166`). Those have no usage to lose, so `(null, undefined)` is correct for them.

Minimal fix: none. Correct the note in `batch-B5b-report.md` ("open risks"), and the "reported, not changed" wording, so nobody adds a `run` field to that error.

## Five logic questions

1. Silent failure.
   - A failed `saveStageLane` in the stage runners' always-save path is caught by the lens catch, and `removePendingRun` swallows its own error behind a `degradation-audit: reported` marker (`stages/lens-stage.runner.ts:93-99`, `triage-stage.runner.ts:39-45`, `verification-stage.runner.ts:148-154`). The primary error is rethrown, so the failure is not lost.
   - The stale marker then reads as "≥ unknown", which is honest.
   - The gateway turns an unreadable usage into `null`, never 0 (`apps/ptah-electron/src/services/review/review-lane-gateway.ts:235-249`, `UNREAD_USAGE` `:27`).
2. Unexpected user action. Abort during a lens is covered: the lane and usage are saved first (`lens-stage.runner.ts:67`), then `closeRunningStage` and `break` (`:68-72`). Abort between lanes closes the row via `stage()` `interrupt` (`review-orchestrator.service.ts:350-358`).
3. Wrong answer rather than error. See m1: a completed lane with `cacheReadTokens` or `cacheWriteTokens` null and known input/output gives `tokensPartial = false` (`usage/review-usage-total.ts:25`), yet `totalTokens` omits those tokens.
4. Dependency failure. The gateway keeps usage on poll failure, stop failure, timeout and cancel (`review-lane-gateway.ts:277-296`). A throwing `findAgentUsage` becomes null (`:236-242`). A failed usage-folder lookup warns and skips the key (`:223-232`).
5. Missing and unmentioned. Nothing material. A stale pending marker after a crash stays forever, so that run's total stays "≥". That is deliberate and honest.

## Requirement checks

| Requirement | Status | Evidence |
|---|---|---|
| Usage captured at every lane end (completed, failed, stopped, timeout) | COMPLETE | `runLane` `review-lane-gateway.ts:251-297`; runner carries `run` on all returns `review-lane.runner.ts:193,218,221,228`; stage runners always save |
| Unknown never 0; partial marked | COMPLETE with m1 | `review-lane-usage.ts:22`; `review-usage-total.ts:22-25,41`; `review-markdown.renderer.ts:59-69` ("≥") |
| Stored per stage, doc `checkpoint:lane:<stage>`, optional `usage`, version 1, runs capped | COMPLETE | `persistence/review-stage-lane-record.ts:12,25-35,97-102,108-123`; cap enforced at begin and merge; invalid or overflow read as one unknown partial run `:70-74` |
| Older stored data still reads | COMPLETE | lenient record schema `:25-27`; `usage` absent means no runs, so `usage` is omitted (`review-query.repository.ts:35`) |
| Run total aggregates all stage lanes; PR comment tokens only | COMPLETE | all lane docs summed, not only the 16 displayed rows (`review-query.repository.ts:73-74`); `publication-stage.runner.ts:88-92`; renderer never reads `costUsd` |
| M6: abort or failure closes `running` and records the lane (lens, triage, verification, `stage()`) | COMPLETE | `lens-stage.runner.ts:61-87`; `triage-stage.runner.ts:23-35`; `verification-stage.runner.ts:113-125`; `review-orchestrator.service.ts:350-374` |
| Spend rolls into the checkout workspace ledger; none open means stored, not counted; no double count | COMPLETE | gateway passes `usageWorkspaceRoot` only when resolved (`:199-204`); the ledger row is written by the manager (`agent-process-manager.service.ts:1651,4553`) keyed by agent id. Review's own store is read-only for display and never added to spend |

## Findings

### Minor

**m1. Token total is not flagged partial when cache counts are unknown.**
- `usage/review-usage-total.ts:25`: `tokensPartial` only looks at `partial`, `inputTokens === null` and `outputTokens === null`.
- A run reporting input and output but no cache fields has cache null, so the aggregate cache fields are null (`:35-40`) while `totalTokens` (`:41`) sums the rest and shows no "≥". For providers that bill cache, the comment understates silently.
- Fix: mark partial when any counted run has a null cache count and the others are known. If "no cache concept" is a legitimate null, record that decision explicitly instead.

**m2. Abort during the usage-folder lookup still spawns a lane.**
- `review-lane-gateway.ts:199`: `usageWorkspace` swallows the abort rejection from `realpathUntilAborted` (`:226-231`) and returns undefined. Then `manager.spawn` runs (`:201`) even though `input.signal` aborted. `runLane` cancels and stops it at once, but an agent is created and its ledger rows land without the checkout key, so they are uncounted.
- A spurious warn "folder lookup failed" is logged as well.
- Fix: `if (input.signal.aborted) throw new Error('Review lane cancelled')` after the `await` at `:199`, or let `usageWorkspace` rethrow when the signal is aborted.

**m3. `removePendingRun` can drop an older stale marker or write an empty document.**
- It is called from the catch whenever the lane threw, including before `beginStageLaneRun` ran (`lens-stage.runner.ts:59-60` throw, then `:82`), or after `saveStageLane` already closed this run (`saveCheckpoint` or `onCompleted` throws).
- `mergeLaneRun(doc, null, undefined)` then removes the last pending entry (`review-stage-lane-record.ts:115-116`). If an earlier crash left a stale marker, it is dropped, which hides that crash's unknown usage.
- With no document it writes `{lane:null,...}` (`:112`).
- Fix: have the catch track `begun` and `ended` locals and call `removePendingRun` only when `begun && !ended`.

**m4. Old and new lease owners can touch each other's pending marker.**
- `closeRunningStage` correctly refuses a row a new owner restarted (`sqlite-review.repository.ts:336-340`, guard on `started_at`).
- `saveStageLane` has no equivalent guard, and the sync transaction (`:327-334`) only serialises writes. A late write from the old owner removes the newest pending marker, which belongs to the new owner. The count stays right because each side appends its run, but it can cost the new owner's mid-run "pending" marker.
- Low likelihood and no effect on the final totals. Note only.

### Other observations, no action

- A lens whose lane completed but whose signal aborted afterwards is discarded and rerun on resume (`lens-stage.runner.ts:68-72`). Both runs stay stored and both are real spend, so there is no double count. It is wasteful but inherited from earlier behaviour.
- `stage()` after abort following `saveCheckpoint` marks the row `interrupted` with a checkpoint present (`review-orchestrator.service.ts:366`), so the stage reruns on resume. Before this change the row stayed `running` and also reran, so there is no regression.
- Spend isn't double counted. The account ledger rows come from `recordLaneUsageOutcome`, keyed by agent id plus completion stamp, so a repeated terminal call converges. The review store never writes to the ledger.
- `closeRunningStage` guard: `state='running' AND started_at=ms(startedAt)`. The runners pass the same ISO string they saved, so the roundtrip is exact to the millisecond. Two owners saving in the same millisecond is negligible.
- Transaction boundaries: `saveStageLane` wraps the family update and the document read-modify-write in one transaction. `updateLaneDocument` nests safely inside it (`sqlite-review.repository.ts:327-358`).

## Checks not run

No jest, tsc or eslint was run, per the brief. The `Lane mutated source` conclusion rests on reading the runner source and the existing specs at `review-lane.runner.spec.ts:189,361`.
