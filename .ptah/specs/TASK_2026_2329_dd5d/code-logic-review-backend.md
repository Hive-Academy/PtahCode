# Code-Logic Review — TASK_2026_2329_dd5d (Backend Slice)

> **Review family note**: `same-family built-in subagent — weaker-evidence fallback because ptah_agent_spawn is unavailable in this session`

**Verdict**: `REVISE` (**2 Blocking**, **4 Serious**, **2 Moderate**, **3 Minor**)

---

## 1. Scope & Evidence

### Inspected Files (Read in Full + `git diff`)
1. `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`
2. `libs/shared/src/lib/types/wizard/steps.ts`
3. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
4. `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts`
5. `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
6. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts`
7. `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts`
8. `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts`
9. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts`
10. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts`
11. `libs/backend/lane-routing/src/lib/pipeline/model-call.ts`
12. `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts`
13. `libs/backend/lane-routing/src/lib/di/register.ts`
14. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
15. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts`
16. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts`
17. `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`

### Supporting Files & Cross-Repo Callers Inspected
- `libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts`
- `libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts`
- `libs/backend/lane-routing/src/lib/decision-model/decision-model.types.ts`
- `libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts`
- `libs/backend/lane-routing/src/lib/decision-model/system-one.client.ts`
- `libs/backend/lane-routing/src/lib/decision-model/system-one.schema.ts`
- `libs/backend/lane-routing/src/lib/pipeline/answer-validation.ts`
- `libs/backend/lane-routing/src/lib/pipeline/prefill-rate.store.ts`
- `libs/backend/lane-routing/src/lib/routing-constants.ts`
- `libs/backend/agent-sdk/src/lib/internal-query/internal-query.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-description.enricher.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.schema.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-json-extract.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-binding.ts`
- Task specs & batch reports: `.ptah/specs/TASK_2026_2329_dd5d/{task.md,decisions.md,research-report.md,batch-1-report.md,batch-2-report.md,batch-3-report.md,batch-4-report.md}`
- Unit test suites inspected: `multi-phase-analysis.service.spec.ts`, `analysis-freshness.service.spec.ts`, `structured-decision.adapter.spec.ts`, `decision-model.config.spec.ts`, `decision-caller.spec.ts`, `model-call.spec.ts`, `skill-ranking-caller.service.spec.ts`, `skills-sh-api-client.spec.ts`, `setup-rpc.handlers.spec.ts`, `skill-judge.service.spec.ts`, `skill-recommendation.service.spec.ts`
- Cross-repo `git grep` for callers of `getStatus(`, `dispatchFor(`, `ModelDispatch`, `WizardGetResumableRunResponse`, `SavedAnalysisMetadata`, `getActiveRun`, `isRunningForWorkspace`, `AnalysisFreshnessOptions`, `decisionModelPrefillTokensPerSecond`, and `wizard:*` RPCs across `apps/` and `libs/`.

### Verified Facts vs. Inference
- **Verified directly from source**: All code paths, constants (`DECISION_REQUEST_TIMEOUT_MS = 3000`, `PROVIDER_OPTION_LIMIT.ollama = 26`, `REQUEST_SIZE_LIMIT_BYTES = 64 * 1024`, `DEFAULT_LIMIT = 50`, `MAX_TERMS = 30`), DI registrations, catch-block annotations, and cross-host caller signatures were verified directly against the worktree files.
- **Verified from batch reports (not re-executed by reviewer)**: Targeted Jest, `tsc --noEmit`, and ESLint runs reported exit code 0 in `batch-1-report.md` through `batch-4-report.md`. Note that the existing specs use small 1–2 item fixtures with explicit `timeoutMs` mocks and therefore do not exercise real-world 20–30 item / >26 candidate System One payloads or default `timeoutExplicit: false` budgets.
- **Inference / remaining uncertainty**: Behavior of third-party OpenAI-compatible structured-output proxies with optional properties under `additionalProperties: false` in `DECISION_SCHEMA` was inferred from JSON Schema dialect rules (Anthropic/Claude Agent SDK accepts optional properties under `additionalProperties: false`; OpenAI strict mode does not).

---

## 2. Five Logic Answers

