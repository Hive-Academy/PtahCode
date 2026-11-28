# Code Logic Review — `TASK_2026_2332_tcpar`

REVISE 6/10

## Summary

| Metric              | Value            |
| ------------------- | ---------------- |
| Overall score       | 6/10             |
| Assessment          | NEEDS_REVISION   |
| Blocking issues     | 0                |
| Serious issues      | 1                |
| Moderate issues     | 2                |
| Failure modes found | 3                |

Live ACP and Codex projection meets the seven card criteria. The same presentation object is what history replay keeps, and the replay compactor destroys the nested `changes` array (and truncates Edit text to 256 characters). A reloaded multi-file edit therefore does not render the diff the live card showed.

Score is not 7: that history path is a normal `session/load`, and the new card reads only the compacted presentation. Score is not 5: the live stream does present Bash, Edit, FileChange, late input, and cancellation, and the accumulator does not leave a second tool node or clear `tool_result`.

Skill discovery was not available in this lane. No skill body was loaded. `code-style-review.md` is absent, so nothing was deduplicated from it. The implementer's Jest, `tsc`, and ESLint report was not re-run. Those checks do not cover a FileChange presentation larger than `ACP_MAX_REPLAY_TOOL_INPUT_CHARS`.

## Criteria

| # | Criterion | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | ACP `execute` becomes `Bash` with `{ command }` that `isBashToolInput` accepts | PASS | `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:134-140` reads `command` or `CommandLine`. `libs/shared/src/lib/type-guards/guards/exec.ts:178-184` accepts a string `command`. |
| 2 | ACP `edit` / `delete` becomes `Edit` or `FileChange` in the shapes the renderer reads | PASS | `acp-session-update-mapper.ts:159-185`. `isEditToolInput` requires `file_path`, `old_string`, and `new_string` (`libs/shared/src/lib/type-guards/guards/fs.ts:198-208`). `isFileChangeToolInput` requires `changes[].path`, `kind.type`, and string `diff` (`fs.ts:289-322`). |
| 3 | Late `rawInput` replaces the same call id without a duplicate node or a reset of output or status | PASS | `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:192-204` re-emits `tool_start` with the stored call id and timestamp. `libs/frontend/chat-streaming/src/lib/accumulator-core.service.ts:378-388` replaces an equal-priority start. `libs/frontend/chat-execution-tree/src/lib/builders/tool-node.fn.ts:165-167` and `:219` still take status and output from the surviving `tool_result`. |
| 4 | ACP `cancelled` is a terminal `tool_result` | PASS | `acp-session-update-mapper.ts:221-224` and `:343-344` emit `toolCompleted` with output `Tool cancelled.` `flat-stream-projector.ts:206-215` sets `isError` when status is not `completed`. `tool-node.fn.ts:219` then sets `complete`. |
| 5 | ACP diff blocks reach the tree | PASS | `acp-session-update-mapper.ts:286-319` and `:169-185` put diff blocks on the tool presentation. The chat projector still returns `[]` for a bare `fileChange` event (`flat-stream-projector.ts:280-290`); the diff is on the card, which is what the tree renders. Replay of that card is defect 1. |
| 6 | Codex file artifact folds into the FileChange node; standalone images keep a card | PASS | `libs/backend/codex-runtime/src/lib/codex-event-translator.ts:642-670` keeps `changes` on the fileChange tool and still emits `file` notices. `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts:121-162` refreshes the file and no longer publishes a second `Edit` tool. An image event still publishes `toolName: 'Image'`. |
| 7 | Claude events, the CLI segment projector, and exported signatures stay compatible | PASS | `projectToCliSegments` still reads native `toolName` and `input` and ignores `toolUpdated` (`libs/backend/provider-session-contracts/src/lib/cli-segment-projector.ts:36-46` and `:120-128`). `presentation` is optional on the event union (`provider-session-events.ts:116` and `:122`). Claude's stream transformer is not in the diff. |

## Five logic questions

### 1. How does this fail silently?

A replayed FileChange whose presentation JSON is longer than 4096 characters is compacted to its top-level strings. The `changes` array is dropped. The projector then prefers that presentation over the native input, so the reloaded card has no diff and no error (`acp-replay-collector.ts:68-88`, `flat-stream-projector.ts:177`).

