# Code-Logic Re-Review — TASK_2026_2329_dd5d (Backend Fix Round 1)

> **Review family note**: `same-family built-in subagent — weaker-evidence fallback because ptah_agent_spawn is unavailable in this session`

**Verdict**: `APPROVED` (**0 Blocking**, **0 Serious**, **0 Moderate**, **0 Minor** new findings; all 10 in-scope prior findings **Fixed**; `M1` tracked as a known deferred follow-up)

---

## 1. Scope & Evidence

### Inspected Files (Read in Full on Disk)
1. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts`
2. `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts`
3. `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts`
4. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
5. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
6. `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts`

### Regression Specs & Collaborating Modules Inspected
- Modified specs:
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - `libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts`
  - `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.spec.ts`
  - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts`
- Collaborators cross-checked:
  - `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts`
  - `libs/backend/lane-routing/src/lib/pipeline/model-call.ts`
  - `libs/backend/lane-routing/src/lib/routing-constants.ts`
  - `libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts`
  - `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts`
  - `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
  - `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts`
- Cross-repo `git grep "dispatchFor("` confirmed all other callers (`route-decide.service.ts`, `scope-check.service.ts`, `child-setting-router.service.ts`, `decision-model-task-kind-classifier.ts`) omit `budget.maxTimeoutMs` and therefore retain their existing `target.timeoutMs` / `DECISION_REQUEST_TIMEOUT_MS` behavior unchanged.

### Independent Verification Executed by Re-Reviewer
All 6 targeted Jest test suites were executed directly in `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:
- `lane-routing`: `skill-ranking-caller.service.spec.ts` + `decision-caller.spec.ts` — **PASS** (2/2 suites, 37/37 tests)
- `agent-sdk`: `structured-decision.adapter.spec.ts` — **PASS** (1/1 suite, 14/14 tests)
- `agent-generation`: `multi-phase-analysis.service.spec.ts` — **PASS** (1/1 suite, 51/51 tests)
- `rpc-handlers`: `setup-rpc.handlers.spec.ts` + `skills-sh-rpc.handlers.spec.ts` — **PASS** (2/2 suites, 147/147 tests)
- **Total independently verified**: 6/6 suites, 249/249 tests passing.
- TypeScript `tsc --noEmit` (8 project configs) and ESLint (12 modified files) were reported clean (exit 0, 0 errors) in `fix-round-1-backend-report.md` (not re-executed by reviewer).

---

## 2. Prior Findings Status Table

