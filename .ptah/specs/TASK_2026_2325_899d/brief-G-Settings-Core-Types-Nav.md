# Lane brief — G-Settings-Core-Types-Nav (W9, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FC = libs/frontend/core/src/lib/services/

## Objective
Small frontend core change for the new "Setup" row in Settings "Background models":
1. MODIFY `FC providers-settings.types.ts`: add the Setup consumer/row types that plan section 8
   names (lines 169-174) and Revision 3 split (line 341). Use the shared `ModelPair` and
   `SetupPairState` from `@ptah-extension/shared`; do not redefine them.
2. MODIFY `FC app-state.service.ts` + `.spec.ts`: add `'setup'` to `PendingSettingsTab.section`
   and make the deep-link gate in `app-state.service.ts` (about lines 126-142) accept it. The
   second gate in `libs/frontend/chat/src/lib/settings/settings.component.ts` belongs to a later
   group (G-Settings-UI): do not edit it; note it in the report.
3. R13/F27 (plan 3.7 row "blocked initial vs blocked restart", search `R13/F27`): implement only
   the part that names `app-state.service`.

## Write files (only these 3)
M: FC app-state.service.ts, FC app-state.service.spec.ts, FC providers-settings.types.ts.

## Read set (line ranges only)
- TF/implementation-plan.md lines 169-174 (section 8), line 341 (split), and the 3.7 row that
  contains `R13/F27`. Never read the plan in full.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (ModelPair, SetupPairState).
- FC app-state.service.ts (lines 100-160 first), FC providers-settings.types.ts.

## Checks (focused only)
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/app-state.service.spec.ts`
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

## Acceptance
- A deep link with section `'setup'` is kept as pending (spec test), other sections unchanged.
- New types exported where neighbor types are exported; no `any`.

**Deliverable**: TF/batch-G-Settings-Core-Types-Nav-report.md (skeleton first, then fill; sections
per lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
