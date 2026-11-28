## PRRT_kwDOPngTds69CWHO
File: libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:230

### 🟠 Major · Keep replayed tool cards when eviction removes their start

**Impact:** A completed ACP edit and its available patch disappear from session/load history\.

The replay collector accounts for successive full snapshots as separate payloads\. Space for a later snapshot can come from evicting its own tool start\. The projector then drops the retained update, and the retained result has no start from which the execution tree can build a card\.

**Evidence**

- [libs/backend/acp\-runtime/src/lib/acp\-replay\-collector\.ts:31](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-replay-collector.ts#L31) — export const ACP\_MAX\_REPLAY\_TEXT\_CHARS = 2\_000\_000;

- [libs/backend/acp\-runtime/src/lib/acp\-replay\-collector\.ts:188](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-replay-collector.ts#L188) — while \(collected\.length &gt; keep &amp;&amp; textChars \+ extra &gt; maxTextChars\) \{

- [libs/backend/acp\-runtime/src/lib/acp\-replay\-collector\.ts:230](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-replay-collector.ts#L230) — : makeRoom\(length, 0\);

- [libs/backend/provider\-session\-contracts/src/lib/flat\-stream\-projector\.ts:192](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts#L192) — const start = toolStarts\.get\(event\.toolId\);

- [libs/backend/provider\-session\-contracts/src/lib/flat\-stream\-projector\.ts:193](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts#L193) — if \(\!start \|\| \!event\.presentation\) return \[\];

- [libs/frontend/chat\-execution\-tree/src/lib/builders/tool\-node\.fn\.ts:45](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-execution-tree/src/lib/builders/tool-node.fn.ts#L45) — const messageToolStarts = indexes\.toolStartsByMessage\.get\(messageId\) ?? \[\];

- [libs/frontend/chat\-execution\-tree/src/lib/builders/tool\-node\.fn\.ts:53](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-execution-tree/src/lib/builders/tool-node.fn.ts#L53) — for \(const toolStart of toolStarts\) \{

<details><summary>Prompt for AI agents</summary>

Store or evict the replay start and its latest full presentation together\. Coalesce superseded snapshots or retain sufficient start metadata with a surviving snapshot to reconstruct its card\. Keep both replay caps and test projection after budget eviction\.

</details>

<!-- ptah-review:finding:01M8GR4XDPF40HRRDFTCGWR3KE -->

## PRRT_kwDOPngTds69CWHP
File: libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:287

### 🟠 Major · Replace ACP diff state when the agent replaces tool content

**Impact:** Live and replayed edit cards can show a file the agent removed from its reported patch\.

The mapper clones the previous path map and upserts each diff in a supplied content collection\. Paths removed from the replacement collection stay in the card\. A replacement with zero diffs also leaves the previous collection in place\.

**Evidence**

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:286](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L286) — const changes = toolDiffs\(update\['content'\]\);

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:287](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L287) — const diffs = changes\.length ? new Map\(remembered?\.diffs\) : undefined;

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:288](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L288) — for \(const change of changes\) diffs?\.set\(change\.path, change\);

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:295](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L295) — diffs: diffs ?? remembered?\.diffs,

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:318](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L318) — presentation: presentTool\(details\),

- [libs/backend/acp\-runtime/src/lib/acp\-session\-update\-mapper\.ts:173](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts#L173) — changes: diffs\.map\(\(\{ path, oldText, newText, patch \}\) =&gt; \{

- [package\.json:71](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/package.json#L71) — "@agentclientprotocol/sdk": "1\.7\.0",

<details><summary>Prompt for AI agents</summary>

Follow the installed ACP SDK ToolCallUpdate content replacement semantics\. Rebuild the diff collection when an array is supplied, including an empty array, and keep remembered diffs when content is omitted\. Refresh the card when a replacement removes previously displayed diffs\. Test replacement with a smaller collection and with an empty collection\.

</details>

<!-- ptah-review:finding:01M8GR4XDRN3GWSW6DHC6770SN -->

## PRRT_kwDOPngTds69CWHQ
File: libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts:121

### 🟠 Major · Electron Codex chat keeps the initial patch when the completed edit changes

**Impact:** Electron Codex chat displays a stale diff and omits files added to the change list after the tool starts\. The file browser still receives refresh notifications for the final paths\.

The Electron file artifact callback drops the final patch from its stream delivery\. The remaining FileChange card renders the start event's input, while the completed patch is attached only to the result and bypassed by the specialized diff renderer\.

**Evidence**

- [apps/ptah\-electron/src/di/codex\-runtime\-composition\.ts:905](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/apps/ptah-electron/src/di/codex-runtime-composition.ts#L905) — createCodexChatEventCallbacks\(\{

- [libs/backend/rpc\-handlers/src/lib/chat/codex\-host/codex\-chat\-event\-callbacks\.ts:123](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts#L123) — await deps\.webviewManager\.broadcastMessage\(

- [libs/backend/rpc\-handlers/src/lib/chat/codex\-host/codex\-chat\-event\-callbacks\.ts:132](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts#L132) — return;

- [libs/backend/codex\-runtime/src/lib/codex\-event\-translator\.ts:649](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/codex-runtime/src/lib/codex-event-translator.ts#L649) — input: \{ changes: item\.changes \},

- [libs/backend/codex\-runtime/src/lib/codex\-event\-translator\.ts:658](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/codex-runtime/src/lib/codex-event-translator.ts#L658) — ? boundJson\(\{ changes: item\.changes \}\)

- [libs/backend/agent\-sdk/src/lib/codex\-app\-server/codex\-chat\-events\.ts:419](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts#L419) — output: event\.output,

- [libs/frontend/chat\-ui/src/lib/molecules/tool\-execution/tool\-output\-display\.component\.ts:80](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts#L80) — &lt;ptah\-file\-change\-diff \[toolInput\]="fileChangeInput\(\)\!" /&gt;

- [libs/frontend/chat\-ui/src/lib/molecules/tool\-execution/tool\-output\-display\.component\.ts:205](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts#L205) — ? node\.toolInput

<details><summary>Prompt for AI agents</summary>

Update the existing native FileChange card with validated final changes before delivering the result, preserving card identity and final\-path refresh notifications\. Add an Electron chat projection regression test with different start and completion patches and a file first reported at completion\.

</details>

<!-- ptah-review:finding:01M8GR4XDVXEM06GRN9RQAYHS0 -->

## PRRT_kwDOPngTds69CWHR
File: libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:198

### 🟡 Minor · Keep the displayed tool name and input together when replay truncates a patch

**Impact:** The last complete Edit patch stops rendering after an oversized FileChange update, even though its input survives replay\.

Replay strips input from an oversized update while retaining its new tool name\. The projector applies the new name to the previous input, which can have the shape of a different tool\.

**Evidence**

- [libs/backend/acp\-runtime/src/lib/acp\-replay\-collector\.ts:137](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-replay-collector.ts#L137) — ? \{ presentation: \{ toolName: body\.presentation\.toolName \} \}

- [libs/backend/acp\-runtime/src/lib/acp\-replay\-collector\.ts:227](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/acp-runtime/src/lib/acp-replay-collector.ts#L227) — length &gt; maxTextChars &amp;&amp;

- [libs/backend/provider\-session\-contracts/src/lib/flat\-stream\-projector\.ts:197](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts#L197) — toolName: event\.presentation\.toolName,

- [libs/backend/provider\-session\-contracts/src/lib/flat\-stream\-projector\.ts:198](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts#L198) — toolInput: event\.presentation\.input ?? start\.toolInput,

- [libs/frontend/chat\-ui/src/lib/molecules/tool\-execution/tool\-output\-display\.component\.ts:193](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts#L193) — if \(node?\.toolName \!== 'Edit'\) return null;

- [libs/frontend/chat\-ui/src/lib/molecules/tool\-execution/tool\-output\-display\.component\.ts:203](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts#L203) — return node\.toolName === 'FileChange' &amp;&amp;

- [libs/frontend/chat\-ui/src/lib/molecules/tool\-execution/tool\-output\-display\.component\.ts:204](https://github.com/Hive-Academy/PtahCode/blob/2674f4b535a988f71e50f03b2c011ca5e1df4fc7/libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts#L204) — isFileChangeToolInput\(node\.toolInput\)

<details><summary>Prompt for AI agents</summary>

Make replay distinguish input deliberately omitted by truncation from a complete presentation update\. Preserve the whole previous presentation when the new snapshot was dropped, and test an Edit\-to\-FileChange transition across the limit\.

</details>

<!-- ptah-review:finding:01M8GR4XDTFQDVQ52V6Q97N4DS -->