1. **Where can failure look like success (or silently hide/misclassify state)?**
   - `wizard:get-resumable-run` (`setup-rpc.handlers.ts:683-730`) reads `activeRun` **before** awaiting disk I/O (`findLatestResumableRun` + `readCompletedPhases`). If an analysis completes while disk I/O is in flight, the handler returns `{ analysis: null, generation: null, analysisActive: true, activeAnalysisStartedAt }` — claiming an analysis is still running after it finished. Conversely, if an analysis starts during disk I/O, it returns `{ analysis: <running>, analysisActive: false }`, displaying a live run as **Interrupted**.
   - `MultiPhaseAnalysisService.cancelAnalysis()` (`multi-phase-analysis.service.ts:653-666`) clears `this.activeRun = null` before the aborted run's async `checkpoint.pause()` writes complete. Starting a new run immediately on the same workspace lets the winding-down run overwrite the new run's `manifest.json` with a `paused` manifest and restore stale phase files into the new slug directory.
   - `SkillRankingCallerService.validateSystemOneItems()` (`skill-ranking-caller.service.ts:367-370`) collapses missing answers or out-of-range confidence (`bad-output`) into `'Unknown Decision candidate ID'`.

2. **What user action surprises?**
   - **Navigating back to Home right after clicking Analyze / Resume on a large repo**: While `AnalysisRunCheckpoint.open()` computes the workspace fingerprint (`computeWorkspaceFingerprint`) and writes the initial `running` manifest, `activeRun.slug` and `activeRun.runId` remain `null` (`multi-phase-analysis.service.ts:352-353,402-413`). During this window, `wizard:analysis-status` passes `{ excludeRunId: null, excludeSlug: null }` (excluding nothing -> `stale / incomplete` with a destructive `Re-run` card), and `wizard:list-analyses` omits `isActive: true`.
   - **Running skill review with a System One model on default settings**: A user with Ollama (`d3:4b`) or Ollama Cloud configured without manually raising `agentOrchestration.decisionModelTimeoutMs` hits a 3,000 ms (2,750 ms after margin) timeout with `coldTimeoutMs` stripped, or hits Ollama's 26-option ceiling / 64 KiB payload cap on real repositories, causing Decision stage to fail (`timed-out` / `provider-error` / `pre-dispatch-error`) and fall back to Normal.
   - **Cancelling and immediately restarting analysis in the same workspace**: Can leave the new run's manifest temporarily overwritten as `paused` by the cancelled run's teardown.
   - **Paginating `SkillsShApiClient.searchPage()` past page 1 when upstream is not install-sorted**: High-install skills beyond page 1's fetch window jump ahead of the page 2 slice offset, skipping top-downloaded skills while duplicating rows from page 1.

3. **What input returns a wrong answer?**
   - **Any stack item matching >= 26 skills from `skills.sh` (limit 50) on Ollama System One**: Sends `none` + `c1..c26+` (>= 27 options), exceeding `PROVIDER_OPTION_LIMIT.ollama = 26` and failing with HTTP 400 (`provider-error`).
   - **A multi-item repository (e.g., 15–30 stack items × 10–30 candidates)**: Exceeds `REQUEST_SIZE_LIMIT_BYTES` (64 KiB) in `runFixedRequest`, returning `pre-dispatch-error` instead of trimming tail candidates per item.
   - **Windows workspace paths with different drive-letter casing** (`C:\Repo` vs `c:\repo`): `normalizeWorkspacePath()` (`multi-phase-analysis.service.ts:173-175`) only calls `path.resolve()`, so `getActiveRun()` misses and `analyzeWorkspace()` treats the same workspace as a different workspace and aborts the active run.
   - **Unmatched `{` in model prose before valid JSON** in `StructuredDecisionAdapter.extractJsonObject()` (`structured-decision.adapter.ts:292-319`): `depth` never returns to `0`, returning `null` (`bad-output`) even when a valid `{ ... }` JSON object follows.

