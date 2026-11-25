# G-Skills-Rec-And-DI report

TASK_2026_2325_899d · W7 · `@ptah-extension/rpc-handlers`

## Files changed

All six modified files are under `libs/backend/rpc-handlers/src/`:

- `lib/di/tokens.ts` adds `SKILL_JUDGE_SERVICE` (`Symbol.for('SkillJudgeService')`) and `SKILL_DRAFT_GENERATION_SERVICE` (`Symbol.for('SkillDraftGenerationService')`) while keeping `SKILL_RANKING_SERVICE` in place until W8.
- `lib/di/register.ts` registers `SkillJudgeService` and `SkillDraftGenerationService` as singletons in `registerSkillServices(container)` alongside existing skill services.
- `lib/skills-sh/services/index.ts` exports `SkillJudgeService`, `SkillDraftGenerationService`, `SkillJudgeInputItem`, and `SkillJudgeRequest`.
- `index.ts` exports `SKILL_JUDGE_SERVICE`, `SKILL_DRAFT_GENERATION_SERVICE`, `SkillJudgeService`, `SkillDraftGenerationService`, `SkillJudgeInputItem`, and `SkillJudgeRequest`.
- `lib/skills-sh/services/skill-recommendation.service.ts` switches `SkillRecommendationService` from `SKILL_RANKING_SERVICE` to `SKILL_JUDGE_SERVICE`, assigns stable `itemId`s before search term coalescing, runs an entry-anchored bounded registry search (`+26 s` search cap, 4 workers, `8 s` per-term timeout, `< 500 ms` start guard, `settled` guard), maps coalesced results and failures back to every linked item with the full candidate pool, calls `SkillJudgeService.judge({ workspaceRoot, rpcEntry, resolved, items })` under the `+70 s` hard deadline, and returns the complete `WizardRecommendAnalysisSkillsResult` (`judge`, copied immutable `analysisPair`, `skills`, `rankedBy`, `detectedItems`, `unmatchedItems`, `searchFailures`, `summarySource`).
- `lib/skills-sh/services/skill-recommendation.service.spec.ts` retains existing normalization/matching/heuristic coverage and adds tests for full candidate pool and independent per-item assessments, all four registry statuses (`matched`, `no-match`, `search-failed`, `not-searched`), equal-name/different-kind and duplicate `itemId` identity with coalesced search and failure mapping, opposite per-item verdicts on a shared candidate, case-preserving consent-key mapping, `analysisPair` immutability, `rankedBy` mapping, DI resolution via `registerSkillServices`, and the 30-item entry-anchored deadline regression using Jest fake timers with real `SkillJudgeService` and `HarnessLlmRunner`.

## Plan items

- **Lines 45–50 & 133–139 (Section 5 — Recommendation service):**
  - Entry-anchored schedule (`rpcEntry = input.rpcEntry ?? Date.now()`, hard deadline `rpcEntry + 70_000`, search deadline `rpcEntry + 26_000`) with 4 workers, `8_000 ms` per-term timeout raced against `searchDeadlineAt`, `< 500 ms` no-new-term guard, unstarted -> `registry: 'not-searched'` (`budget-exceeded`), aborted/in-flight -> `registry: 'search-failed'` + `{ kind: 'timed-out', reason: 'Search timed out' }`, error -> `registry: 'search-failed'` + `{ kind: 'registry-error', reason: 'Search failed' }`, and `settled` guards blocking late search writes.
  - Stable `itemId` assignment (`${kind}:${name.trim().toLowerCase()}` plus `#${occurrence}` on duplicates in original stack order) BEFORE search term coalescing, mapping coalesced results/failures back to every linked `itemId`.
  - Full candidate pool preserved per item without cross-item pre-dedup; `skills` built from Install outcomes when `judge.method !== 'none'` or heuristic best eligible candidates when `judge.method === 'none'`; `unmatchedItems` strictly limited to zero-result successful searches (`registry === 'no-match'`); immutable copy of `analysisPair` (or `null`, never substituting live Setup); legacy `rankedBy` mapped from `judge.counts`.
- **Line 141 (Section 5 — Verification):**
  - Added full pool, registry statuses, equal-name/different-kind identity, opposite per-item verdicts on a shared candidate, consent-key mapping, and the 30-item deadline regression (2 s pre-search latency, unfinished searches aborted at `+26 s`, 500 ms assembly overhead, 3 s Decision, queued/late Normal provider asserting actual Normal dispatch with `>= 30 s` budget and settlement by `70 s`).
