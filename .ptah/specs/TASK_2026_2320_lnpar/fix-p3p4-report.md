# Fix report, code-logic-review-p3p4 — `TASK_2026_2320_lnpar`

I checked each finding against the code before I changed it. All seven findings I was asked to fix are real, and none is disputed. I did not touch S1 or S2 (they belong to batch 22) and made no backend edits.

## Findings

- **S3: fixed.** `sendQueuedNow` no longer returns when the lane switches after the cancel. It finishes the send for the original lane, because the user asked for it to go now and the queue no longer holds it. A refusal or exception puts the message back in the composer only if that composer still shows the lane. Otherwise the message is held for its own lane with the new `AgentDeliveryStore.holdForComposer`, and the next composer that shows the lane restores it. `send()` now calls `remember()` even after a lane switch, so a later refusal restores the message when the lane is shown again. It also still cancels the earlier queued message it combined (before, it returned early and both could be delivered). A draft that is refused or that fails after a switch is held for its lane too. `withdraw()` (Edit) used to restore into whichever lane was showing; it now uses the same lane-safe restore. Errors about a lane are no longer shown on another lane (`errorFor`).
- **M1: fixed.** Ctrl+Enter (`requestNow`) refuses while `attachments.pendingReads() > 0` and shows "An attachment is still loading. Send when it appears in the tray." `sendNow` checks again after the loss dialog, because a read can start while the dialog is open.
- **M2: fixed.** `restore()` puts back the message's model and effort only when the lane has no pending pick for that field. A newer pick is kept.
- **M3: fixed.** Every accepted message now records the composer that sent it (`owner`). A refused receipt is restored only into the owner. Another composer on that lane gets it only after the owner leaves the lane, and only if it is the lane's preferred composer. A recovered message ("Recover text") goes only to the preferred composer: the one the user last used for the lane (draft edit, send, edit or send now), else the one mounted last. Each controller adds itself to a module-level registry and removes itself on `DestroyRef`.
- **M4: fixed.** The `resolvedStatus` computation has no side effects any more. `sentOutcomes` is bounded instead (32 entries, oldest dropped on insert). The outcome is recorded before `respondLane` runs and rolled back if the answer was not sent. The status line clears when a new prompt arrives or the lane changes. `notice` is now a `linkedSignal`. It clears on the next answer that is sent, when a new prompt arrives, or on a lane switch. It is not cleared when the refused prompt leaves.
- **M5: fixed.** The source of `figureChanges` is now `{ agentId, tokens }`. A different agent resets the count to 0, so no flash shows.
- **M6: fixed.** `LanePermissionView.answer` passes the owner tab as the deciding tab. That is the question's `tabId`, else the tab of the lane's `parentSessionId` (looked up by tab id, then by session id), else `null`. `ChatStore.handleQuestionResponse` now treats `null` as "no tab decided". Leaving the argument out still means the active tab, so existing callers are unchanged. The same bug was in the canvas lane view's tab-level question card, which now passes its own `tabId()`. That is a one-line template change.

## Files changed

- `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-delivery.controller.ts`: S3, M2, M3.
- `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-delivery.controller.spec.ts`: 11 new specs (S3 ×5, M2, M3 ×4); the mock store gains `holdForComposer`.
- `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts` and `.spec.ts`: M1.
- `libs/frontend/chat/src/lib/services/lane-permission-view.ts` and `.spec.ts`: M4, M6 (7 new specs).
- `libs/frontend/chat/src/lib/services/chat.store.ts`: M6 (`decidingTabId: string | null`).
- `libs/frontend/chat/src/lib/components/molecules/agent-card/cli-lane-usage-summary.component.ts` and `.spec.ts`: M5.
- `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts` and `.spec.ts`: `holdForComposer` (`recoverIntoComposer` now uses it).
- `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts`: the question card passes `tabId()`.

## Checks

- `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-streaming,@ptah-extension/canvas`: exit 0, 3 of 3 tasks succeeded. Jest results: chat 98 suites, 1832 tests passed; the other two projects 21 suites / 697 tests and 5 suites / 220 tests, all passed. Log: `.ptah/tmp/w9-fix-related.log`.
- `npm run verify -- -t lint,typecheck -p` (same three projects): exit 0, 6 of 6 tasks succeeded. Log: `.ptah/tmp/w9-fix-lint.log`.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: exit 0. Log: `.ptah/tmp/w9-fix-templates.log`.

## Notes

- A message held for another lane comes back with its text, files, images, model and effort. Two things are lost on the way: the refusal reason is not shown when it returns, and file and image metadata is rebuilt from the turn, the same way as "Recover text".
- The preferred composer is a heuristic: last used, else mounted last. The visual review in Electron should check the inspector plus canvas case.
