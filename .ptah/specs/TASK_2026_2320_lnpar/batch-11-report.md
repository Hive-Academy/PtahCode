# Batch 11 report — F5b lane composer rewrite and mounts

## Frontend implementation — `TASK_2026_2320_lnpar`, batch 11

**Tasks completed**: 11.1 (new `LaneComposerComponent` in chat), 11.2 (remount continue-input and inspector, exports, delete the chat-ui LC). Also done: the executor-notes hand-offs (switched to `takeRecoveredMessage()` and deleted `takeRecovered`, added the `@` footer line, `providers: [VoiceInputService]`, queued list names `sendNowAction`/`busy`/`sendable`).

Skills loaded: angular-frontend-patterns, angular-developer.

**Files** (root `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity`):

- CREATED `libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-composer.component.ts`: the `ptah-lane-composer` component. It provides `VoiceInputService`, `ComposerCompactStore`, `ComposerAttachmentsService`, `ComposerInputController` and `LaneDeliveryController`.
- CREATED `...\lane-composer\lane-composer.component.html`: its template, split out so the `.ts` file stays under the `max-lines` 700 lint limit (683 lines).
- CREATED `...\lane-composer\lane-composer.component.spec.ts`: 38 tests. It covers every parity A row plus the new states.
- MODIFIED `...\lane-composer\lane-delivery.controller.ts`: the Recover effect now uses `takeRecoveredMessage()` and restores the text plus the turn (files, images, model, effort). Added `sendQueuedNow(id, allowPartialTurnLoss)` and a private `takeQueued` (read, then cancel) that `withdraw` shares.
- MODIFIED `...\lane-composer\lane-delivery.controller.spec.ts`: switched the mock to `takeRecoveredMessage`. Added a test for restoring a recovered turn and 5 `sendQueuedNow` tests.
- MODIFIED `libs\frontend\chat\src\lib\components\molecules\agent-continue-input\agent-continue-input.component.ts`: mounts the new LC. Removed the `variant`→LC mapping and the `laneControls` slot. Stop and Resume now go through the LC inputs `showLaneControls`, `resumable`, `stopPending`, `resumePending` and the outputs `stopRequested`, `resumeRequested`. The visibility rules, the lone Stop/Resume and the terminal status are unchanged.
- MODIFIED `...\agent-continue-input\agent-continue-input.component.spec.ts`: host-rule tests run against an LC stub with `errorOnUnknownProperties: true`. Behaviour tests moved to the LC spec.
- MODIFIED `libs\frontend\chat\src\lib\components\organisms\session-inspector\inspector-agents-section.component.ts`: imports the chat LC and has no `variant`.
- MODIFIED `...\session-inspector\inspector-agents-section.component.spec.ts`: uses an LC stub. The mount test now checks `agentId`, `laneLabel` and `stopped`.
- MODIFIED `libs\frontend\chat\src\lib\components\file-suggestions\unified-suggestions-dropdown.component.ts` (+ spec): new `footer` input that renders one line at the foot of the panel.
- MODIFIED `libs\frontend\chat\src\lib\components\molecules\attachment-tray\attachment-tray.component.ts` (+ spec): new `imagesBlocked` input. Image chips get a "Can't send" text badge and a remove button that stays visible.
- MODIFIED `libs\frontend\chat\src\index.ts`: exports `LaneComposerComponent`.
- MODIFIED `libs\frontend\chat-ui\src\index.ts`: removed the `LaneComposerComponent` export.
- MODIFIED `libs\frontend\chat-streaming\src\lib\agent-delivery.store.ts`: deleted `takeRecovered`.
- MODIFIED `libs\frontend\chat-streaming\src\lib\agent-delivery.store.spec.ts`: the first Recover test uses `takeRecoveredMessage`, and the `takeRecovered` test is deleted.
- MODIFIED 5 agent-card specs (`agent-card-flat-header`, `agent-card-unified`, `cli-agent-output.component`, `stats-accumulation`, `stdout-visibility`): changed the mock from `takeRecovered: () => null` to `takeRecoveredMessage: () => null`.
- DELETED `libs\frontend\chat-ui\src\lib\molecules\lane-composer.component.ts`
- DELETED `libs\frontend\chat-ui\src\lib\molecules\lane-composer.component.spec.ts`

