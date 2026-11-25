# Batch 23 report: B5a Claude SDK lane runner (interrupt, content blocks, settings, live usage)

## Changes

- MODIFIED `ptah-cli/helpers/ptah-cli-prompt-mailbox.ts`: `push(turn: PromptTurn, sessionId?)` with
  `PromptTurn { content: string | ContentBlock[]; uuid? }` (`PromptTurnContent` =
  `SDKUserMessage['message']['content']`). Exported `toUserMessage(turn, sessionId?)`; the uuid is
  generated only when absent (Batch 25 tags steer messages with it).
- MODIFIED `claude/claude-sdk-lane-runner.ts`:
  - `claudeLaneTurnContent(message, content?)`: files as path text (`withFileReferences`, D14);
    images as base64 blocks via `resolveImageMediaType`; an unresolvable image throws before the
    turn is queued (never dropped). The named-account gate (`ClaudeNamedLaneAdmission.enqueue`,
    `userTurn`) takes the same `PromptTurn`.
  - `continue(message, content?)`: logs counts only (`imageCount`, `fileCount`).
  - `interrupt()` / `supportsInterrupt()`: true while a turn runs (queued turns > result frames)
    and the lane is open. `query.interrupt()` bounded at 3 s; timeout rejects with
    "Claude did not stop the turn in 3 s" and keeps the flag. `interruptPending = { turnIndex,
    timedOut }` clears on the next result frame of any outcome and on `finish()`. A non-timeout
    rejection clears it.
  - The stream loop's new `onTurnResult` hook: only `error_during_execution` of the flagged turn,
    while the lane is open, is `interrupted` (exit 0). A late interrupt also emits the info
    segment "The turn ended after a late interrupt; your message was not sent."
  - `applyTurnSettings`: `setModel` (10 s) then `applyFlagSettings({ effortLevel })` (10 s) with
    `max -> xhigh`; an unknown effort level and any rejection become `LaneTurnSettingRefusal`
    (named lanes get fixed text only; others get the provider message, at most 200 chars);
    returns `appliesAt: 'next-turn'`.
  - `listTurnOptions`: `supportedModels()` / `supportedCommands()` each bounded 5 s through
    `Promise.allSettled`; efforts = `EFFORT_LEVELS`; commands filtered by `filterLaneCommands`
    with `CLAUDE_HIDDEN_LANE_COMMANDS = []`; `builtin` entries are `command`, every other entry
    `skill`; any failure -> that list empty + `error: 'Lane options could not be read.'` (logged).
    `currentModel` / `currentEffort` start from the spawn options and follow applied settings.
- MODIFIED `ptah-cli/helpers/ptah-cli-stream-loop.service.ts`:
  - each assistant message's own usage is emitted once per `message.id` as an info segment
    "Claude message usage." with `usageScope: 'message'` (A2); the id set clears per turn.
  - the result's usage segment carries `usageScope: 'turn'` explicitly.
  - `onTurnResult({ subtype, userMessageUuids? })` is called on every result frame; an
    interrupted `error_during_execution` emits "Turn interrupted." (info) and exits 0, never an
    error segment.
- Handle default `usageScope: 'turn'` and `outcomeUsageIsTurnTotal` are unchanged: the per-segment
  `message` scope overrides it, and the turn segment corrects the running sum (Batch 21).

## Out-of-write-set edits

- `cli-adapters/claude-cli.adapter.spec.ts` (a Batch 24 file): `mailbox.push({ content })` and
  `interrupt` is now a function. Both needed so this commit's suites pass.

## Assumptions

- A2: one assistant `message.id` repeats its usage on each content-block frame; counted once.
  Recorded by the stream loop spec.
- A3: an interrupted Claude turn ends with an `error_during_execution` result. Covered by the
  runner and loop specs against a fake query; live confirmation is L-test work.
- A14: `applyFlagSettings` has no `max` tier in the flag layer; mapped to `xhigh` as main chat
  does (`session-control.service.ts`).

## Verification

- Focused jest (`--runInBand --coverage=false --runTestsByPath`): runner + stream loop specs 138
  passed; claude-cli adapter, registry permission-routing, registry capabilities, inbound-peer
  loop and mailbox specs 129 passed.
- `npx eslint` on the 7 changed files: 0 errors. Warnings: `max-lines` on the runner (was
  already over) and on the stream loop (737 counted lines, now over 700), pre-existing
  non-null assertions.
- Typecheck not run locally (user: CI verifies); ts-jest type-checks these suites.

## Decisions

- Claude command grouping: `SlashCommand.builtin === true` -> `command`, else `skill` (the SDK has
  no other field that separates skills). Reversible.
