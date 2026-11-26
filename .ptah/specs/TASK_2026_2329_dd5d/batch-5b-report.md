# Batch 5b Implementation Report — Frontend Onboarding Navigation, Active Banners & Stream Reconnection

**Task**: `TASK_2026_2329_dd5d`

**Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`

**Status**: PASS

## Summary of Changes

### 1. Reactive Active & Interrupted Banners (`OnboardingResumeStore`, `ResumeBannerComponent`, `OnboardingHomeComponent`)
- **`libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`**:
  - Added `OnboardingResumeState = Extract<OnboardingRunChipState, 'running' | 'cancelling' | 'resumable'>` and `readonly state: OnboardingResumeState` to `OnboardingResumeItem`.
  - Injected `WizardAnalysisRunner` and converted `items` to a `computed(...)` over `_discoveredItems`, `_activeRoot`, `_cleared`, and live runner signals (`isRunningForWorkspace`, `isCanceling`, `isRunning`).
  - Active/cancelling workspace analysis banners now appear immediately on Home before `refresh()` settles and disappear immediately when the runner transitions back to idle.
  - When `getResumableRun()` reports `analysisActive === true` and `!runner.isRunning()`, hydrates the runner via `runner.syncBackendActive(true, { startedAt: latest.activeAnalysisStartedAt, workspacePath: root })` and emits a `'running'` banner rather than a stale `'resumable'` banner.
  - Mapped bound generation/guidance tab runs to accurate `state` and titles (`'running'` → `"Agent generation in progress"` / `"Project guidance in progress"`, `'cancelling'` → `"Stopping agent generation"` / `"Stopping project guidance"`, otherwise `'resumable'` → `"Continue ..."`).
- **`libs/frontend/onboarding/src/lib/home/resume-banner.component.ts`**:
  - Added `readonly state = input<OnboardingRunChipState>('resumable')` and wired `<ptah-run-status-chip [state]="state()" />`.
  - Applied active border styling (`border-state-run/70` when `'running'`, `border-state-need/70` otherwise), state-accurate `aria-label`, and action button label/icon (`View` + `ArrowRight` when `'running'` or `'cancelling'`, `Resume` + `Play` when `'resumable'`).
- **`libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`**:
  - Bound `[state]="item.state"` on `<ptah-resume-banner>`.

### 2. Active-Run Protection on Home (`AnalysisFoundCardComponent`)
- **`libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts`**:
  - Resolved `WizardAnalysisRunner` and added `analysisActive = computed(...)` scoped to `workspace.activePath()`.
  - Hid stale incomplete cards (`reason === 'incomplete'`) while `analysisActive()` is `true` via `visibleStatus`.
  - Replaced `Re-run` with `View progress` (navigating to `['/onboarding', 'analyze']` without `rerun: '1'`) while `analysisActive()` is `true`, and guarded `rerun()` against navigating with `?rerun=1`.

### 3. Stream Reconnection, Active-Run Guards & Lifecycle Transitions (`AnalyzeWorkspacePage`, `AnalysisStepStore`, `OnboardingWorkspaceStore`)
- **`libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`**:
  - Resolved `OnboardingWorkspaceStore`, passed `workspacePath()` to `runner.startFreshAnalysis(...)` and `runner.resumeAnalysis(...)`, and derived workspace-scoped `isAnalysisActive`, `isAnalysisRunning`, and `isAnalysisCanceling`.
  - Reconnected stream (`store.attachStream()`) and preserved elapsed time (`runner.startedAt()` / `activeAnalysisStartedAt`) in `ngOnInit()` both when returning mid-run and when hydrating `resumable.analysisActive === true` after reload; kept `interrupted` false and stripped/ignored `?rerun=1` while active.
  - Guarded `startPendingRerun()`, `useSaved()`, `loadSaved()` auto-selection, and the Saved analyses `Use` button while `isAnalysisActive()` is `true`.
  - Added `effect()` tracking `isAnalysisRunning()` `true` → `false` to clear `interrupted` on completion and automatically refresh `loadSaved()`.
  - Added `analysisError` computed so a failed `wizardState.multiPhaseResult()` (`manifest.lifecycle === 'failed'`) without `runner.errorMessage()` renders the `Analysis failed` `ptah-run-panel` instead of dropping to idle/interrupted, and resets failed live wizard state before retrying in `continuePrevious()`.
  - Added `if (this.destroyed) return;` before `await this.loadSaved()` in `continuePrevious()`.
  - Filtered active (`isActive === true`) and non-completed (`lifecycle !== undefined && lifecycle !== 'completed'`) entries out of `visibleSaved`.
- **`libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`**:
  - Filtered active (`isActive === true`) and non-completed (`lifecycle !== undefined && lifecycle !== 'completed'`) entries in `listAnalyses()`.
- **`libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`**:
  - Resolved `WizardAnalysisRunner` and skipped `wizard.reset()` on workspace transitions while a live analysis is running/cancelling, while continuing to call `analysis.resetForWorkspace()` (and preserving `wizard.reset()` on idle switches).

### 4. Back Navigation Query Preservation (`AnalyzeSkillsPage`)
- **`libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`**:
  - Updated `back()` to preserve the current `analysis` query parameter (`['/onboarding/analyze'], analysis ? { queryParams: { analysis } } : {}`).

## Changed Files

Source files:
- `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`
- `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts`
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`
- `libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
- `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`
- `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`

Test files:
- `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts`
- `libs/frontend/onboarding/src/lib/home/resume-banner.component.spec.ts`
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts`
- `libs/frontend/onboarding/src/lib/home/analysis-found-card.component.spec.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`
- `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts`
- `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts`

## Verification Results

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

1. **Jest (9 affected suites, including `analyze-workspace.render.spec.ts`)**:
   ```bash
   npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false \
     --moduleNameMapper='{"^marked$":"/home/amun/ptah-extension/node_modules/marked/lib/marked.umd.js"}' \
     --runTestsByPath \
     libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts \
     libs/frontend/onboarding/src/lib/home/resume-banner.component.spec.ts \
     libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts \
     libs/frontend/onboarding/src/lib/home/analysis-found-card.component.spec.ts \
     libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts \
     libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts \
     libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts \
     libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts \
     libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts
   ```
   - **Exit code**: `0`
   - **Result**: `9 passed, 9 total` suites; `147 passed, 147 total` tests.
   - *Note*: `--moduleNameMapper` points `^marked$` to the main checkout's `node_modules/marked/lib/marked.umd.js` because the git worktree shares `node_modules` with the parent repository.

2. **TypeScript typecheck**:
   ```bash
   npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
   ```
   - **Exit code**: `0`

3. **ESLint**:
   ```bash
   npx eslint \
     libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts \
     libs/frontend/onboarding/src/lib/home/resume-banner.component.ts \
     libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts \
     libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts \
     libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts \
     libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts \
     libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts \
     libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts
   ```
   - **Exit code**: `0` (`0 errors`, 38 pre-existing warnings).
