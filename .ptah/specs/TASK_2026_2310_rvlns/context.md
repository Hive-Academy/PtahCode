# TASK_2026_2310_rvlns — Review lane pool with per-role pins and family diversity

## User request

`/orchestrate` (2026-11-23): "we had a task before to allow setting the lanes and models used to review
our PRs, also there is an issue #1457 #1481". The earlier task, TASK_2026_896_1ec9 (PR #1053, merged
2026-11-10), only made reviews follow the global `agentOrchestration.preferredAgentOrder` and
`disabledClis`; its D3 decided "no new UI and no new review setting". This task adds that setting.
#1457 ships separately as TASK_2026_2309_bigdf (`fix/review-large-diff`).

## User decisions (2026-11-23)

- Feature shape: **Pool + per-role pins**. An ordered review lane pool (lane + optional model each),
  family diversity across lenses, optional pins that force a lane/model for triage, a specific lens
  or the verifier (verifier default: avoid the lens author's family). Empty settings keep today's behaviour.
- Delivery: two PRs. This PR covers #1481 + the settings feature.

## Issue #1481 (summary)

`ReviewLaneRunner.run()` (`libs/backend/review-core/src/lib/lanes/review-lane.runner.ts:98`) calls
`selector.select([request.kind], ...)` with one kind per call. `ReviewLaneSelector.select()`
(`review-lane-selector.ts:26`) builds `usedFamilies` fresh each call, so diversity never applies and the
first non-at-limit lane in `preferredAgentOrder` (codex) wins every lens. `lensAuthorFamily` is never set
by any caller, so the verifier rule never applies.

## Known surfaces

- Settings schema: `OperatorSettingsSchema` in `libs/backend/review-contracts/src/lib/review-config.schema.ts:83`.
- Settings UI: `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.ts`, store `review-runs.store.ts`.
- Lanes: `apps/ptah-electron/src/services/review/review-lane-gateway.ts` (`list`/`spawn`, no model on spawn today).
- Lens list: `LensSchema` in `review-config.schema.ts:5`.

## Gate 0.1

- Ptah MCP tools are not available in this session. Lanes mode: `disabled`. Approval mode: `user`.
- All phases run on Claude subagents; document reviews are same-side (recorded reason in decisions.md D3).

## Flow

FEATURE, Full: `plan` -> `document-review` -> `design` (Reviews settings drawer section) -> `document-review`
-> Gate 1.7 (user) -> `architecture` -> `document-review` -> Gate 2 (user) -> `batch` -> `implement` ->
`review` -> `tests` -> `visual-review` (Electron) -> `completion`.
