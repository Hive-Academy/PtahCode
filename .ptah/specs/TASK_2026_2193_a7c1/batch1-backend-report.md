# Batch 1 backend report

## Files changed

- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`, `libs/shared/src/lib/types/rpc.types.ts`: stack summary and analysis recommendation contracts and RPC registry entry.
- `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-prompts.ts`, `stack-summary.extractor.ts`, `stack-summary.extractor.spec.ts`, `multi-phase-analysis.service.ts`, `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`: structured stack output request, bounded parsing and legacy fallback, live extraction, and response population for live and saved runs.
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`, `skill-recommendation.service.spec.ts`: typed stack item recommendations with bounded concurrent searches, timeout, deduplication, unmatched items and per-item failures; package dependency path remains.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts`, `setup-rpc.schema.spec.ts`: strict `runId` parameter schema.

## Exact exported type names

`StackItemKind`, `StackSummaryItem`, `StackSummary`, `WizardRecommendAnalysisSkillsParams`, `WizardRecommendAnalysisSkillsResult`; `MultiPhaseAnalysisResponse.stackSummary` is optional.

## Decisions

- Attach summaries in `AnalysisStorageService.toResponse`, the shared response builder used by live and saved analysis handlers. This avoids a second response path in the phase runner. Reversible.
- Malformed structured blocks yield empty items and a warning; old runs use a bounded heading scan marked `legacy`. Reversible.

## Checks

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`: passed after correcting the phase ID type.
- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.spec.ts`: 4 passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`: 16 passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`: 2 passed after the final matching change.
- `ptah_get_diagnostics` was called after edits; its TypeScript check was still running after 45 seconds and returned unchecked coverage. Both targeted `tsc` checks completed.
- `npx eslint <changed backend/shared files>`: 0 errors; 3 warnings in the existing large `rpc.types.ts` file (two unused imports and max-lines). Nx module-boundary checks were skipped because no cached ProjectGraph was available.
- `npx eslint libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.ts libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.spec.ts`: 0 errors, 1 max-lines warning in the existing phase runner.

## Open items after PR #1333

- Implement `wizard:recommend-analysis-skills` in `setup-rpc.handlers.ts`: validate runId, load the saved run for the active workspace, use its `stackSummary`, invoke `SkillRecommendationService.recommendAnalysis`, and return warnings and failure details. Add the handler spec.
- Update Electron and CLI RPC composition guard specs after the overlapping PR merges. No forbidden handler, DI guard or frontend files were edited in this batch.
