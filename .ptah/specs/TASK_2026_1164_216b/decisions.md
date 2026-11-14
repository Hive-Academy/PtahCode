# Decisions

| # | Decision | Source | Evidence |
|---|----------|--------|----------|
| 1 | Type FEATURE, depth Full | rule table | new worker + schema + 5 batches, 5+ files |
| 2 | Scope = all five batches | user | AskUserQuestion 2026-11-13 |
| 3 | Backfill = all configured profiles, counts and metadata only | user | AskUserQuestion 2026-11-13 |
| 4 | Skip separate `plan` phase; research-report.md + context.md are the requirements | evidence | user approved the batch plan directly |
| 5 | No `design` phase in this task; frontend follow-up only reads the new aggregation, adds no surface | evidence | research-report batch 5 |
| 6 | Lanes enabled, approval mode lane-review, writer codex, reviewer Claude family | user CLAUDE.md + ptah_agent_list | only codex has confirmed room among non-Claude lanes |
| 7 | Gate 2 passed after 2 revise rounds: round-2 findings N1-N5 came with exact required changes; the orchestrator confirmed each in the plan text (B0 added, native thread ownership, sidechain attribution, registry split, backfill after each pass) | cross-side review plan-review.md, plan-review-2.md | plan lines 164-170, 180, 212 |
| 8 | Accepted risk: Codex child-thread ownership stays an assumption; B7b must prove it from fixtures or leave child replay billable | plan-review-2 N2 | flagged for the final code review and the live test |

- B10 review (coordinator): `getRepositoryUsageTotals.knownCostMicroUsd` sums priced rows only; unpriced rows are not flagged separately. Accepted as "known cost"; the B11 UI must label it partial when `hasUnknownTokens` or unpriced rows exist. Reversible.

## 2026-11-13 — B9 write set expanded

- The B9 lane blocked: `ReadOnlyGit` is not exported from task-end-hook, the CLI root has no
  Git read runner, and the Electron container has no disposal hook.
- Decision: export `ReadOnlyGit` from `task-end-hook/src/index.ts` (additive), add a small
  CLI Git read runner in cli-engine (argument array, no shell, timeout), and stop the
  reconciler in the Electron teardown path. Reversible: yes.
