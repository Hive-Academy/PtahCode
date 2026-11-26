# Research Report — TASK_2026_2329_dd5d

## Question and Bounds
Investigate three defects reported in the Setup Wizard / Onboarding flow after PR #1514 (`6a99ab936`):
1. Navigating back and forth during an active workspace analysis stops the analysis or shows it as `Interrupted` in the list instead of keeping it active and showing it as running.
2. The decision model is not properly working when reviewing/ranking skills.
3. Skills are not ordered by download count (`installs`).

Scope: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de` (Electron-first; shared contracts keep other hosts compiling).

---

## Summary Answer

All three bugs have concrete, verified root causes across backend and frontend:

1. **Navigation & Active Analysis Shown as "Interrupted" / Stopped**:
   - `MultiPhaseAnalysisService` (`libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:167,254-257`) tracks no active run metadata and aborts any running analysis if `analyzeWorkspace()` is invoked again.
   - `wizard:get-resumable-run` (`setup-rpc.handlers.ts:645-690`), `wizard:analysis-status` (`analysis-freshness.service.ts:175-187`), and `wizard:list-analyses` (`analysis-storage.service.ts:667-688`) read only disk `manifest.json` (`lifecycle: 'running'`) with no awareness of the live in-process run — causing Home to show `Interrupted` (`ResumeBannerComponent`), `Analysis found · stale (incomplete)` with a destructive `Re-run` button (`AnalysisFoundCardComponent`), and premature `Workspace analyzed` (`SetupStatusStore`), while `AnalyzeWorkspacePage` shows the running analysis inside "Saved analyses".
   - `ResumeBannerComponent` (`resume-banner.component.ts:13-22`) and `OnboardingResumeStore` (`onboarding-resume.store.ts:11-89`) hardcode `<ptah-run-status-chip state="resumable" />` (`Interrupted`) and `Resume` for all non-completed runs, including actively running analyses and actively running generation/guidance tabs.
   - `AnalyzeWorkspacePage` (`analyze-workspace.page.ts:689-710,875-912`) detaches the stream and stops the clock on `ngOnDestroy()`, never re-attaches them on `ngOnInit()` when returning mid-run, sets `interrupted = true` while running, lets `?rerun=1` abort an active run, allows `useSaved()` to corrupt live phase state, misses `if (this.destroyed) return;` in `continuePrevious()`, and loses `?analysis=` when navigating back from `AnalyzeSkillsPage.back()`.

2. **Decision Model Not Properly Working When Reviewing Skills**:
   - **System One models (`ollama`, `ollama-cloud`, `jev`, `custom` e.g. `d3:4b`) are 100% bypassed**: `SkillRankingCallerService` (`skill-ranking-caller.service.ts:170-178`) unconditionally returns `{ status: 'skipped', category: 'no-work' }` for `dispatch.kind !== 'structured'`, hiding the decision model from the run pill and displaying `skipped · Decision stage · no work` in the banner details.
   - **Hardcoded 3-second timeout ignores `decisionModelTimeoutMs`**: `SkillRankingCallerService` (`:55-58`), `DecisionCaller.dispatchFor()` (`decision-caller.ts:97-100`), and `callStructured()` (`model-call.ts:289,427-428`) cap both System One and Structured requests at `3,000 ms` / `3,250 ms` regardless of `agentOrchestration.decisionModelTimeoutMs`, causing systematic `timed-out` failures on real LLM/SDK calls.
   - **`StructuredDecisionAdapter` (`structured-decision.adapter.ts:73,209-236`)** hardcodes `maxTurns: 1` (triggering `error_max_turns` on `json_schema` tool retries) and lacks text-JSON extraction fallback when `msg.structured_output` is absent.
   - **Prompt/schema mismatch (`skill-ranking-caller.service.ts:21-35,186-190,400-406`)**: `DECISION_SCHEMA` uses untyped `items: {}`; prompt labels candidates `c1:`/`c2:` while `matchingCandidates()` rejects `c1`/`c2`; deprecation check still uses overbroad `/\bdeprecated\b/i` instead of `hasSkillDeprecationNotice`; expired deadlines before submit report `pre-dispatch-error` instead of `timed-out`; `DECISION_CALLER` DI registration (`lane-routing/src/lib/di/register.ts:70-84`) omits `readPrefillTokensPerSecond`.

3. **Skills Not Ordered by Download Count (`installs`)**:
   - `installs` numeric data flows intact from `skills.sh` to the UI, but sorting is missing or overridden at multiple layers:
   - **Backend**: `SkillsShApiClient.fetchRanked()` (`skills-sh-api-client.ts:179-197`) does not sort by `installs` (and enriches top 8 before sorting); `skills-sh-rpc.handlers.ts` search/popular/recommended lack `installs` sorting; `SkillRecommendationService.filterAndSortCandidates()` (`skill-recommendation.service.ts:570-574`) sorts `described` boolean before `installs` (demoting high-install skills without GitHub descriptions below 1-install described skills); `SkillJudgeService.prepareItems()` (`skill-judge.service.ts:74-98,429`) emits `judge.candidates` in insertion order.
   - **Frontend**: In judged mode (`AnalyzeSkillsPage` → `StackSkillReviewComponent`), `installCards`, `residualCards`, `row.candidates`, `row.manualCandidates`, `otherResults`, and initial `selectedCandidateIds` all lack `installs` descending sort. Marketplace `SkillShBrowserComponent` (`skill-sh-browser.component.ts`) also does not sort search/popular/recommended results by `installs`.

---

## Evidence Table

| Claim | Source | Verification |
| --- | --- | --- |
| `ResumeBannerComponent` hardcodes `state="resumable"` (`Interrupted`) | `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts:13-22` | Direct file read |
| `OnboardingResumeStore` marks all non-completed analysis & generation runs as resumable | `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:52-89` | Direct file read |
| `MultiPhaseAnalysisService` aborts active run unconditionally and exposes no active-run query | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:166-168,254-259` | Direct file read |
| `AnalysisFreshnessService` marks running manifest as `stale (incomplete)` | `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts:175-187` | Direct file read |
| `AnalyzeWorkspacePage` detaches stream on destroy and never re-attaches on init | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:689-710` | Direct file read |
| `SkillRankingCallerService` skips all non-`structured` (System One) decision models as `no-work` | `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:170-178` | Direct file read |
| Stacked 3,000 ms timeouts cap SkillRankingCaller, DecisionCaller, and callStructured | `skill-ranking-caller.service.ts:55-58`, `decision-caller.ts:97-100`, `model-call.ts:289,427-428` | Direct file read |
| `StructuredDecisionAdapter` hardcodes `maxTurns: 1` and rejects non-`structured_output` JSON | `libs/backend/agent-sdk/src/lib/lane-routing/structured-decision.adapter.ts:73,209-236` | Direct file read |
| `filterAndSortCandidates` sorts `described` before `installs` | `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:570-574` | Direct file read |
| `installCards`, `residualCards`, `row.candidates`, `otherResults` lack `installs` sort | `stack-skill-review.component.ts:165-197,284-288`, `stack-coverage.ts:514-534,572-614` | Direct file read |

---

## Local Consequences
- All changes stay backward-compatible on shared RPC types (`WizardGetResumableRunResponse`, `SavedAnalysisMetadata`) so VS Code and TUI hosts compile cleanly without feature work.
- Existing specs asserting `described`-first override (`skill-recommendation.service.spec.ts:173-188`) and insertion-order `judge.candidates` (`:759-767`) will be updated to assert download-count ordering, along with specs asserting System One skipping in `skill-ranking-caller.service.spec.ts`.
