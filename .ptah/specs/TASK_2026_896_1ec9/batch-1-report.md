## Changes

- `apps/ptah-electron/src/services/review/review-lane-gateway.ts:32`: One lane builder filters disabled system CLIs, adds eligible Ptah CLI agents, computes family, and applies preferred order. Both list and spawn use it. `:74` writes large prompts to `task/review-task.md` and removes the file in `finally`.
- `apps/ptah-electron/src/di/phase-2-libraries.ts:494`: Lazy registry and workspace provider resolvers.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:375`: Detailed version probe returns output and exit code; existing probe delegates to it.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:213`: Copilot exit 127 is unavailable without a path.
- `apps/ptah-electron/src/services/review/review-lane-gateway.spec.ts:10,45`: Lane selection, registry fallback, spawn, and prompt file cases.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts:180` and `cli-adapter.utils.spec.ts:1018`: Shim and detailed probe cases.

## Tests

- Required `npm run verify -- -p ptah-electron,@ptah-extension/cli-agent-runtime` ran once. Lint and typecheck passed (4/4 tasks). Jest projects failed due a missing `marked` mapping in this worktree. The run also found TS2345 in the new gateway spec; corrected afterward by providing a definite working directory fallback. Scoped Ptah diagnostics timed out before reporting results.

## Verify result

- Lint/typecheck: `NX 4 tasks: 4 succeeded`.
- Test: `NX 12 tasks: 10 succeeded, 2 failed` (`@ptah-extension/cli-agent-runtime:test`, `ptah-electron:test`).
- CLI runtime: 84 suites failed, 89 passed; 1252 tests passed. Electron: 39 suites failed, 68 passed; 9 tests failed, 1308 passed. Many suites could not locate `node_modules/marked/lib/marked.umd.js`; the gateway spec also had the corrected TS2345 during this run. Tests were not rerun after that correction, per the one-run verify instruction.

## Extra reads

- `apps/ptah-electron/src/services/review/review-lane-files.ts`: Confirmed checksum snapshots only `src/` and output handling stays under `out/`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts`: Reference lane row and sort rules.
- `libs/backend/cli-agent-runtime/src/index.ts`, `src/lib/ptah-cli/index.ts`, and `src/lib/ptah-cli/helpers/ptah-cli-registry.utils.ts`: Confirmed public registry and role delivery exports.
- Nx test logs under `/home/amun/.nx/8b7110c7390b9603/cache/terminalOutputs/`: Identified the test failures.

## Decisions

- Used an attempt-local `task/` file because `ReviewLaneFiles.sourceChecksum()` resolves `src/` only; `clearOutput()` handles `out/` only. Reversible.
- Kept registry and workspace resolution lazy so late registration does not prevent gateway construction. Reversible.
