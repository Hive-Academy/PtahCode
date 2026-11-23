# TASK_2026_2321_rvusg — Track token usage and cost of PR review runs

## User request

2026-11-23, after PR #1492 (review lane pool, TASK_2026_2310_rvlns) merged: "create a follow up for the
review costs and usage". The question came up as: "do we update lanes usage tokens while agent works same
as we do with main orchestrator and subagents?" Chat lanes do (per turn). Review lanes do not track usage at all.

## Current state (audited on aa7ef509a)

- Review lanes run through `ReviewLaneGateway.runLane()`
  (`apps/ptah-electron/src/services/review/review-lane-gateway.ts:~183-215`): `manager.spawn({ taskKind: 'review',
  deliverables: ['out/lane-output.json'] })`, then polls `manager.findAgentInfo(agentId)` until `completed`,
  then `manager.stop()`. It reads only the output file. Usage and cost are never read.
- The process manager already accumulates per-lane usage: `tracked.outcomeUsage`, fed by
  `LaneUsageNormalizer.accept()` on each usage-bearing segment
  (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:~2048`), and puts it
  in the lane outcome context (`usage: tracked.outcomeUsage`, `~4340`). Every adapter reports `usageScope: 'turn'`.
  Review lanes are single-turn, so the turn total is the lane total.
- Nothing in `review-contracts` carries usage or cost: `StageRecord` has lane, model, family and fallback
  (added by #1492) but no tokens or cost.
- The PR comment hardcodes it: `review-markdown.renderer.ts:~77` writes `Usage: unavailable` in "Run metadata".
- Run detail (`libs/frontend/review-runs-ui`, `review-run-detail.component.ts`) shows the stage lane, model
  and fallback, and no usage.

## Goal

1. Capture: when a review lane finishes (completed, failed or stopped), the gateway reads the lane's final
   usage (input, output, cache read and write tokens, cost in USD when known, model) from the manager and
   returns it with the lane result. Unknown counters stay unknown, never 0.
2. Store: persist usage per stage (triage, each lens, verifier, follow-ups) beside the stage lane record,
   including on failed and timed-out stages, which still cost tokens. No migration break for older builds.
3. Total: compute a per-run total. Mark it partial ("≥") when any stage's usage or cost is unknown.
4. Show: run detail shows per-stage and total tokens and cost. The PR review comment's "Run metadata"
   shows the run total instead of `Usage: unavailable`, and says "unavailable" only when nothing is known.
5. Optional, ask at Gate 1: roll review spend into the existing usage and analytics surfaces
   (`analytics:spendSummary`, plan-limit tiles) so review cost counts against the same lane or account totals.

## Out of scope

- Live, mid-turn usage for chat lanes and the lane composer: TASK_2026_2320_lnpar (`feat/lane-chat-parity`).
- Changing which lanes review uses (#1492).

## Open questions for Gate 1

1. Should review spend count in the session or account spend totals, or only in the Reviews UI and PR comment?
2. Should the PR comment show cost in USD, or only tokens? It is public on GitHub.
3. Should a stopped, at-limit or timed-out lane's partial usage be recorded? Recommended: yes, marked partial.

## Related

- TASK_2026_2310_rvlns / PR #1492 (merged aa7ef509a): stage lane, model and fallback records this extends.
- TASK_2026_2309_bigdf / PR #1482: large-diff fallback.
- TASK_2026_2320_lnpar: chat lane parity, including live usage.
