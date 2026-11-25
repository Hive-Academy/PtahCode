# Lane brief — G-Onb-Rail (W10, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Note: the `angular-frontend-patterns` skill is disabled for model invocation here. Follow the
patterns of the neighbor components (standalone, OnPush, signal `input`/`output`, ptah tokens).

## Objective
Update the skill selection rail `FO proposal/skill-selection-rail.component{.ts,.html,.css,.spec.ts}`
for the judged skills step:
1. Accept `installBlockedReason = input<string | null>(null)` (from
   `StackSkillStore.installBlockedReason()`, text "Finish or cancel the open skill draft before
   installing"). While it is non-null, Install is disabled and the reason is visible and linked to
   the button (aria-describedby). R20: rail Install disabled while the draft editor is open. F29/R17.
2. R22: the rail stays sticky. Apply the 3.6 sticky containing block and the judged grid-area rules
   that name the rail (plan 3.6, lines 474-558; search `rail` and `sticky` in that range).
3. Keep the unjudged team-builder use of the rail working (new inputs optional, defaults keep
   today's behavior).

## Write files (only these 4)
M: FO proposal/skill-selection-rail.component.ts, .html, .css, .spec.ts. Do not edit any other
file (the review component owns the grid container; report any change it needs).

## Read set (line ranges only)
- TF/implementation-plan.md lines 474-558 (3.6, parts that name the rail / sticky / grid areas),
  559-582 (3.7 rows that name the rail, e.g. R17/F29). Never read the plan in full.
- TF/decisions.md lines 40-105 (R17, R20, R22).
- TF/batch-G-Onb-Store-Coverage-report.md section "Store API" (line 45 on) and "Open Items"
  (the G-Onb-Rail bullet).
- TF/design-spec.md section 14 (line 238 to end). TF/prototype/README.md. NEVER open
  TF/prototype/index.html.
- The 4 write files.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

## Acceptance
- Spec: Install disabled + visible reason when `installBlockedReason` is set; enabled and no reason
  when null; unjudged defaults unchanged; sticky class/attribute present per 3.6.
- New inputs listed in the report under "Contract for G-Onb-Review". No `any`.

**Deliverable**: TF/batch-G-Onb-Rail-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
