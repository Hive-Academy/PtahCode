# Main-chat tool cards: one tree, three adapters

## Verdict
Shared tree. Claude, Codex, and agy (ACP) all publish `FlatStreamEventUnion` into `ChatStreamBroadcaster.streamEventsToWebview` (`libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts:141-155`). The renderer builds one `ExecutionNode` tree per tab (`libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.ts:503-508` → `ExecutionTreeBuilderService.buildTree`). That builder has no provider branch. Cards differ because the adapters do not emit the same tool name, input, output, or parent id.

## Pipelines
Claude: Agent SDK `content_block_start` `tool_use` → `tool_start` with the SDK name, `isTaskTool`, `parentToolUseId` (`libs/backend/agent-sdk/src/lib/message-transform/stream-event.transformer.ts:402-426`). `input_json_delta` → `tool_delta` (`:480-497`). User `tool_result` → `tool_result` with content, `is_error`, `parentToolUseId` (`user-message.transformer.ts:110-121`). Broadcaster → `buildToolNode` (`libs/frontend/chat-execution-tree/src/lib/builders/tool-node.fn.ts:164-229`). Headers/diffs key off Claude names (`Bash`, `Edit`, …).

Codex: app-server event → `CodexChatEvents.project` (`libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:293-437`) → same flat events. `presentCodexTool` (`libs/backend/codex-runtime/src/lib/codex-tool-presentation.ts:100-135`) renames `commandExecution`→`Bash`, `webSearch`→`WebSearch`, `fileChange`→`FileChange`. `presentCodexToolResult` (`:179-198`) shapes output. Child threads are stamped `parentToolUseId` (`codex-chat-events.ts:179-201`). Spawns become `Task` plus `agent_start` (`:373-383`). File/image artifacts are a second tool via `live` (`libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts:123-156`).

agy: ACP `session/update` → `createAcpSessionUpdateMapper` (`libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:270-301`, wired at `acp-session-runtime.ts:404-406`) → `ProviderSessionEvent` → `createFlatStreamProjector` (`libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:170-191`, called from `provider-session-turn-stream.ts:227-238`). Names and `rawInput` pass through. `fileChange`, `plan`, approvals, and `toolUpdated` are dropped (`flat-stream-projector.ts:254-265`). Main-chat host is provider-session (`provider-session-chat-host-ports.ts:1-2`).

## Gaps
| gap | Claude | Codex | agy | file:line | likely effect |
| --- | --- | --- | --- | --- | --- |
| tool name | SDK name | `Bash` / `FileChange` / passthrough | ACP `title`, or literal `edit`/`delete` | `codex-tool-presentation.ts:104-125`; `acp-session-update-mapper.ts:287-291` | Codex shell can match Bash cards. Codex patches use the FileChange card, not Edit. agy names miss `Edit`/`FileChange`/`Bash` unless `rawInput.command` happens to pass `isBashToolInput` (`exec.ts:178-184`) |
| input timing | streaming `tool_delta` | full input on `tool_start` only | `rawInput` only on the first `tool_call`; later input is not stored | `stream-event.transformer.ts:480-497`; `codex-chat-events.ts:540-544`; mapper `172-185`, `278-291` | Claude input grows. Codex appears at once. agy input is missing when `rawInput` arrives on `tool_call_update` |
| diffs | `Edit` needs `file_path`+`old_string`+`new_string` (`fs.ts:198-208`) | unified diff as `FileChange`; artifact card is named `Edit` with only `file_path`, diff on output | diff blocks become `fileChange` events the projector drops | `tool-output-display.component.ts:191-206`; `codex-chat-event-callbacks.ts:123-145`; projector `:254-265` | Codex file cards are not Claude Edit diffs. agy diffs never enter the tree |
| output | content + `is_error` | Bash failure line; cancel → denial text | output capped at 64KiB; `exitCode` dropped; `cancelled` is not terminal | `presentCodexToolResult` `:179-198`; mapper `:4-5`, `:131-132`; projector `:182-190` | Codex errors resemble Claude Bash. agy output is a truncated string. A cancel leaves the card `streaming` (`tool-node.fn.ts:219`) |
| nesting | `parentToolUseId`, Task/Agent | child projection + `agent_start`; native Codex status in the agent node | `isTaskTool: false`; no parent id; no `agent_start` | `tool-node.fn.ts:47-55`; `codex-chat-events.ts:179-201`; projector `:178`; `agent-node.fn.ts:83` | Codex subagents can nest. agy tools stay flat siblings |
| permission | side-channel `PERMISSION_REQUEST` with the SDK tool name (not a tree node) | `presentCodexApproval` → `Bash`, raw `fileChange` | tool name is ACP `kind` or `"tool"` | `codex-chat-approval-presentation.ts:140-156`; `provider-session-approval-presentation.ts:54-57`, `:172-178` | agy (and Codex file) permission cards skip Bash/Edit layouts |

## Fix direction
Keep this tree. Put an ACP presentation step in front of `createFlatStreamProjector`, the same job as `presentCodexTool` / `presentCodexToolResult`: `execute`→`Bash` (`command`), `edit`/`delete`→`FileChange` or `Edit` using fields the guards read, re-emit input when `rawInput` arrives late, treat `cancelled` as a terminal `tool_result`, and stop dropping `fileChange`. Fold Codex file/image artifacts into the `FileChange` node so one file op is one card. Do not add a second renderer tree.

## Decisions
None open. The question was whether the trees are shared. Evidence: shared renderer, divergent adapters. Reversible if a later design splits components.

## Evidence labels
Verified: the citations above, read in this worktree. Inferred: a late ACP `rawInput` never reaches the card, because `trackTool` remembers only kind, title, and output, and the projector copies `input` only on `toolStarted`.
