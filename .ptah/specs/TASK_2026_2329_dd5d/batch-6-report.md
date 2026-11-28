# Batch 6 Report — Frontend Onboarding Review Skills Download-Count Ordering

- **Task**: `TASK_2026_2329_dd5d`
- **Phase**: `implement`
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Verdict**: PASS

## Changed Files

1. `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts`
   - Exported `compareSkillsByInstallsDesc(a: SkillShEntry, b: SkillShEntry): number` normalizing non-finite/negative `installs` to `0`, sorting descending by `installs`, with deterministic tie-breakers (`skillId`, `source`, `name` via `localeCompare`).
   - Sorted `candidates` (`JudgeItemCandidateView[]`) and `manualCandidates` (`SkillShEntry[]`) in `buildJudgeItemRows()`.
   - Sorted returned `ResidualCandidateView[]` in `computeJudgeResidualCandidates()`.
2. `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts`
   - Sorted stored `searchResults` and `retainedSearchResults` in `setSearchResults()` using `compareSkillsByInstallsDesc`.
   - Sorted stored per-item search results and retained per-item search results in `setItemSearchResults()` using `compareSkillsByInstallsDesc`.
   - Sorted preselected non-deprecated `install` candidates by `compareSkillsByInstallsDesc(a.skill, b.skill)` in `applyRecommendationResult()` before storing their canonical IDs in `selectedCandidateIdsState`.
3. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts`
   - Sorted `installCards` by `compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill)`.
   - Sorted `residualCards` by `compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill)`.
   - Sorted `otherResults` by `compareSkillsByInstallsDesc(a, b)`.
   - Sorted `filteredRecommendations` by `compareSkillsByInstallsDesc(a.skill, b.skill)`.
4. `libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts`
   - Updated equal-install tie-break expectation on `manualCandidates` (`current-result` before `Jest-Tips`).
   - Added unit tests for `compareSkillsByInstallsDesc` (descending order, negative/`NaN`/`Infinity` normalization, deterministic tie-breakers), `buildJudgeItemRows()` (`row.candidates`, `row.manualCandidates`), and `computeJudgeResidualCandidates()`.
5. `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts` (new)
   - Added unit tests verifying download-count descending ordering for `applyRecommendationResult()` initial `selectedCandidateIds`/`selectedSelectionKeys`, `setSearchResults()`, `setItemSearchResults()`, `visibleItemRows()[].candidates`, `visibleItemRows()[].manualCandidates`, and `residualCandidates()`.
6. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts`
   - Added component DOM ordering tests for `installCards`, `residualCards`, `row.candidates`, `row.manualCandidates`, `otherResults`, `filteredRecommendations`, and initial selection rail order.

## Verification Commands & Results

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

1. **Focused Jest suite**
   ```bash
   npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts
   ```
   - **Exit code**: `0`
   - **Result**: `Test Suites: 3 passed, 3 total`, `Tests: 55 passed, 55 total`

2. **TypeScript library check**
   ```bash
   npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
   ```
   - **Exit code**: `0`
   - **Result**: 0 errors

3. **ESLint on modified source files**
   ```bash
   npx eslint libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts
   ```
   - **Exit code**: `0`
   - **Result**: 0 errors, 1 pre-existing warning (`stack-skill.store.ts` `max-lines`)

4. **Additional regression check (sibling Team Builder review spec)**
   ```bash
   npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts
   ```
   - **Exit code**: `0`
   - **Result**: `Test Suites: 1 passed, 1 total`, `Tests: 19 passed, 19 total`