| ID | Severity | Status | Evidence (`file:line`) | Verification Notes |
| --- | --- | --- | --- | --- |
| **B1** | Blocking | **Fixed** | `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:28,240-251,367-473,475-675`; `skill-ranking-caller.service.spec.ts:776-908` | `candidateWidthSteps()` caps System One per-item options to `PROVIDER_OPTION_LIMIT[opened.provider] - 1` (`25` + `'none'` = `26` on Ollama). `fitSkillQuestions()` shrinks width iteratively using `estimateFixedRequestBytes()`, whose System One (`buildDecisionPayload` + `serializeSystemOneRequest`) and Structured (`prompt` + `fixedSchema` with `DECISION_SCHEMA_BYTES` reserved) byte counts match `runFixedRequest()` (`model-refine.ts:260-280`) byte-for-byte. `validateSystemOneItems()`, `validateItem()`, `readRejections()`, and `matchingCandidates()` all validate and resolve aliases against each item's exact `offeredEligible` slice while preserving top-install candidates. |
| **B2** | Blocking | **Fixed** | `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:27,191-211`; `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:151-178`; `decision-caller.spec.ts:103-169`; `skill-ranking-caller.service.spec.ts:698-774` | `SkillRankingCallerService` now gives System One `SKILL_DECISION_TIMEOUT_MS` (`20_000`) when `timeoutExplicit` is `false` and honors `opened.target.timeoutMs` when `true` (bounded by `rpcEntry + DECISION_RPC_CAP_MS`). `DecisionCaller.dispatchFor()` computes `maxTimeoutMs = budget?.maxTimeoutMs !== undefined ? validBudgetMs(budget.maxTimeoutMs) : caller.target.timeoutMs` and applies it to both transport `timeoutMs` and `admission.maxTimeoutMs`, preserving `route_decide`'s `3_000 ms` default when omitted. |
| **S1** | Serious | **Fixed** | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:352-366,447-448`; `analysis-freshness.service.ts:144,165-170`; `multi-phase-analysis.service.spec.ts:1945-1980` | `runRecord.slug` is synchronously pre-populated from `storageService.getRunDir(workspacePath, folderName).slug` (matching line 436's `folderName`) before `AnalysisRunCheckpoint.open()`, and updated with `manifest.runId` and `manifest.slug` once `open()` resolves (handling `legacy-fallback` `--v4`). `AnalysisFreshnessService.findLatestRun()` skips `entry.name === excludeSlug` before reading `manifest.json`, and `wizard:list-analyses` tags `isActive: true` throughout `open()`. |
| **S2** | Serious | **Fixed** | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:684-780`; `setup-rpc.handlers.spec.ts:878-998` | `wizard:get-resumable-run` captures `activeBefore`, re-reads `activeAfter` after `findLatestResumableRun()`, re-queries once if an active run finished mid-read while disk returned a stale `lifecycle: 'running'` manifest, and performs the same re-read + stale-`running` refresh guard after `readCompletedPhases()`. Both Race 1 (start during disk read) and Race 2 (finish during disk read, both `null` and stale-`running` subcases) are covered by passing unit tests. |
| **S3** | Serious | **Fixed** | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:191,342-349,382-395,427-435,688-702`; `multi-phase-analysis.service.spec.ts:1982-2062` | `settlingByWorkspace` tracks the settlement promise of every aborted run from both `cancelAnalysis()` and cross-workspace replacement in `analyzeWorkspace()`, with identity-checked self-cleanup in `finally`. `executeAnalysisRun()` awaits any prior settling promise for the same normalized workspace before `AnalysisRunCheckpoint.open()` and exits early if aborted while waiting. Chaining also preserves serialization across rapid back-to-back cancel/restart cycles. |
| **S4** | Serious | **Fixed** | `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:162-315`; `skill-ranking-caller.service.spec.ts:910-933` | The entire body of `rank()` is wrapped in `try/catch` (with a valid `// degradation-audit:` comment), ensuring post-timeout rejections on the losing `Promise.race` branch resolve safely inside `rank()` and never surface as `UnhandledPromiseRejection`. |
| **M1** | Moderate | **Deferred (Known Follow-Up)** | `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts:148-225` | Explicitly out-of-scope for Fix Round 1 per task instructions; no new defect or regression introduced. Retained as a known follow-up for prefix-bounded `searchPage()` cross-page sorting. |
| **M2** | Moderate | **Fixed** | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:174-177,220,273,351,358-359,383,404,428` | `normalizeWorkspacePath()` lowercases `resolve(workspacePath)` on `process.platform === 'win32'` (matching `wizard-generation-binding.ts`), while preserving original casing in `ActiveMultiPhaseAnalysisInfo.workspacePath`. |
| **m1** | Minor | **Fixed** | `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:1048-1057`; `skills-sh-rpc.handlers.spec.ts` | `enrichWithInstallStatus()` returns shallow-cloned objects (`{ ...skill, isInstalled: ... }`) rather than mutating shared cached `SkillShEntry` objects in place. Regression test verifies both non-mutation and distinct object reference. |
| **m2** | Minor | **Fixed** | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:675-679,700-709,735-744,771-780`; `setup-rpc.handlers.spec.ts:675-715,874` | All inactive `wizard:get-resumable-run` return paths consistently include `analysisActive: false`; all active paths return `analysisActive: true` with `activeAnalysisStartedAt`. |
| **m3** | Minor | **Fixed** | `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts:292-318`; `structured-decision.adapter.spec.ts:321-336`; `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:491-499`; `skill-ranking-caller.service.spec.ts:693` | `extractJsonObject()` iterates subsequent `{` offsets whenever an unmatched stray `{` fails to close or fails JSON parsing, with an early return when no closing `}` remains. `validateSystemOneItems()` now differentiates `bad-output` (`'Invalid or missing Decision choice or confidence'`) from `'Unknown Decision candidate ID'`. (The OpenAI strict-schema portability note on `DECISION_SCHEMA` remains informational only; valid under Anthropic/Claude Agent SDK.) |

