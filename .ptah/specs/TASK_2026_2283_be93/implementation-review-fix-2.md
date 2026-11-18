# Migration review follow-up (F1–F3)

Applied all three requested findings to the uncommitted migration fix. No commit, push, or PR response was made.

## Changes and decisions

- F1 — `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts:41`: startup migration checks `IFileSystemProvider.lstat` before reading CLAUDE.md. Only `FileType.File` proceeds; symbolic links (including combined file/symlink flags), directories, and unknown entries return without reading or writing and log at debug. Normal `link()` behavior is unchanged. Existing formatter reuse, byte preservation, and per-path serialization remain intact.
- F1 specs — `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts:221`: four file-type cases assert the skip result, debug log, no byte reads/writes, and unchanged original content.
- F2 — `apps/ptah-electron/src/activation/boot-heavy-services.ts:235` and `libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts:300`: start the non-rejecting helper with `void` instead of awaiting it. Workspace readiness still precedes CLI migration. The helper and existing linker queue retain error containment and serialization.
- F2 Electron spec — `apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts:158`: an indefinitely pending migration helper still permits boot completion, user-layer refresh, and harness reconciliation.
- F2/F3 CLI specs — `libs/backend/cli-engine/src/lib/bootstrap/with-engine.analysis-index.spec.ts:60`: full mode calls the helper and linker with the workspace root; minimal mode calls neither. At line 73, a linker that never resolves still permits the command and engine lifecycle to complete. Tests exercise the real helper behind a spy, with a child DI container and mocked unrelated bootstrap/lifecycle boundaries.
- Kept the coordinator's `logMigrationFailure` implementation in `migrate-workspace-analysis-index.ts` unchanged.
- No new injectable or registration was needed. Added a separate CLI spec because the existing `with-engine.spec.ts` already exceeds 700 lines. Every source/spec changed in this pass is below 700 lines (largest: with-engine.ts, 631). No new any, double unknown cast, non-null assertion, or Windows home path.

## Verification

All heavy CLI checks ran sequentially. No Nx or npm verify commands were run.

1. PASS — `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.spec.ts`
   - 2 suites, 39 tests passed.
2. PASS — `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/bootstrap/with-engine.analysis-index.spec.ts`
   - 1 suite, 3 tests passed. This project provides jest.config.cjs, not jest.config.ts; used its existing configuration. An initial test-fixture logger type error was corrected by resolving the typed logger from DI before the successful rerun.
3. PASS — `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts apps/ptah-electron/src/activation/boot-order.spec.ts`
   - 2 suites, 27 tests passed. The previous missing-dependency limitation did not recur.
4. PASS — `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` (exit 0).
5. PASS — `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` (exit 0).
6. PASS with existing warnings — `npx eslint apps/ptah-electron/src/activation/boot-heavy-services.ts apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts libs/backend/agent-generation/src/index.ts libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.spec.ts libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts libs/backend/cli-engine/src/lib/bootstrap/with-engine.analysis-index.spec.ts`
   - Exit 0, zero errors; five pre-existing non-null assertion warnings in the original linker specs (now lines 70, 83, 94, 124, 125).
7. PASS — `git diff --check` and changed-file line counts.

## Tooling and remaining requirements

- Checked available tools. CLI-native skill discovery/loading is not exposed in this session; no matching skill was loaded. No design/UI work was required.
- Requested Ptah dependents and scoped diagnostics; diagnostics returned unavailable after its compiler timeout, so direct TypeScript checks above provide verification. Native rg and source inspection supplemented Ptah context.
- Preserved unrelated/pre-existing task metadata and prior lane changes. No requested finding remains unimplemented.