4. **What happens when a dependency fails, times out, or returns malformed data?**
   - **Late rejection after `SkillRankingCallerService` timeout**: `Promise.race([rank(), timedOut])` (`skill-ranking-caller.service.ts:289`) has no `.catch()` attached to `rank()`. If `openCaller()`, `dispatchFor()`, `runFixedRequest()`, or `noteLive()` rejects after the deadline timer resolves `timedOut`, Node/Electron receives an `UnhandledPromiseRejection`.
   - **Slow `openCaller()` exceeding `DECISION_RPC_CAP_MS` (42s)**: Timer fires, aborts `controller`, settles `Promise.race` with `timed-out`, and `finally` clears the timer. When `openCaller()` later resolves, line 154 returns `timeout()` before rescheduling — **no timer leak**.
   - **Malformed `installs` (`NaN`, `Infinity`, `-Infinity`, negative)**: Properly normalized to `0` across `skills-sh-api-client.ts`, `skills-sh-rpc.handlers.ts`, `skill-judge.service.ts`, and `skill-recommendation.service.ts`.
   - **`StructuredDecisionAdapter` text fallback**: Rejects non-objects (`null`, arrays, primitives, invalid JSON) as `StructuredDecisionError('bad-output', ...)`. `handle.stream` releases its concurrency slot via `InternalQueryService.holdSlotUntilDone` (`guarded()` `finally` runs on `break`/return/throw).
   - **`degradation-audit`**: All new/modified catch blocks (`structured-decision.adapter.ts:333`, `setup-rpc.handlers.ts:326`, `skill-ranking-caller.service.ts:290`, `decision-caller.ts:181`) are properly logged, rethrown, or annotated with `// degradation-audit:`.

5. **What requirement is missing or incomplete?**
   - Requirement #2 (*"The decision model is not properly working when reviewing/ranking skills"*) is still broken in practice for System One users on default settings (3,000 ms timeout with no cold-load budget) and for real-sized workspaces (>25 candidates/item on Ollama or >64 KiB total payload).
   - Requirement #1 (*"Navigating back and forth during active analysis"*) still has race windows during `AnalysisRunCheckpoint.open()` (`slug === null`) and in `wizard:get-resumable-run` (checking `activeRun` before disk reads) as well as cancel-then-immediate-restart.

---

## 3. Findings

### Blocking

#### B1. `SkillRankingCallerService` sends uncapped per-item candidates and uncapped payloads, breaching Ollama's 26-option limit and the 64 KiB request cap on real repositories
- **Location**:
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:226-249`
  - `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:274-280`
  - `libs/backend/lane-routing/src/lib/routing-constants.ts:130-134,207`
  - `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:64,406-435,537-588`
- **Impact**:
  1. `SkillsShApiClient.search()` fetches up to `DEFAULT_LIMIT = 50` skills per term, and `SkillRecommendationService.filterAndSortCandidates()` passes every matching candidate to `SkillJudgeService` -> `SkillRankingCallerService` (up to `MAX_TERMS = 30` stack items).
  2. `SkillRankingCallerService` builds `criteria` as `['none', ...eligible.map((c, i) => ['c' + (i + 1), JSON.stringify(c)])]` without enforcing `PROVIDER_OPTION_LIMIT.ollama` (`26`, defined in `routing-constants.ts:131`). Whenever any common stack term (e.g., `react`, `typescript`, `angular`, `docker`, `tailwind`) matches >= 26 skills, `criteria` has >= 27 keys (`none` + `c1..c26+`), causing Ollama `/v1/systemone` to reject the entire request with HTTP 400 (`provider-error`).
  3. Because each candidate is serialized with `JSON.stringify(candidate)` (~250–450 bytes, further inflated by quote-escaping when `serializeSystemOneRequest` / `JSON.stringify({ prompt, jsonSchema })` stringifies it again), a typical multi-stack repository (15–30 items × 10–25 candidates) exceeds `REQUEST_SIZE_LIMIT_BYTES` (`65,536` bytes). `runFixedRequest()` (`model-refine.ts:278-280`) returns `emptyOutcome('payload-too-large')`, which `SkillRankingCallerService:251-253` turns into `status: 'failed', category: 'pre-dispatch-error'` for the entire Decision stage (both System One and Structured).
- **Concrete Fix**:
  1. Cap per-item candidates in `SkillRankingCallerService` before building `questions`: since `eligible` arrives pre-sorted by `installs` descending (from `SkillJudgeService.prepareItems`), cap System One options to `PROVIDER_OPTION_LIMIT[opened.provider] - 1` (at most 25 eligible candidates + `'none'` for Ollama), and consider a practical ceiling (e.g., top 8–12 candidates per item) across both transports.
  2. Add payload-fitting before `runFixedRequest` (mirroring `fitLane`): if the serialized request exceeds `maxRequestBytes`, iteratively reduce the per-item candidate width (down to 1 eligible candidate + `'none'`) while keeping the highest-install candidates at the front of `eligible` so real 30-item workspaces fit cleanly under 64 KiB instead of failing with `pre-dispatch-error`. Note: ensure `matchingCandidates` and `validateSystemOneItems` index against the exact sliced `offeredEligible` list sent in the prompt/criteria!
  3. Add regression tests in `skill-ranking-caller.service.spec.ts` for (a) an item with 30 candidates on Ollama capping criteria to <= 26 options, and (b) a 25-item × 20-candidate request fitting and succeeding instead of failing with `pre-dispatch-error`.

#### B2. System One skill review defaults to 3,000 ms (2,750 ms after margin) with `coldTimeoutMs` stripped when `decisionModelTimeoutMs` is unset
- **Location**:
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:180-198`
  - `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:153-173`
  - `libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts:193-208`
