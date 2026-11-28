# Code Logic Re-review — `TASK_2026_2332_tcpar`

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 0        |
| Failure modes found | 0        |

The prior serious finding and both moderate findings are fixed. A FileChange or Edit presentation over 4,096 characters is replayed whole when it fits the replay text budget. A late `toolUpdated` reuses the original `tool_start` id and timestamp, and keeps the previous input when the update has none. A completed tool result with a non-zero `exitCode` is `isError: true`.

Score is not 9. A presentation larger than the entire replay text budget is still omitted as a unit (`acp-replay-collector.ts:224-231`), so an earlier empty FileChange placeholder can remain the card (`flat-stream-projector.ts:198`). Native `toolStarted.input` over 4,096 characters is still compacted (`acp-replay-collector.ts:197-203`). Score is not 7. The three defects that held the last review at 6 are closed on `session/load` and on a late `tool_call_update`, and the specs that lock those paths passed.

No code-logic-review skill is assigned in this lane. The host catalogue has no skill whose body is this review. `code-style-review.md` is absent. No handoff stub is in the task folder. Source was not edited.

## Prior findings

| Prior finding | Status | Evidence |
| ------------- | ------ | -------- |
| Serious — replay strips FileChange `changes` and cuts Edit strings to 256 characters | FIXED for inputs that fit the replay text budget | `acp-replay-collector.ts:205-217` skips `compactInput` when `presentation.toolName` is `Edit` or `FileChange`. `acp-replay-collector.spec.ts:7-38` replays a 5,000-character multi-file diff and an Edit whose strings are 3,000 characters each. Both projected `tool_start` rows keep that input. |
| Moderate — late input remounts the card under a new id | FIXED | `flat-stream-projector.ts:195-201` copies the stored start, so `id` and `timestamp` stay, and sets `toolInput` to `event.presentation.input ?? start.toolInput`. `flat-stream-projector.spec.ts:37-54` expects that object. `acp-session-update-mapper.spec.ts:787` expects `update.id === start.id`. `tool-node.fn.ts:217` uses that id. `execution-node.component.ts:414` tracks `child.id`. |
| Moderate — completed shell with a non-zero exit looks successful | FIXED | `acp-session-update-mapper.ts:329-350` sets `exitCode` only for a completed `execute`. `flat-stream-projector.ts:211` sets `isError` when status is not `completed` or `(exitCode ?? 0) !== 0`. `flat-stream-projector.spec.ts:57-76` covers exit 7, 0, and absent. |

## Five logic questions

### 1. How does this fail silently?

No new silent success on the three fixed paths. A FileChange or Edit whose presentation JSON is over 4,096 characters and within `ACP_MAX_REPLAY_TEXT_CHARS` (2,000,000) is stored intact (`acp-replay-collector.ts:205-217`). The chat projector prefers that presentation (`flat-stream-projector.ts:177`).

A presentation whose counted length is greater than the whole text budget is not cut into a short diff. `push` skips `makeRoom` and `cutText` drops the input (`acp-replay-collector.ts:224-231` and `:130-138`). The truncation notice still counts `cutChars` (`:266-269`). For a `toolUpdated`, the projector keeps the previous input (`flat-stream-projector.ts:198`), which `acp-replay-collector.spec.ts:41-64` locks for a real prior patch. If the only prior input was the empty placeholder from a path-only edit (`acp-session-update-mapper.ts:149-157` and `:178-181`, `diff: ''`), the reloaded card shows that empty patch. The notice says characters were cut. That is the bound recorded in `review-fix-report.md`, not a return of the 256-character diff.

### 2. What user action produces unexpected behaviour?

Reloading a session whose edit fits the text budget shows the same `changes` array or Edit snapshot the live card had (`acp-replay-collector.spec.ts:21-37`).

A late `tool_call_update` with `rawInput` projects another `tool_start` with the original id (`acp-session-update-mapper.spec.ts:762-787`). The accumulator replaces the stored start when source priority is equal (`event-deduplication.service.ts:118-120`, `accumulator-core.service.ts:378-391`) and writes the new event under that id. The message's tool child is tracked by `child.id` (`execution-node.component.ts:414`), so the card is not recreated. `toolCallMap` appends the same id again (`accumulator-core.service.ts:397-400`). `parentToolName` returns on the first stored `tool_start` (`accumulator-core.service.ts:930-932`). One node remains.

