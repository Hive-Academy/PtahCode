# Merge fix report

- **Major 1:** Removed both new `SetupRpcHandlers` constructor dependencies. `wizard:recommend-analysis-skills` resolves storage and recommendation services inside its try block, so resolution failures return fixed empty copy. Updated the constructor harness in `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`; the skills-stubs spec and constructor typecheck pass.
- **Major 2:** Added `AnalysisStorageService.loadByRunId` in `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`. It finds the matching manifest and loads only that run. Storage specs cover a match, no match, and an unreadable unrelated manifest. The handler uses this method.
- **Minor 1:** Corrected the analyze/skills route comment in `libs/frontend/core/src/lib/routing/onboarding-routes.ts`.
- **Minor 2:** Ran Prettier on the five changed TypeScript files.
- **Minor 3:** Added handler specs for missing stack summary, no open workspace, and a storage error; all assert empty results without raw error copy.

## Checks

- `npx prettier --write libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts libs/frontend/core/src/lib/routing/onboarding-routes.ts` — passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/handlers/host-profile/manifest.spec.ts` — failed: host-profile path does not exist; other two suites passed (53 tests).
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts` — passed, 3 suites, 61 tests.
- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts` — passed, 48 tests.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` — passed.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.spec.json` — passed.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.spec.json` — failed with errors in untouched auth-state and mock RPC specs plus shared BigInt target errors; no errors reported in the changed route file.
- `npx eslint libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts libs/frontend/core/src/lib/routing/onboarding-routes.ts` — passed with 0 errors, 2 handler warnings (`preserve-caught-error`, `max-lines`).

Merge state was left untouched.
