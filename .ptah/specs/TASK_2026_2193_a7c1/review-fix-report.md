# Review fix report

## Changes

| Finding | Fix | Files |
| --- | --- | --- |
| M1 | Seeded the page identity for an empty run and restore the missing-analysis error after state reset. Added a focused no-analysis spec. | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`, `.spec.ts` |
| m1 | Skip a malformed structured phase, retain valid items from the other phase, and return a warning. Legacy extraction still runs only when neither phase has a block. Added a malformed JSON plus valid phase spec. | `libs/backend/agent-generation/src/lib/services/wizard/stack-summary.extractor.ts`, `.spec.ts` |
| m2 | Terms shorter than two characters remain unmatched; two-character terms require a full skill name or ID token. Added negative and positive matching specs. | `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`, `.spec.ts` |
| m3 | Removed the redundant phase file reads, extraction, and debug log after analysis completion. The response extraction in `AnalysisStorageService.toResponse` remains the single consumer. | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` |
| m4 | Draft fields reset only when the item's kind and name change. Added a spec for reloading an item with the same identity. | `libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts`, `.spec.ts` |
| Raw search failure reason | UI-facing failures use fixed `Search failed` or `Search timed out` text; arbitrary error messages are no longer returned. Updated the failure spec. | `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`, `.spec.ts` |

## Checks

- Agent generation focused Jest: passed, 5 tests, including the final malformed JSON fixture.
- RPC handlers focused Jest: passed, 4 tests.
- Onboarding focused Jest: could not start; esbuild failed with `spawn EPERM` before running tests.
- `npx tsc --noEmit --project <tsconfig.lib.json>`: passed for onboarding, agent-generation, and rpc-handlers.
- `npx eslint <changed files>`: passed with 0 errors and 21 warnings. Warnings concern existing explicit member accessibility and the existing length of `multi-phase-analysis.service.ts`.
- Scoped Ptah diagnostics was unavailable after its 45-second timeout; the three direct TypeScript checks above completed successfully.

The frontend Jest specs remain unexecuted because of the environment's `spawn EPERM` failure.
No rendered UI or screenshot was checked: this review fix changed component state behavior, and this run prohibited launching the application. No design reference was supplied for a visual comparison.
