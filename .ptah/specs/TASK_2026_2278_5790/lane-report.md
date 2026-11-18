# Settings field info implementation - TASK_2026_2278_5790

Implemented the lane brief in the supplied worktree. Long help now uses the trailing info action; short range/download hints remain below fields. Existing lane intro hooks remain on the hidden accessible description. Session budget number inputs and suffixes follow Context budgets.

## Changed files

- `libs/frontend/ui/src/lib/surfaces/field.component.ts` - optional infoTextId/infoTestId and stale description-ID removal.
- `libs/frontend/ui/src/lib/surfaces/field.component.spec.ts` - generated/custom IDs, hook preservation, ID changes/reset and existing popover interaction coverage.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts` - range-only hint/error companion; intro moved to info with original hooks.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.logic.ts` - preserved intro text in field metadata.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.spec.ts` - info action, hidden intro and accessible association; original intro assertions retained.
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts` - number/select info, range hints, Context budgets input/suffix styling.
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts` - all number help/ranges, select help/actions and new styling.
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts` - Whisper download hint plus model info; custom model info.
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts` - curated/custom info actions and text; short hint.
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts` - custom model info.
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts` - custom model info action and text.
- `.ptah/specs/TASK_2026_2278_5790/lane-report.md` - this deliverable.

## Checks

- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/surfaces/field.component.spec.ts` - PASS: 1 suite, 15 tests.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts` - FAIL: 3 suites passed, 1 failed; 99 tests passed, 2 failed. Fixed the default-size expectation (the directive defaults to sm) and moved the existing advisory-text assertion to the info description. Rerun below passes.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts` - PASS: 1 suite, 50 tests. The other three chat suites passed on the initial run (51 tests). All changed component suites now pass, with 116 unique tests including UI.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` - PASS, exit 0.
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` - PASS, exit 0.
- `npx eslint libs/frontend/ui/src/lib/surfaces/field.component.ts libs/frontend/ui/src/lib/surfaces/field.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.logic.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts` - PASS, exit 0, no diagnostics.
- `ptah_get_diagnostics` scoped to the 11 changed TypeScript files (two attempts, after implementation and after final checks) - unavailable: compiler still running after 45 seconds; no clean diagnostic result claimed. Both direct library tsc checks passed as recorded above.

## Decisions

- Follow the explicit Context budgets markup and keep the lane guard compact input, as required by the lane brief; these are reversible renderer-only changes.
- Removing explicit size="sm" still produces input-sm because PtahTextControlBase defaults to sm. Retained the default class assertion and added a check that no size attribute is supplied. No directive default was changed.
- Replace the lane guard metadata help with info because the intro first sentence covers the old help. Preserve the full intro text and original DOM hooks.

## Open points

- Electron visual screenshots and select stacking review belong to the coordinator in context.md; no rendered visual result is claimed by this lane. Build/serve/e2e commands are prohibited for this lane.
- Skill discovery/loading tools are unavailable in the lane tool catalogue. No skill instructions were reconstructed; implementation follows the brief, repository instructions and existing components.
- ptah_ast_analyze later returned a transport error for text-control.base.ts; native read confirmed its default size.
- ptah_search_files returned zero task/instruction paths; native listing used for those.
- No Providers files, docs files, or protected design-preview shot were edited. No Git command was run.
