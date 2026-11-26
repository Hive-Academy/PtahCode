# Batch 1 Report — Shared Contracts & Backend Active Analysis Tracking

**Task**: `TASK_2026_2329_dd5d` — Batch 1

**Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`

**Verdict**: PASS — all Batch 1 requirements implemented within the allowed write set; Jest (3 suites, 127 tests), TypeScript typechecks (`libs/shared`, `libs/backend/agent-generation`), and ESLint all exited 0 with zero errors and zero new warnings.

## Changed Files

1. `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`
   - Added backward-compatible optional fields `analysisActive?: boolean` and `activeAnalysisStartedAt?: string` to `WizardGetResumableRunResponse`.
2. `libs/shared/src/lib/types/wizard/steps.ts`
   - Added backward-compatible optional fields `lifecycle?: 'running' | 'paused' | 'completed' | 'failed'` and `isActive?: boolean` to `SavedAnalysisMetadata`.
3. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
   - Exported `ActiveMultiPhaseAnalysisInfo` (`workspacePath`, `runId`, `slug`, `startedAt`).
   - Unified active run tracking (`activeRun`) with `AbortController`, promise handle, and `path.resolve`-normalized workspace path; updated `runId` and `slug` immediately after `AnalysisRunCheckpoint.open(...)` returns `manifest`.
   - Added `getActiveRun(workspacePath?: string): ActiveMultiPhaseAnalysisInfo | null` and `isRunningForWorkspace(workspacePath: string): boolean`.
   - Updated `analyzeWorkspace()` to join and return the active run's promise when a non-aborted run is already active for the same workspace (checked both before and after `resolveSetup()` to close concurrent race windows), rather than aborting and wiping the slug directory. Preserved abort-and-start behavior for different workspaces or after `cancelAnalysis()`.
   - Updated `cancelAnalysis()` to clear `activeRun` before aborting, and guarded `finally` with `this.activeRun === runRecord` so a winding-down run cannot clear a replacement run.
   - Note: `libs/backend/agent-generation/src/index.ts` and `libs/backend/agent-generation/src/lib/services/wizard/index.ts` use explicit exports and were not modified per the Allowed Write Set (`ActiveMultiPhaseAnalysisInfo` is exported directly from `multi-phase-analysis.service.ts` and returned by `MultiPhaseAnalysisService.getActiveRun`).
   - Verified existing `multi-phase-analysis.service.spec.ts`: no existing test expected a second concurrent same-workspace call to abort.
4. `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts`
   - Exported `AnalysisFreshnessOptions` (`excludeRunId?: string | null; excludeSlug?: string | null`).
   - Added optional second parameter `options?: AnalysisFreshnessOptions` to `getStatus()` and passed it through to `findLatestRun()`.
   - Skipped directories matching `excludeSlug` (`entry.name === excludeSlug` before manifest read, and `manifest.slug === excludeSlug` after) or `excludeRunId` (`manifest.runId === excludeRunId`) so an actively executing analysis is never reported as `{ state: 'stale', reason: 'incomplete' }` or `unreadable`.
5. `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
   - Populated `lifecycle: manifest.lifecycle` on each `SavedAnalysisMetadata` item returned by `list()` without filtering out non-completed runs.
6. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts`
   - Added 5 unit tests covering `getActiveRun` / `isRunningForWorkspace` (including trailing-slash path normalization), immediate clear on `cancelAnalysis()` without clobbering a replacement run, same-workspace concurrent join (active phase and Setup-resolution race), and different-workspace abort behavior.
7. `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.spec.ts`
   - Added 3 unit tests covering exclusion by `excludeRunId` and `excludeSlug` (returning `missing` when no other run exists, falling back to a prior completed run as `fresh`, and skipping an excluded slug with an unreadable mid-write manifest).
8. `libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts`
   - Extended listing assertions and added a unit test verifying `lifecycle` is populated for `running`, `paused`, `completed`, and `failed` runs.

## Verification

All commands executed inside `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`:

| Check | Exact Command | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (focused suites) | `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-freshness.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts` | `0` | 3 suites passed, 127 tests passed (8.096 s) |
| Typecheck (`shared`) | `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | `0` | 0 errors |
| Typecheck (`agent-generation`) | `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` | `0` | 0 errors |
| ESLint (changed files) | `npx eslint libs/shared/src/lib/types/rpc/rpc-setup.types.ts libs/shared/src/lib/types/wizard/steps.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts libs/backend/agent-generation/src/lib/services/analysis-freshness.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts` | `0` | 0 errors; 29 pre-existing warnings only (`no-non-null-assertion` in pre-existing spec lines and `max-lines` on `multi-phase-analysis.service.ts`); 0 warnings on added/edited lines |