- **Impact**:
  - When `agentOrchestration.decisionModelTimeoutMs` is unset (the default configuration), `resolveDecisionEndpoint()` returns `{ timeoutMs: 3000, timeoutExplicit: false }`.
  - While `SkillRankingCallerService` gives `structured` models a `20_000 ms` skill-review default (`SKILL_DECISION_STRUCTURED_TIMEOUT_MS`), it sets System One's `requestBudgetMs = opened.target.timeoutMs` (`3,000 ms`). After `DECISION_RETURN_MARGIN_MS` (`250 ms`), only `2,750 ms` remain.
  - Worse, `DecisionCaller.dispatchFor()` strips `coldTimeoutMs: undefined` (`decision-caller.ts:157`) and hard-clamps both the transport `timeoutMs` (`:156`) and admission `maxTimeoutMs` (`:167`) to `caller.target.timeoutMs` (`3,000 ms`), completely ignoring `budget.maxTimeoutMs` on the `system-one` branch.
  - As a result, out-of-the-box System One users (e.g., local Ollama `d3:4b` or Ollama Cloud) systematically fail skill review with `timed-out` — either rejected pre-dispatch by the prefill admission gate (`model-call.ts:148-157`, since multi-item prompts contain thousands of tokens) or aborted mid-load/mid-prefill at 2.75 s.
- **Concrete Fix**:
  1. In `SkillRankingCallerService:180-184`, when `opened.kind === 'system-one'`, use `opened.target.timeoutExplicit ? opened.target.timeoutMs : SKILL_DECISION_TIMEOUT_MS` (e.g., `20_000`, shared with Structured and still capped by `rpcEntry + DECISION_RPC_CAP_MS`).
  2. In `DecisionCaller.dispatchFor()` (`decision-caller.ts:151-174`), honor `budget.maxTimeoutMs` on the `system-one` branch:
     ```ts
     const maxTimeoutMs =
       budget?.maxTimeoutMs !== undefined
         ? validBudgetMs(budget.maxTimeoutMs)
         : caller.target.timeoutMs;
     ```
     Use `maxTimeoutMs` in both `Math.min(maxTimeoutMs, Math.floor(validBudgetMs(timeoutCapMs ?? budget.remainingMs())))` and `admission.maxTimeoutMs` (leaving `route_decide` unchanged at 3,000 ms since it omits `maxTimeoutMs`).
  3. Add regression tests in `decision-caller.spec.ts` and `skill-ranking-caller.service.spec.ts` covering `timeoutExplicit: false` (default unset -> 20s skill-review budget) vs `timeoutExplicit: true` (configured timeout honored verbatim).

---

### Serious

#### S1. `activeRun.slug` and `activeRun.runId` remain `null` during `AnalysisRunCheckpoint.open()`, breaking active-run exclusion in `wizard:analysis-status` and `isActive` tagging in `wizard:list-analyses`
- **Location**:
  - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:347-355,401-413`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:746-754,863-872`
  - `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts:134-135,144,165-170`
- **Impact**:
  - `runRecord` is created with `runId: null, slug: null` and only populated at lines 412–413 **after** `await AnalysisRunCheckpoint.open(...)` resolves.
  - `AnalysisRunCheckpoint.open()` performs substantial async I/O before returning: `computeWorkspaceFingerprint()` (scans workspace files), `createSlugDir()`, and `await checkpoint.persist()` (which writes `manifest.json` with `lifecycle: 'running'` to disk). On resume, the prior `paused` manifest is already on disk throughout `open()`.
  - Any `wizard:analysis-status` call arriving during that window calls `freshnessService.getStatus(workspaceRoot, { excludeRunId: null, excludeSlug: null })`, which excludes **nothing** and returns `{ state: 'stale', reason: 'incomplete' }` (or `unreadable` mid-write). Any `wizard:list-analyses` call hits `if (!activeRun || activeRun.slug === null) return { analyses }` and omits `isActive: true`.
