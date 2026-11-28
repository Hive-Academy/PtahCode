# Batch 5a Implementation Report — Frontend Setup Wizard Runner & Chat UI Status/Browser

- **Task**: `TASK_2026_2329_dd5d` (Batch 5a)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Verdict**: PASS — all scoped unit tests, typechecks, and lint checks succeeded with exit code 0.

## Changed Files

1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`
   - Added `startedAt`, `activeWorkspacePath`, and `backendActive` readonly signals; updated `isRunning` to a `computed(() => this._isRunning() || this._backendActive())` so all consumers automatically reflect hydrated in-process backend runs.
   - Added optional `workspacePath?: string | null` parameter to `ensureStarted`, `retry`, `resumeAnalysis`, and `startFreshAnalysis` (preserving backward compatibility when omitted).
   - Added `isRunningForWorkspace(workspacePath)` with trailing-slash normalization and legacy `null` active-workspace fallback.
   - Added `syncBackendActive(active, options)` for post-reload hydration without overwriting an active in-flight run's `startedAt` or `activeWorkspacePath`, and clearing `_resumableAnalysis` when active.
   - Updated `discoverResumableRun()` and `launchAfterDiscovery()` so `analysisActive: true` hydrates `backendActive` (instead of surfacing an interrupted analysis or starting a fresh run), and cleared `_backendActive`, `_startedAt`, and `_activeWorkspacePath` in `reset()` (used by `cancel()`) and `run()` `finally`.
2. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts`
   - Added 7 unit tests covering `startedAt`, `activeWorkspacePath`, legacy `workspacePath`-omitted callers, `isRunningForWorkspace`, `syncBackendActive`, `discoverResumableRun` when `analysisActive: true`, and `reset()`/`cancel()` cleanup.
3. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts`
   - Extended `ListAnalysesScanSchema` with optional `lifecycle` and `isActive` fields and filtered `toScanFacts()` to completed, non-active analyses (`!item.isActive && (item.lifecycle === undefined || item.lifecycle === 'completed')`), preventing in-flight/incomplete runs from prematurely marking `scanReady` while preserving legacy entries.
4. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.spec.ts`
   - Added unit test verifying active, running, paused, and failed analyses are ignored while `completed` and legacy (undefined-lifecycle) analyses set `scanReady` and `scanProjectType`.
5. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts`
   - Added `normalizeInstallCount` and deterministic `compareByInstallsDesc(a, b)` (descending installs, normalizing non-finite/negative values to `0`, tie-breaking by `skillId`, `source`, `name`) and applied it in both `withDisplayFields()` (popular + search results) and `recommendedDisplaySkills`.
6. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.spec.ts`
   - Added explicit `installs` values to the existing debounced search test fixture so its order assertion remains decoupled from lexical tie-breaking, and added dedicated sorting tests for popular skills, recommended skills, search results, non-finite/negative install counts, and deterministic tie-breaking.

## Verification

| Check | Command | Exit Code | Result |
| --- | --- | --- | --- |
| `setup-wizard` Jest | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts` | `0` | 1 suite passed, 24/24 tests passed |
| `chat-ui` Jest | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.spec.ts libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.spec.ts` | `0` | 2 suites passed, 44/44 tests passed |
| TypeScript (`setup-wizard` & `chat-ui`) | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json && npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json` | `0` | 0 errors |
| ESLint (modified source files) | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx eslint libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts` | `0` | 0 errors (1 pre-existing warning at `setup-status.store.ts:103`) |
| ESLint (modified spec files) | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx eslint libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts` (and prior check on `setup-status.store.spec.ts`, `skill-sh-browser.component.spec.ts`) | `0` | 0 errors, 0 warnings |
