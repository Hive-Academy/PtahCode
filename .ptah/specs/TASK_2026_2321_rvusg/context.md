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

## Also in scope: two known gaps from PR #1492 (user, 2026-11-23)

Both were recorded in TASK_2026_2310_rvlns `decisions.md` (D19 M6, D20) and not fixed there. Neither changes
lane selection or performance. Both make review diagnostics wrong or silent. They touch the same stage-record
and lane-listing code as the usage work, so they ship with this task.

- **M6: stale stage lane record after an aborted lens rerun.**
  - `lens-stage.runner.ts:~56-66`: the runner saves the stage as `running`, runs the lane, then
    `if (signal?.aborted) break;` comes *before* `saveStageLane(...)`.
  - An aborted lens therefore keeps the `checkpoint:lane:lens:<x>` row and the `family` column from an earlier
    run of the same attempt, or gets none. The lane it actually ran on is not recorded, and the stage can stay `running`.
  - `saveStage` never resets `family` (`sqlite-review.repository.ts:~323-329`).
  - Fix: record the lane the stage ran on, including on abort and failure, and close the stage row (`interrupted` or `cancelled`).
  - Check the triage and verification runners for the same pattern.
  - Usage for that stage (goal 2) belongs to the same record.
- **D20: the drawer cannot mark a lane whose default model is blocked.**
  - The gateway already computes `defaultModelBlocked` per lane (`review-lane-gateway.ts:~114-125`), and
    selection uses it (`review-lane-selection.ts:~74`).
  - The strict public listing `ReviewLaneListingEntrySchema` (`review-lanes.schema.ts:~96`) drops it, so
    `review:listLanes` (`review-lane-listing.service.ts`) never sends it.
  - Fix: forward an optional `defaultModelBlocked` in the listing. In the drawer, show the "Lane default" option
    (`review-lane-options.ts`) for that lane as blocked, with the reason, in the pool and in the pins.
    It must be visible before save, not only as a `model-blocked` fallback in run detail.

## Out of scope

- Live, mid-turn usage for chat lanes and the lane composer: TASK_2026_2320_lnpar (`feat/lane-chat-parity`).
- Changing which lanes review uses (#1492).

## Open questions for Gate 1

1. Should review spend count in the session or account spend totals, or only in the Reviews UI and PR comment?
2. Should the PR comment show cost in USD, or only tokens? It is public on GitHub.
3. Should a stopped, at-limit or timed-out lane's partial usage be recorded? Recommended: yes, marked partial.

## Related

- TASK_2026_2310_rvlns / PR #1492 (merged aa7ef509a): stage lane, model and fallback records this extends;
  source of M6 and D20.
- TASK_2026_2309_bigdf / PR #1482 (merged 6225e966a): large-diff fallback.
- TASK_2026_2320_lnpar: chat lane parity, including live usage.

## Gate 1 answers (user, 2026-11-23)

1. Spend totals: **also roll review spend into account totals** (`analytics:spendSummary`, plan-limit tiles), not only the Reviews UI and PR comment.
2. PR comment: **tokens only**. USD appears only in local run detail.
3. Partial usage: **yes, record it, marked partial**; run total shown with ≥.

## Gate 0.1 — execution

- Preference source: none found (no `ptah_memory_search` / `ptah_agent_list` tools in this host session).
- Lanes: `disabled` (no ptah lane tools available); executors are built-in subagents.
- Approval mode: `user`. Document reviews are same-side (reason: opposite side unavailable).
