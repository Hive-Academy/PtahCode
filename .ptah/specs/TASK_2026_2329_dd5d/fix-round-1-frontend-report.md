# Fix Round 1 Frontend Report — TASK_2026_2329_dd5d

- **Role**: Fix Round 1 Frontend Developer
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Review Addressed**: `code-logic-review-frontend.md` (`[B1]`, `[B2]`, `[S1]`, `[S2]`, `[M1]`, `[m1]`, `[m2]`)
- **Verdict**: **PASS** — All 7 review findings resolved with explicit regression tests; focused Jest (`8/8` suites, `173/173` tests, `0` open handles), `tsc --noEmit` (`lib` projects), and `eslint` (`0` errors) all green.

---

## 1. Findings Addressed & Changed Files

| Finding | Severity | Files Modified | Summary of Fix |
| --- | --- | --- | --- |
| **[B1]** `_backendActive` latched during local runs | Blocking | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | `syncBackendActive(true)` returns early when `_isRunning()` is already `true`; `run()` `finally` unconditionally clears `_backendActive` and stops the backend watcher; added monotonic `runGeneration` signal; `AnalyzeWorkspacePage.ngOnInit()` captures `hadLocalRun`, `initialRunGeneration`, `hadResult`, and `hadLoaded` before `await` and skips `syncBackendActive(true)` if a local run was active or settled while `getResumableRun()` was in flight. |
| **[B2]** Post-reload `backendActive` hydration had no completion exit path | Blocking | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | Added bounded completion watcher (`2500ms` chained `setTimeout`, max `5` consecutive error retries, `DestroyRef.onDestroy()` + `reset()` + `cancel()` + `run()` cleanup) in `WizardAnalysisRunner` that polls `wizardRpc.getResumableRun()`, adopts terminal `completed`/`failed` analyses with workspace scoping, and clears `syncBackendActive(false)` when `analysisActive !== true`. Both `OnboardingResumeStore.refresh()` and `AnalyzeWorkspacePage.ngOnInit()` also call `syncBackendActive(false)` when `getResumableRun()` reports `analysisActive !== true` for the active workspace. |
| **[S1]** Cross-workspace result & error bleed | Serious | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`, `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts` | Added `resultWorkspacePath` signal and `isResultForWorkspace(path)` on `WizardAnalysisRunner` (recorded on `run()` completion/failure, `discoverResumableRun`, and backend watcher adoption; cleared on `reset()`). Added `setWorkspacePath(path)` on `AnalysisStepStore` (synced from both `OnboardingWorkspaceStore` and `AnalyzeWorkspacePage`) and gated `completedLiveResult()` and `AnalyzeWorkspacePage.analysisError` with `isResultForWorkspace(...)`. In `OnboardingWorkspaceStore`, wrapped effect body in `untracked()`, removed dead fallthrough in `hasLiveAnalysis()`, and reset idle `runner` on workspace switch. |
| **[S2]** `continuePrevious()` / `resumeAnalysis()` no-op on `paused` `multiPhaseResult` | Serious | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | `WizardAnalysisRunner.run()` now only reuses cached `multiPhaseResult` on `ensureStarted()` (`allowCachedResult = true`, `!resume`, and `lifecycle === undefined || lifecycle === 'completed'`); explicit `resumeAnalysis()` and `startFreshAnalysis()` never short-circuit on paused/failed/stale results. `AnalyzeWorkspacePage.continuePrevious()` resets `wizardState` whenever `multiPhaseResult()?.manifest.lifecycle !== 'completed'`. |
| **[M1]** Selection rail ordering after toggles & in non-judged mode | Moderate | `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts` | `StackSkillReviewComponent.selectedSkills` sorts `[...selected]` by `compareSkillsByInstallsDesc` via the `skills` map, keeping known entries ahead of unknown keys sorted by `localeCompare`. |
| **[m1]** `AnalyzeSkillsPage.back()` dropped analysis context via `?run=` | Minor | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` | `back()` now falls back from `queryParamMap.get('analysis')` to `this.analysis.selected() ?? this.analysis.loaded()?.manifest.slug ?? null`. |
| **[m2]** Untracked `store.loaded()` read in `effect()` & elapsed copy | Minor | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | Wrapped `this.store.loaded()` read inside `untracked()` in the completion `effect()`, and updated elapsed label copy to `{{ elapsedSeconds() }}s elapsed`. |

