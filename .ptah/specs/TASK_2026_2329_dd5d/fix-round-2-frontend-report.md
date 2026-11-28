# Fix Round 2 (Final) Frontend Report — TASK_2026_2329_dd5d

- **Role**: Fix Round 2 (Final) Frontend Developer
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Review Addressed**: `code-logic-review-frontend-rereview.md` (`[N1]` Blocking, `[N2]` Serious, `[N3]` Minor)
- **Verdict**: **PASS** — All 3 findings resolved within the allowed write set with explicit regression tests; focused Jest (`8/8` suites, `179/179` tests, `0` open handles), `tsc --noEmit` (`setup-wizard` + `onboarding` libs), and `eslint` (`0` errors) all green.

---

## 1. Findings Addressed & Changed Files

| Finding | Severity | Files Modified | Summary of Fix |
| --- | --- | --- | --- |
| **[N1]** Workspace-aware backend completion watcher & defense-in-depth `analysisDir` check | Blocking | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | Added `currentWorkspacePath` and `setCurrentWorkspacePath(path)` on `WizardAnalysisRunner`, synced from `OnboardingWorkspaceStore` (constructor + `untracked()` effect) and `AnalyzeWorkspacePage` (`untracked()` effect + `ngOnInit()`). When switching away from `activeWorkspacePath`, `setCurrentWorkspacePath()` pauses the watcher timer (`stopBackendWatcher()`) without clearing `_backendActive`, and resumes polling when switching back. `syncBackendActive(true)` only starts the watcher when `currentWorkspacePath` is unset or matches `activeWorkspacePath`. `pollBackendActive()` verifies workspace match both before and after `await wizardRpc.getResumableRun()` (ignoring stale cross-workspace replies), and validates `analysis.analysisDir` via `isPathWithinWorkspace()` (slash-normalized, Windows drive case-insensitive, prefix-safe) before adopting `resumable.analysis`. |
| **[N2]** Explicit `analysisActive === false` check everywhere | Serious | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`, `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | Updated `WizardAnalysisRunner.pollBackendActive()` to only adopt completion and call `syncBackendActive(false)` when `resumable.analysisActive === false`, reset error count on `analysisActive === true`, and route `analysisActive === undefined` (the real `WizardRpcService.getResumableRun()` RPC error fallback `{ analysis: null, generation: null }`) through `handleBackendPollError()` (bounded at `MAX_BACKEND_POLL_ERRORS = 5` without clearing `backendActive`). Updated `OnboardingResumeStore.refresh()` and `AnalyzeWorkspacePage.ngOnInit()` to require explicit `analysisActive === false` before calling `syncBackendActive(false)`. |
| **[N3]** Preserve `SetupWizardStateService` on `A -> B -> C` switches while A is live | Minor | `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts` | Moved `this.wizard.reset()` inside the `!this.runner?.isRunning() && !this.runner?.isCanceling()` guard so hopping across 3+ workspaces while Workspace A is running/canceling never wipes A's accumulated stream/phase state. |

### Complete Changed File List (Strictly Within Allowed Write Set)
1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`
2. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts`
3. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`
4. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts`
5. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
6. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
7. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`
8. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts`

---

## 2. Regression Tests Added

- **[N1]** `wizard-analysis-runner.service.spec.ts`:
  - Verifies switching `setCurrentWorkspacePath('/repo/a')` -> `setCurrentWorkspacePath('/repo/b')` while `backendActive` is true for `/repo/a` pauses polling, ignores an in-flight cross-workspace reply returning `/repo/b`'s completed analysis + `analysisActive: false`, preserves `/repo/a`'s `backendActive`, and resumes polling + completes cleanly upon switching back to `/repo/a` with `0` open handles.
  - Verifies defense-in-depth `analysisDir` mismatch rejection (`/repo/ab/.ptah/analysis/wrong-workspace` is never adopted for `/repo/a`).
  - Updated `[B2]` completion fixture's `analysisDir` to `/repo/reloaded/.ptah/analysis/demo` to match its `workspacePath: '/repo/reloaded'`.
- **[N2]** `wizard-analysis-runner.service.spec.ts`:
  - Verifies `{ analysis: null, generation: null }` (`analysisActive: undefined`) does not clear `backendActive` on a transient fallback (recovers cleanly on subsequent `analysisActive: true` -> `false`) and stops the watcher cleanly after `5` consecutive `undefined` responses with `0` open handles.
- **[N2]** `onboarding-resume.store.spec.ts`:
  - Verifies `{ analysis: null, generation: null }` (`analysisActive: undefined`) during `refresh()` does not call `syncBackendActive(false)` and preserves the active running banner.
- **[N2]** `analyze-workspace.page.spec.ts`:
  - Verifies `{ analysis: null, generation: null }` (`analysisActive: undefined`) during `ngOnInit()` does not call `syncBackendActive(false)`, keeps `isAnalysisActive() === true`, and syncs `setCurrentWorkspacePath('/workspace')`.
- **[N1][N3]** `onboarding-workspace.store.spec.ts`:
  - Verifies `setCurrentWorkspacePath` is called on init and on each switch, and that switching `A -> B -> C -> A` while Workspace A is running never calls `wizard.reset()` or `runner.reset()`.

---

## 3. Verification Commands & Results

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

| Check | Exact Command | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`setup-wizard`) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts --detectOpenHandles --runInBand` | `0` | `1/1` suite, `32/32` passed, `0` open handles |
| Jest (`onboarding` — analyze/home/shell)* | `npx jest --config libs/frontend/onboarding/jest.config.ts --moduleNameMapper '{"^marked$":"/home/amun/ptah-extension/node_modules/marked/lib/marked.umd.js"}' libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts --runInBand --detectOpenHandles` | `0` | `5/5` suites, `79/79` passed, `0` open handles |
| Jest (`onboarding` — skills/review) | `npx jest --config libs/frontend/onboarding/jest.config.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts --detectOpenHandles --runInBand` (run within full onboarding suite) | `0` | `2/2` suites, `68/68` passed |
| TypeScript (`setup-wizard` lib) | `npx tsc -p libs/frontend/setup-wizard/tsconfig.lib.json --noEmit` | `0` | `0` errors |
| TypeScript (`onboarding` lib) | `npx tsc -p libs/frontend/onboarding/tsconfig.lib.json --noEmit` | `0` | `0` errors |
| ESLint (all 8 modified files) | `npx eslint libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts` | `0` | `0` errors (`16` pre-existing warnings, `0` new warnings) |

*\*Note on worktree `marked` mapping*: Worktrees share `node_modules` from the main repo root (`/home/amun/ptah-extension/node_modules`), while `jest.preset.js` maps `^marked$` relative to the worktree path; passing `--moduleNameMapper` on the CLI resolves `marked` without touching `jest.preset.js`.
