# Fix brief — P2 review slice A, fix F-A1 (TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
P = libs/frontend/onboarding/src/lib/proposal/
Review: TF/code-logic-review-p2-A.md (read findings 1, 3, 4, 6 in full).

## Fix these findings
1. **Finding 1 (Blocking), store part.** `P stack-skill.store.ts:597`: `applyRecommendationResult`
   must not drop a dirty or busy draft. New contract (D40, binding; another lane codes the page
   against it now):
   `applyRecommendationResult(result, options?: { discardDirtyDraft?: boolean }): RecommendationApplyResult`
   with `export type RecommendationApplyResult = { status: 'ok' } | { status: 'busy' } | { status: 'confirm-dirty' }`
   in `P stack-coverage.ts`. 'busy' = a draft Create or preview generation is in flight: change
   nothing. 'confirm-dirty' = an open dirty draft and no `discardDirtyDraft: true`: change nothing.
   Otherwise apply as today and return 'ok'. Update existing callers in your files and specs.
2. **Finding 3 (Major).** "N more candidates - Show all" must reveal what it counts: give the
   disclosure its own action that resets BOTH the verdict filter and the active stack-item filter
   (`P skill-verdict-filter.component.ts:75` new output, e.g. `showAllRequested`; store method,
   e.g. `showAllCandidates()`; wire it in `P stack-skill-review.component.html/.ts`). Add a
   two-filter integration assertion.
3. **Finding 4 (Major).** A candidate installed for one item and rejected for another keeps both
   facts: carry item-qualified rejection reasons (`P stack-coverage.ts:570,585`,
   `P stack-skill.store.ts:414`) and show each rejection on the affected item's row or in the card
   disclosure (`P stack-skill-review.component.html:226`). Cover a shared candidate with different
   judgments in one fixture.
4. **Finding 6 (Minor).** `P stack-skill.store.ts:1011`: require a nonblank receipt path before
   recording completion; on an incomplete receipt keep the draft and its edits and show an error.
   Update the spec at `P stack-coverage.spec.ts:786`.

## Write files (only these)
P stack-skill.store.ts, P stack-coverage.ts, P stack-coverage.spec.ts,
P skill-verdict-filter.component.ts, P skill-verdict-filter.component.spec.ts,
P stack-skill-review.component.ts, .html, .spec.ts.
Another lane edits `libs/frontend/onboarding/src/lib/analyze/*.page.ts` now, and a third lane
edits the rail and the coverage strip: do not touch those files.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-verdict-filter.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` (errors in the analyze
  pages may come from the parallel lane: report them, do not fix them)
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

**Deliverable**: TF/batch-fix-p2-A1-report.md (skeleton first; per finding: change, file:line,
test). Reply `WROTE: <absolute path>` plus one headline line.
