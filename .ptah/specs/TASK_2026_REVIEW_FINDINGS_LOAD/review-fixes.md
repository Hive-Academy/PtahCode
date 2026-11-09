# Review fixes — TASK_2026_REVIEW_FINDINGS_LOAD

Fixes for the three findings in [code-review.md](code-review.md). The Glm lane e120c1fa made the
code changes and exited without filling this file; the orchestrator wrote it from the diff and
its own verify run.

## 1. Major — stale same-attempt findings replies (store)

- `review-runs.store.ts`: private `findingsGeneration` counter. `loadFindings` takes a new
  generation; a reply or an error is applied only when the generation and `selectedAttemptId`
  both still match. `closeRun` increments the generation, so a reply after close is ignored.
- Tests (`review-runs.store.spec.ts`): two loads for the same run resolved in reverse order
  (older success and older rejection after a newer success), and close then reopen while a load
  is pending.

## 2. Minor — empty ready state reads as unavailable (findings table)

- `review-findings-table.component.ts:53`: the empty ready text is now
  "No accepted findings for this run." The error text "Findings are unavailable." stays only in
  the run-detail error state.
- Test: `review-findings-table.component.spec.ts:40`.

## 3. Minor — findings error state has no retry (run detail)

- `review-run-detail.component.ts:58,82`: a Retry button in the findings error state emits the
  new `retryFindings` output.
- `review-runs-page.component.ts:227`: binds `(retryFindings)` to the new public
  `store.reloadFindings()`, which reloads findings for the selected run and does nothing when no
  run is selected.
- Tests: `review-run-detail.component.spec.ts:88` (emits on click) and
  `review-runs.store.spec.ts` (`reloadFindings` calls `review:listFindings` again; no-op with
  no selection).

## Verification

- `npm run verify -- -p @ptah-extension/review-runs-ui`: exit 0. Lint/typecheck
  "2 tasks: 2 succeeded"; test "1 task: 1 succeeded" (Nx cache hit on the same inputs).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0.

## Decisions

- The Retry button uses the same DaisyUI `btn btn-ghost btn-sm` classes as the rest of this
  template. The migration to `ptahButton` belongs to the Reviews redesign (Phase C), not to this
  bug fix.