- **Concrete Fix**:
  - Synchronously pre-populate `runRecord.slug` when creating `runRecord` in `MultiPhaseAnalysisService.analyzeWorkspace()` using `this.storageService.getRunDir(workspacePath, folderName).slug` (where `folderName = workspacePath.split(/[\\/]/).pop() || 'project'`), and update both `runRecord.runId = manifest.runId` and `runRecord.slug = manifest.slug` once `AnalysisRunCheckpoint.open()` resolves (handling the rare `legacy-fallback` `--v4` slug).
  - Add a unit test in `multi-phase-analysis.service.spec.ts` verifying `getActiveRun(WORKSPACE)?.slug` is non-null while `AnalysisRunCheckpoint.open` / workspace fingerprinting is still pending.

#### S2. `wizard:get-resumable-run` reads `getActiveAnalysisRun()` before awaiting disk I/O, creating two stale-state race conditions
- **Location**:
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:683-730`
- **Impact**:
  - `activeRun` is captured synchronously at line 683, before `await storageService.findLatestResumableRun(workspaceRoot)` (line 688) and `await this.readCompletedPhases(...)` (line 701).
  - **Race 1 (Start during disk read)**: `activeRun` is `null` at line 683; a run starts and persists `manifest.json` (`lifecycle: 'running'`) before `findLatestResumableRun` reads it -> handler returns `{ analysis: <running>, analysisActive: false }`, causing the UI to display a live running analysis as **Interrupted**.
  - **Race 2 (Finish during disk read)**: `activeRun` is non-null at line 683; the run completes (`lifecycle: 'completed'`, `this.activeRun = null`) before `findLatestResumableRun` runs -> `findLatestResumableRun` returns `null`, and line 690 returns `{ analysis: null, generation: null, analysisActive: true, activeAnalysisStartedAt }`, reporting a completed analysis as still actively running.
- **Concrete Fix**:
  - Re-read `const activeRun = this.getActiveAnalysisRun(workspaceRoot);` **after** `await storageService.findLatestResumableRun(workspaceRoot)` (and after `readCompletedPhases`, matching `wizard:list-analyses` at line 864). If `activeBefore !== null && activeAfter === null && run?.manifest?.lifecycle === 'running'`, re-query `findLatestResumableRun` once so a run that just completed mid-read is not returned as an orphaned running manifest.

#### S3. `MultiPhaseAnalysisService.cancelAnalysis()` followed by an immediate same-workspace `analyzeWorkspace()` can let the aborting run's `checkpoint.pause()` overwrite the new run's `manifest.json`
- **Location**:
  - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:339-368,525-535,546-559,653-666`
- **Impact**:
  - `cancelAnalysis()` sets `this.activeRun = null` and calls `abortController.abort('user_cancelled')` synchronously without awaiting `executeAnalysisRun`'s unwind.
  - If a new `analyzeWorkspace(workspacePath)` starts immediately for the same workspace before the cancelled run finishes `restorePriorPhaseFileIfMissing()` / `checkpoint.pause(phaseId)`, Run 2 wipes and creates `slugDir` with Run 2's `running` manifest, and then Run 1's async abort handler writes **Run 1's `paused` manifest and stale phase file directly over Run 2's `slugDir`**.
  - Note that the existing test in `multi-phase-analysis.service.spec.ts:1765-1818` executes this exact sequence (`cancelAnalysis(); analyzeWorkspace(WORKSPACE)`), and only passes because Run 2 later overwrites `manifest.json` as its phases complete.
- **Concrete Fix**:
  - Track the last aborted run's settlement promise per normalized workspace path (e.g., `private readonly settlingByWorkspace = new Map<string, Promise<unknown>>()`), and in `analyzeWorkspace()` await any settling aborted run for the same workspace before calling `AnalysisRunCheckpoint.open()`, OR guard `restorePriorPhaseFileIfMissing` / `checkpoint.pause` so an aborted run skips disk writes if a newer run already owns `this.activeRun` for the same workspace. Awaiting the prior aborted run's cleanup before `open()` also guarantees no interleaved file I/O on the same `slugDir`.

