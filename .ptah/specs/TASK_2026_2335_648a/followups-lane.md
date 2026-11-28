# Prompt follow-ups

## Files changed

Paths below are relative to `libs/backend/agent-sdk/src/lib/helpers`.

- `sdk-query-options-builder.ts:510` adds a stream wrapper that attaches context to the first top-level user turn.
- `sdk-query-options-builder.ts:2480` keeps the full prompt's static text and workspace guidance and emits only the local date as Ptah environment context.
- `sdk-query-options-builder.ts:2531` resolves recalled memory and relevant workspace symbols as a `<system-reminder>` block independently of system-prompt assembly.
- `session-lifecycle/session-query-executor.service.ts:1818`, `:1833`, and `:1856` route ambient starts, named-account launches, and resumed input through the builder's returned prompt stream.
- `session-lifecycle-manager.ts:265` documents where recall is delivered.
- `sdk-query-options-builder.spec.ts:1614`, `:1708`, and `:1771` cover the date, byte-identical system prompts across two queries in each mode, first-turn context delivery with attachments, unchanged follow-ups, and native slash commands.
- `assemble-system-prompt.output-style.spec.ts` removes the test for the retired system-prompt append helper. The builder specs exercise the replacement behavior.

## Design

The installed Claude Agent SDK is 0.3.329. Its `sdk.d.ts:2515` system-prompt contract supports custom arrays with a global-cache boundary and the Claude Code preset with an append. The SDK also accepts an asynchronous stream of user turns. The initial turn already goes through the SDK message factory and session stream pump, so the builder wraps that stream at the delivery boundary. It prepends a text block to the first ordinary SDK user turn, preserving its UUID, attachments, and original content. Native slash commands receive the context as a synthetic, non-querying user message immediately before the original command, following the stream pump's existing stop-context pattern.

Full mode preserves every block before the SDK cache marker and keeps the date, workspace memory snapshot, and selected corpus after it. Preset mode retains its existing query-independent append and already relied on the SDK for environment metadata. Both modes deliver recall and symbols in the user stream.

Ptah no longer repeats working directory, platform, OS version, shell, Git repository status, or model in full mode. The Git subprocess, OS imports, environment assembly helper, and Git failure specs are removed.

## Verification

Initial focused Jest run

```powershell
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.input-channel-failure.spec.ts
```

Exit 0. Jest reported 5 passed suites, 328 passed tests, 0 snapshots, and 168.751 s. Node emitted a non-fatal warning about loading the TypeScript Jest config as an ES module.

Builder rerun after restoring the original cache-marker position

```powershell
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts
```

Exit 0. Jest reported 1 passed suite, 140 passed tests, 0 snapshots, and 14.167 s. Node emitted the same Jest config warning.

TypeScript

```powershell
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
```

Exit 0 with no diagnostics.

ESLint

```powershell
npx eslint libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts
```

Exit 0 with 0 errors and 2 `max-lines` warnings. ESLint reported 1,897 lines against a limit of 700 in `sdk-query-options-builder.ts:1179:1` and 1,583 against the same limit in `session-query-executor.service.ts:912:1`.

`git --no-pager diff --check -- libs/backend/agent-sdk` exited 0 with Git line-ending normalization notices.

Ptah search, symbol reads, and dependency analysis were available. The Ptah skill catalog located the Agent Lanes skill and the workspace supplies its local instructions. I used PowerShell to read the installed SDK declaration and `rg` to cross-check the working tree and collect line references.

## Open questions

The comparison covers Ptah's assembled system prompt. The date and workspace data can change over time, and the SDK renders its own preset and attachments. Provider-side cache reads and writes were outside the requested command scope. Existing resumed SDK transcripts may retain an older system-prompt snapshot until compaction, per the SDK declaration.
