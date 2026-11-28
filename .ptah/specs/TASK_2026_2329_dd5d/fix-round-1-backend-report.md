# Fix Round 1 Backend Report — TASK_2026_2329_dd5d

**Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`

**Verdict**: **PASS** — All Blocking (B1, B2), Serious (S1–S4), Moderate (M2), and local Minor (m1–m3) findings from `code-logic-review-backend.md` resolved; 6 focused Jest suites (249/249 tests), 8 TypeScript `tsc --noEmit` project checks (`lib` + `spec` across all 4 packages), and ESLint across all 12 modified files exited `0` with `0` errors.

---

## Summary of Fixes

### 1. [B1] Per-Item Candidate Cap & Payload Fitting (`skill-ranking-caller.service.ts`)
- Imported `PROVIDER_OPTION_LIMIT` from `../routing-constants`, `buildDecisionPayload`, `serializeSystemOneRequest`, and `FixedQuestion` / `ModelDispatch` / `OpenedCaller`.
- Added `fitSkillQuestions()`, `candidateWidthSteps()`, `buildSkillQuestions()`, and `estimateFixedRequestBytes()`:
  - Caps per-item candidates on System One to at most `PROVIDER_OPTION_LIMIT[opened.provider] - 1` (`25` eligible + `'none'` = `26` options on Ollama).
  - Iteratively shrinks `perItemLimit` along `[initialLimit, 25, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1]` until exact serialized payload bytes fit within `maxRequestBytes` (`REQUEST_SIZE_LIMIT_BYTES` for System One; `REQUEST_SIZE_LIMIT_BYTES - DECISION_SCHEMA_BYTES` for Structured).
  - Preserves top-install skills by slicing `entry.eligible.slice(0, width)` (already sorted by `installs` descending).
  - Updated `validateSystemOneItems`, `validateItems`, `validateItem`, `readRejections`, and `matchingCandidates` to resolve `c1..cN` aliases and allowed selections against each item's exact `offeredEligible` slice.
- Added regression tests in `skill-ranking-caller.service.spec.ts` covering (a) 30 candidates on Ollama System One capping to `<= 26` criteria (`none` + `c1..c25`) and (b) 25 items × 20 candidates trimming width to fit under 64 KiB and succeeding.

### 2. [B2] System One Default Skill-Review Timeout & `DecisionCaller.dispatchFor()` `maxTimeoutMs` (`skill-ranking-caller.service.ts`, `decision-caller.ts`)
- Renamed `SKILL_DECISION_STRUCTURED_TIMEOUT_MS` to `SKILL_DECISION_TIMEOUT_MS = 20_000` in `skill-ranking-caller.service.ts`.
- On System One, computed `requestBudgetMs = opened.target.timeoutExplicit ? opened.target.timeoutMs : SKILL_DECISION_TIMEOUT_MS` (still capped by `rpcEntry + DECISION_RPC_CAP_MS`).
- Updated `DecisionCaller.dispatchFor()` (`decision-caller.ts`) on the `system-one` branch to compute `maxTimeoutMs = budget?.maxTimeoutMs !== undefined ? validBudgetMs(budget.maxTimeoutMs) : caller.target.timeoutMs` and use it for both transport `timeoutMs` and `admission.maxTimeoutMs` (preserving `caller.target.timeoutMs` when `maxTimeoutMs` is omitted, e.g., `route_decide`).
- Added regression tests in `decision-caller.spec.ts` and `skill-ranking-caller.service.spec.ts` covering `timeoutExplicit: false` (20s budget) vs `timeoutExplicit: true` (configured timeout honored) and omitted vs supplied `budget.maxTimeoutMs`.

### 3. [S1] Pre-Populate `activeRun.slug` Synchronously (`multi-phase-analysis.service.ts`)
- In `analyzeWorkspace()`, synchronously pre-populated `runRecord.slug` using `this.storageService.getRunDir(workspacePath, folderName).slug` (guarded with `typeof this.storageService.getRunDir === 'function'`, falling back to `null`) before `AnalysisRunCheckpoint.open()`, and updated both `runRecord.runId` and `runRecord.slug` once `open()` resolves.
- Added a regression test in `multi-phase-analysis.service.spec.ts` verifying `getActiveRun(WORKSPACE)?.slug === 'demo'` while `AnalysisRunCheckpoint.open()` is pending.

### 4. [S2] & [m2] Stale-State Races & Consistent `analysisActive` in `wizard:get-resumable-run` (`setup-rpc.handlers.ts`)
- Captured `activeBefore` prior to `findLatestResumableRun()`, re-read `activeAfter` after `findLatestResumableRun()`, re-queried once if `activeBefore !== null && activeAfter === null && run?.manifest?.lifecycle === 'running'`, and re-checked `activeAfter` after `readCompletedPhases()` (with the same stale-`running` refresh guard).
- Returned `analysisActive: false` consistently on all inactive responses (no workspace, no resumable run, and inactive resumable run).
- Updated existing inactive `toEqual` assertions and added Race 1 (start during disk read) and Race 2 (finish during disk read, both `null` and stale-`running` subcases) tests in `setup-rpc.handlers.spec.ts`.

### 5. [S3] & [M2] Serialize Aborted Run Teardown & Windows Path Normalization (`multi-phase-analysis.service.ts`)
- Added `private readonly settlingByWorkspace = new Map<string, Promise<unknown>>()` and `trackAbortedRunSettlement()`, recording settlement promises whenever `cancelAnalysis()` or `analyzeWorkspace()` aborts a running analysis (with self-cleaning `finally`).
- Awaited `settlingByWorkspace.get(runRecord.normalizedWorkspacePath)` at the start of `executeAnalysisRun()` before `AnalysisRunCheckpoint.open()`, aborting cleanly if cancelled while waiting.
- Normalized `normalizeWorkspacePath()` case on `process.platform === 'win32'` while storing case-preserving `resolve(workspacePath)` as `workspacePath` on `ActiveMultiPhaseAnalysisInfo`.
- Added a regression test in `multi-phase-analysis.service.spec.ts` verifying cancel -> immediate same-workspace restart waits for the prior run's delayed `checkpoint.pause()` write and leaves the new run's `running` manifest intact on disk.

### 6. [S4] & [m3] Late-Rejection Containment, System One Rejection Diagnostics, & Prose Extraction (`skill-ranking-caller.service.ts`, `structured-decision.adapter.ts`)
- Wrapped the body of `rank()` inside `SkillRankingCallerService.rankSkillCandidates()` in `try/catch` so a rejection on the losing `Promise.race` branch after timeout is always contained and can never emit `UnhandledPromiseRejection`. Added a regression test.
- Differentiated `bad-output` (`'Invalid or missing Decision choice or confidence'`) from `'Unknown Decision candidate ID'` in `validateSystemOneItems()`.
- Hardened `StructuredDecisionAdapter.extractJsonObject()` to advance to subsequent `{` positions whenever an earlier unmatched `{` reaches EOF with `depth > 0` (or fails JSON parsing), with an early return when no closing `}` remains. Added a regression test in `structured-decision.adapter.spec.ts`.

### 7. [m1] Clone Cached `SkillShEntry` Objects (`skills-sh-rpc.handlers.ts`)
- Changed `SkillsShRpcHandlers.enrichWithInstallStatus()` to return cloned entries (`skills.map((skill) => ({ ...skill, isInstalled: ... }))`) instead of mutating `skill.isInstalled` in place on cached API objects.
- Added a regression test in `skills-sh-rpc.handlers.spec.ts`.

---

## Changed Files

1. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
2. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts`
3. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts`
4. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts`
5. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts`
6. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts`
7. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts`
8. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
9. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
10. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
11. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts`
12. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts`

---

## Verification

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

| Check | Exact Command | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`lane-routing`) | `npx jest --config libs/backend/lane-routing/jest.config.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts --runInBand` | `0` | 2 suites passed, 37 tests passed |
| Jest (`agent-sdk`) | `npx jest --config libs/backend/agent-sdk/jest.config.ts libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts --runInBand` | `0` | 1 suite passed, 14 tests passed |
| Jest (`agent-generation`) | `npx jest --config libs/backend/agent-generation/jest.config.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts --runInBand` | `0` | 1 suite passed, 51 tests passed |
| Jest (`rpc-handlers`) | `npx jest --config libs/backend/rpc-handlers/jest.config.ts --moduleNameMapper='{"^vscode$":"<rootDir>/../../../__mocks__/vscode.ts","^marked$":"/home/amun/ptah-extension/node_modules/marked/lib/marked.umd.js"}' --runInBand libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts` | `0` | 2 suites passed, 147 tests passed *(Note: `--moduleNameMapper` points `marked` to the shared repo `node_modules` for worktree execution.)* |
| TypeScript (`tsc --noEmit`) | `npx tsc -p libs/backend/lane-routing/tsconfig.lib.json --noEmit && npx tsc -p libs/backend/lane-routing/tsconfig.spec.json --noEmit && npx tsc -p libs/backend/agent-sdk/tsconfig.lib.json --noEmit && npx tsc -p libs/backend/agent-sdk/tsconfig.spec.json --noEmit && npx tsc -p libs/backend/agent-generation/tsconfig.lib.json --noEmit && npx tsc -p libs/backend/agent-generation/tsconfig.spec.json --noEmit && npx tsc -p libs/backend/rpc-handlers/tsconfig.lib.json --noEmit && npx tsc -p libs/backend/rpc-handlers/tsconfig.spec.json --noEmit` | `0` | Clean (0 errors across all 8 configs) |
| ESLint | `npx eslint libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts` | `0` | 0 errors (31 pre-existing warnings on untouched lines / `max-lines` only) |
