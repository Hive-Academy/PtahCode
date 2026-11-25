# Lane brief — G-Setup-RPC-Integration (W8, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Objective
Wire the backend into the Setup RPC surface. This group is the sole owner of
`setup-rpc.handlers.ts` and its spec. After it, rpc-handlers and ptah-electron typecheck with
ZERO errors.
1. Remove the `SkillRankingService` re-export (`setup-rpc.handlers.ts:94`) and the
   `SKILL_RANKING_SERVICE` references in `apps/ptah-electron/src/di/expected-resolvable.ts`.
   Do not delete the `skill-ranking*` files (G-Skills-Ranking-Delete does that next).
2. Add the Setup RPCs `wizard:get-setup-model` and `wizard:set-setup-model`.
3. Add `wizard:generate-skill-draft`: zod-validate and sanitize the input at the RPC boundary,
   then call `SkillDraftGenerationService.generateDraft(params, workspaceRoot)` (token
   `SKILL_DRAFT_GENERATION_SERVICE`, registered by W7).
4. `wizard:recommend-analysis-skills`: resolve Setup BEFORE the broad `try`; `invalid` /
   `unavailable` throws `RpcUserError(SETUP_MODEL_INVALID)`; rethrow any `RpcUserError` inside
   the `try`. `empty()` (around line 647) returns `analysisPair: null` and an empty `judge`
   (this fixes the known TS2739).
5. Wire the analysis Setup snapshot, and saved-analysis read failures as typed RPC errors.
6. Update the RPC allowlist spec and the Electron DI expectations / RPC surface spec for the
   new methods and tokens.

## Write files (only these)
M: libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts, setup-rpc.handlers.spec.ts,
libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts,
apps/ptah-electron/src/di/expected-resolvable.ts, apps/ptah-electron/src/di/rpc-surface.spec.ts

## Read set
- TF/implementation-plan.md lines 62-98 (section 2, Setup pair storage and resolver), 131-168
  (sections 5 and 7), 245, 349, 354-384 (3.2 RPC receipt vs effective state, read with
  Coordinator amendment C1 at the end of the file), 583-606 (3.8 saved-analysis read failures).
  Search the plan for `G-Setup-RPC-Integration`. Do not read the plan in full.
- TF/batch-G-Skills-Rec-And-DI-report.md, TF/batch-G-Skills-Draft-And-Fs-report.md,
  TF/batch-G-Analysis-Service-report.md, TF/batch-G-Runner-And-Extract-report.md (what each
  earlier group built and left for you).
- libs/shared/src/lib/types/rpc/rpc-setup.types.ts, rpc-skill-judge.types.ts,
  rpc-error-codes.types.ts; libs/shared/src/lib/types/rpc.types.ts (method maps).

## Checks (lane only)
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts`
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/rpc-surface.spec.ts`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` (zero errors)
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` (zero errors)
- `npx eslint <changed files>`
Never `npm run verify` or `nx`. Never build. Never commit or push.

**Deliverable**: TF/batch-G-Setup-RPC-Integration-report.md (skeleton first).
Reply: `WROTE: <absolute path>` plus one headline line.

## Added after W7 (D28)
- `AnalysisSkillRecommendationInput` fields `rpcEntry`, `resolved` and `analysisPair` are
  optional only for the interim. Always pass them: `rpcEntry = Date.now()` at RPC entry (same
  clock as the judge), the strict Setup resolution from before the registry search, and
  `analysisPair: saved.analysisPair ?? null`. Map Setup `invalid` / `unavailable` / timeout to
  `RpcUserError(SETUP_MODEL_INVALID)`.
- Read TF/batch-G-Skills-Rec-And-DI-report.md and batch-G-Skills-Rec-And-DI-revise1-report.md.