### 3. What input data produces a wrong answer?

Edit and FileChange presentations are no longer reduced to top-level strings of 256 characters. `compactInput` (`acp-replay-collector.ts:70-90`) still runs for native `toolStarted.input` over 4,096 characters (`:197-203`) and for any other presentation tool name (`:206-216`). The chat card does not read that native input when `presentation` is present (`flat-stream-projector.ts:177`). The CLI segment still does (`cli-segment-projector.ts:43-45`). A Bash command over the per-input cap is still shortened, and one that cannot fit the whole text budget is omitted (`acp-session-update-mapper.spec.ts:888-910` expects `{ toolName: 'Bash' }` only).

`isFileChangeToolInput` still requires `changes[].path`, `kind.type`, and a string `diff`. The replayed objects in the new spec have that shape.

### 4. What happens when a dependency fails?

`project` still catches a throw and returns `[]` (`flat-stream-projector.ts:296-304`). Ordinary string presentations do not throw.

`isError` is now true for `failed`, `cancelled`, and a `completed` result whose `exitCode` is not 0 (`flat-stream-projector.ts:211`). An absent `exitCode` counts as 0, so a completed Read or Edit stays success. The mapper leaves `exitCode` unset except on a completed execute (`acp-session-update-mapper.ts:348-350`). Codex `commandExecution` already attaches `exitCode` when it is not null (`codex-event-translator.ts:598-602`) and can report status `completed` together with a non-zero code (`toolStatus` at `:123-126`). The shared projector now marks that row an error, which matches `presentCodexToolResult` (`codex-tool-presentation.ts:185-194`). A completed command with exit 0 stays success.

### 5. What is missing that the requirements never mentioned?

Nothing new in this fix round. These leftovers were already recorded and were left out of the fix on purpose (`review-fix-report.md`):

- CLI file-change rows still precede `toolCompleted` (`acp-session-update-mapper.ts:321-351`). `projectToCliSegments` still emits both (`cli-segment-projector.ts:48-68`).
- `textLength` still adds native input and presentation input (`acp-replay-collector.ts:103-107`). For an Edit or FileChange the native side is compacted first, so the displayed patch is what consumes the budget.
- `toolDiffs` still ignores a patch-only `diff` field (`acp-session-update-mapper.ts:111-125`).

## Failure modes

None open on the paths this round changed. Scope: `acp-replay-collector.ts`, `acp-session-update-mapper.ts`, `flat-stream-projector.ts`, and the CLI segment projector those events also pass through. Residual bound, accepted in the fix report: a single tool presentation larger than the whole replay text budget is omitted rather than partially rendered (`acp-replay-collector.ts:224-231`).

## Blocking issues

None.

## Serious issues

None. The history path that dropped `changes` now keeps an Edit or FileChange presentation that fits the text budget (`acp-replay-collector.ts:205-217`, consumed at `flat-stream-projector.ts:177`).

## Moderate and minor issues

None new.

Prior minors, unchanged and out of this round: CLI file-change order (`acp-session-update-mapper.ts:321`), and counting both inputs in `textLength` (`acp-replay-collector.ts:103-107`).

## Data flow