### Complete Changed File List (All Within Allowed Write Set)
1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`
2. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts`
3. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`
4. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts`
5. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
6. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
7. `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`
8. `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts`
9. `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
10. `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`
11. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`
12. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts`
13. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts`
14. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts`

---

## 2. Regression Tests Added

- **[B1]** `wizard-analysis-runner.service.spec.ts`: verifies `syncBackendActive(true)` during active `run()` does not latch `_backendActive`, and settling `deepAnalyze` clears `isRunning()` and `isRunningForWorkspace('/other')`.
- **[B1]** `analyze-workspace.page.spec.ts`: verifies remounting `AnalyzeWorkspacePage` mid-run with real `WizardAnalysisRunner` + `AnalysisStepStore` and `getResumableRun` returning `analysisActive: true` transitions to `"Analysis complete"`, refreshes `loadSaved()`, and keeps `isRunningForWorkspace('/other') === false`; also verifies a stale `getResumableRun()` resolving after a local run settles does not re-arm `backendActive`.
- **[B2]** `wizard-analysis-runner.service.spec.ts`: verifies post-reload `syncBackendActive(true)` watcher polls `getResumableRun()`, adopts completed analysis with workspace scoping, clears `isRunning()` / `backendActive()`, stops timers on completion and `reset()`, and stops cleanly after `5` consecutive poll errors.
- **[B2]** `onboarding-resume.store.spec.ts` & `analyze-workspace.page.spec.ts`: verifies `syncBackendActive(false)` is called when `getResumableRun()` returns `analysisActive: false` for the active workspace (and does not clear another workspace's active run).
- **[S1]** `wizard-analysis-runner.service.spec.ts`, `analysis-step.store.spec.ts`, `analyze-workspace.page.spec.ts`, `onboarding-workspace.store.spec.ts`: verifies Workspace A's completed results and errors never render in Workspace B, and idle workspace switches reset `runner` and update `AnalysisStepStore.setWorkspacePath(...)`.
- **[S2]** `wizard-analysis-runner.service.spec.ts` & `analyze-workspace.page.spec.ts`: verifies `resumeAnalysis()`, `startFreshAnalysis()`, and `continuePrevious()` invoke `deepAnalyze` / reset `wizardState` even when `multiPhaseResult` holds a `paused` manifest.
- **[M1]** `stack-skill-review.component.spec.ts`: verifies selection rail sorts by `installs` DESC after toggling a higher-install skill in judged mode AND when passing ascending `selectedIds` in non-judged mode.
- **[m1]** `analyze-skills.page.spec.ts`: verifies `AnalyzeSkillsPage.back()` preserves the loaded/selected analysis slug when entered via `?run=`, and navigates without `queryParams` when neither route param nor store analysis is present.

---

## 3. Verification Commands & Results

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

| Check | Exact Command | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`setup-wizard`) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts --detectOpenHandles --runInBand` | `0` | `1/1` suite, `29/29` passed, `0` open handles |
| Jest (`onboarding` — skills/review) | `npx jest --config libs/frontend/onboarding/jest.config.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts --runInBand` | `0` | `2/2` suites, `68/68` passed |
| Jest (`onboarding` — analyze/home/shell)* | `npx jest --config libs/frontend/onboarding/jest.config.ts --moduleNameMapper '{"^marked$":"/home/amun/ptah-extension/node_modules/marked/lib/marked.umd.js"}' libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts --runInBand --detectOpenHandles` | `0` | `5/5` suites, `76/76` passed, `0` open handles |
| TypeScript (`setup-wizard` lib) | `npx tsc -p libs/frontend/setup-wizard/tsconfig.lib.json --noEmit` | `0` | `0` errors |
| TypeScript (`onboarding` lib) | `npx tsc -p libs/frontend/onboarding/tsconfig.lib.json --noEmit` | `0` | `0` errors |
| ESLint (all 14 modified files) | `npx eslint libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` | `0` | `0` errors (`33` pre-existing warnings) |

*\*Note on worktree `marked` mapping*: Worktrees share `node_modules` from the main repo root, while `jest.preset.js` resolves `^marked$` relative to `__dirname/node_modules`. Passing `--moduleNameMapper` on the CLI resolves `marked` without modifying `jest.preset.js`.
*\*Note on `tsconfig.spec.json`*: Running `tsc -p .../tsconfig.spec.json --noEmit` directly exits `2` solely due to pre-existing ES-target BigInt errors in `libs/shared`/`libs/worker-protocol` and unrelated pre-existing spec files (`generation-run-event-adapter.spec.ts`, `onboarding-ready-host.guard.spec.ts`); zero TypeScript errors were reported in any code or tests added in this fix round.
