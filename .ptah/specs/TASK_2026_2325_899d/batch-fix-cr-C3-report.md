# Batch CR-C Revision 2 Report — TASK_2026_2325_899d

Fix for the remaining Moderate finding from `code-logic-review-cr-C-rereview.md` (PR #1514, onboarding Angular UI).

> **Tool & skill availability note**: `angular-frontend-patterns` is not listed in this host's available skill catalogue, so edits followed the repository's existing standalone Angular signals conventions. `ptah_search_files` was used to locate proposal specs. `ptah_get_diagnostics` (scoped to the 3 edited `.ts` files) exceeded its 1024 MB memory limit, so type and lint verification were confirmed via `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`, Jest (`ts-jest`), and `npx eslint`.

## Summary

| Defect | Fix Files:Lines | Specs |
| --- | --- | --- |
| Moderate — Hidden-candidate count ignoring visible rows' `manualCandidates` (`Minor 8`) | `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:620-623,633-638,658-662` | `libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts:856-919` (`tracks visible row manualCandidates against the pool in hiddenPoolCandidateCount`); `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts:623-696` (`updates Show-all when per-item manual search renders or clears a pool candidate`) |

No `data-testid` or `aria-*` attributes changed. Existing CR-C and CR-C2 fixes remain intact.

## PR thread replies

- **Minor 8 (`stack-coverage.ts:616-671`)**: Fixed. `computeHiddenPoolCandidateCount` now counts visible pool candidates from the rendered `visibleItemRows()` and `residualCandidates()`, including pinned draft rows and each visible row's `manualCandidates` matched by canonical candidate ID. Non-pool search results do not change the count, and clearing per-item search results restores the hidden count. Added store and component regression specs in `stack-coverage.spec.ts` and `stack-skill-review.component.spec.ts`.

## Checks run

| Check | Command | Result |
| --- | --- | --- |
| Jest (touched proposal specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` | PASS — 2 suites passed, 47/47 tests passed (log: `.ptah/tmp/cr-c3-jest.log`) |
| Typecheck (onboarding lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | PASS — exit 0 (log: `.ptah/tmp/cr-c3-tsc.log`) |
| ESLint (3 changed files) | `npx eslint libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` | PASS — exit 0, 0 errors, 0 warnings (log: `.ptah/tmp/cr-c3-eslint.log`) |
| UI class audit | `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` | PASS — exit 0, `0 token count(s) over baseline` (log: `.ptah/tmp/cr-c3-ui-audit.log`) |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | PASS — exit 0, `TOTAL 0 unsuppressed site(s)` (log: `.ptah/tmp/cr-c3-deg-audit.log`) |
| Diagnostics (`ptah_get_diagnostics`) | Scoped to the 3 edited `.ts` files | Unavailable — exceeded 1024 MB memory cap; covered by `tsc --noEmit`, Jest (`ts-jest`), and `eslint`. |

## Decisions

1. **Include `row.manualCandidates` across all verdict filters (`stack-coverage.ts:658-662`)**
   - **Decision**: Iterate `row.manualCandidates` for every row in `visibleRows` without gating on `filter`, and widen `addIfInPool` to accept `string | Pick<SkillShEntry, 'source' | 'skillId'>` so canonical IDs match `poolIds` directly.
   - **Options**: (a) Always scan `row.manualCandidates` on all `visibleRows` and intersect with `poolIds`; (b) Gate `row.manualCandidates` on `filter === 'all'`.
   - **Evidence**: `stack-skill-review.component.html:214-290` renders `row.manualCandidates` as selectable `ptah-skill-pick-card` items for every visible row regardless of verdict or active `verdictFilter`. `StackSkillStore.hiddenPoolCandidateCount` already passes `this.visibleItemRows()`, which carries `manualCandidates`, so no store or component code changes were needed.
   - **Reversible**: Yes.