Nothing imports the old LC any more. `chat-ui` has no lane composer and imports nothing from `@ptah-extension/chat` (checked with grep).

**Stack observed**:
- Angular standalone, signals, OnPush and `inject()`, as in `chat-input.component.ts`.
- Per-composer services in component `providers`, as in `chat-input.component.ts:144-149`.
- Tailwind/DaisyUI classes plus the shared `COMPOSER_*` constants from `chat-ui/src/lib/molecules/composer-card.ts`.
- Lucide icons.
- The fold and container-query CSS is main chat's sheet, reused through `styleUrl: '../chat-input/chat-input.component.css'`.

**Design fidelity** (design-spec 2-6, parity-inventory A):

- Same card, textarea and toolbar order as main chat: `+` → approval chip | model · effort group → mic → Stop or Resume session → Send.
- Same container breakpoints: below 640 px the effort label hides, at ≤400 px the labels hide and the "N limited" badge hides.
- The compact bar is main chat's unchanged (decisions.md 8). Its label reads "{CLI} is working…" and its chip shows the confirmed model (`observedModel ?? model`).
- No Send options chevron (decisions.md 7). Ctrl/Cmd+Enter sends now, and so does the queued card button.
- Send keeps the native `disabled` (decisions.md 10).
- The status line under the card shows, in priority order: a revealed gated reason, the image block, "Checking lane options…", the last action note, then the mode hint. It is `aria-live`, with the full text in `title`.
- The loss dialog follows 6.3: "Interrupt this turn?", the backend `lossDisclosure.text` or the spec fallback, "Interrupt & send" (`btn-warning btn-xs`) and "Keep current turn".
- Deviation 1: the design's ghost xs "Retry" now also re-reads the catalog, not only the previews.
- Deviation 2: when a now-send is confirmed, its result note is only one of the two design texts: steer → "Sent. It joined the running turn.", interrupt → "Turn ended…". The Claude caveat variant waits until the backend reports steer.

**States covered**:

- **Checking**: gated pills are `aria-disabled`, the chip reads "Checking" with a spinner, the status line shows a spinner and "Checking lane options…", and Send is disabled.
- **Options failed**: "Could not load lane options." in `state-err` ink with Retry, and the approval chip reads "Unknown".
- **Refused send**: an error line with the backend text; the draft and attachments are kept.
- **Image blocked (Req 1.6)**: driven by `turnInput.images` from the preview's `effectiveCapabilities`. The chip says "Can't send", Send is `disabled`, the status line says "{CLI} lanes cannot take images. Remove the image to send." in `state-need` ink, and Enter does not send.
- **Gated model/effort/approval**: these use the existing gated directive, so the backend reason shows in the title, in `aria-describedby` and on the status line while the control is focused or hovered.
- **Model/effort footer**: "next turn" or "next spawn".
- **Pending dot**: from `LaneTurnSettingsStore.pending`.
- **`@` footer**: "Chosen files are sent as file references." or the path-text line, and the status note "Added as a file reference.".
- **`/` list**: Commands and Skills groups, with blocked names removed and each empty group giving its reason. When the lane has neither, one notice row says so.
- **Queued cards**: through the shared `ptah-queued-message-list` (Withdraw, Send now / Interrupt & send, aria-disabled with its reason). Parent-sent items show "Sent by the parent session" and no Withdraw.
- **Stopped**: placeholder "Resume {lane} with a message…", Send `aria-label="Resume with message"`, and the resume path in the hint.
- **Accessibility**: the textarea is a combobox with a label; the dialog has `aria-modal`, `aria-labelledby` and `aria-describedby`; the fold is announced through an sr-only live region.

Parity A rows, all kept or moved. Each has a test in `lane-composer.component.spec.ts` unless noted:

