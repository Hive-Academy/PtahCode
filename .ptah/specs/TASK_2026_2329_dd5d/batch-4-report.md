# TASK_2026_2329_dd5d — Batch 4 Report (Backend RPC Handlers & Skill Judge/Recommendation Services)

## Verdict
**PASS** — All Batch 4 changes implemented in the worktree, typechecked, linted (0 errors), and verified across 6 Jest test suites (241/241 tests passing).

## Changed Files
1. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
   - Added `getActiveAnalysisRun(workspaceRoot)` helper resolving `MultiPhaseAnalysisService` safely from the DI container (with `// degradation-audit: optional-capability` guard when unregistered in test/minimal containers).
   - Updated `wizard:get-resumable-run` to check `getActiveAnalysisRun(workspaceRoot)`: returns `{ analysis: null, generation: null, analysisActive: true, activeAnalysisStartedAt }` when an in-process run is active before any manifest is written, and attaches `analysisActive: true, activeAnalysisStartedAt` or `analysisActive: false` when a resumable run is found.
   - Updated `wizard:analysis-status` to pass `{ excludeRunId: activeRun.runId, excludeSlug: activeRun.slug }` to `freshnessService.getStatus(...)` when an active run exists for the workspace (and preserves the single-argument call otherwise).
   - Updated `wizard:list-analyses` to tag the matching entry (`activeRun.slug !== null && item.filename === activeRun.slug`) with `isActive: true`.
2. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
   - Added tests covering active-run exclusion in `wizard:analysis-status`, `analysisActive`/`activeAnalysisStartedAt` (both pre-manifest and alongside a resumable run) in `wizard:get-resumable-run`, and `isActive: true` tagging in `wizard:list-analyses`.
3. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts`
   - Added `normalizeInstalls` and `compareSkillsByInstallsDesc` (descending normalized `installs`, deterministic tie-breakers `skillId`, `source`, `name`).
   - Sorted returned skill arrays in `skillsSh:search` (API and CLI fallback paths), `skillsSh:getPopular` (CLI, curated fallback, and error fallback paths), and `skillsSh:detectRecommended`.
4. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts`
   - Added tests verifying descending `installs` sorting, negative/NaN normalization, and deterministic tie-breaking across `skillsSh:search` (API and CLI paths), `skillsSh:getPopular` (CLI and curated fallback), and `skillsSh:detectRecommended`.
5. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`
   - Updated `compareRecommendations` to compare normalized `installs` descending before `score`, `skillId`, `source`, `name`.
   - Updated `filterAndSortCandidates()` so `installs` descending is primary and `described` only breaks ties when `installs` are equal (no longer letting `described` override higher `installs`).
   - Sorted `judge.candidates` by `compareJudgeCandidatesByInstallsDesc` in `buildFallbackJudgeResult()`.
   - Updated `recommend()` final sort to use `compareRecommendations`.
6. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
   - Updated and expanded candidate ranking tests to verify higher `installs` wins over lower-install described skills, `described` breaks ties at equal `installs`, invalid rows are logged/dropped, and `result.judge.candidates` is ordered by `installs` descending.
7. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts`
   - Added exported `compareJudgeCandidatesByInstallsDesc` (descending normalized `installs`, real-description tie-breaker when installs are equal, then `skillId`, `source`, `name`, `candidateId`).
   - Updated `prepareItems()` to sort per-item `candidateIds` (and therefore `candidateAssessments`) and the global `candidates` pool by `compareJudgeCandidatesByInstallsDesc`, and sorted `SkillJudgeResult.candidates` in `judge()`.
8. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
   - Updated deprecated-candidate assertion to lookup by `candidateId` under deterministic candidate ordering.
   - Added tests verifying per-item `candidateIds`/`candidateAssessments` and global `judge.candidates` descending install order, and verifying a System One `status: 'used'` Decision response is accepted and attributed to `stage: 'decision'` without invoking Normal.

## Verification Commands & Results

### 1. Jest Unit Tests
- **Command**:
  ```bash
  cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx jest --config libs/backend/rpc-handlers/jest.config.ts --moduleNameMapper='{"^vscode$":"<rootDir>/../../../__mocks__/vscode.ts","^marked$":"/home/amun/ptah-extension/node_modules/marked/lib/marked.umd.js"}' --runInBand libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts
  ```
  *(Note: `--moduleNameMapper` supplied the worktree-external `marked` UMD path because this worktree shares `/home/amun/ptah-extension/node_modules`.)*
- **Exit Code**: `0`
- **Result**: `Test Suites: 6 passed, 6 total` | `Tests: 241 passed, 241 total`
  - `skill-recommendation.service.spec.ts`: PASS
  - `skill-judge.service.spec.ts`: PASS
  - `skills-sh-rpc.handlers.spec.ts`: PASS
  - `setup-rpc.handlers.spec.ts`: PASS
  - `setup-rpc-skill-install.spec.ts`: PASS
  - `setup-rpc-skills-stubs.spec.ts`: PASS

### 2. TypeScript Typecheck
- **Command**:
  ```bash
  cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
  ```
- **Exit Code**: `0`
- **Result**: Clean (no diagnostics).

### 3. ESLint
- **Command**:
  ```bash
  cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx eslint libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts
  ```
- **Exit Code**: `0`
- **Result**: `0 errors, 3 warnings` (pre-existing `max-lines` and `preserve-caught-error` warnings unrelated to Batch 4 edits).
