# Final fix round, TASK_2026_2320_lnpar

Source: `code-logic-review-final.md`. I checked each finding against the code before I changed anything.
None was disputed. S2 is fixed in part: see its line.

## Findings

- **S1 fixed.** `holdImages` now puts a sentence in `detail` (`ATTACHMENTS_CAPACITY_TEXT`). The new
  `messageOutcomeText` (`chat-streaming/agent-message-outcome-text.ts`) is the one map from every
  `AgentMessageOutcome.reasonCode` to user text. The map is a typed `Record`, so a new code fails the
  typecheck until it gets text. Host text in `detail` is kept. A bare code (`unsupportedFor`, `refuse`,
  `storageRefusal`, `laneDenied`, `already-decided`) is mapped, or falls back to the generic text. The
  lane delivery controller (2 sites) and `agent-follow-up-queue.service.ts` (2 sites), which showed
  `outcome.detail` the same way, now use it.
- **S2 fixed in part.** On a stopped lane with no cached catalog, `turnOptions` now serves
  `adapter.laneEfforts()`, a new optional `CliAdapter` method. Claude (`EFFORT_LEVELS`), Copilot and Pi
  implement it with the same fixed lists their live handles serve. It also returns `unavailableReason`
  ("Commands and skills appear when the lane is running." or "Effort levels, commands and skills appear
  when the lane is running."). The RPC passes the field through. The composer shows it as the effort
  reason and as the empty-group text of the `/` list, in place of "reports no reasoning effort levels".
  - ACP profile efforts are not filled. `profileEfforts()` needs the spawn options of the session, which
    the coordinator does not have.
  - Codex efforts are not filled either. They come from the live model catalog.
  - Both get the honest reason instead. No persisted catalog exists to read: the only cache is the
    coordinator's in-process map, and I did not add persistence.
- **M1 fixed.** After an accepted send, `LaneDeliveryController.send` calls `clearPending` when the
  pending pick still equals the pick the message carried. A pick changed during the send stays.
  `clearPending` now has a production caller, so it is kept. A failure restore puts the pick back as
  before.
- **M2 fixed.** `LANE_TURN_MAX_IMAGES` (8) and `LANE_TURN_MAX_FILES` (32) are now in
  `libs/shared/src/lib/types/agent-messaging.types.ts`. The RPC `turnSchema` and the envelope schema use
  them. Past either limit, the lane composer disables Send and Ctrl+Enter. The status line and the Send
  title show "A lane message takes at most 8 images. Remove N to send." The queue fold skips merging
  when the merged snapshot would exceed a limit, and the draft goes as its own message.
- **M3: already fixed by the orchestrator** in `1475896d7`. Not redone.
- **M4 fixed.** When `processReceipt` restores a failed message, it calls the new
  `AgentDeliveryStore.markRestored(id)` (a bounded set of 1024). `receiptStatus` then offers no Recover
  text for that row, so the text, images and files are not added twice. Retry stays, because it sends the
  host's single copy.
- **M5 (getMessage) fixed.** `getMessage` no longer releases a failed message's images on read. This
  matches the P5 S2 rules: a failed envelope keeps its images until the 30 min TTL, a cancel or another
  terminal state, and `retry` calls `keep()`. The coordinator spec now asserts that the images are still
  held after the read.
- **M5 (catalog error) fixed.** `LaneTurnSettingsStore.read` keeps an answer with `error` when any list
  is non-empty. It is stored as `ready` with `errorDetail`. The composer shows the lists and a notice:
  "Showing the last known lane options. The latest read failed." with Retry
  (`data-testid="lane-options-stale"`). An answer with `error` and only empty lists is still the error
  state.
- **M6 fixed.** The `UsageScope` doc in `agent-process.types.ts` now says that `cumulative` is a
  turn-scoped running snapshot and never a session total.
- **Minor, @ files fixed.** `ComposerInputSources` has a new optional `filesUnsupportedReason`. While it
  is set, `@` shows the reason as its one row, offers no files and fetches none, and a file pick inserts
  nothing. The lane composer wires it from `turnInput.files`. Attach files shows the reason instead of
  opening the picker.
- **Minor, Retry on a refused-settings failure fixed.** A `failed` receipt with reason
  `turn-options-refused` or `turn-input-unsupported` no longer offers Retry. Recover text and Cancel
  stay.
- **Minor, dead `clearPending` resolved.** It now has a production caller (M1) and a doc comment.

## Commits

- `1de7b2641` fix(cli-agent-runtime,rpc-handlers,shared): honest lane options and text
- `a0a1e28ec` fix(chat,chat-streaming): map lane refusals and mirror host limits
- this report: docs(docs)

## Checks (focused only; CI runs the gate, as the user asked)

- jest cli-agent-runtime: `agent-message-coordinator.lane-messaging.spec.ts` 25 passed, and
  `agent-message-envelope.schema.spec.ts` 18 passed.
- jest rpc-handlers: `agent-message-rpc.handlers.spec.ts` 41 passed.
- jest chat-streaming: `agent-message-outcome-text.spec.ts` (new), `agent-delivery.store.spec.ts` and
  `lane-turn-settings.store.spec.ts`: 71 passed.
- jest chat: `lane-delivery.controller.spec.ts`, `lane-composer.component.spec.ts`,
  `agent-follow-up-queue.service.spec.ts` and `composer-input.controller.spec.ts`: 102 passed.
- `npx eslint` on all 26 changed files: 0 errors. The 4 warnings were already there: max-lines in
  `copilot-sdk.adapter.ts`, and non-null assertions and an empty function in `pi-cli.adapter.ts`.
- `check-degradation.ts`: 0 unsuppressed sites. `check-ui-classes.ts`: 0 token counts over the
  baseline. I added no dynamic `[class]` binding.
- Not run, as instructed: `npm run verify`, `nx`, project `tsc`, `typecheck-templates` (the lane
  composer template changed), builds.
  - I did not run the copilot, pi and claude adapter specs. The only change there is the new
    `laneEfforts()` method.
