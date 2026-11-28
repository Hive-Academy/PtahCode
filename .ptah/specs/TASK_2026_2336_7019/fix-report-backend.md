# Backend fixes for TASK_2026_2336_7019

## Findings

1. Replay visibility and provenance. Both wrapped stdout shapes pass the meta, synthetic, tool provenance and skill/command text filters before promotion. Replay pairs the stdout with an immediately preceding usage or context command echo. The replay spec covers both positive echo shapes and exercises the old hidden cases against a matching echo. [Replay implementation](../../../libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts#L274), [replay specs](../../../libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts#L435)
2. Grammar validation and weekly limits. The formatter compiles the finished body before fencing it and returns the original input if compilation fails. The weekly grid contains at most four cards and puts remaining limits into a table. The 51-limit regression asserts four cards, 47 table rows and successful compilation. [Formatter](../../../libs/shared/src/lib/local-command/format-local-command-output.ts#L25), [weekly-limit renderer](../../../libs/shared/src/lib/local-command/usage-output.render.ts#L75), [regression](../../../libs/shared/src/lib/local-command/local-command-output.spec.ts#L169)
3. Usage detection. The parser requires a Current week limit or a Last window header with both request and session counts. Replay routes a paired report through the parser for its command. A generic utilization line passes through live and stays hidden in both replay shapes. [Usage signature](../../../libs/shared/src/lib/local-command/usage-output.parser.ts#L15), [live regression](../../../libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.spec.ts#L443), [replay regressions](../../../libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts#L493)
4. Message IDs. Live and replay use the same command ID prefix and supplied UUID. Only records without a UUID need a generated fallback. Artifact parity asserts the visible text and the ID on all three events for both replay shapes. [Live ID](../../../libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts#L177), [parity specs](../../../libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts#L372)
5. Replay timestamps. Untimed cards start after the latest emitted event, including a preceding assistant completion's sequence offset. Replay uses the preceding valid record time, the first following valid time when needed, or a deterministic zero-based sequence. The specs cover both timed neighbours, consecutive untimed cards, and a repeated all-untimed replay with different mocked clocks. [Timestamp implementation](../../../libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts#L258), [timestamp specs](../../../libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts#L554)
6. Exponent notation. The decimal writer rejects rounded magnitudes at or above 1e21 and non-finite values. The formatter returns the original report on that error. The chart regression supplies a full decimal spelling of 1e21 as a contributor percentage. [Decimal writer](../../../libs/shared/src/lib/local-command/ptah-ui-writer.ts#L34), [regression](../../../libs/shared/src/lib/local-command/local-command-output.spec.ts#L177)

## Decisions

- Pair the immediately preceding command echo with a wrapped stdout record. Both supported record shapes have ordered echoes, and limiting the match to one pair avoids reusing an old invocation after an unrelated record. A wider lookback would need evidence of an intervening record format and a reliable correlation key. The matching rule is local and reversible.
- Pass the recorded command to the existing formatter as an optional parser constraint. Live messages lack a command name and continue using their content signature. This avoids inferring command identity from a generated title. The constraint is additive and reversible.
- Preserve weekly-limit detail in an overflow table and reject oversized chart numbers through the formatter's existing raw fallback. Truncating rows or clamping chart values would silently alter report data. Progress percentages already use their existing bounded display range.
- Retain the existing replay sequence offsets and use a deterministic baseline for untimed main transcript records, including ordinary turns. This prevents an untimed assistant or user record from passing a wall-clock timestamp to a later command card. The fallback is local to replay and reversible.

## Additional files read

- Task inputs under this folder were task.md, context.md and code-logic-review-codex.md.
- Repository guidance was read from CLAUDE.md. Ptah file search found no AGENTS.md. A native rg file check confirmed that result.
- Replay and SDK contracts were inspected in libs/backend/agent-sdk/src/lib/helpers/history/history.types.ts, libs/backend/agent-sdk/src/lib/helpers/history/history-event-factory.ts, libs/backend/agent-sdk/src/lib/message-transform/message-transform-helpers.ts, libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts and node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts.
- Grammar was inspected in libs/shared/src/mcp-apps-contracts/ptah-ui-pipeline.ts and libs/shared/src/mcp-apps-contracts/ptah-ui-parser.ts.

## Verification

Commands below ran from the supplied worktree using the Windows command shims.

```powershell
node_modules/.bin/jest.cmd --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/local-command/local-command-output.spec.ts
node_modules/.bin/jest.cmd --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.spec.ts libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts
node_modules/.bin/tsc.cmd --noEmit --project libs/shared/tsconfig.lib.json
node_modules/.bin/tsc.cmd --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
node_modules/.bin/eslint.cmd libs/shared/src/lib/local-command/format-local-command-output.ts libs/shared/src/lib/local-command/usage-output.parser.ts libs/shared/src/lib/local-command/usage-output.render.ts libs/shared/src/lib/local-command/ptah-ui-writer.ts libs/shared/src/lib/local-command/local-command-output.spec.ts libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.spec.ts libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts
```

- Shared Jest passed 1 suite and 39 tests, with 0 failures.
- Agent SDK Jest passed 3 suites and 171 tests, with 0 failures.
- Shared and agent SDK TypeScript checks both exited 0 with 0 errors.
- ESLint exited 0 across 10 files with 0 errors and 6 rule warnings. Those warnings cover unused sequence increments, file length and a pre-existing non-null assertion. ESLint emitted 10 additional messages that it skipped the Nx module-boundaries rule because the cached project graph was unavailable.
- Jest emitted the existing ES module loading warning for the TypeScript configs.
- Scoped Ptah diagnostics timed out twice and reported 10 unchecked files each time. The targeted native TypeScript and Jest commands supplied the compiler verification.

The initial agent SDK Jest run passed 1 suite and 77 tests and failed to load 2 suites because of TS7030. The initial agent SDK TypeScript run reported that one error. The initial lint run reported 2 errors and 6 warnings. After the first fixes, a fixture type error caused 1 Jest suite to fail to load while the other 2 suites passed 96 tests. The final results above include the corrections.

## Remaining work

CI must verify Nx module boundaries. The authorized local command set excludes generating the Nx project graph.