An ACP shell that completes with a non-zero `exitCode` and status `completed` is projected as `isError: false` (`flat-stream-projector.ts:214`, `acp-session-update-mapper.ts:329-350`). The new Bash card looks successful.

### 2. What user action produces unexpected behaviour?

Reloading an agy session replays `session/load` through `createAcpReplayCollector`. A multi-file edit that rendered in the live turn comes back as a FileChange card `isFileChangeToolInput` rejects.

Sending a late `tool_call_update` while the card is open replaces `tool_start` with a new event id (`flat-stream-projector.ts:200`). The transcript tracks `child.id` (`libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts:315`), so the card component is destroyed and created again. Model output and status stay; expanded state and scroll do not.

### 3. What input data produces a wrong answer?

A presentation input `{ file_path, changes: [...] }` over 4096 characters compacts to `{ file_path }` only. A single-file Edit input `{ file_path, old_string, new_string }` over that bound keeps each string cut to 256 characters (`acp-replay-collector.ts:72-77`). The Edit guard still passes, so the card shows a short diff as if it were the whole edit.

`snapshotDiff` (`acp-session-update-mapper.ts:188-201`) treats a falsy string as no lines. An empty `newText` becomes a deletion-only hunk. That part matches a cleared file. A unified `diff` field on an ACP content block is never read; `toolDiffs` (`:112-125`) keeps only `oldText` and `newText`, so a patch-only block becomes `diff: ''`.

### 4. What happens when a dependency fails?

`map` and `project` catch every throw and return `[]` (`acp-session-update-mapper.ts:456-464`, `flat-stream-projector.ts:299-307`). A throw inside `presentTool` on a terminal update drops the `toolCompleted` that was in the same call, and the card stays `streaming`. `presentTool` itself does not throw on ordinary strings.

Codex fileChange failure still completes with `output: null` and a non-completed status (`codex-event-translator.ts:654-659`). `presentCodexToolResult` marks that `isError`. Cancellation of an ACP tool is terminal and `isError: true`. A completed ACP shell does not consult `exitCode`.

### 5. What is missing that the requirements never mentioned?

The live tree never reads `exitCode`. Codex Bash does (`libs/backend/codex-runtime/src/lib/codex-tool-presentation.ts:183-195`). The new ACP Bash card does not.

`textLength` counts a `toolStarted` native input and its presentation input separately (`acp-replay-collector.ts:101-105`). One command is charged twice against the 2_000_000 character budget, so older replay rows are dropped sooner. The collector does not grow without a bound: `ACP_MAX_REPLAY_EVENTS` and `ACP_MAX_REPLAY_TEXT_CHARS` still apply.

CLI file-change rows for one terminal update now precede the tool result. `trackTool` pushes `fileChanges` before `toolCompleted` (`acp-session-update-mapper.ts:321-351`). The old update path appended file changes after the completion. `projectToCliSegments` still emits both. This is order only.

## Failure modes

### Replay drops the diff the new card needs

- Trigger: `session/load` replays an edit whose presentation input JSON is longer than `ACP_MAX_REPLAY_TOOL_INPUT_CHARS` (4096), or a later update that does not fit the remaining text budget.
- Symptom: A multi-file card reloads without a patch. A large Edit reloads as a 256-character diff. An update that does not fit replaces the previous start with `toolInput: undefined`.
- Evidence: `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:68-88` and `:128-136`; `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:177` and `:192-204`. The new spec locks the stripped shape at `acp-session-update-mapper.spec.ts:888-910`.
- Current handling: `compactInput` keeps only top-level primitives. `cutText` removes presentation input entirely when the remainder of the budget is too small. The projector uses presentation whenever the object exists, including when `input` is absent.
- Recommendation: Compact `changes[]` by bounding each `diff` string, and omit `toolInput` on a replacement start when the snapshot has no input so the previous input stays.

### Late input remounts the card

- Trigger: A `tool_call_update` carries `rawInput` or a diff after `tool_call`.
- Symptom: The open card is recreated. Collapse and scroll reset. The tree still has one node for that call id, and an existing result keeps `complete` and `toolOutput`.
- Evidence: `flat-stream-projector.ts:197-203` assigns a new id (`…:tool-update`). `tool-node.fn.ts:217` uses that id as the node id. `execution-node.component.ts:315` tracks `child.id`.
- Current handling: The accumulator removes the previous `tool_start` when source priority is equal (`accumulator-core.service.ts:63-70` and `:118-120`). Timestamp is kept, so sibling order by `startTime` stays (`message-node.fn.ts:89`).
- Recommendation: Reuse the original `tool_start` id when replacing input, so the tracked node identity is stable.

