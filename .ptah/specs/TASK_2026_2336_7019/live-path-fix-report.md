# Claude Code local command live path

## Root cause

The installed Claude Agent SDK 0.3.329 sends these reports as complete assistant text with model `<synthetic>`. `libs/backend/agent-sdk/src/lib/sdk-message-transformer.ts:302` dispatches that frame to `AssistantMessageTransformer`, whose text delta carried the raw block text. The separate `system/local_command_output` route at `sdk-message-transformer.ts:466` already called the formatter in `message-transform/system-message.transformer.ts:201`. The successful result's duplicate text never becomes a chat bubble. `message-transform/result-message.transformer.ts:22` settles the turn and emits `turn_state`.

## Observed SDK frames

I called the installed SDK directly with a streamed SDK user message, Haiku, partial messages enabled, and session persistence disabled. This isolated the SDK boundary from Electron while using the same prompt shape as the host. Each successful probe yielded these frames in order.

| Command | Output frame | Terminal frame |
| --- | --- | --- |
| `/cost` | `assistant`, `message.model: '<synthetic>'`, one `message.content` text block beginning “You are currently using your subscription to power your Claude Code usage” | `result/success`, `result` repeats the report, `num_turns: 0`, `is_error: false` |
| `/usage` | Same shape and report heading as `/cost` | Same terminal shape |
| `/context` | `assistant`, `message.model: '<synthetic>'`, one text block beginning `## Context Usage` with model and token usage | Same terminal shape |

A `system/init` frame preceded each assistant message. The probe yielded no partial text events, `system/local_command_output` frames, or user stdout echoes for these commands. The initial `/cost` attempt hit its timeout and the isolated retry completed.

`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3902` declares the assistant envelope, and line 5836 also declares the distinct local-command system message. `sdk.mjs:164` starts the native CLI with stream-json input and output. The stdout tag at `sdk.mjs:40` also exists in transcript handling. Ptah's history replay recognizes wrapped stdout separately at `libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts:277`.

## Electron routing and renderer

- Electron registers the shared chat handlers at `apps/ptah-electron/src/di/phase-4-handlers.ts:121`. `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:290` registers `chat:start` and `chat:continue`. Initial prompts pass through the classifier at `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1192`. Follow-ups reach the slash router at line 2133.
- The classifier reserves native handling for `/clear`. `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:454` invokes the SDK adapter with the raw command and line 493 broadcasts its event stream. `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:2143` delegates to the lifecycle manager, which resumes the session with the command as the initial prompt at `helpers/session-lifecycle-manager.ts:997`. `helpers/session-lifecycle/session-query-executor.service.ts:1612` takes the initial command into the session input queue. At line 1809 the executor selects an async iterable prompt. The ambient resume path starts with an idle iterable and attaches the queued user stream with `sdkQuery.streamInput` at line 1849.
- The adapter's response uses the normal chat stream at `sdk-agent-adapter.ts:2192`. `helpers/stream-transformer.ts:862` handles result accounting and line 1185 forwards message frames to the transformer. The user and replay dispatch branches in `sdk-message-transformer.ts:313` and `:390` handle prompt echoes and tool results. Separate subagent dispatch in `helpers/subagent-message-dispatcher.ts:90` serves child queries. `stream-processing/sdk-stream-processor.ts:93` extracts result text for analysis and generation callers outside the chat stream.
- In Electron, `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.ts:365` supplies the assistant message's Ptah UI context. `message-bubble.component.html:89` passes it to the execution node. `execution/execution-node.component.ts:196` mounts the fence-aware text component for a text node, and `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-message-text.component.ts:72` mounts `ptah-ui-block`. The existing Electron-configured component spec exercises this assistant bubble and text node.

## Changes

- `libs/backend/agent-sdk/src/lib/message-transform/assistant-message.transformer.ts:165` formats synthetic assistant text at the complete text-delta boundary, using the existing formatter's content detection and raw-text fallback.
- `libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts` exercises the complete assistant envelopes for all three commands, ordinary synthetic text, and report-shaped text from a regular model.
- The existing renderer path handles the emitted fence. A rebuilt Electron window was outside the verification scope because the task forbids build and serve commands.

## Verification

- Agent SDK Jest passed 135 tests across the artifact parity, assistant transformer, and system transformer specs.
- Chat Jest passed all 31 tests in `execution-node.ptah-ui.spec.ts`, including the Electron-configured assistant bubble mounting a native `ptah-ui-block` and surface renderer from a text node.
- ESLint passed for both changed TypeScript files.
- The optional wider focused run that included `stream-transformer.spec.ts` produced no suite result after more than two minutes and was stopped. The completed Agent SDK run covered the changed transformer and SDK message dispatch.
- I used Ptah source search and range reads, with `git grep`, `rg`, and PowerShell as fallbacks for searches with no index results, SDK files, and the reverse dependency graph while it was still indexing. A native CLI skill invocation mechanism was unavailable.
