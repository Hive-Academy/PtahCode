# Lane brief — G-Lane-Routing-SkillCaller (W3, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Objective
Make `SkillRankingCallerService.rankSkillCandidates` (Decision stage of the skill judge) return a
discriminated result with pair attribution, use the new dispatch seam of
G-Lane-Routing-Dispatch (commit 362f89a76, already merged with main PR #1511), and validate
Decision answers per item.

## Write files (only these; LR = libs/backend/lane-routing/src/lib/)
- LR decision-model/skill-ranking-caller.types.ts
- LR decision-model/skill-ranking-caller.service.ts
- LR decision-model/skill-ranking-caller.service.spec.ts

## Read set
- TF/implementation-plan.md lines 110-130 (section 4, Decision stage), 397-412 (3.3 seam),
  438-450 (3.4 Decision validation and rejection payload). Search the plan for
  `G-Lane-Routing-SkillCaller` for any other mention. Do not read the plan in full.
- TF/batch-G-Lane-Routing-Dispatch-report.md (what the seam provides).
- LR pipeline/phase-plan.ts (`OpenedCaller`, blocked variant `configuredPair`),
  LR pipeline/model-refine.ts (`runFixedRequest` with `signal`, `onProviderSubmit`),
  LR decision-model/decision-caller.ts, LR routing-constants.ts (lines 110-125).
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (shared judge contract; pair and
  category types). Use these types; do not redefine them.

## Contract (binding)
- Name: the hook is `onProviderSubmit(submitted: ModelPair)` (not `onProviderDispatch`).
- Run-local `decisionTrace` set before `runFixedRequest`. `onProviderSubmit` sets
  `pairAttempted = submitted`. `pairUsed` only on a successful response.
- `unset` selection -> `status: 'skipped'`, category `not-configured`, no pairs.
- `blocked` -> `status: 'failed'` with category (`unreachable` / `auth` / `provider-error`) and
  `pairConfigured` only.
- `sent: false` or failure before `onProviderSubmit` -> `pre-dispatch-error` with
  `pairConfigured` only. Post-submit timeout keeps `pairAttempted`, no `pairUsed`.
- Deadline-linked `AbortController.signal` passed to `runFixedRequest`. Cap:
  `min(now + 3_000, rpcEntry + 31_000)` per plan line 118 / routing-constants.
- Request carries `kind`, `name`, sanitized `evidence`, `registry`, non-deprecated candidates.
  The Decision answer is Install with a concise evidence-grounded reason, or `none`. Never
  Build, never `proposalRef`.
- Per-item validation (plan 3.4): unknown or ambiguous `candidateId`, conflicting answers for
  one item, deprecated candidate, missing or blank evidence/reason -> item rejected with a
  reason and left for the Normal stage. `none`, low confidence, omitted items -> unresolved.
- Keep raw provider error text out of the result (UI-facing).
- Keep existing callers of the service compiling. If a caller outside the write set breaks,
  report the needed change (G-Skills-Judge owns the rpc-handlers consumer).

## Tests (in skill-ranking-caller.service.spec.ts)
- `pre-dispatch fit/abort returns pre-dispatch-error with pairConfigured only; post-submit
  timeout retains pairAttempted without pairUsed` (exact name from plan line 411).
- unset -> skipped/not-configured; blocked -> failed with pairConfigured; success -> pairUsed;
  each validation rejection above.

## Checks (lane only)
- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
- `npx eslint <changed files>`
Never `npm run verify` or `nx`. Never commit or push.

**Deliverable**: TF/batch-G-Lane-Routing-SkillCaller-report.md (skeleton first).
Reply: `WROTE: <absolute path>` plus one headline line.
