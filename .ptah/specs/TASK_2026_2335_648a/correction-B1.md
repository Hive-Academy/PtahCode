# B1 and B3 correction

## 1. Ptah CLI flag settings

Added `disableBundledSkills: true` and `skillListingMaxDescChars: 200` to four strict expected Settings objects covering five test cases. All existing assertions remain in place. See `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-auto-compact-argv.spec.ts:474,486,509,524`.

Batch B1 report, Revise round 2 defect 4, calls for bundled-skill suppression on Ptah CLI spawns. `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:1001` calls the shared lane builder, which passes `true` to `buildFlagSettingsArg` at `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:257–266`. The settings builder adds the suppression flag and the 200-character cap at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:448–456,497–498`.

## 2. RPC opt-in coverage

Added a round-trip test with every ID in the public `CLAUDE_BUNDLED_SKILL_IDS` catalog. It verifies storage through `agent:setConfig` and reads through `agent:getConfig` and `agent:getClaudeBuiltins`. See `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.spec.ts:1053`. The B1 fix adds the catalog to both the read normalizer and the shared write allowlist in `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:724–728,759–764,1184`.

## 3. Effective tool-list snapshots

Ran only `effective-tool-list.spec.ts` with Jest `-u` (10 passed, 0 failed; 3 snapshots updated and 1 already matched). The exact-path Git diff showed three replacements at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/__snapshots__/effective-tool-list.spec.ts.snap:45,128,210`. All three replace the `ptah_agent_spawn` hash `7e542497259c86ca` with `d8d9493e9e8db858`. Tool names and their order are identical. B3 changed the spawn description and parameter descriptions in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:806`. No snapshot lines required manual restoration.

## Verification

| Focused check | Passed | Failed |
| --- | ---: | ---: |
| Jest · `ptah-cli-registry-auto-compact-argv.spec.ts` | 10 | 0 |
| Jest · `sdk-query-options-builder.auto-compact-argv.spec.ts` | 16 | 0 |
| Jest · `agent-rpc.handlers.spec.ts` | 88 | 0 |
| Jest · `effective-tool-list.spec.ts` without `-u` | 10 | 0 |
| Snapshots · `effective-tool-list.spec.ts` without `-u` | 4 | 0 |
| TypeScript · `cli-agent-runtime/tsconfig.lib.json` | 1 | 0 |
| TypeScript · `agent-sdk/tsconfig.lib.json` | 1 | 0 |

All four Jest suites passed on their final runs. The first RPC run reported 88 passing tests and stayed open after Jest warned about asynchronous operations. I stopped that process and reran the same spec with `--forceExit`. It reported 88 passing tests and exited with code 0. The open handle remains uninvestigated. Both `tsc --noEmit` checks exited with code 0. Scoped `git diff --check` passed.

The run list named two non-RPC specs explicitly. I used the SDK-side auto-compact argv spec as the third because it checks the same Settings serialization. Ptah skill discovery returned no local match for Jest testing. I used native Git, Jest, and TypeScript for the focused checks.