### Completed shell with a non-zero exit looks successful

- Trigger: An ACP `execute` update has status `completed` and `extractExitCode` returns a non-zero number. Grok's profile reads `rawOutput.exit_code` (`libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts:243-246`).
- Symptom: The Bash card shows the output as a successful tool result.
- Evidence: `acp-session-update-mapper.ts:329-350` stores `exitCode` only for a completed execute. `flat-stream-projector.ts:209-215` sets `isError` from status alone and does not copy `exitCode` onto the flat event.
- Current handling: `failed` and `cancelled` are errors. `completed` is success regardless of exit code.
- Recommendation: Set `isError` when a completed execute reports a non-zero exit code, the way `presentCodexToolResult` does.

## Blocking issues

None.

## Serious issues

### History replay strips the presentation the card renders

- File: `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:68-88`; consumed at `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:177`
- Scenario: A live FileChange or Edit is later replayed. `compactInput` drops nested `changes`. For an Edit, it keeps `old_string` and `new_string` cut to 256 characters (`:72-77`). `cutText` (`:128-136`) deletes presentation input when the event does not fit the remaining budget, and the replacement start writes `toolInput: undefined` (`flat-stream-projector.ts:202`).
- Impact: After reload, a multi-file agy edit does not satisfy `isFileChangeToolInput` (`fs.ts:289-297`), so `fileChangeInput()` is null (`tool-output-display.component.ts:201-206`) and the diff is gone. A large single-file edit shows a short, plausible diff.
- Fix: Preserve a bounded `changes` array (and Edit strings long enough to remain the real patch, or mark the card truncated). When a `toolUpdated` presentation has no input, do not overwrite `toolInput`.

## Moderate and minor issues

### Moderate — replacement start changes the node id

- File: `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:200`; `libs/frontend/chat-execution-tree/src/lib/builders/tool-node.fn.ts:217`; `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts:315`
- Scenario: Late `rawInput` or a late diff re-emits `tool_start` under a new id.
- Impact: One logical card, but the component remounts and local UI state resets. Output and status on the new node are rebuilt from the events, so this does not fail criterion 3.
- Fix: Keep the original event id on the replacement start.

### Moderate — non-zero exit is success on the new Bash card

- File: `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:214`; `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:329-350`
- Scenario: Status is `completed` and `exitCode` is non-zero.
- Impact: The parity Bash card does not match Codex, which sets `isError` for a non-zero exit (`codex-tool-presentation.ts:185-195`).
- Fix: Project `isError: true` for that case.

### Minor — CLI file-change rows moved ahead of the tool result

- File: `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts:321-351`
- Scenario: A terminal `tool_call_update` carries diff blocks.
- Impact: `projectToCliSegments` emits the file-change segment before the tool result. Previously the completion was emitted first. No row is dropped. Signatures are unchanged.
- Fix: Push `fileChanges` after `toolCompleted` if lane order should stay stable.

### Minor — replay budget counts the same tool input twice

- File: `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:101-105`
- Scenario: `toolStarted` has both `input` and `presentation.input`.
- Impact: The text budget is consumed faster and older events are evicted earlier. Growth is still capped by `ACP_MAX_REPLAY_EVENTS` (5000) and `ACP_MAX_REPLAY_TEXT_CHARS` (2_000_000) (`acp-replay-collector.ts:24-31`).
- Fix: Count the input the projector will actually render, once.

## Data flow

