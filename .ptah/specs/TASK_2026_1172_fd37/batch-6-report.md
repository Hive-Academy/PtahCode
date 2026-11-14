# Batch 6 report

## Changes

- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts`: malformed present effective policy now restores to Plan, so an unreadable snapshot cannot inherit a wider saved default. Missing legacy policy remains absent; valid empty policy remains valid; malformed requested policy is dropped.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts`: checks malformed snapshot fallback and missing legacy key.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts`: drives the real projection, in-memory metadata store, restore, resumer, and adapter for Claude and Codex across saved-default changes, parent Plan caps, and malformed snapshots.
- `.ptah/specs/TASK_2026_1172_fd37/batch-6-report.md`: records the batch design and exact verification results.

## Verification

All checks used focused commands. Failed intermediate runs were corrected before the final passing run.

| Exact command | Result |
| --- | --- |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` | Initial run failed to compile: 0 tests, 3 TypeScript errors in the new test. |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` | Second run failed during module setup: 0 tests, child-process Jest mock import order. |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` | Third run: 247 passed, 6 failed because the harness lacked `replayOutbox`. |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts --testNamePattern="persists, restores, and resumes"` | First targeted run: 6 failed, 247 skipped; exposed the same missing harness method. |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts --testNamePattern="persists, restores, and resumes"` | Second targeted run: 5 passed, 1 failed, 247 skipped. Corrected the Codex malformed snapshot expectation: network remains undefined. |
| `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts` | 165 passed, 0 failed. |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` | Final run: 253 passed, 0 failed. |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | Exit 0, 0 errors. |
| `npx tsc --noEmit --project libs/shared/tsconfig.spec.json` | Exit 0, 0 errors. |
| `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` | Exit 0, 0 errors. |
| `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` | Exit 0, 0 errors. |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | Exit 0, 0 errors. |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` | Exit 0, 0 errors. |
| `npx eslint libs/backend/agent-sdk/src/lib/session-metadata-store.ts libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` | Exit 0, 0 errors, 2 existing warnings (file length and an unrelated non-null assertion). |

The runtime project already imports `@ptah-extension/agent-sdk`; the integrated test therefore stays in the CLI runtime spec and uses the real store without crossing a new module boundary. The test observes adapter `runSdk` options after the real resumer calls the real manager. The parent Plan cap remains in `resolveCliLanePolicy`.
