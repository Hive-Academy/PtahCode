# PR #1432 review fix

Implemented workspace-open migration of the legacy marked analysis imports into the existing analysis index format.

## Changes

- `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts:34`: added `migrateLegacyBlock`. Requires exactly one ordered marker pair and a body containing only safe legacy analysis imports (blank lines allowed). Missing files, missing markers, malformed/duplicated markers, and non-legacy bodies are debug-logged and left untouched. It requires no analysis manifest or phase-file reads.
- `analysis-claude-md-linker.ts:42`: reads bytes and splices only the content between marker bytes. Preserves all outside bytes, including BOM, mixed line endings, Unicode, invalid UTF-8, user imports, and trailing spaces. Checks for an intervening editor save before writing.
- `analysis-claude-md-linker.ts:84`: extracted the index formatter for reuse by normal linking and migration. Both operations share the same per-workspace serialization queue (`:91`). Filesystem failures use `catch (error: unknown)`, debug logging, and a non-throwing result.
- `libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.ts:8`: shared startup boundary catches DI-resolution and unexpected migration failures. Accepts an explicit Electron root or resolves the CLI workspace provider root.
- `libs/backend/agent-generation/src/index.ts:33`: exports the startup helper.
- `apps/ptah-electron/src/activation/boot-heavy-services.ts:235`: awaits migration during each workspace's initial activation, after persistence settles and before harness activation. The existing workspace boot latch handles startup and newly opened roots.
- `libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts:300`: awaits migration after workspace readiness in full mode, before SDK initialization. Minimal commands do not register agent-generation and skip migration. Uses host-neutral filesystem and workspace ports; platform-cli needs no changes.
- `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts:178`: focused migration coverage for index formatting, repeated migration, no block/file, malformed/unbalanced/reversed/duplicated markers, non-legacy content, outside-byte preservation, editor changes, and Error/non-Error write failures.
- `libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.spec.ts:8`: Electron/CLI root selection and non-fatal migration/DI failures.
- `apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts:158`: activation regression for both opened roots and ordering before harness refresh.

## Decisions

- Reuse paths from the old marked imports instead of selecting a new completed analysis. This fixes existing workspaces even when their manifest is absent or old, without scanning analysis outputs at startup.
- Preserve non-legacy bodies exactly, including already migrated indexes with user edits. Conservative path validation matches the linker's safe slug/file syntax.
- No new injectable or token. The linker is already registered by `registerAgentGenerationServices` in both Electron (`apps/ptah-electron/src/di/phase-2-libraries.ts:441`) and CLI (`libs/backend/cli-engine/src/lib/container.ts:927`); no expected-resolvable changes are needed.
- All changed source/spec files are below 700 lines (largest: with-engine.ts, 631 lines). No new any, double unknown cast, non-null assertion, or Windows home path.
- Preserved the pre-existing external modification to task.md. No commit, push, or PR response.

## Checks

1. PASS — `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.spec.ts`
   - 2 suites, 35 tests passed. An initial BOM-preservation failure led to the byte-splicing implementation; the final run passes.
2. PASS — `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` (exit 0).
3. BLOCKED — `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts apps/ptah-electron/src/activation/boot-order.spec.ts`
   - Both suites failed before executing tests because the existing Jest mapper points `marked` to missing `node_modules/marked/lib/marked.umd.js`. The failure enters through the agent-sdk/tool-output-reducers graph. No Electron assertions ran; the activation regression remains unverified at runtime.
4. PASS — `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` (exit 0).
5. PASS with existing warnings — `npx eslint apps/ptah-electron/src/activation/boot-heavy-services.ts apps/ptah-electron/src/activation/boot-heavy-services.install-scope.spec.ts libs/backend/agent-generation/src/index.ts libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.ts libs/backend/agent-generation/src/lib/services/migrate-workspace-analysis-index.spec.ts libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts`
   - Exit 0; zero errors. Five warnings on pre-existing non-null assertions in the original linker specs (lines 69, 82, 93, 123, 124); none introduced by this change.
6. PASS — `git diff --check`; inspected changed-file line counts and final worktree status.

No Nx, verify, build, serve, dev, or e2e targets were run. Heavy CLI checks ran sequentially. Ptah diagnostics were requested per lane guidance but returned unavailable after a compiler timeout; no diagnostic success is claimed. Ptah dependency coverage was partial, so native rg/source inspection supplemented it. Codex skill discovery/loading was not exposed in this session; local skill descriptions were inspected and none matched this small backend fix.