1. ACP `tool_call` / `tool_call_update` enters `trackTool` (`acp-session-update-mapper.ts:264`). OK.
2. `presentTool` builds Bash `{ command }`, Edit `{ file_path, old_string, new_string }`, or FileChange `{ changes }` (`:134-185`). OK on the live path.
3. `toolCompleted` carries `exitCode` for a completed execute (`:329-350`). OK.
4. `createAcpReplayCollector.compacted` leaves Edit and FileChange presentations whole (`acp-replay-collector.ts:205-217`) and still compacts other inputs over 4,096 characters. OK for the card.
5. `push` keeps that presentation when its counted length fits the text budget, dropping older events first (`:187-191`, `:226-231`). A presentation larger than the whole budget is stored without input and does not evict the prior start. OK for the spec at `acp-replay-collector.spec.ts:41-64`.
6. `createFlatStreamProjector` writes presentation input on `tool_start` (`flat-stream-projector.ts:175-188`). A `toolUpdated` re-emits that same start with a new tool name and input (`:190-201`). OK.
7. `tool_result.isError` follows status and exit code (`:211`). OK.
8. The accumulator replaces by `toolCallId` at equal priority and the tree node id stays the start id (`accumulator-core.service.ts:378-391`, `tool-node.fn.ts:217`). OK.
9. `projectToCliSegments` still ignores `toolUpdated` (`cli-segment-projector.ts:121`) and still emits a completed execute as `command` with `exitCode` (`:48-62`). OK. `platform-cli` and `cli-engine` do not reference this projector. Electron chat uses it through `createSessionProjector` (`provider-session-turn-stream.ts:494-497`). The lane handle projects segments and the flat stream from the same event (`provider-session-lane-handle.ts:251-274`).

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Replay keeps FileChange `changes` and full Edit snapshots | COMPLETE within the text budget | Omitted only when one presentation exceeds the whole budget |
| Late input keeps the same tool id | COMPLETE | `flat-stream-projector.ts:195-198` |
| Non-zero exit marks an error | COMPLETE | `flat-stream-projector.ts:211` |
| CLI segment projector and exported event shape stay compatible | COMPLETE | `cli-segment-projector.ts` unchanged in behaviour; `exitCode` was already on `toolCompleted` (`provider-session-events.ts:133`) |
| Electron chat still builds from the flat projector | COMPLETE | `provider-session-turn-stream.ts:494-497` |

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| FileChange over 4,096 characters, under the text budget | YES | Presentation skipped by `compactInput` | None |
| Edit snapshot over 4,096 characters, under the text budget | YES | Same exemption | None |
| Update larger than the whole text budget | YES | Input omitted; prior start kept | Empty placeholder remains if that was the start |
| Late `rawInput` | YES | Same start id, timestamp, and call id | `toolCallMap` stores the id twice |
| Late update with no input | YES | `?? start.toolInput` | None |
| Completed execute, exit 7 | YES | `isError: true` | Output text is unchanged |
| Completed execute, exit 0 or absent | YES | `isError: false` | None |
| Completed non-shell tool | YES | `exitCode` unset, treated as 0 | None |
| Cancelled tool | YES | Status is not `completed`, `isError: true` | None |
| CLI `toolUpdated` | YES | Segment projector returns `[]` | Chat card still updates |

## Decisions

- The whole-budget omission is accepted. Options were to treat a presentation larger than `maxTextChars` as a new serious defect, or as the bound the fix report states. Evidence: `acp-replay-collector.ts:224-231` omits the input as a unit, the spec at `acp-replay-collector.spec.ts:41-64` requires the previous patch to remain, and `review-fix-report.md` records that choice. Reversible if a later round marks the card truncated instead of keeping a placeholder.
- Criterion 7 stays met for CLI consumers. Options were to fail the re-review because `projectToCliSegments` still shows a completed execute as `command` when `exitCode` is non-zero, or to pass it because that segment already carried `exitCode` and the card defect was `isError` on the flat stream. Evidence: `cli-segment-projector.ts:48-62` and the passing `cli-segment-projector.spec.ts`. `platform-cli` and `cli-engine` have no references to the projector. Reversible if a lane UI is later required to read `isError`.

## Checks

- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts` — 44 passed, 2 suites.
- `npx jest --config libs/backend/provider-session-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts libs/backend/provider-session-contracts/src/lib/cli-segment-projector.spec.ts` — 27 passed, 2 suites.
- `npx eslint` on the three reviewed sources plus `cli-segment-projector.ts` — exit 0. `@nx/enforce-module-boundaries` was skipped because no cached project graph was available.
- `npx tsc --noEmit --project libs/backend/acp-runtime/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/provider-session-contracts/tsconfig.lib.json` — exit 0.

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH
- Top risk: A single edit whose presentation exceeds the whole replay text budget reloads as the previous input, which can be an empty placeholder, with a truncation notice and no partial diff.
- What a robust implementation would add: nothing required for this round. A later pass could mark that omitted card truncated, and count only the input the chat card renders.
