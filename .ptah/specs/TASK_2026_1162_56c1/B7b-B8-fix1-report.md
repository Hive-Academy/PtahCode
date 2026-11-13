# B7b–B8 fix round 1 report

## Fixes

- Fix 1 — done. `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`: Back invalidates pending requests, aborts the launch, resets stage to `intent`, and clears the error. A late launch completion is guarded by launch identity. Cause: the cancellation branch returned while the stage remained `launching`; `back()` had not reset it. Attachments remain untouched.
- Fix 2 — done. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`: per-skill catch logs the failure with a real `Error` without changing the result. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`: the later-skill throw test checks the logger received an `Error`.
- Fix 3 — done. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`: added the five new wizard methods to the registration expectation.
- Fix 4 — done. `libs/backend/rpc-handlers/src/lib/di/register.ts`: registration takes only the container and has no info logs. `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts`: removed eager Logger resolution at skill service registration. `apps/ptah-electron/src/di/surface-composition.spec.ts`: updated the call-text assertion.

## Verification

- `npm run verify -- -t test -p @ptah-extension/onboarding`: failed before tests, Nx plugin loading `spawn EPERM`; no `Running target test for 1 projects` header; 0 tests run. PowerShell output was filtered to the last 40 lines.
- `npm run verify -- -t test -p @ptah-extension/rpc-handlers`: failed before tests, same Nx `spawn EPERM`; no project-count header; 0 tests run. PowerShell output was filtered to the last 40 lines.
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: failed before tests, esbuild `spawn EPERM`; 1 suite failed to run, 0 tests.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.spec.ts`: 3 suites passed, 65 tests passed.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/container.smoke.spec.ts apps/ptah-electron/src/di/rpc-surface.spec.ts apps/ptah-electron/src/di/surface-composition.spec.ts`: 3 suites passed, 94 tests passed; process exited 1 after a SQLite asynchronous task attempted `require` after Jest teardown. These are the three requested Electron DI guards.
- `git diff --check -- [the seven changed code/spec paths]`: passed, no whitespace errors.

## Unexpected

- Nx verification is blocked by `spawn EPERM` in this environment. The frontend focused Jest fallback is likewise blocked by esbuild `spawn EPERM`.
- Existing unrelated tracked and untracked work was present before edits, including the prohibited `libs/backend/harness-sync/src/lib/targets/copy-engine.skill-markdown.spec.ts`; it was left untouched. The page, handler and install spec already had task changes before this fix round.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: 1 suite passed, 19 tests passed. This is the requested CLI RPC guard.

- No rendered UI screenshot was available for this logic-only page change; the brief prohibits build/serve/dev, and the frontend test runner was blocked by spawn EPERM.