- **Lines 274 & 340 (Amendment 3.1 — Batch split & DI ownership):**
  - Sole owner of `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE` tokens, registrations, and exports, leaving `SKILL_RANKING_SERVICE` and `skill-ranking*` files intact for W8 (`G-Setup-RPC-Integration`) and `G-Skills-Ranking-Delete`.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
  - Passed: 2 test suites, 58 tests passed (39 in `skill-recommendation.service.spec.ts`, 19 in `skill-judge.service.spec.ts`).
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
  - Passed for all 6 changed files. Exited 2 with ONLY the single expected W8 error: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts(647,80): error TS2739` (missing `judge`, `analysisPair`). The previous error at `skill-recommendation.service.ts:304` is resolved.
- `npx eslint libs/backend/rpc-handlers/src/lib/di/tokens.ts libs/backend/rpc-handlers/src/lib/di/register.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/index.ts libs/backend/rpc-handlers/src/index.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
  - Passed: 0 errors, 0 warnings.
- Scoped `ptah_get_diagnostics` on the 6 changed files returned unavailable after 45 s; native `tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` supplied the compiler verification.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Use `Date.now()` as the clock base for `rpcEntry` and deadlines | `performance.now()` vs `Date.now()` | Both `SkillJudgeService` (`skill-judge.service.ts:530,537`) and `SkillRankingCallerService` (`skill-ranking-caller.service.ts:52-58`) compare `request.rpcEntry` against `Date.now()`. Mixing `performance.now()` with `Date.now()` would cause immediate negative remaining budgets. `Date.now()` is also driven by `jest.useFakeTimers()`. | Yes |
| Keep new `AnalysisSkillRecommendationInput` fields (`rpcEntry`, `resolved`, `analysisPair`) optional | Required vs optional on `AnalysisSkillRecommendationInput` | `setup-rpc.handlers.ts:675` is out of scope until W8 (`G-Setup-RPC-Integration`), and the brief requires `setup-rpc.handlers.ts:647` to be the only remaining TS error. Optional fields preserve compile compatibility until W8 passes them. | Yes |
| In `method === 'none'` heuristic `skills[]` fallback, coalesce same-term items onto their first chosen covering skill | Pick a second-ranked skill for duplicate/versioned items of the same term vs attach to the term's chosen skill | Preserves existing single-best-skill heuristic behavior (`['Angular', 'Angular 24.0.0']` chooses one Angular skill) while still retaining every item and the full candidate pool in `judge.items` and `judge.candidates`. | Yes |
| Record `registryFailure: { kind: 'budget-exceeded', reason: 'Search budget reached' }` on `'not-searched'` items | Omit `registryFailure` vs populate `'budget-exceeded'` | `SkillJudgeItem['registryFailure']` defines `'budget-exceeded'` specifically for budget-skipped items; attaching it gives downstream UI/callers typed provenance while excluding `'not-searched'` from `unmatchedItems` and `searchFailures`. | Yes |

## Open items

- **W8 (`G-Setup-RPC-Integration`):** Update `setup-rpc.handlers.ts` to capture `rpcEntry = Date.now()` at RPC entry, resolve Setup strictly before registry search (throwing `RpcUserError(SETUP_MODEL_INVALID)` on invalid/unavailable/timeout), pass `rpcEntry`, `resolved`, and `analysisPair: saved.analysisPair ?? null` to `recommendation.recommendAnalysis(...)`, fix `empty()` at `setup-rpc.handlers.ts:647` to include `judge` and `analysisPair`, remove the `SkillRankingService` re-export at line 94, and update `apps/ptah-electron/src/di/expected-resolvable.ts` to replace `SKILL_RANKING_SERVICE` with `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE`.
- **`G-Skills-Ranking-Delete`:** Remove `skill-ranking*` files and the temporary `SKILL_RANKING_SERVICE` token/registration/export after `G-Setup-RPC-Integration`.
- Observed another concurrent lane's unstaged edit in `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts` (untouched per brief).

## Extra reads

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (lines 75–110, 625–700) to verify the existing `recommendAnalysis` call site and `SKILL_RANKING_SERVICE` usage.
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts` (lines 1–100) to verify constructor injection tokens for DI registration.
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts` (lines 1–165, 580–722) to align real `HarnessLlmRunner` test fixtures and fake-timer usage.
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` for `ResolvedSetupSnapshot`.
- `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts` (lines 1–160) to confirm `Date.now()` clock alignment with `rpcEntry`.
- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts` (lines 1–120) and `apps/ptah-electron/src/di/expected-resolvable.ts` (lines 1–100) to verify DI registration wiring and token exports.
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` (lines 65–95, 235–265, 320–350) to confirm consent-key (`${source}/${skillId}`) and `unmatchedItems` usage.
- Targeted sections of `implementation-plan.md` (lines 35–60, 108–155, 250–295, 330–465, 580–620, plus grep hits for registry failure and recommendation references).
- `rg` was not installed in the shell environment; used `grep -n` for text searches. Host skill discovery was not needed for this backend batch.
