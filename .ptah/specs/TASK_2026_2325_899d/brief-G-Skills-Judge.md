# Lane brief — G-Skills-Judge (W6, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Objective
Create the skill judge service: the rewrite of `SkillRankingService` that produces a
`SkillJudgeResult` per request (install vs build per detected stack item, with reasons).
Pipeline: pre-filter deprecated -> Decision stage (`SkillRankingCallerService`, optional) ->
Normal stage on the Setup pair (`HarnessLlmRunner`) for every unresolved item -> per-item
validation -> semantic Build `proposalRef` grouping. Do not delete or edit the old
`skill-ranking*` files (G-Skills-Ranking-Delete owns that). Do not touch DI (G-Skills-Rec-And-DI
owns `register.ts`, `tokens.ts`, `index.ts` and the recommendation service).

## Write files (only these; RH = libs/backend/rpc-handlers/src/lib/)
C: RH skills-sh/services/skill-judge.types.ts, skill-judge.schema.ts, skill-judge.service.ts,
skill-judge.service.spec.ts

## Read set
- TF/implementation-plan.md lines 36-60 (shared contract), 110-130 (section 4), 223-234 (test
  matrix), 385-450 (3.3 seam and 3.4 schema, validation, grouping, verification). Search the
  plan for `G-Skills-Judge`. Do not read the plan in full.
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts (use these types; no redefinition).
- RH skills-sh/services/skill-ranking.service.ts, .schema.ts, .types.ts (the code you replace;
  keep its inputs and deprecated pre-filter rule).
- RH skills-sh/services/skill-json-extract.ts, RH harness/ai/harness-llm-runner.service.ts
  (runner contract), RH skills-sh/services/skill-draft-generation.service.ts (an example of a
  service on the Setup pair: resolveSetup, runner snapshot, categories).
- libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.types.ts and
  .service.ts (Decision stage result; G-Lane-Routing-SkillCaller just changed them, read its
  report TF/batch-G-Lane-Routing-SkillCaller-report.md).
- libs/backend/agent-sdk/src/lib/internal-query/internal-query.types.ts (for
  `InternalQueryQueueTimeoutError`).

## Contract notes (binding, from earlier batches)
- The dispatch hook is `onProviderSubmit(submitted: ModelPair)` (plan name
  `onProviderDispatch` is not used).
- `terminal` is optional. A stream that ends without an SDK result gives
  `{ structuredOutput: null }` and no `terminal`. Success attribution requires
  `terminal?.kind === 'success'`.
- Use the typed `InternalQueryQueueTimeoutError` for `queue-timed-out`. When an outer timer
  wins, a missing `pairAttempted` alone cannot separate slot wait from SDK preparation:
  classify it as `timed-out` with no `pairAttempted`, not `queue-timed-out`.
- The strict Setup model identity check stays in `buildSetupProfile`; do not add alias
  checks here.
- Fixed user-facing messages per category. Keep raw provider errors out of the result.

## Tests (skill-judge.service.spec.ts)
Use the plan line 129 and 446 setup (fake decision caller + REAL `HarnessLlmRunner` + REAL
`SdkStreamProcessor` over a fake `InternalQueryService`). Include the test name from plan line
412 (`pre-dispatch-error vs post-dispatch tim...`, copy it exactly) and the cases of the test
matrix (lines 223-234) that name the Normal judge.

## Checks (lane only)
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — two known errors
  are expected and not yours: `handlers/setup-rpc.handlers.ts:647` and
  `skills-sh/services/skill-recommendation.service.ts:304` (TS2739, missing `judge` /
  `analysisPair`). Any other error in your files must be fixed.
- `npx eslint <changed files>`
Never `npm run verify` or `nx`. Never commit or push.

**Deliverable**: TF/batch-G-Skills-Judge-report.md (skeleton first). Include in "open items"
the exact wiring that G-Skills-Rec-And-DI needs (class, token name, injected tokens).
Reply: `WROTE: <absolute path>` plus one headline line.

## Added after G-Lane-Routing-SkillCaller (commit 08963872c, D26)
- Call `rankSkillCandidates(items, rpcEntry)` with the original RPC entry timestamp, project
  evidence, registry state, stable candidate IDs in `label`, and candidate deprecation flags.
- Map `itemRejections` keys to the Decision stage `invalidItemIds`. Every item absent from
  `items` stays eligible for the Normal stage. Apply accepted Install outcomes and candidate
  rejection reasons, plus the plan default for unselected eligible candidates.
- Native System One answers have no reason field, so its Install picks fall through to Normal.
  This is intended (D26). Do not invent reasons.
