# Fix brief — P2 review slice B2 (TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
P = libs/frontend/onboarding/src/lib/proposal/
Review: TF/code-logic-review-p2-B2.md, section "## Findings" (6 findings, each with a suggested
fix). Fix ALL six as the review suggests (decision D42):
1. Major: `applyRecommendationResult` (only on status 'ok') also clears prior-run item search
   results, retained search results and custom selection keys. Spec: Re-run after an item search
   shows no stale cards, totals or "available" counts.
2. Major: `beginRetryDraftGeneration` after "Discard edits" resets name/description/body to the
   proposal defaults, so a second failure cannot keep discarded edits with `dirty: false`.
3. Minor: `analyze/project-skill-draft.component.ts:92-95` requires a nonblank `skillPath`;
   otherwise keep the draft and show the inline error. Spec: empty and whitespace receipts.
4. Minor: Preview and Create normalize `name` and `description` the same way (byte equality,
   plan 3.5): trim in one place used by both the preview serialization and `beginCreateDraft`.
5. Minor: pass created-item state to `unmatched-stack-list` and `skill-not-judged-row` so their
   "Write a skill by hand" opener is `aria-disabled="true"` (still focusable) after creation.
6. Minor: `stack-coverage-strip.component.ts:92-101` resets `expandedState` only when the ordered
   item-key signature changes, not on every new array.

## Write files (only these)
P stack-skill.store.ts, P stack-coverage.spec.ts, P skill-draft-preview.component.ts, .spec.ts,
P stack-skill-review.component.ts, .html, .spec.ts, P unmatched-stack-list.component.ts, .html,
.spec.ts, P skill-not-judged-row.component.ts, .spec.ts, P stack-coverage-strip.component.ts,
.spec.ts, libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts, .spec.ts.
Do NOT edit `analyze/analyze-skills.page.ts` / `.spec.ts` (another lane edits them now) or any
core/chat file (a third lane edits those). Do not change the D40 signature of
`applyRecommendationResult`.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <the specs of your write files> libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` (errors in the analyze
  page come from the parallel lane: report them, do not fix them)
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

**Deliverable**: TF/batch-fix-p2-B2-report.md (skeleton first; per finding: change, file:line,
test; checks). Reply `WROTE: <absolute path>` plus one headline line.
