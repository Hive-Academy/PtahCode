# Test Report - TASK_2026_2321_rvusg (Batch 9)

## Scope

- Created `libs/backend/usage-analytics/src/lib/review-lane-spend.spec.ts` (9 tests, real SQLite ledger via `SessionStoreDatabase` + `SessionStatsRepository`, real `UsageAnalyticsService` and `RepositoryIdentityBackfillService`; a stub Codex `UsageSource` that applies the production `workspaceMatches` filter).
- `review-usage.acceptance.spec.ts` was NOT created: the audit found every AC row already covered by the B1-B8 specs (below), so a gap spec would only duplicate them.
- No production code changed. `lane-plan-limits-rpc.handlers.spec.ts` untouched.

## AC to spec mapping

| AC | Spec (file : test) |
| --- | --- |
| 1.1, 1.3 | `apps/ptah-electron/.../review-lane-gateway.spec.ts` (`ReviewLaneGateway lane usage`); `review-lane.runner.spec.ts` (`lane run usage`) |
| 1.2, 1.4, 1.5 | same two specs; `sqlite-review.repository.spec.ts` (`lane run usage`: begin + save(null) gives `runs: []`) |
| 1.6, 7.2 | `lens-stage.runner.spec.ts` (`... lane usage and abort (M6) on in-memory SQLite`: rejecting gateway, pre-selection throw) |
| 2.1-2.4, 7.5 | `sqlite-review.repository.spec.ts`, `review-query.repository.spec.ts` (`lane usage on runs and stages`, pre-change fixtures) |
| 2.2 | `review-query.repository.spec.ts` (resume skip counted once); `lens-stage.runner.spec.ts` (resume after abort sums 2 runs) |
| 3.1-3.7 | `review-usage-total.spec.ts` (12 cases) |
| 4.1-4.4 | `review-usage-format.spec.ts`, `review-run-detail.component.spec.ts` |
| 4.5 | NOT automated: manual Electron screenshots (D6), by the orchestrator |
| 5.1-5.4 | `review-markdown.renderer.spec.ts` (5 new tests) |
| 6.1 | `review-lane-gateway.spec.ts` (two folders); `review-lane-spend.spec.ts` : "shows nothing for a second registered folder B", "reports one session, one message and one top session" |
| 6.2 (F4) | `agent-namespace.builder.spec.ts`, `agent-lane-resume.service.spec.ts`, `lane-completion-outcome.spec.ts` |
| 6.2, 6.3 | `review-lane-spend.spec.ts` : "counts the lane turn once in folder A across ledger, replay and disk paths"; reconciler block (3 tests: key-owner guard rejects same-key replay; replay rewrite at revision 2 + `requestFinalization` still counts once; identical live event re-recorded counts once) |
| 6.4 | `review-lane-spend.spec.ts` : "keeps an unpriced lane turn unpriced" (`costUsd: null`, top session `unpriced: true`) |
| 6.5 | `review-lane-spend.spec.ts` : "puts a row keyed only with the attempt root in neither folder" |
| P6 / S2 | `review-lane-spend.spec.ts` : "lists the turn once under repositories after the backfill resolves folder A" |
| 6.6 | Documented check: `lane-plan-limits-rpc.handlers.ts` contains no reference to `SessionStatsRepository` / usage-analytics (grep, no match); its spec is unchanged |
| 7.1, 7.3, 7.4, 7.6 | `lens-stage.runner.spec.ts`, `verification-stage.runner.spec.ts`, `review-orchestrator.service.spec.ts` (M6 blocks) |
| 7.7 | `sqlite-review.repository.spec.ts` (F5/A7), `review-query.repository.spec.ts` (begin then `reconcileExpiredLeases`) |
| 8.1 | `review-lane-listing.service.spec.ts` |
| 8.2-8.4 | `review-lane-options.spec.ts` |
| 8.5 | `review-lane-selection*.spec.ts` unchanged |
| NFR (a), (b) | `review-stage-lane-record.spec.ts`, `review-query.repository.spec.ts` (pre-change schema copies) |

S4: no count assertions for non-SDK lanes. The spend spec asserts `sessionCount`/`messageCount` only for the seeded single `cli-lane` ledger row (that is A10 as specified), not for CLI adapters.

## Execution

- `node scripts/verify.mjs --exec --task b9-jest -- npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/review-lane-spend.spec.ts`: 9 passed, 0 failed (log `.ptah/tmp/b9-jest-usage.log`). First run failed to compile (`topSessions` optional in the type); fixed in the spec with `?.`.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.spec.json`: exit 0.
- `npx eslint` on the new spec: exit 0.
- review-core tsc/jest not re-run: no review-core file was changed by this batch.

## Verdict

- Proven: 6.1-6.5, P6/S2, A10 (single count across ledger, replay and Codex disk paths) on a real ledger.
- Not automated: 4.5 (manual screenshots), 6.6 (documented grep check only).
- Production defects found: none.
- Notes: the reconciler risk is exercised through the repository write guard (same session + event key from another producer is rejected; a differently keyed replay lands under the attempt root, outside A and B). The real `ClaudeJsonlUsageCollector`/Codex rollout reader are not driven end to end; the replay rows are seeded directly with the keys those producers use.
