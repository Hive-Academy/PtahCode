# Fix brief — P2 review slice C (TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
A = libs/frontend/onboarding/src/lib/analyze/
Review: TF/code-logic-review-p2-C.md, section "## Findings" (4 findings, each with a suggested
fix and file:line). Fix ALL four as the review suggests (decision D44):
1. Blocking: bind the post-result "Discard edits and apply" confirmation (`A analyze-skills.page.ts:655,798`)
   to the exact draft revision and fields, like the pre-run path at `:719`; refresh or dismiss it
   when its target draft changes; never pass `discardDirtyDraft: true` for a different draft.
   Spec: confirmation for draft A must not clear draft B.
2. Major: mark the restart pending BEFORE the first await (`:672`); while pending, gate consent
   preview and duplicate retries; never replace results or clear preview rows while consent or
   installation owns the selection. Spec with a deferred Setup read that drives Re-run and Install.
3. Major: `A analyze-workspace.page.ts:687,742`: a focus/init refresh must not overtake a pending
   "Use workspace model" write: queue refresh behind the write, or invalidate pre-commit reads
   and read again after the write settles; keep any write error visible. Spec: deferred clear +
   focus during it.
4. Major: `A analyze-workspace.page.ts:538,660,806`: gate Start, Continue and the `rerun=1` route
   intent on a settled, valid Setup pair before any run state changes; an initial read failure
   shows fixed recovery copy with Retry (no raw provider error). Specs: delayed invalid read,
   rejected read.

## Write files (only these 4)
A analyze-skills.page.ts, .spec.ts; A analyze-workspace.page.ts, .spec.ts. Do not edit the store
or other files; if a store change is needed, report it.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` and
  `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree. Another lane runs a read-only Electron visual review now.

**Deliverable**: TF/batch-fix-p2-C-report.md (skeleton first; per finding: change, file:line,
test; checks). Reply `WROTE: <absolute path>` plus one headline line.
