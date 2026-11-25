# Lane brief — G-Onb-Cards-Unmatched (W10, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Note: the `angular-frontend-patterns` skill is disabled for model invocation here. Follow the
patterns of the neighbor components (standalone, OnPush, signal `input`/`output`, ptah tokens).

## Objective
Make the Install candidate card and the unmatched-stack list fit the judged skills step:
1. `FO proposal/skill-pick-card.component{.ts,.html,.spec.ts}` (Install verdict card):
   R22 compact card (name, source, one-line description, covers badges and ONE line of reason; the
   full reason and the script note open on demand), F24 word/hyphen-only wrapping and an
   always-contained native "More" button, R19 unique description id per rendering. Keep the
   unjudged team-builder use of this card working (same inputs stay valid; new inputs optional).
2. `FO proposal/unmatched-stack-list.component{.ts,.html,.spec.ts}`: the judged-mode behavior
   that plan section 9 and the 3.7 matrix assign to it (R16 authoritative item rows; items with a
   Build verdict or no verdict; manual draft opener output). Keep today's unjudged behavior.
Every state, count, reason and action of the earlier design stays reachable (R22 changes density,
not content).

## Write files (only these 6)
M: FO proposal/skill-pick-card.component.ts, .html, .spec.ts;
FO proposal/unmatched-stack-list.component.ts, .html, .spec.ts. Do not edit any other file.

## Read set (line ranges only)
- TF/implementation-plan.md lines 175-206 (section 9; rows F22, F24 and the MODIFY line 204),
  474-558 (3.6; only the parts that name skill-pick-card or unmatched-stack-list, e.g. line 550),
  559-582 (3.7 rows that name your files, R16 and R22 rows). Never read the plan in full.
- TF/decisions.md lines 40-105 (R13-R23; R16, R19, R22 apply).
- TF/design-spec.md section 14 (line 238 to end). TF/prototype/README.md. NEVER open
  TF/prototype/index.html.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (SkillJudgeItem, verdicts, reasons).
- FO proposal/skill-build-row.component.ts (new neighbor with the same F24 "More" pattern; read
  only) and the current files of your group.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree. Other lanes edit other onboarding files at the same time
(the store and the coverage strip): a tsc error in a file you do not own is not yours; report it.

## Acceptance
- Specs cover: compact card fields, one-line reason with "More" reveal of the full reason and the
  script note, unique description ids for two renderings, unjudged card unchanged, unmatched list
  judged rows and the manual draft output.
- New inputs/outputs listed in the report under "Contract for G-Onb-Review".
- No `any`. Accessible names; aria-expanded on "More".

**Deliverable**: TF/batch-G-Onb-Cards-Unmatched-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
