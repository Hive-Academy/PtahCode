# CI shared entry point fix

## Changes

- `libs/shared/src/index.ts:79` removes the local-command re-export at the former export line, cutting the root entry's path to the Zod-based ptah-ui pipeline.
- `libs/shared/src/mcp-apps-contracts/index.ts:124` exports the existing local-command API, including its formatter, types, parsers, and renderers.
- `libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts:19` and `libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts:37` import the formatter from the secondary entry. The three requested agent-sdk specs exercise the callers without directly importing or mocking the formatter. Formatter and caller logic are unchanged.

## Decisions

- Reused the existing secondary alias at `tsconfig.base.json:264`. A new alias was unnecessary because the formatter imports the pipeline module directly, so this export introduces no barrel cycle, and agent-sdk enables strict mode in `libs/backend/agent-sdk/tsconfig.json:7` and `libs/backend/agent-sdk/tsconfig.spec.json:11`. The choice is reversible by moving the re-export and changing the two imports.
- Confirmed the dependency by inspecting the tags and rule configuration. Agent-sdk is `scope:extension` / `type:feature`, shared is `scope:shared` / `type:util`, and `eslint.config.mjs:285` allows the scope edge. The secondary entry belongs to the same shared project, and `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-ui-hint.spec.ts:5` already imports its `/surface` sibling. ESLint did not independently validate the edge because the cached project graph was unavailable.

## Verification

Commands ran from the worktree using the Windows `node_modules/.bin/*.cmd` shims.

| Command | Result |
| --- | --- |
| `jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/local-command/local-command-output.spec.ts libs/shared/src/index.zod-free.spec.ts` | Exit 0. 2 suites and 50 tests passed. |
| `jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.spec.ts libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts` | Exit 0. 3 suites and 171 tests passed. |
| `tsc --noEmit -p libs/shared/tsconfig.lib.json` | Exit 0. |
| `tsc --noEmit -p libs/backend/agent-sdk/tsconfig.lib.json` | Exit 0. |
| `tsc --noEmit -p libs/backend/platform-cli/tsconfig.lib.json` | Exit 0. |
| `tsc --noEmit -p libs/backend/settings-core/tsconfig.spec.json` | Exit 2. TS2835 on extensionless `./runner` imports in `src/migrations/migration-edge-cases.spec.ts:161:46` and `src/migrations/v4-migration.spec.ts:362:46`. No MCP apps contract diagnostics. |
| `tsc --noEmit -p libs/backend/settings-core/tsconfig.lib.json` | Exit 0. Used the requested library-config fallback. |
| `eslint libs/shared/src/index.ts libs/shared/src/mcp-apps-contracts/index.ts libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts` | Exit 0. No errors and five warnings in session replay at 452:41, 515:25, 791:1, 822:11, and 823:37. Nx module-boundary rule skipped because no cached project graph was available. |
| `ptah_get_diagnostics` scoped to the four changed files | Clean on retry, with zero errors or warnings. |

Both Jest invocations emitted a Node warning while loading the TypeScript Jest config and completed successfully. The Zod-free spec covers selected contract modules. Its header documents pre-existing Zod paths through the root barrel, which are outside this change.
