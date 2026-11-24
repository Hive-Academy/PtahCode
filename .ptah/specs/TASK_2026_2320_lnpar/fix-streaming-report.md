# Fix report: chat-streaming follow-ups (MonitoredAgent turn fields, Recover text turn)

## Frontend implementation — `TASK_2026_2320_lnpar`, chat-streaming follow-up

**Tasks completed**: both gaps named in `executor-notes.md`, `batch-7-report.md` and `batch-10-report.md`.
**Skills loaded**: angular-frontend-patterns, angular-developer.
**Git**: none run. The worktree is dirty. HEAD is 5f3385ca6.

## Files

All files are under `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\`. Every file is MODIFIED; none was created.

- `lib\agent-monitor.store.ts`
  - `MonitoredAgent` gains optional `reasoningEffort` and `observedModel`.
  - They are copied from `AgentProcessInfo` on all four record paths:
    - same-id re-spawn (re-open)
    - replacement card
    - fresh spawn
    - exit
  - On re-open and exit, a value in the payload wins. When the payload has none, the card keeps what it already had (`info.x ?? existing.x`), the same rule `providerId` and `supportsContinuation` use.
- `lib\agent-monitor.store.spec.ts`: a new describe block `lane turn settings on the record` with 5 tests:
  - fresh spawn copies both fields
  - both fields are absent when the record has none
  - re-spawn takes new values and keeps known ones
  - exit takes new values and keeps known ones
  - replacement card copies both fields
- `lib\lane-turn-settings.store.spec.ts`: a new describe block `confirmation from the real agent monitor record`. It uses the real `AgentMonitorStore` and `BackgroundAgentStore` and has 3 tests:
  - a pending model clears when a re-spawn reports `observedModel`
  - a pending effort clears when a re-spawn reports `reasoningEffort`, while an unconfirmed model stays pending
  - a pending effort clears when an exit payload confirms it
- `lib\agent-delivery.store.ts`
  - New exported `RecoveredLaneMessage { text; turn? }`. `recoverQueuedMessage` now returns this type (same shape as before).
  - `recoverIntoComposer` calls `recoverQueuedMessage` and stores `{text, turn}` per composer.
  - When two recoveries wait for the same composer, a private `mergeRecovered` folds them:
    - the texts join with a newline
    - files are deduplicated by path, and images by `mediaType` plus `data`
    - the later model and effort win
    - `turn` stays absent when neither recovery had one
  - New `takeRecoveredMessage(agentId): RecoveredLaneMessage | null`.
  - `takeRecovered(agentId): string | null` is kept as a text-only delegate (see Plan deviations).
  - `recoverQueuedText` is unchanged. It still returns a string, and `libs/frontend/chat/src/lib/services/agent-follow-up-queue.service.ts:212` is untouched.
- `lib\agent-delivery.store.spec.ts`: 5 new tests in the `turn snapshot` block:
  - Recover text hands the composer the message with its turn (files, images, model, effort), and the entry is consumed once
  - a text-only message is recovered with no `turn` key
  - two recoveries merge: texts joined, attachments deduplicated, later model wins, earlier effort kept
  - text-only, then a message with a turn, then text-only again: the turn is kept
  - `takeRecovered` still returns only the text and consumes the entry
- `index.ts`: exports `type RecoveredLaneMessage`.

## Stack observed

- Angular 22 with signals: root stores use `signal`, `computed` and a root `effect` (`lane-turn-settings.store.ts:111`).
- Host access goes only through `ClaudeRpcService`.
- The types come from `libs/shared/src/lib/types/agent-process.types.ts:327-329` and `agent-messaging.types.ts:58-73`.

## Verification

Both commands ran from the worktree, one at a time.

1. `npm run verify -- --related -p @ptah-extension/chat-streaming -- --output-style=static` wrote `.ptah/tmp/fixcs-related.log`. It exited 0:
   - `Test Suites: 21 passed, 21 total`
   - `Tests: 697 passed, 697 total`
   - `Successfully ran target test for project @ptah-extension/chat-streaming`
   - `lock released after 19.9s, exit code 0`
2. `npm run verify -- -t lint,typecheck -p @ptah-extension/chat-streaming -- --output-style=static` wrote `.ptah/tmp/fixcs-lint.log`. It exited 0:
   - `36 problems (0 errors, 36 warnings)`
   - `Successfully ran targets lint, typecheck`
   - None of the warnings is on a changed line. They are old non-null assertions in the monitor spec at lines 776 and later, and the existing `max-lines` warning on `agent-monitor.store.ts`.

Other notes:

- After both runs I changed only line endings. The Edit tool had written CRLF into the touched files, and I converted them back to LF, as they are in HEAD. The content did not change, so the results above still apply.
- No run was killed for low memory.
- Builds, serve, e2e and package did not apply.
- `typecheck-templates` does not apply because no template changed.
- `chat` was not checked, because another agent is editing it. Its callers typecheck by shape:
  - `recovered().has` still works.
  - `takeRecovered` still returns `string | null`.
  - `recoverQueuedText` is unchanged.

## Plan deviations

- **`takeRecovered` stays as a text-only delegate.** Its callers live in libraries this task could not edit:
  - `LaneDeliveryController` (`libs/frontend/chat/.../lane-composer/lane-delivery.controller.ts:226-229`)
  - the chat-ui `LaneComposerComponent`, which Batch 11 deletes

  Changing the return type would break their typecheck. The store now keeps the full turn, but those callers still drop it.

  **Follow-up for the chat owner:** in the controller effect, call `takeRecoveredMessage(agentId)`. Restore `message.text` with a snapshot built from `message.turn`, the same rebuild that Edit-after-reload already does through `recoverQueuedMessage`. Then delete `takeRecovered` and update the `takeRecovered` mocks in the chat specs. This is the only way Req 2.8's restore of files, images, model and effort reaches the "Recover text" receipt action.

## Decisions

- **Re-open and exit keep known values when the payload has none.**
  - Options: overwrite with `undefined`, or keep the known value.
  - Evidence: `providerId` and `supportsContinuation` follow the same rule at the same sites, and an exit payload may not carry the turn fields.
  - Reversible: yes.
- **When two recoveries merge, the later model and effort win.**
  - Evidence: the batch-10 coalescing rule ("the new pick wins for model and effort").
  - Reversible: yes; the rule is in one function.

## Out-of-scope observations

- The `takeRecoveredMessage` switch in `lane-delivery.controller.ts` described above. It is in the `chat` library, which this task did not own.
- The Batch 14 header (`observedModel ?? model`) can now read `MonitoredAgent.observedModel` directly.
