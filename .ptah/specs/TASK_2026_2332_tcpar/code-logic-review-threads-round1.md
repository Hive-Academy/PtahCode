# Code-logic review: PR #1528 thread fixes (round 1)

**Score:** 9/10
**Head:** `2674f4b53` plus the uncommitted diff (source not edited by this review)
**Scope:** uncommitted changes in `acp-replay-collector`, `acp-session-update-mapper`, `flat-stream-projector`, `codex-chat-events`, and the Codex native-contract spec. `codex-chat-event-callbacks.ts` is unchanged and was reviewed as the refresh path.

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| Major | 0 |
| Minor | 0 |

## Issues

None.

## Per-thread

| Thread | Was | Verdict | Why |
| --- | --- | --- | --- |
| `PRRT_kwDOPngTds69CWHO` | Major | Fixed | A retained full presentation is retyped to `toolStarted` on the same event when its start fell out of the window. Event and text caps still bound the replay. |
| `PRRT_kwDOPngTds69CWHP` | Major | Fixed | A supplied content array replaces the diff map, including `[]`. Omitted content keeps the previous map. After a clear, location metadata does not synthesize the old paths back. |
| `PRRT_kwDOPngTds69CWHQ` | Major | Fixed | A completed native `fileChange` republishes the original `tool_start` with the validated final patch, then the result. The file callback still broadcasts refresh and returns. The renderer replaces that start instead of adding a card. |
| `PRRT_kwDOPngTds69CWHR` | Minor | Fixed | An oversized replay update drops its whole presentation. The projector applies only a present snapshot, so a truncated update cannot pair a new name with the previous input. |

## Checks asked for

| Check | Result |
| --- | --- |
| Replay budget stays bounded | Holds. Promotion retypes a kept event. `events()` still returns one notice plus at most `maxEvents - 1` kept events. Text accounting is unchanged. An update larger than the whole text budget still does not evict older events. |
| Promoted start keeps a stable event id | Holds. The promoted body is the retained update with `type` and `toolName` overwritten (`acp-replay-collector.ts:333`). `sequence` and the other identity fields stay. The flat id is `${turn}:${generation}:${sequence}:tool-start`. |
| Empty ACP content clears diffs; omitted content keeps them | Holds for a stored content map. `content: []` after real diff blocks publishes `FileChange` with no input. A later update that omits `content` does not emit a presentation. |
| Atomic presentation does not drop Claude or other partial inputs | Holds for current producers. `toolUpdated` is emitted only by the ACP mapper. `ToolPresentation` is a full card snapshot. Claude and native Codex do not use this event. Truncation omits `presentation`, and the projector returns no row, so the previous input stays. |
| Codex same-id replacement does not duplicate Electron cards | Holds. The second start reuses the first start's id, `toolCallId`, and `source: 'stream'`. Equal source priority removes the stored start and stores the new one. The tree builds one tool node from that event. |
| `platform-cli` and `cli-engine` | Unaffected. Neither calls `CodexChatEvents` or `createFlatStreamProjector`. `projectToCliSegments` still ignores `toolUpdated` and still reads live `toolStarted.input`. That projector file was not changed. |

## Thread notes

### CWHO — replay start evicted

`events()` runs the promotion only when a truncation notice is already required (`acp-replay-collector.ts:304-337`). The first retained `toolUpdated` with a presentation becomes `toolStarted` when that turn and tool id have no start yet. A later update stays an update, so the projector applies it onto the promoted start. `toolCompleted` clears the marker, which lets a later call that reused the tool id promote its own surviving snapshot.

The text path still refuses to evict older events for a tool body larger than `maxTextChars` (`acp-replay-collector.ts:228-232`). Event-count eviction still drops from the front, then gives one slot to the notice (`acp-replay-collector.ts:307-310`). The spec projects both limits through `createFlatStreamProjector` and expects the final Edit input plus the result.

### CWHP — ACP content replacement

`replacesDiffs` is true for any content array that contains diffs, and for an empty or non-diff array once a content map already exists (`acp-session-update-mapper.ts:286-292`). The new map is built only from that array. `presentTool` synthesizes a path diff only when `details.diffs` is `undefined` (`acp-session-update-mapper.ts:149`), so an emptied map cannot be refilled from `locations`. The same flag is what publishes the update (`acp-session-update-mapper.ts:311-323`), including the empty replacement that completes the tool.

An empty array before any content map was stored does not flip the flag. That leaves the existing location or `rawInput` presentation in place, which is the omitted-content behavior for a tool that has not reported diff blocks yet. The regression spec covers a smaller diff list, an omitted update, and `content: []` on completion.

### CWHQ — Codex final patch

`codex-chat-event-callbacks.ts` was not modified. On `file` it still broadcasts `FILE_CONTENT_CHANGED` for that path and returns (`codex-chat-event-callbacks.ts:121-132`). The patch update is on the stream, not in that callback.

`CodexChatEvents` keeps the original `tool_start` for `fileChange` (`codex-chat-events.ts:375-385`). On a completed output that passes `isFileChangeToolInput`, it runs the same `presentCodexTool` validation used at start and, when the presented input differs, emits `{ ...fileStart, ...presentation }` before the result (`codex-chat-events.ts:443-452`). That spread keeps the start id, timestamp, `toolCallId`, and `source`. History projection uses this class too, then the shared accumulator.

The Electron accumulator replaces a `tool_start` when the new event's source priority is greater or equal (`event-deduplication.service.ts:63-70`, `accumulator-core.service.ts:378-390`). Both Codex copies are `source: 'stream'`, so the second start removes the first and is stored. `collectTools` then sees one start, and `buildToolNode` reads `toolStart.toolInput` when no input delta was accumulated (`tool-node.fn.ts:205-209`). `FileChange` rendering reads that input. The native-contract spec asserts same id, final changes, result order, and a refresh for each final path.

### CWHR — name and input stay together

`cutText` now clears `presentation` on an oversized `toolUpdated` (`acp-replay-collector.ts:130-132`). `toolStarted` can still keep a name without input, because there is no earlier card to preserve. The projector ignores a missing presentation and, when a presentation is present, copies `input` even if it is absent (`flat-stream-projector.ts:193-198`). That clears a real empty `FileChange` snapshot and does not apply a dropped one.

No other production mapper constructs `toolUpdated`. ACP `presentTool` rebuilds the snapshot from remembered input, so a title-only Bash or generic update still carries the command or raw input it already had. Claude tool cards and native Codex cards do not go through this projector.

## Evidence limits

Jest, ESLint, and `tsc` were not re-run here. The assertions above were checked against the current spec sources and the call sites they claim to cover. The fix report's focused runs are consistent with those assertions but are not this review's evidence.

Skill note: the bundled `review` skill starts a separate reviewer subagent. This lane is the assigned reviewer and the deliverable format is fixed, so that skill was not run. No other code-logic skill was available.

## Verdict

APPROVED