1. ACP `session/update` enters `createAcpSessionUpdateMapper.map` (`acp-session-update-mapper.ts:355`). OK for a record with `sessionUpdate`.
2. `trackTool` merges `rawInput`, locations, and diff blocks (`:264-296`). OK. A `tool_call` without a title never starts a tool (`:420-426`); that gate is unchanged.
3. `presentTool` maps `execute` to Bash and `edit`/`delete` or diff blocks to Edit or FileChange (`:128-185`). OK on the live path. Patch-only content blocks become an empty diff. Gap.
4. `emit` stamps a new sequence per body (`acp-session-runtime.ts:482-490`). OK.
5. `createFlatStreamProjector` writes presentation input onto `tool_start`, and a later `toolUpdated` replaces that start (`flat-stream-projector.ts:175-204`). OK for one live card. New id remounts the component. Gap.
6. Bare `fileChange` bodies still return `[]` (`:280-290`). The diff is not lost on the live path because step 3 copied it onto the tool. OK for the live tree.
7. `toolCompleted` becomes `tool_result` with `isError: status !== 'completed'` (`:206-215`). OK for `failed` and `cancelled`. Non-zero exit on `completed` stays success. Gap.
8. The accumulator replaces the same `toolCallId` and leaves `tool_result` in place (`accumulator-core.service.ts:378-441`). OK. `toolCallMap` appends every replacement id and does not remove the old one (`:397-400`). `parentToolName` skips missing ids (`:930-933`). No duplicate node.
9. `buildToolNode` sets `streaming` only when no result exists (`tool-node.fn.ts:219`). OK.
10. History takes the same bodies through `createAcpReplayCollector` before step 5. Compaction drops `changes`. Gap, defect 1.
11. Codex `fileChange` still starts a tool with `{ changes }` and, on success, completes with `{ changes }` plus `file` notices (`codex-event-translator.ts:642-670`). The chat callback no longer makes an Edit card (`codex-chat-event-callbacks.ts:121-133`). OK. A patch that exists only on the completed item still depends on the start input for the specialized view; the result object is hidden while `isFileChangeToolInput` matches the start (`tool-output-display.component.ts:79-80`). The implementer recorded that limit. Images still get their own card (`:134-162`). OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| 1. Bash `{ command }` | COMPLETE | `command` or `CommandLine` only |
| 2. Edit or FileChange shapes | COMPLETE | Live guards match |
| 3. Late input, one card, output and status kept | COMPLETE | Component remount is defect 2, not a second node |
| 4. Cancelled is terminal | COMPLETE | None |
| 5. Diff blocks reach the tree | COMPLETE | Live card only; replay is defect 1 |
| 6. One Codex file card; images stay | COMPLETE | None on the changed callback |
| 7. No Claude, CLI, or signature regression | COMPLETE | CLI row order is minor |

Implicit requirements not addressed: replay must show the same diff the live card showed; a completed shell's exit code must surface as a failure the way Codex Bash does.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Late `rawInput` before completion | YES | Replacement `tool_start` with the same call id | New node id remounts the card |
| Late `rawInput` after `tool_result` | YES | Result lookup is by call id, not event id | Status stays `complete` |
| `cancelled` with partial output | YES | Output is replaced by `Tool cancelled.` and `isError` is true | Partial output is discarded on purpose |
| Multi-file diff, live | YES | One FileChange `changes` array | None for the live projector |
| Multi-file diff, replay over 4096 chars | NO | `changes` dropped | Defect 1 |
| Edit replay over 4096 chars | NO | Strings cut to 256 | Looks like a real small edit |
| Patch-only ACP diff block | NO | `toolDiffs` ignores a `diff` field | Empty update patch |
| Codex image with its own item id | YES | Image tool start and result | None |
| Codex file notice | YES | `FILE_CONTENT_CHANGED` only | No second Edit card |
| Replay collector growth | YES | Event and character caps | Same input counted twice |
| In-flight tool memory | YES | `releaseTools` at each prompt (`acp-session-runtime.ts:1501`) and on respawn (`:1479`) | Full file text is held until the tool finishes or the turn ends |

## Decisions

- Replay compaction is in scope for this diff. Options were to treat the 4096-character cap as existing policy, or to treat the new nested presentation as a new loss. Evidence: `compactInput` never kept arrays, and this change is the first time the chat card depends on `presentation.input` (`flat-stream-projector.ts:177`). Reversible if product owners accept a truncated history marker instead of a silent short diff.
- Criterion 3 passes. Options were to fail it because the component remounts, or to pass it because the tree keeps one call id and the result fields. Evidence: replacement deletes the previous start (`event-deduplication.service.ts:118-120`) and `buildToolNode` reads the result by call id (`tool-node.fn.ts:165-167` and `:219`). Reversible if "reset" is later defined as component instance state.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A reloaded agy file edit shows no diff, or a 256-character diff, with no error.
- What a robust implementation would add: bounded `changes` entries in the replay compactor, a stable `tool_start` id, and `isError` for a non-zero execute exit code.
