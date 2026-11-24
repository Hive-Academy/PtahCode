# Batch 10 report: F5a lane delivery controller

## Frontend implementation — `TASK_2026_2320_lnpar`, batch 10

**Tasks completed**: Task 10.1, which moves the LC delivery logic into `LaneDeliveryController` and adds the turn snapshot. Status: COMPLETE.

**Skills loaded**: angular-frontend-patterns, angular-developer.

**Files**:

- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-delivery.controller.ts`. This is the per-composer `@Injectable()` delivery controller. The owner calls `connect` on it once.
- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-delivery.controller.spec.ts`. It holds 14 tests, including the Req 2.8 spec.

No other file was touched. The chat-ui `LaneComposerComponent` stays as it is: Batch 11 deletes it and mounts the new component.

**Stack observed**: Angular 22 (`package.json` `@angular/core ~22.2.7`). It uses signals, `computed` and `effect`, and per-composer providers. The connect pattern follows `libs/frontend/chat/src/lib/services/composer-input.controller.ts`. The stores are `AgentDeliveryStore` (`recoverQueuedMessage` and `sendMessage(..., turn)`) and `LaneTurnSettingsStore` (`turnSettings`, `pickModel`, `pickEffort`), both from `@ptah-extension/chat-streaming`. Attachments go through `ComposerAttachmentsService` (`snapshotForSend`, `addFile`, `images`).

## Controller API (for Batch 11)

- `connect({ agentId, draft, stopped, cli, resumePath, accepted })`. `draft` is the owner's `WritableSignal<string>`.
- Read-only signals:
  - `sending`, `error`, `state`, `previewsReady`
  - `queuedReceipts`, `lastReceiptLabel`
  - `queueDisabled`, `nowDisabled`, `nowNeedsConfirmation`
  - `resumeDescription`, `hint`
- Actions:
  - `send(delivery, allowPartialTurnLoss?)`
  - `withdraw(messageId)` (Edit or Withdraw)
  - `refreshPreviews()`
  - `draftChanged()`, which clears the error when the user types
- Providers it needs beside it: `ComposerAttachmentsService` (the composer provides it). `FilePickerService`, `LaneTurnSettingsStore`, `AgentDeliveryStore` and `AgentMonitorStore` are root services.
- The overlay UI stays in the component: menu, loss dialog, focus return, Escape and the focus trap. The component calls `send('now', true)` after the confirmation, gated on `nowNeedsConfirmation()`.

## What moved, and what was added

Moved from `chat-ui/.../lane-composer.component.ts:82-363`:

- preview loading and the preview-key refresh
- the shared accepted map with its caps (32 in total, 8 per lane)
- coalescing a new draft with the earlier queued message, including the cancel-before-RPC guard
- idempotency key reuse after a transport failure
- restore driven by receipts (failed, expired, interrupted-undelivered), plus the settled cleanup
- Recover text into the draft
- the `lane-at-limit` hold counted as accepted
- Edit, which reads the message back before the cancel drops it
- the "No receipt" error and the error after a refused send

Added:

- **Turn snapshot.** Each accepted message keeps `{files: ChatFile[], images: ComposerImage[], settings: LaneTurnSettings}` beside its text.
  - The send builds the `LaneTurnRequest` from it: `model`, `reasoningEffort`, `images` (`data` and `mediaType`) and `files` (paths). A text-only send passes `turn` as `undefined`.
  - On accept, the controller clears the draft only if it is unchanged, and removes only the attachments it sent (`removeSent`).
- **Restore.** When a message comes back, the text goes after the current draft, and the files and images return to the tray without duplicates.
  - Files are deduplicated by path and images by id.
  - The model and effort go back through `pickModel` / `pickEffort`.
  - Restore does not call `attachments.restore()`, which would abort a file pick still in progress.
- **Req 2.8.** A receipt that fails with `turn-options-refused` or `turn-input-unsupported` shows `<status label>: <receipt.lastError>`, which is the backend's reason. Without `lastError` it shows a fixed hint instead.
- **Coalescing.** The combined send merges the earlier message's snapshot with the new draft's. Attachments are kept from both; the new pick wins for model and effort.
- **Edit after a reload.** It uses `recoverQueuedMessage` and rebuilds the `ChatFile` and `ComposerImage` entries from the host's turn.
- **Idempotency key.** The key's signature now covers the turn as well (model, effort, files, image fingerprint). A retry with different attachments gets a new key.
- **Lane switch.** Switching lanes also clears the attachment tray, not only the draft.

## Verification

Each command was run once, one at a time, from the worktree.