#### S4. `SkillRankingCallerService` `Promise.race([rank(), timedOut])` can emit an `UnhandledPromiseRejection` if `rank()` rejects after timeout
- **Location**:
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:152-299`
- **Impact**:
  - `rank()` is an async closure with no internal `try/catch`; the `try/catch` sits outside `Promise.race([rank(), timedOut])` (line 289).
  - If the deadline timer fires first and resolves `timedOut`, `Promise.race` settles immediately. If a pending call inside `rank()` (`openCaller()`, `dispatchFor()`, `runFixedRequest()`, or `noteLive()`) subsequently rejects, the losing promise has no rejection handler, emitting an `UnhandledPromiseRejection` in Node/Electron.
- **Concrete Fix**:
  - Attach a guarded rejection handler to `rankPromise` (or wrap the body of `rank()` in `try { ... } catch { return expired() ? timeout() : fail(decisionTrace.pairAttempted ? 'provider-error' : 'pre-dispatch-error'); }`), so post-timeout rejections are always observed and safely contained.

---

### Moderate

#### M1. Client-side `installs` sorting in `SkillsShApiClient.fetchRanked()` breaks `searchPage()` cross-page consistency when upstream is not strictly install-ordered
- **Location**:
  - `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts:148-225`
- **Impact**:
  - `searchPage(query, limit, offset)` fetches `requested = Math.min(offset + limit + 1, 200)` rows from `/api/search?q=...&limit=${requested}`, sorts that prefix client-side by `installs` descending, and slices `[offset, offset + limit]`.
  - When upstream `/api/search` returns rows not strictly ordered by `installs` (the exact case Batch 3's sort is meant to handle), a high-install skill sitting at upstream index `>= limit + 1` is absent on page 1, enters the sort on page 2 at index `0`, shifts earlier rows down, and is **dropped (skipped)** by `rows.slice(offset, offset + limit)` while previously shown rows from page 1 are **duplicated** on page 2.
- **Concrete Fix**:
  - Document the prefix-bounded sort behavior explicitly if `limit = offset + limit + 1` is intentionally retained for API bandwidth, OR have `searchPage()` fetch and cache `UPSTREAM_MAX_RESULTS` (200) once per query and slice pages from the single globally sorted 200-entry array (eliminating cross-page drift and redundant network calls on page 2+).

#### M2. `normalizeWorkspacePath()` in `MultiPhaseAnalysisService` does not normalize Windows drive-letter/path casing
- **Location**:
  - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:173-175`
- **Impact**:
  - `normalizeWorkspacePath()` returns `resolve(workspacePath)` directly, whereas `wizard-generation-binding.ts:124-126` normalizes case on `process.platform === 'win32'`. On Windows, if one caller passes `C:\Repo` and another passes `c:\repo` (common between VS Code/Electron IPC and `path.resolve`), `getActiveRun(workspaceRoot)` returns `null` and `analyzeWorkspace()` fails `findJoinableRun()` and aborts the active run as if it were a different workspace.
- **Concrete Fix**:
  - Normalize case on `win32`: `const resolved = resolve(workspacePath); return process.platform === 'win32' ? resolved.toLowerCase() : resolved;` (and store/return the original `resolve(workspacePath)` if case-preserving display is desired in `ActiveMultiPhaseAnalysisInfo.workspacePath`).

---

### Minor

#### m1. `SkillsShRpcHandlers.enrichWithInstallStatus()` mutates `isInstalled` on objects inside `SkillsShApiClient`'s shared cache
- **Location**:
  - `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:262-264,1048-1057`
  - `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts:198-199,220-224`
- **Impact**: Pre-existing mutation of cached `SkillShEntry` objects (`skill.isInstalled = ...`), though the new `[...enriched].sort(...)` at line 264 safely avoids mutating the cached array's order. Cloning objects (`skills.map(s => ({ ...s, isInstalled: ... }))`) prevents cross-workspace `isInstalled` leakage in shared cache entries.

