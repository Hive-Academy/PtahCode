# Batch CR-C Revision 1 Report — TASK_2026_2325_899d

Fixes for the two Moderate findings from `code-logic-review-cr-C.md` (PR #1514, onboarding Angular UI).

> **Tool & skill availability note**: `angular-frontend-patterns` is not listed in this host's available skill catalogue, so edits followed the repository's existing standalone Angular signals conventions. `ptah_code_search_symbols` returned 0 hits (`symbolCount: 0`, empty index), so a single targeted `grep` in `libs/frontend/onboarding/src` was used as fallback to verify callers. `ptah_get_diagnostics` ran cleanly on the first scoped check of all 8 edited files (0 errors in the 4 production files; caught a `TestBed.overrideProvider` typing error in the new spec), and hit its 1024 MB memory cap on the follow-up single-spec check, which was verified by Jest (`ts-jest`), `npx tsc --noEmit`, and `npx eslint`.

## Summary

| Defect | Fix Files:Lines | Spec Added |
| --- | --- | --- |
| Moderate 1 — Late initial saved-list reply overwriting post-rerun list (`Minor 3`) | `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts:55,120-130,177`; `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:536,829-849` | `analysis-step.store.spec.ts`: `keeps the newer saved list when an older listAnalyses reply settles late`, `drops a late saved-list reply after workspace reset`; `analyze-workspace.page.spec.ts`: `keeps the post-rerun saved list when the initial rerun=1 list reply arrives late`, `ignores a late initial saved-list failure on rerun=1 after the post-rerun list succeeds` |
| Moderate 2 — Hidden-candidate count ignoring pinned draft row (`Minor 8`) | `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:616-663`; `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts:453-464` | `stack-coverage.spec.ts`: `excludes candidates already rendered through a pinned draft row from the hidden count`; `stack-skill-review.component.spec.ts`: `does not show Show-all while a pinned draft row keeps the sole Install card visible` |

No `data-testid` or `aria-*` attributes changed. Existing CR-C fixes, Minor 8 unpinned behavior, and Trivial 2 evidence indexing remain intact.

## PR thread replies

- **Minor 3 (`analyze-workspace.page.ts:703-704`)**: Fixed. On `rerun=1`, `ngOnInit()` starts `loadSaved()` beside `refreshSetupModel()` without waiting for Setup readiness. Both `AnalysisStepStore.listAnalyses()` and `AnalyzeWorkspacePage.loadSaved()` check a request sequence number, so only the newest request updates the saved list or error state. Added regression specs in `analysis-step.store.spec.ts` and `analyze-workspace.page.spec.ts` for late older success and failure replies.
- **Minor 8 (`stack-coverage.ts:643`)**: Fixed. `computeHiddenPoolCandidateCount` now counts visible candidates from the same `visibleItemRows()` and `residualCandidates()` lists that the view renders, including pinned draft rows. The unscoped `All` filter still returns zero, and a visible pinned Install card is no longer counted as hidden. Added store and component regression specs in `stack-coverage.spec.ts` and `stack-skill-review.component.spec.ts`.

## Checks run

| Check | Command | Result |
| --- | --- | --- |
| Jest (all specs of touched files) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` | PASS — 5 suites passed, 90/90 tests passed (log: `.ptah/tmp/cr-c2-jest.log`) |
| Typecheck (onboarding lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | PASS — exit 0 (log: `.ptah/tmp/cr-c2-tsc.log`) |
| ESLint (all 8 changed files) | `npx eslint libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` | PASS — exit 0, 0 errors, 17 pre-existing warnings (log: `.ptah/tmp/cr-c2-eslint.log`) |
| UI class audit | `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` | PASS — exit 0, `0 token count(s) over baseline` (log: `.ptah/tmp/cr-c2-ui-audit.log`) |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | PASS — exit 0, `TOTAL 0 unsuppressed site(s)` (log: `.ptah/tmp/cr-c2-deg-audit.log`) |
| Diagnostics (`ptah_get_diagnostics`) | Scoped to 8 edited `.ts` files, then follow-up on `analyze-workspace.page.spec.ts` | First run: 0 errors in production files; caught and fixed `overrideProvider` spec typing error. Follow-up hit 1024 MB cap; covered by Jest + `tsc --noEmit` + `eslint`. |

## Decisions

1. **Saved-list latest-request guard placement (`analysis-step.store.ts`, `analyze-workspace.page.ts`)**
   - **Decision**: Guard list writes with `listRevision` inside `AnalysisStepStore.listAnalyses()` (also incremented in `resetForWorkspace()`) and guard `savedError` / `pendingAnalysis` with `savedRequestSeq` inside `AnalyzeWorkspacePage.loadSaved()`, keeping `listAnalyses(): Promise<void>`.
   - **Options**: (a) Sequence guard in both store and page while preserving `Promise<void>`; (b) Change `listAnalyses()` to return `'loaded' | 'superseded'` and handle error state inside the store.
   - **Evidence**: Matches the store's existing `selectionRevision` pattern (`analysis-step.store.ts:56,146,178`), matches the page's existing `setupRequestSeq` pattern (`analyze-workspace.page.ts:535`), and preserves compatibility with all existing store mocks (`mockResolvedValue(undefined)`).
   - **Reversible**: Yes.

2. **Hidden-candidate visibility source (`stack-coverage.ts`, `stack-skill.store.ts`)**
   - **Decision**: Pass `this.visibleItemRows()` and `this.showOtherCandidatesSection() ? this.residualCandidates() : []` from `StackSkillStore.hiddenPoolCandidateCount` into `computeHiddenPoolCandidateCount`, removing duplicated item-filtering logic from the helper.
   - **Options**: (a) Pass `visibleItemRows()` and `residualCandidates()` directly so the count uses the renderer's exact visibility source; (b) Pass `openDraft` into `computeHiddenPoolCandidateCount` and re-derive row pinning inside the helper.
   - **Evidence**: `computeHiddenPoolCandidateCount` is internal to `libs/frontend/onboarding/src/lib/proposal/` (not exported from `index.ts`) and has one caller (`StackSkillStore`). Passing `visibleItemRows()` and `residualCandidates()` guarantees parity with `StackSkillReviewComponent.installCards()`, not-judged candidate cards (`stack-skill-review.component.html:238-256`), and the `Other candidates` section (`stack-skill-review.component.html:302-324`).
   - **Reversible**: Yes.
