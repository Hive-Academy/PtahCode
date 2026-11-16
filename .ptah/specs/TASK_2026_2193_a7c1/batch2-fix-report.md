# Batch 2 frontend test fixes

## Changes

- Removed the unused `ClaudeRpcService` and `GenerationWorkflowStore` injections from `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`. Analysis loading no longer constructs the removed agent-generation dependency chain.
- Updated `libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts` to expect the Analyze and review skills link at `/onboarding/analyze`, and to assert that no Analyze agents link is rendered.

## Checks

- Focused Jest for the two affected specs: tests did not start in this sandbox; esbuild returned `spawn EPERM` for both suites.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: passed.
- `npx eslint` on the two edited files: passed with 0 errors and existing warnings.
- `ptah_get_diagnostics` on both edited files: 0 errors in requested files. It reports existing sibling spec and shared/worker TS target errors.

## Open items

- The coordinator must rerun the two Jest suites outside this sandbox to confirm the three reported failures are resolved.
