# Lane brief — G-Onb-Judge-Parts (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Load the `angular-frontend-patterns` skill before you write code (signals, OnPush, standalone).

## Objective
Create three small presentational components of the judged skills step (inputs/outputs only, no
store injection; G-Onb-Review wires them later):
1. `FO proposal/skill-method-banner.component{.ts,.spec.ts}`: the method banner "Judged by AI ..."
   (which pair judged, Decision vs Normal stage, fallback disclosure). R22: one line by default,
   details collapsed behind a disclosure button (aria-expanded).
2. `FO proposal/skill-verdict-filter.component{.ts,.spec.ts}`: verdict filter (All / Install /
   Build / Not judged ...) with counts, F28 `"N more candidates - Show all"` (N = distinct hidden
   pool candidates, given as an input).
3. `FO proposal/skill-not-judged-row.component{.ts,.spec.ts}`: row for an item that the judge did
   not decide (no-judge, both-failed, TD 4.4 search-failure disclosure), with its recovery action
   as an output.

## Write files (only these 6, all CREATE; inline templates and styles)
FO proposal/skill-method-banner.component.ts, .spec.ts; FO proposal/skill-verdict-filter.component.ts,
.spec.ts; FO proposal/skill-not-judged-row.component.ts, .spec.ts. Do not edit index.ts or any
other file; report the needed exports.

## Read set (line ranges only)
- TF/implementation-plan.md lines 175-206 (section 9; rows F23, F28 name your files), 559-582
  (3.7 matrix rows that name your files, e.g. "No-judge, both-failed"). Never read the plan in full.
- TF/decisions.md lines 40-105 (R13-R23). TF/design-spec.md sections 3.1-3.6 (lines 63-112), 8
  (copy, line 161) and 14 (line 238 to end). TF/prototype/README.md. NEVER open
  TF/prototype/index.html.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (judge result, stage, verdict types).
- FO proposal/skill-pick-card.component.ts (neighbor style; read only).

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <your 3 specs>`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Other lanes edit
other onboarding files at the same time: a tsc error in a file you do not own is not yours; report it.

## Acceptance
- Each spec covers its rows of the plan, the collapsed/expanded banner, filter counts and the F28
  count text, and each not-judged variant with its action.
- No `any`. Accessible names, keyboard reachable controls, unique ids per rendering (R19).

**Deliverable**: TF/batch-G-Onb-Judge-Parts-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
