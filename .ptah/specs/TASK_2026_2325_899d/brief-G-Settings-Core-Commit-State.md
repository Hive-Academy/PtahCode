# Lane brief — G-Settings-Core-Commit-State (W10, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FC = libs/frontend/core/src/lib/services/

## Objective
Add the Setup pair commit and state logic for the Settings "Background models" Setup row:
1. `FC providers-commit.service{.ts,.spec.ts}`: commit the Setup pair through
   `wizard:set-setup-model` (one atomic write of provider + model; clear = explicit empty pair),
   apply the receipt, keep the `commitSeq` order (a slower older save never overwrites a newer
   commit), overlapping-save-safe Undo (plan 3.2 + Coordinator amendment C1: the store return
   contract, `commitSetupPair` receipt, `commitSeq`, UI out-of-order and Undo contract stay binding).
2. `FC providers-settings-state.service{.ts,.spec.ts}`: hold the Setup row state
   (`ProvidersSetupRowState`, `ProvidersSetupUndoEntry` already exist in
   `FC providers-settings.types.ts`), load it with `wizard:get-setup-model`, map typed errors
   (`SETUP_MODEL_INVALID`) to a UI-safe state. No raw provider errors in UI state.
Follow the existing patterns of these two services for the other background-model rows.

## Write files (only these 4)
M: FC providers-commit.service.ts, .spec.ts; FC providers-settings-state.service.ts, .spec.ts.
Do not edit `providers-settings.types.ts` or any other file; report a needed type change instead.

## Read set (line ranges only)
- TF/implementation-plan.md lines 169-174 (section 8), 354-384 (3.2), 671 to end (C1). Search
  the plan for `commitSetupPair` and `commitSeq`. Never read the plan in full.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts and rpc-setup.types.ts (setup RPC
  params/results), rpc-error-codes.types.ts (SETUP_MODEL_INVALID).
- FC providers-settings.types.ts (the two new Setup types at the end of the file).
- The 4 write files.

## Checks (focused only)
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-commit.service.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts`
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

## Acceptance
- Specs cover: set, clear (explicit empty pair, `committed === null`), out-of-order receipts
  (older `commitSeq` ignored), Undo after overlapping saves, invalid pair error state, load.
- The public API for G-Settings-UI is listed in the report (method and signal names with types).
- No `any`.

**Deliverable**: TF/batch-G-Settings-Core-Commit-State-report.md (skeleton first, then fill;
sections per lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
