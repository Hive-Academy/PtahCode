# B7c fixes

## Changes

- `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.ts`: Added an optional staged verifier after hashing and before any root write.
- `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.spec.ts`: Added a rejection test that checks the old skill bytes and metadata remain unchanged.
- `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts`: Shared the install pipeline through a public method that accepts the staged verifier. The RPC method calls it without a verifier.
- `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts`: Checked that the direct method passes the verifier through the shared install path.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`: The wizard calls `SkillsShRpcHandlers.install` from DI, checks staged bytes before the move, and returns fixed text for other errors.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`: Updated the fixture for the direct call and checked mismatch, old copy, script consent, partial progress, and safe error text.
- `.ptah/specs/TASK_2026_1162_56c1/decisions.md`: Replaced the B7b consent binding section with the one-fetch staged check.

## Decisions

- Use the existing DI container to resolve `SkillsShRpcHandlers` in the wizard. The alternative was a new constructor dependency. The container is already present in `SetupRpcHandlers`; this keeps the install pipeline in one owner. Reversible.
- Existing wizard test expectations changed because installation now calls the direct method, a mismatch is rejected on staged bytes, and other errors use fixed client text.

## Verification

- `npm run verify -- -t typecheck,test -p @ptah-extension/rpc-handlers`: no output after several minutes; stopped. No pass claimed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed, exit 0.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the three changed specs: 2 suites passed, 1 failed; 129 tests passed, 1 failed. The failure was a mock hash left from an earlier test.
- The same Jest command for `setup-rpc-skill-install.spec.ts` after resetting that mock in `beforeEach`: 1 suite passed, 7 tests passed. The other two suites passed in the combined run.
- Scoped `ptah_get_diagnostics` did not finish within its 45-second limit. The direct TypeScript check above passed.

## Unexpected

- The project verifier produced no result before it was stopped. No files outside the allowed write set were changed by this lane.