#### m2. `wizard:get-resumable-run` inconsistently omits `analysisActive` on empty inactive responses vs returning `analysisActive: false` when a resumable run exists
- **Location**:
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:690-696,721-730`
- **Impact**: When `run === null && activeRun === null`, the handler returns `{ analysis: null, generation: null }` (`analysisActive` is `undefined`), whereas when `run !== null && activeRun === null` it returns `analysisActive: false`. Returning `analysisActive: false` consistently in both branches makes the response contract uniform.

#### m3. Edge-case diagnostics and prose extraction polish
- **Location**:
  - `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts:292-319`: If model prose before a JSON object contains an unmatched `{` (e.g., `For {section A: {"items": [...]}`), `depth` never returns to `0`, causing `extractJsonObject` to return `null`. Resetting or scanning from subsequent `{` positions when a scan reaches EOF with `depth > 0` makes the fallback resilient to stray braces in prose.
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:367-370`: `validateSystemOneItems` reports `'Unknown Decision candidate ID'` even when the model omitted an answer or returned an out-of-range confidence (`bad-output`). Differentiating missing/invalid-confidence reasons improves diagnostics.
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:22-55`: `DECISION_SCHEMA` sets `additionalProperties: false` with optional properties (`candidateId`, `reason`, `confidence`, `rejections`). This is valid JSON Schema and accepted by Anthropic/Claude Agent SDK structured outputs; note only as a portability caveat if a future structured provider enforces OpenAI's strict-schema subset (which requires all properties in `required`).

---

## 4. Verification of Checked Areas With No Defects Found

- **Callers outside the diff (Electron, VS Code, TUI)**: All signature changes (`AnalysisFreshnessService.getStatus(workspaceRoot, options?)`, `DecisionCaller.dispatchFor(caller, budget?)`, `ModelDispatch` structured `timeoutMs?`, `WizardGetResumableRunResponse.analysisActive?` / `activeAnalysisStartedAt?`, `SavedAnalysisMetadata.lifecycle?` / `isActive?`) are strictly additive/optional. Cross-repo `git grep` confirmed all callers (`content-generation.service.ts`, `enhanced-prompts.service.ts`, `wizard-generation-binding.ts`, `route-decide.service.ts`, `child-setting-router.service.ts`, `scope-check.service.ts`, `decision-model-task-kind-classifier.ts`, frontend stores/fixtures) remain compatible.
- **`DECISION_CALLER` DI wiring (`libs/backend/lane-routing/src/lib/di/register.ts:84-88`)**: Matches `ROUTE_DECIDE_SERVICE` (`:252-255`) verbatim (`section: 'ptah'`, `key: 'agentOrchestration.decisionModelPrefillTokensPerSecond'`).
- **`DecisionModelConfig.getConfiguredTimeoutMs()` (`decision-model.config.ts:261-265`)**: Matches `decision-model.target.ts:216-230` (same section/key, finite positive check, rounding, min/max clamping).
- **`SkillJudgeService.runDecision()` (`skill-judge.service.ts:514-560`)**: Properly parses System One `Install` verdicts via `skillJudgeInstallSchema` (`candidateId` lowercased/trimmed, `reason` trimmed `1..280`, `verdict: 'install'`), verifies `eligibleIds(item).has(parsed.data.candidateId)`, and records `'Not selected by decision model'` for unselected eligible candidates when `answer.rejections` is `{}`.
- **Structured `callStructured()` + `stringRecord()` (`model-call.ts:285-356,416-429`)**: `stringRecord({ items: [...] })` returns `{}` (non-null), allowing `SkillRankingCallerService` to capture `structuredAnswer` cleanly while still failing non-object payloads as `bad-output` -> `invalid-output`.
- **`c1..cN` alias resolution (`skill-ranking-caller.service.ts:520-537`)**: Exact candidate ID matches take precedence over `c1..cN` aliases, and aliases resolve safely against `input.eligible` (excluding deprecated candidates).
- **Skills download-count ordering in `SkillJudgeService`, `SkillRecommendationService`, and `SkillsShRpcHandlers`**: Properly normalizes `NaN` / `Infinity` / negative `installs` to `0`, uses deterministic tie-breakers (`described` / `hasRealDescription` -> `skillId` -> `source` -> `name`), and does not mutate shared arrays when sorting (`[...enriched].sort(...)`, `[...CURATED_POPULAR_SKILLS].sort(...)`, `[...skills].sort(...)`).
- **`degradation-audit` compliance**: Every new or modified `catch` block across the 17 files is properly logged, rethrown, or annotated with a valid `// degradation-audit:` justification.
