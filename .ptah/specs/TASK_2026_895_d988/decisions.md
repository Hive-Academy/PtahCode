# Decisions - TASK_2026_895_d988

| # | Stage | Decision | Evidence / source |
|---|-------|----------|-------------------|
| 1 | pre-flight | Type REFACTORING, depth Partial, with research phase first | ptah_route_decide pre-flight: taskType/depth null, source skill-table, fallbackCause timeout, usage requests 1. REFACTORING row ranks above RESEARCH. |
| 2 | gate-0.1 | Lanes enabled, Approval lane-review | User global CLAUDE.md preference; codex has confirmed room. |
| 3 | gate-0.1 | research-setup, research-online, architecture, implement -> codex (gpt-6-sol) | ptah_route_decide gate-0.1, source ranking, scores 79/79/69/78, confidence null; architecture and implement fallbackCause timeout. |
| 4 | gate-0.1 override | plan-review: router chose codex (same family and same side as author). Override -> independent subagent (cross-side, different family) | checkpoints cross-side review rule; author is a codex lane. |
| 5 | gate-0.1 override | code-review: router chose claude lane (opus). Override -> antigravity lane if spawnable (different family, non-Claude per user preference); fallback claude-family subagent with weaker-evidence label | User prefers non-Claude lanes; antigravity limit state unknown, not AT LIMIT. |
| 7 | scope (USER) | This task = A (batch-sizing skill rules) + B (lane-routing: per-phase weight/shape in, tier+effort out, replace fixed tierFor) + C (orchestrator per-call subagent model override from router tier). D (per-CLI tier map) -> TASK_2026_896_9339. | User answer via AskUserQuestion, 2026-11-09. Research: research-setup.md, research-online.md (Option C staged through B). |
| 8 | scope (USER) | Decision-model timeout -> separate BUGFIX TASK_2026_897_4e36 | User answer via AskUserQuestion. |
| 9 | research verify | Spot-checked: 14 agent files have `model:` (grep count 14); `tierFor` at phase-plan.ts:346 returns opus/sonnet by kind. | Grep in worktree. |
| 10 | decomposition | Architect lane's `## Batches` used as batches.md; team-leader Mode 1 subagent skipped | Plan already applies A1-A9 and passed Gate 2; saves Claude usage (user preference). Reviewer checked batches (re-review round 1). |
| 11 | gate 2 | APPROVED in lane-review mode (cross-side: codex lane author, Claude subagent reviewer) after 1 revise round | implementation-plan-review.md |
| 12 | batching | B7/B8 run in parallel with B1 (file-disjoint docs; depend only on contract names fixed in plan) | plan B7/B8 deps = B1 names only |
| 6 | scope | Part B starts as research + design; implementation of any code change (router, settings) is scoped by the plan and may become a follow-up task | Code changes in libs need their own verify; the plan decides. |
| 13 | batch scope | confidence.spec.ts added to B3 write set | B1 verify found the gate fixture at :271 fails the new result schema; no plan write set held it. |
| 14 | docs edit | Orchestrator moved the B8 paragraph above "Every `task` carries:" in both agent-lanes copies | The paragraph split the sentence from its list. |
| 15 | phase 1 review | APPROVED 8/10 (antigravity, other family than codex). Fix round: F1 tests only, F2, F4; F3 no change | code-logic-review-phase1.md; rule 4 severity: Moderate F1 cannot break a lane config or lose data, but a test is local and cheap. |
| 16 | re-review | The scoped re-review of fix commit a0e2f14f1 is folded into the final PR review | Rule 5 final review covers fix-round commits; saves one review run. Reversible. |
| 17 | docs edit | Orchestrator replaced the B9 weight table with two bullets in both team-leader files | A table inside a bullet list breaks the Markdown list. |
| 18 | verify | user-layer-reap.spec.ts EPERM failures are pre-existing | `git diff main...HEAD -- libs/backend/agent-generation` is empty before B9; Windows symlink permission. |