- Card shape, label and placeholder, aria-live hint with `title`, auto-grow (`field-sizing: content`, `rows=2`, asserted).
- Draft resets on a lane switch.
- Enter / Shift+Enter / IME composition.
- Ctrl+Enter and Cmd+Enter.
- Queue send.
- Send now moved to Ctrl+Enter and the queued card.
- Loss dialog: focus, Tab trap, Escape returns focus to the field, the textarea is read-only while open, the backend text plus a fallback, Keep current turn, consent passed only after confirmation.
- Disabled reasons and the preview refresh on focus and status change; unrelated updates are ignored.
- Retry.
- Resume with message.
- Queued list. "N queued · last" is replaced by the shared queued cards (design 6.1).
- Withdraw (formerly Edit), with the read-back after a reload and the failed read-back.
- No Withdraw for parent-sent messages.
- Coalescing, all 3 cases.
- Restore with reason, and restore after a remount.
- Recover text.
- Limit hold.
- Idempotency key reuse.
- Error when there is no receipt.
- `laneControls` moved into the toolbar.
- Visibility rules and terminal status: in the ACI spec.
- The variant replaced by the compact bar.
- Inspector mount: in the inspector spec.

**Usage highlight (acceptance line)**: the composer shows no usage figure. The usage highlight belongs to the lane header in Batch 14 (design 7). The only motion here is main chat's fold, and its CSS and the compact store already respect reduced motion. I added no timers or animations, and nothing runs per list item.

**Verification** (logs in `.ptah\tmp\`):

1. `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/chat-streaming` (`w6-b11-lint-typecheck.log`). First run: 1 error, a parse error in my attachment-tray spec title, plus a `max-lines` warning on the LC (831 lines). After the fixes: "6 tasks: 6 succeeded", exit 0. `npx eslint` on the changed folders and files prints nothing.
2. `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/chat-streaming` (`w6-b11-related.log`). Result: 47 suites, 808 passed, 3 failed, all in the new LC spec, where the catalog read had not settled in `mount`. I fixed `mount` to settle microtasks.
3. I re-ran only the LC suites: `npm run verify -- --related -p @ptah-extension/chat -- --testPathPatterns=lane-composer` → 3 suites, 65 tests passed (`w6-b11-related-lc.log`).
4. `npm run verify -- -t typecheck-templates -p ptah-extension-webview` → 1 task succeeded, not cached, 36.6 s, exit 0 (`w6-b11-templates.log`).
5. Extra check, because canvas mounts the ACI: `npm run verify -- -t test -p @ptah-extension/canvas -- --testPathPatterns=canvas-lane-view` → 1 suite, 23 passed (`w6-b11-canvas.log`).
6. Not run, per the batch rules: the full gate, the Electron visual review (phase review due; decisions.md 17 combines the visual reviews), builds and e2e. I did not edit `batches.md` and made no git commits.

**Plan deviations**:

- **Write set expanded**, needed by the spec or the hand-offs:
  - the dropdown `footer` input (the `@` footer line has no other place to go);
  - the attachment tray `imagesBlocked` input (the Req 1.6 "Can't send" chip);
  - the chat-streaming store and its spec (the hand-off said to delete `takeRecovered`);
  - 5 agent-card spec mocks;
  - the controller and its spec (the hand-off switch, plus `sendQueuedNow`).
- **`sendQueuedNow`**: the queued card's Send now needs an action on a queued item, and the controller had none. It withdraws the item, then sends its text and snapshot with delivery `now`, separately from the draft. If the send is refused or fails, the item goes back into the composer.
- **Type-to-expand**: it listens only inside the lane composer, through `isTypeToExpandKey` scoped to the composer root, rather than with the document-wide directive. Otherwise a key typed in the main chat could also expand a lane composer folded inside the same `ptah-chat-view`. The design asks for "a printable key while it has focus".
- **`laneActive` follows the host's `stopped` input**: the canvas passes not running or starting, the inspector passes not running. That input also drives the fold and Stop.
- **The catalog loads on mount and on a lane switch**, not only when the dropdown opens. The pills need the current model and effort, and the `/` list needs the commands.

**Out-of-scope observations**:

- The open note from fix-p2 still stands: focus is lost when a gated pill swaps to the enabled one. Check it in the Electron visual review.
- The `MonitoredAgent` copy of `reasoningEffort` and `observedModel` is assigned to Batch 14. Until it lands, the pending dot may not clear.
- The queued card shows the receipt `preview`, which is the backend preview and may be truncated, because the full text of a reloaded receipt lives only in the backend.
