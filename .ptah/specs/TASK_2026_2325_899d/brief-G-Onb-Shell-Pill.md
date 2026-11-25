# Lane brief — G-Onb-Shell-Pill (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/

## Objective
Show the Setup provider/model pair of the current onboarding run in the run pill (design-spec 3.1,
decisions D4/D6/D7): the pill shows the pair snapshot that the run uses (`ModelPair` from
`@ptah-extension/shared`), not the chat model. Keep the current pill behavior for runs without a
pair.

## Write files (only these 3)
M: FO shell/onboarding-run-pill.service.ts, FO shell/onboarding-shell.component.ts,
FO shell/onboarding-shell.component.spec.ts.

## Read set (line ranges only)
- TF/design-spec.md section 3.1 (lines 63-76) and section 14 (line 238 to end).
- TF/implementation-plan.md lines 175-206 (section 9; search `run-pill` and `shell`). Never read
  the plan in full.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (ModelPair, SetupPairState).
- The 3 write files.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Other lanes edit
other onboarding files at the same time: a tsc error in a file you do not own is not yours; report it.

## Acceptance
- Spec: the pill shows "provider / model" of the run pair; without a pair it keeps today's text.
- No `any`.

**Deliverable**: TF/batch-G-Onb-Shell-Pill-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
