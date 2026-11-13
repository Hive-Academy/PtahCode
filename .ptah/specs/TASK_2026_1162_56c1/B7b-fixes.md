# B7b skill install fixes

- Installed content mismatch: validates the installed path within the workspace plugins folder, removes changed installed bytes, and invalidates caches before returning failure. The regression test checks that no installed directory, consent record, or selection remains.
- Partial progress: catches failures per skill, returns `installed`, `failedSkill`, and `reason`, then saves selection and propagates successfully installed skills. A two-skill test covers a later thrown error.
- Install RPC data: uses a Zod `success: true` parse instead of an unchecked cast.
- Logging: mismatch logging passes a real `Error` and skill context.
- Preview decision: documented in `decisions.md`; submitted preview hash is checked against staged bytes, then installed bytes. No server-held preview record is required.

## Verification

- `npm run validate-skill`: passed, 21 files, zero errors or warnings.
- `npm run verify -- -p @ptah-extension/rpc-handlers -t typecheck,test`: Nx plugin loading failed with `spawn EPERM` before either target could run.
- Role census command: `git ls-files failed: undefined` in the current sandbox.
- Direct `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed.
- Focused `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts`: passed, 7 tests.
- Ptah scoped diagnostics timed out after 45 seconds; direct typecheck passed.
- Staging the four task files failed: Git could not create the worktree `index.lock` because `.git/worktrees/...` is read only in this lane. Files are written but unstaged.
