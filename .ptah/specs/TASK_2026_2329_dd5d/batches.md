# Batches — TASK_2026_2329_dd5d

- **Total batches**: 6 (`Batch 1`, `Batch 2`, `Batch 3`, `Batch 4`, `Batch 5a`, `Batch 5b`, `Batch 6` — 7 logical units across 3 parallel waves)
- **Plan validation status**: OK (plan-free BUGFIX validated directly against `research-report.md` and source files in worktree `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`)
- **Assumptions & Risks**:
  - `ptah_agent_spawn` is unavailable in this session; all batches execute via built-in subagents (`self`), with an independent review subagent (`review`) after implementation (same-family fallback explicitly recorded).
  - Existing unit tests asserting `described`-first ordering (`skill-recommendation.service.spec.ts`), insertion-order `judge.candidates`, and System One skipping (`skill-ranking-caller.service.spec.ts`) are updated alongside the fixes.
  - All shared-type additions (`analysisActive`, `activeAnalysisStartedAt`, `lifecycle`, `isActive`) are optional so VS Code and TUI hosts remain 100% compatible.

---

## Batch 1: Shared contracts & Backend Active Analysis Tracking — COMPLETE

- **Commit**: `0872e217f`
- **Phase**: Wave 1 (parallel-safe with Batches 2 & 3)
- **Projects**: `shared`, `agent-generation`
- **Dependencies**: None
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`) — fallback because `ptah_agent_spawn` unavailable
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/shared/src/lib/types/rpc/rpc-setup.types.ts`
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/shared/src/lib/types/wizard/steps.ts`
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts`
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
  - Matching `.spec.ts` files in `libs/backend/agent-generation/src/lib/services/`
- **Tasks**:
  1. Add optional `analysisActive?: boolean` and `activeAnalysisStartedAt?: string` to `WizardGetResumableRunResponse`.
  2. Add optional `lifecycle?: 'running' | 'paused' | 'completed' | 'failed'` and `isActive?: boolean` to `SavedAnalysisMetadata`.
  3. In `MultiPhaseAnalysisService`: track active run (`workspacePath`, `runId`, `slug`, `startedAt`, `abortController`, `promise`); expose `getActiveRun(workspacePath?)` and `isRunningForWorkspace(workspacePath)`; when `analyzeWorkspace()` is invoked for a workspace that already has an active non-aborted run, join and return that active run's promise instead of aborting/deleting it (ensure `cancelAnalysis()` still aborts and clears it).
  4. In `AnalysisFreshnessService`: accept optional `options?: { excludeRunId?: string | null; excludeSlug?: string | null }` on `getStatus()` / `findLatest()` to skip an actively running manifest instead of returning `stale (incomplete)`.
  5. In `AnalysisStorageService.list()`: populate `lifecycle: manifest.lifecycle` on each `SavedAnalysisMetadata`.
- **Verify command**: Focused jest + tsc + eslint on `shared` and `agent-generation`.
- **Acceptance**: All tests pass; active run metadata is queryable, same-workspace concurrent call joins instead of aborting, freshness skips excluded active run, and `list()` populates `lifecycle`.

---

## Batch 2: Decision Model Skill Review (System One + Structured + Timeouts + Schema) — COMPLETE

