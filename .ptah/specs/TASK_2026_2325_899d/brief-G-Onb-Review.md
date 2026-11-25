# Lane brief — G-Onb-Review (W11, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Note: the `angular-frontend-patterns` skill is disabled for model invocation here. Follow the
patterns of the neighbor components (standalone, OnPush, signals, ptah tokens).

## Objective
Wire the judged skills step in `FO proposal/stack-skill-review.component{.ts,.html,.css}` and
CREATE its spec `stack-skill-review.component.spec.ts`. In judged mode the review uses the new
parts; in unjudged team-builder mode it keeps today's behavior and markup.
1. Judged layout (plan 3.6): `.skills-layout--judged`, `[data-layout="bar"]` rail, full-width
   compact grid (R22: no narrow centered column; at 1100 px wide about 8 Install and 3 Build rows
   in 1.5 window heights; at 1400 px or more the grid adds columns; the rail stays sticky).
2. Use the store API (StackSkillStore): coverage strip <- `stackCoverage()`/`activeItemId()`;
   verdict filter <- `verdictFilter()`, `verdictFilterOptions()`, `hiddenPoolCandidateCount()`;
   item rows <- `visibleItemRows()`, Build rows <- `visibleProposals()` (open draft pinned, F30);
   "Other candidates" only when `showOtherCandidatesSection()` (R16).
3. Install cards (`skill-pick-card`): bind `compact`, `reason`, `scriptNote` (SkillShEntry has no
   script data; derive the note from the judge item, or omit it when unknown).
4. Build rows (`skill-build-row`) and the draft preview (`skill-draft-preview`): controlled by the
   store — `openDraft()`, `[usedSlugs]="store.createdSkillSlugs()"` (C5), `setDraftMode(...)`,
   `updateDraftFields(...)`. Disable "Preview draft" and "Write a skill by hand" and show
   `draftBlockedReason()` when non-null (F29). Return focus to the opener after Create or Cancel.
   Emit outputs for the RPC actions (preview generation, create) to the page; the page
   (G-Onb-Pages) calls the RPCs. Do not inject RPC services here unless the current component
   already does.
5. Method banner, not-judged rows (`manualDraftRequested` runs the F29 consent guard, the R18
   dirty-draft confirmation, then the store's draft opener), unmatched list (`judgedItems`,
   `draftBlockedReason`, `manualDraftRequested`).
6. Rail: `[layout]="judgedMode() ? 'bar' : 'rail'"`, `[responsive]="!judgedMode()"`,
   `[installBlockedReason]="store.installBlockedReason()"`.
Every state, count, reason and action of the earlier design stays reachable.

## Contracts (read these sections; do not re-derive)
- TF/batch-G-Onb-Store-Coverage-report.md: "Store API" (line 45 on) and "Open Items" (Review bullets).
- TF/batch-G-Onb-Build-Draft-report.md: "Contract for G-Onb-Review".
- TF/batch-G-Onb-Judge-Parts-report.md: "Open items" (wiring contracts).
- TF/batch-G-Onb-Cards-Unmatched-report.md and TF/batch-G-Onb-Rail-report.md: contract sections.

## Write files (only these 4)
M: FO proposal/stack-skill-review.component.ts, .html, .css; C: FO proposal/stack-skill-review.component.spec.ts.
Do not edit the parts, the store or the pages. Report each change they need.

## Read set (line ranges only)
- TF/implementation-plan.md lines 175-206 (section 9), 474-558 (3.6 grid areas, sticky block,
  `.skills-layout--judged`, line 555 test), 559-582 (3.7 matrix: every row that names
  `stack-skill-review`). Never read the plan in full.
- TF/decisions.md lines 40-105 (R13-R23). TF/design-spec.md sections 3 B (lines 35-62) and 14
  (line 238 to end). TF/prototype/README.md. NEVER open TF/prototype/index.html.
- The 4 write files and the public inputs/outputs of the parts (read the component .ts only).

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree. `team-builder-skill-review.component.spec.ts` must stay green
without edits (unjudged parity).

## Acceptance
- New spec asserts `.skills-layout--judged` and `[data-layout="bar"]` in judged mode vs the
  unjudged layout (plan line 555), filter + pinned open draft, Other candidates predicate, F29
  blocked reasons, C5 `usedSlugs` binding, focus return.
- Outputs for G-Onb-Pages listed in the report under "Contract for G-Onb-Pages". No `any`.

**Deliverable**: TF/batch-G-Onb-Review-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