---

## 3. Five Logic & Five Style Re-Check Summary

### Logic Re-Check (Post-Fix)
1. **Failure looking like success**: Closed across all prior findings (`wizard:get-resumable-run` re-reads active state after each async boundary; aborted analysis teardown finishes before a replacement run opens its slug directory; System One validation separates `bad-output` from unknown candidate IDs).
2. **Surprising user actions**: Navigating Home immediately after clicking Analyze/Resume now excludes the pre-populated slug during `AnalysisRunCheckpoint.open()`; default System One users now receive a 20s skill-review budget and automatic option/payload fitting; cancelling and immediately restarting serializes cleanly.
3. **Wrong answers on boundary inputs**: 30-candidate items on Ollama cap to `<= 26` options (`none` + `c1..c25`); 25–30 item multi-candidate payloads shrink width cleanly under 64 KiB; stray `{` in prose no longer blocks fallback JSON extraction; Windows drive-letter casing normalizes consistently.
4. **Dependency failure / timeout / malformed data**: Post-timeout rejections in `SkillRankingCallerService.rank()` are contained inside `rank()`; `degradation-audit` comments are present and accurate on every modified `catch` block; `SkillsShRpcHandlers` does not mutate shared cached entries.
5. **Requirements fulfillment**: All backend requirements for navigation during active analysis, System One & Structured skill-review decision model execution, and download-count sorting are met (with `M1` explicitly deferred as a known follow-up).

### Style & Architecture Re-Check (Post-Fix)
1. **Six-month maintenance risk**: Low. Helper decomposition (`fitSkillQuestions`, `candidateWidthSteps`, `buildSkillQuestions`, `estimateFixedRequestBytes`, `trackAbortedRunSettlement`) keeps logic readable and localized.
2. **Readability / clarity**: Clean naming and explicit comments explaining non-obvious invariants (e.g., `DECISION_SCHEMA_BYTES` reservation, `settlingByWorkspace` cleanup guard, `rank()` catch containment).
3. **Local pattern compliance**: `normalizeWorkspacePath()` aligns with `wizard-generation-binding.ts`; `fitSkillQuestions()` mirrors `fitLane()` in `model-refine.ts`; `wizard:get-resumable-run` active-run re-read aligns with `wizard:list-analyses`.
4. **Module boundaries & contracts**: No new cross-library deep imports, no host branching regressions, no breaking signature changes, no lint suppressions added.
5. **Alternative structure**: None needed; `estimateFixedRequestBytes()` intentionally duplicates the small fixed-request serialization math in `skill-ranking-caller.service.ts` to keep `model-refine.ts` untouched, which is well-tested and exact.

---

## 4. New Findings

None (**0 Blocking**, **0 Serious**, **0 Moderate**, **0 Minor**).

---

## 5. Remaining Uncertainty & Notes

- **Verified directly from source and execution**: All 6 modified backend source files, 6 spec files, 7 collaborating modules, and 249/249 targeted Jest tests passed on disk.
- **Unverified / minor test-coverage gaps (non-blocking)**:
  - `M2` (`process.platform === 'win32'` lowercase normalization in `multi-phase-analysis.service.ts:174-177`) was verified by source inspection rather than a mocked-`win32` unit test (tests ran on Linux).
  - Race 2c in `setup-rpc.handlers.ts:727-760` (active run finishing during `readCompletedPhases()`) mirrors Race 2b and was verified by code trace; the spec exercises Race 1, Race 2a, and Race 2b.
  - `tsc --noEmit` and `eslint` results are taken from `fix-round-1-backend-report.md` and were not re-executed by the reviewer.
  - Known deferred follow-up: `M1` (`SkillsShApiClient.searchPage()` prefix-bounded cross-page sort when upstream is not install-sorted).

---

## 6. Verdict

**`APPROVED`** — 0 blocking, 0 serious.