1. `npm run verify -- --related -p @ptah-extension/chat` produced `.ptah/tmp/w5-b10-related.log` and exited 0: `NX 1 task: 1 succeeded`, `@ptah-extension/chat:test 34.9s`, lock released with exit code 0. The Nx output style hid the per-suite lines, so the next run confirms the new spec by name.
2. `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=lane-delivery --output-style=static` produced `.ptah/tmp/w5-b10-spec.log` and exited 0:
   ```
   Test Suites: 1 passed, 1 total
   Tests:       14 passed, 14 total
   ```
3. `npm run verify -- -t lint,typecheck -p @ptah-extension/chat -- --output-style=static` produced `.ptah/tmp/w5-b10-lint.log` and exited 0:
   ```
   ✖ 251 problems (0 errors, 251 warnings)
   NX  Successfully ran targets lint, typecheck for project @ptah-extension/chat
   ```
   None of the warnings is in the new files (`grep lane-composer` on the log finds nothing). The rest are warnings that already existed in the project.

- `typecheck-templates` does not apply: no template changed.
- No build, serve, e2e or package command was run, and no verify run was killed for low memory.

## Spec coverage (`lane-delivery.controller.spec.ts`)

1. A send carries the attachments and the pick as `turn`, then clears the draft and the tray.
2. A text-only send passes no turn.
3. **Req 2.8**, run with `it.each` for `turn-options-refused` and `turn-input-unsupported`: when the receipt fails at flush, the text (after the draft typed in the meantime), the file, the image, the model and the effort all come back, and the error shows the backend's `lastError`.
4. A refused send (`mode: 'unsupported'`) keeps the draft, the attachments and the pick, and shows the detail (Req 2.10).
5. Coalescing merges both snapshots and cancels the earlier message. A cancel push for the earlier message does not restore it, while a failure of the combined message restores everything.
6. Withdraw restores the local snapshot without a backend read.
7. Edit after a reload reads the text and turn back through `recoverQueuedMessage`, and rebuilds the file and image entries and the model.
8. When Edit cannot read the message back, it does not cancel, shows an error and clears `sending`.
9. The idempotency key is reused for an identical retry and changes after the attachments change.
10. A `lane-at-limit` hold counts as accepted, and a later expiry restores the message.
11. Recover text lands in the draft.
12. A lane switch clears the draft and the tray and loads both previews.
13. The hint text, and `nowNeedsConfirmation` for a lossy Send now.

## Decisions

- **The snapshot's model and effort win on restore**, over a pick the user made in the meantime.
  - Options considered: let the snapshot win, or keep the current pick.
  - Evidence: Req 2.8 says "restores ... model and effort".
  - Reversible: yes; it is in one place (`restore`).
- **Accepting a message does not clear the pending pick.**
  - Evidence: `LaneTurnSettingsStore` clears a pick when the agent record confirms it, so the picker keeps showing the queued choice until then.
  - Reversible: yes.
- **Settled cleanup now clears the attachments of a message that has started.** The old LC removed nothing for a `started` receipt because it had no attachments; now `removeSent` runs for `started` too, like the draft clear.
- **A file restored from the host has `size: 0` and `tokenEstimate: 0`.** The host returns only paths. The type comes from `FilePickerService.isFileSupported`, the same check `pickFiles` uses.

## Plan deviations

None. Two notes:

- `hint` and `resumeDescription` sit in the controller, because they are derived from the delivery state. Batch 11 may replace the hint text with the design-spec status line.
- Image-gating (Req 1.6) stays with Batch 11, which owns the component and its status line. The controller exposes `state()` so it can derive the gate.

## Risk handling

- **Memory.** The shared accepted map now holds image base64. It keeps the old caps (32 in total, 8 per lane). Entries are dropped when the message settles, fails, is cancelled or is coalesced.
- **Tests sharing state.** The module-level map is shared across tests, so every test uses a unique receipt id.
- **Tray handling.** Restore adds to the tray instead of replacing it, so a draft or attachment the user added in the meantime is never lost.

## Out-of-scope observations

- `AgentDeliveryStore.recoverIntoComposer` (the "Recover text" receipt action, chat-streaming) still recovers only the text: it calls `recoverQueuedText`, which drops the turn. To get the model, effort and attachments back through that path too, the store would need a `recovered` entry that carries the turn. That change belongs to chat-streaming, outside this batch's write set.
- Batch 11 has to provide `LaneDeliveryController` next to `ComposerAttachmentsService` in the new component's providers, and remove the overlay resets from the old effect (the menu and the loss dialog) into the component itself.
