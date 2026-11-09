# Batch B7 report

## Files changed

- `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.ts`
- `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.spec.ts`

## Change

Removed the `Stop` callback registration, `onStop`, the debounced `scheduleHarvest`/`fireHarvest` chain, harvest timer state, and the trigger service's Stop registry and harvester dependencies. Retained SubagentStop, PostToolUse, and prompt expansion telemetry. The explicit `SpecHarvesterService.harvestTask` and `skillSynthesis:harvestSpecs` paths were inspected and left intact. The trigger unit spec now dispatches a Stop event and asserts the registry has no trigger service subscriber; telemetry coverage remains.

## Verification

Command: `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/cli-engine` (one foreground run).

- Lint and typecheck: **pass**, 4/4 tasks.
- Tests: **fail**, 1/2 tasks. Skill synthesis had 35 passing suites and one suite unable to compile: `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.integration.spec.ts:55` constructs `SkillTriggerService` with 10 arguments; the service now accepts 8 (`TS2554`). This is caused by the B7 constructor change, not a pre-existing main failure. That integration spec is outside B7's owned file list, so it remains for the owner to update. CLI engine's test task passed.
- Scoped `ptah_get_diagnostics` was requested after edits; its TypeScript check exceeded its 45-second response window, so it returned unavailable. The verify typecheck passed afterward.

## Decisions

- Removed the two constructor dependencies along with the automatic Stop harvest chain. Keeping unused injected dependencies would preserve a stale coupling. The constructor call in the unowned integration spec needs to be updated by its owner; this is reversible.

## Unmet requirement

- The requested verify command cannot pass until the unowned integration spec updates its constructor call.