- **Commit**: `b6db01d0c`
- **Phase**: Wave 1 (parallel-safe with Batches 1 & 3)
- **Projects**: `agent-sdk`, `lane-routing`
- **Dependencies**: None
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts`
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/lane-routing/src/lib/pipeline/model-call.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/lane-routing/src/lib/di/register.ts`
- **Tasks**:
  1. `StructuredDecisionAdapter`: raise `STRUCTURED_DECISION_MAX_TURNS` to `3`; add safe text-JSON fallback in `readStructured()` when `isSuccessResult(msg)` has no `structured_output` but `msg.result` contains valid JSON object.
  2. `DecisionModelConfig` + `DecisionCaller` + `callStructured`: expose `getConfiguredTimeoutMs(): number | null`; allow `dispatchFor` (`budget.maxTimeoutMs` or honoring `budget.remainingMs()` when `allowExtendedBudget: true`) and `callStructured` (`dispatch.timeoutMs`) to use caller-provided budgets instead of clamping to 3,000 ms (keep 3,000 ms default when not specified so `route_decide` is unchanged).
  3. `SkillRankingCallerService`:
     - Remove the `dispatch.kind !== 'structured'` skip; support `system-one` dispatch by reading `outcome.answers` (`c1..cN` -> `Install` with evidence-grounded reason citing item name, project evidence, and confidence when present; `none`/low-confidence/abstain -> unresolved for Normal stage).
     - Compute `deadlineAt` after `openCaller()` using `opened.target.timeoutMs` (System One) or `configuredTimeoutMs ?? 20_000` (Structured), capped at `rpcEntry + DECISION_RPC_CAP_MS` (`42_000`).
     - Replace untyped `DECISION_SCHEMA` `items: {}` with a concrete object schema for `{itemId, verdict, candidateId, reason, confidence, rejections}`.
     - Support both canonical `candidateId` and prompt aliases (`c1..cN`) in `matchingCandidates()`.
     - Align deprecation check with `hasSkillDeprecationNotice` (don't reject valid skills mentioning "deprecated APIs").
     - Fix `timeout()` so expired deadlines report `'timed-out'` instead of `'pre-dispatch-error'`.
  4. `libs/backend/lane-routing/src/lib/di/register.ts`: wire `readPrefillTokensPerSecond` into `LANE_ROUTING_TOKENS.DECISION_CALLER`.
- **Verify command**: Focused jest + tsc + eslint on `agent-sdk` and `lane-routing`.
- **Acceptance**: System One and Structured decision models both succeed on skill ranking with real timeouts, typed schema, alias resolution, and text-JSON fallback.

---

## Batch 3: Backend Skills API Client Download Ordering — COMPLETE

- **Commit**: `027c64761`
- **Phase**: Wave 1 (parallel-safe with Batches 1 & 2)
- **Projects**: `cli-agent-runtime`
- **Dependencies**: None
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts` (+ `.spec.ts`)
- **Tasks**:
  1. Sort `skills` by `installs` DESC (with deterministic tie-breaker `skillId`, `source`, `name`) inside `SkillsShApiClient.fetchRanked()` before calling `this.enricher.enrich(skills)`.
  2. Add/update unit tests proving download-count ordering and that enrichment receives the highest-download entries first.
- **Verify command**: Focused jest + tsc + eslint on `cli-agent-runtime`.
- **Acceptance**: Search/ranked results from `SkillsShApiClient` are strictly ordered by `installs` descending before and after enrichment.

---

## Batch 4: Backend RPC Handlers & Skill Judge/Recommendation Services — COMPLETE

- **Commit**: `ceca3854a`
- **Phase**: Wave 2 (after Batches 1, 2, 3)
- **Projects**: `rpc-handlers`
- **Dependencies**: Batches 1, 2, 3
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (+ spec)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts` (+ spec)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.ts` (+ `.spec.ts`)
- **Tasks**:
  1. `setup-rpc.handlers.ts`: expose `analysisActive` + `activeAnalysisStartedAt` in `wizard:get-resumable-run`; exclude active run in `wizard:analysis-status`; tag `isActive: true` on matching entry in `wizard:list-analyses`.
  2. `skills-sh-rpc.handlers.ts`: sort results by `installs` DESC in `skillsSh:search`, `skillsSh:getPopular`, and `skillsSh:detectRecommended`.
  3. `skill-recommendation.service.ts`: sort primarily by `installs` DESC (`compareRecommendations`) with `described` only as tie-breaker; sort fallback `judge.candidates` by `installs` DESC.
  4. `skill-judge.service.ts`: sort per-item `candidateIds` / `candidateAssessments` and global `judge.candidates` by `installs` DESC.
- **Verify command**: Focused jest + tsc + eslint on `rpc-handlers`.
- **Acceptance**: Active analysis metadata propagates through all 3 setup RPCs; all skill search/recommendation/judge outputs are ordered by `installs` DESC.

---

## Batch 5a: Frontend Setup Wizard Runner & Chat UI Status/Browser — COMPLETE

- **Commit**: `51f4fd756`
- **Phase**: Wave 2 (after Batch 1; parallel-safe with Batches 4 & 6)
- **Projects**: `setup-wizard`, `chat-ui`
- **Dependencies**: Batch 1
- **Required Skills**: `angular-frontend-patterns`
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts` (+ `.spec.ts`)
- **Tasks**:
  1. `WizardAnalysisRunner`: track `startedAt` signal and `activeWorkspacePath` signal; expose `startedAt`, `activeWorkspacePath`, `isRunningForWorkspace(path)`, and `backendActive` hydration from `discoverResumableRun()` / `syncBackendActive()` when `resumable.analysisActive` is true (never setting `_resumableAnalysis` for an active run).
  2. `SetupStatusStore`: in `toScanFacts()`, count only completed, non-active analyses (`(a.lifecycle === undefined || a.lifecycle === 'completed') && !a.isActive`) toward `scanReady`.
  3. `SkillShBrowserComponent`: sort `searchResults`, `popularSkills`, and `recommendedDisplaySkills` by `installs` DESC.
- **Verify command**: Focused jest + tsc + eslint on `setup-wizard` and `chat-ui`.

---

## Batch 6: Frontend Onboarding Review Skills Download-Count Ordering — COMPLETE

- **Commit**: `eedad8b63`
- **Phase**: Wave 2 (parallel-safe with Batches 4 & 5a)
- **Projects**: `onboarding` (proposal folder only — file-disjoint from Batch 5b)
- **Dependencies**: None
- **Required Skills**: `angular-frontend-patterns`
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts` (+ `.spec.ts`)
- **Tasks**:
  1. Export a deterministic `compareSkillsByInstallsDesc` helper in `stack-coverage.ts`.
  2. Sort `row.candidates`, `row.manualCandidates`, and `computeJudgeResidualCandidates()` by `installs` DESC.
  3. Sort `setSearchResults`, `setItemSearchResults`, and initial `preselected` candidate IDs by `installs` DESC in `stack-skill.store.ts`.
  4. Sort `installCards`, `residualCards`, `otherResults`, and `filteredRecommendations` by `installs` DESC in `stack-skill-review.component.ts`.
- **Verify command**: Focused jest + tsc + eslint on `onboarding` proposal specs.

---

## Batch 5b: Frontend Onboarding Navigation, Active Banners & Stream Reconnection — COMPLETE

- **Commit**: `618c95010`
- **Phase**: Wave 3 (after Batch 5a and Batch 6)
- **Projects**: `onboarding`
- **Dependencies**: Batches 1, 5a, 6
- **Required Skills**: `angular-frontend-patterns`
- **Executor**: Built-in subagent (`self`)
- **Actual lane tokens**: unavailable for the built-in executor
- **Write Set**:
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/home/resume-banner.component.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (+ `.spec.ts`)
  - `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts` (+ `.spec.ts`)
- **Tasks**:
  1. `OnboardingResumeStore` + `ResumeBannerComponent` + `OnboardingHomeComponent`: show active running/cancelling analyses & generation tabs with `state: 'running'` / `'cancelling'` (`Running` / `Stopping` chip, active border, `"View"` button) instead of `Interrupted` / `Resume`; reactively reflect `WizardAnalysisRunner` state and backend `analysisActive`.
  2. `AnalysisFoundCardComponent`: hide/disable destructive `Re-run` while an analysis is actively running for the workspace.
  3. `AnalyzeWorkspacePage` + `AnalysisStepStore` + `OnboardingWorkspaceStore`:
     - Re-attach stream & elapsed timer (preserving original `startedAt`) on `ngOnInit()` when returning to an active analysis; never mark as `interrupted` or let `?rerun=1` abort an active run.
     - Hydrate active state when `resumable.analysisActive === true` (after reload).
     - Watch `runner.isRunning()` completing (`true -> false`) to refresh `loadSaved()` and handle `failed` lifecycle cleanly.
     - Add `if (this.destroyed) return;` in `continuePrevious()`.
     - Filter active/incomplete entries from clickable "Saved analyses" and guard `useSaved()` while running.
     - Scope workspace-switch resets properly so active runs don't bleed across workspaces.
  4. `AnalyzeSkillsPage.back()`: preserve `?analysis=` query param when navigating back to `/onboarding/analyze`.
- **Verify command**: Focused jest + tsc + eslint on `onboarding`.
