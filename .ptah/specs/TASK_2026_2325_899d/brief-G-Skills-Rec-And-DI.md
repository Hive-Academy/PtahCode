# Lane brief — G-Skills-Rec-And-DI (W7, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d

## Objective
Make `SkillRecommendationService` build the full judge input (stable item identity, bounded
search, full candidate pool) and call the new `SkillJudgeService`, so it returns the complete
`WizardRecommendAnalysisSkillsResult` (with `judge` and `analysisPair`). Register
`SkillJudgeService` and `SkillDraftGenerationService` in the rpc-handlers DI and export them.
This group is the sole owner of the `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE`
tokens, registrations and exports.

## Write files (only these; RH = libs/backend/rpc-handlers/src/)
M: RH lib/skills-sh/services/skill-recommendation.service.ts, .service.spec.ts,
RH lib/skills-sh/services/index.ts, RH lib/di/tokens.ts, RH lib/di/register.ts, RH index.ts

Do NOT edit or delete the old `skill-ranking*` files (G-Skills-Ranking-Delete). Do NOT edit
`setup-rpc.handlers.ts` (G-Setup-RPC-Integration fixes its TS2739 at line 647). Keep the old
`SKILL_RANKING_SERVICE` token and registration in place for now: `setup-rpc.handlers.ts:94` and
`apps/ptah-electron/src/di/expected-resolvable.ts` still use it until W8.

## Read set
- TF/implementation-plan.md lines 131-142 (section 5) and 340 (split rule). Search the plan
  for `G-Skills-Rec-And-DI` and `skill-recommendation`. Do not read the plan in full.
- TF/batch-G-Skills-Judge-report.md (judge API and the wiring it needs: class, token, injected
  tokens) and TF/batch-G-Skills-Draft-And-Fs-report.md (draft service wiring: injects
  `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` and `HARNESS_TOKENS.LLM_RUNNER`).
- RH lib/skills-sh/services/skill-judge.service.ts, skill-judge.types.ts (created in W6).
- libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts and rpc-setup.types.ts
  (`WizardRecommendAnalysisSkillsResult`).
- Existing DI patterns in RH lib/di/register.ts and tokens.ts (follow them exactly).

## Contract (from plan section 5)
- Entry-anchored schedule: `rpcEntry = monotonicNow()`, hard deadline `rpcEntry + 70_000`.
  Registry search deadline `rpcEntry + 26_000`: 4 workers, 8 s per-term timeout raced against
  the search deadline; no new term when < 500 ms remain. Unstarted -> `registry:'not-searched'`;
  aborted -> `registry:'search-failed'` + `{ kind:'timed-out', reason }`. A `settled` guard
  blocks late search writes. Pass `rpcEntry` to the judge.
- Assembly: create `SkillJudgeItem` records with stable `itemId`s BEFORE the search terms are
  coalesced. Map coalesced results and failures back to every linked `itemId`. First-seen
  global pool and independent per-item assessments. `skills` = Install candidates (or best
  candidates when `method:'none'`). `unmatchedItems` only for zero-result successful searches.
  Copy the immutable saved `analysisPair` (or `null`).

## Tests (skill-recommendation.service.spec.ts)
Full pool, registry statuses, equal-name/different-kind identity, opposite per-item verdicts on
a shared candidate, consent-key mapping, and the 30-item deadline regression from plan section
5 "Verification" (2 s pre-search latency, unfinished searches at +26 s, 500 ms assembly, 3 s
Decision, queued/late Normal provider with actual Normal dispatch at >= 30 s budget, settled by
70 s). Use Jest fake timers or an injected clock, as the existing spec does.

## Checks (lane only)
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — after your change
  only ONE known error may remain: `handlers/setup-rpc.handlers.ts:647` (W8). The error at
  `skill-recommendation.service.ts:304` must be gone.
- `npx eslint <changed files>`
Never `npm run verify` or `nx`. Never commit or push.

**Deliverable**: TF/batch-G-Skills-Rec-And-DI-report.md (skeleton first).
Reply: `WROTE: <absolute path>` plus one headline line.
