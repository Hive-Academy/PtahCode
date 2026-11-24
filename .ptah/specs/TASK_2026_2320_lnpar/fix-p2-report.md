# Fix round P2 - TASK_2026_2320_lnpar

Source: `code-logic-review-p2.md` (M1-M4, m1-m3). Worktree `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity`, HEAD 5f3385ca6, no commits. Files touched only in `libs/frontend/chat` (none in `chat-ui` or `chat-streaming`). Skills loaded: angular-frontend-patterns, angular-developer.

## Findings and fixes

- **M1 glass guard**: the fold spec now renders the real `ComposerAttachMenuComponent` and `ComposerVoiceButtonComponent` (override imports). The glass test opens the attach menu, then asserts that `.ptah-composer-toolbar` holds `[data-glass-surface="overlay"][data-composer-overlay]`, and that no faded element is or contains a glass surface while the menu is open. The attach-menu spec now asserts `data-glass-surface="overlay"` and `data-composer-overlay` on the open `role="menu"` panel.
- **M2 host glue**: new `describe('toolbar controls, rendered in Electron')` in the fold spec, with `isElectron` true and the host `VoiceInputService` stub. (1) It clicks Dictate, which calls `startRecording`. Recording is set, `stopRecording` resolves `{ok, transcript: ' hello from voice '}`, and a second click puts `'hello from voice'` into `currentMessage()`. (2) It clicks `+`, then Attach files, then Attach images, and checks that `pickFiles` and `pickImages` are each called once on the component-level `ComposerAttachmentsService`.
- **M3 reopen after gate**: in the model and effort pickers, `_isOpen` is now `linkedSignal({ source: gated, computation: () => false })`. Every gate change resets it to closed, so a menu that was open when a reason arrived stays closed after the reason clears. `menuOpen` is unchanged. Each picker has the spec "stays closed after a gated period ends".
- **M4 stale reason**: the directive tracks whether its reason is shown. An effect sends `reasonCleared` when `gated()` goes false while the reason is shown. Angular removes output listeners before it runs destroy hooks (`processCleanups`), so the directive cannot emit while it is being destroyed. The pickers destroy the gated button when they swap it out, so they track the relayed reveal/clear themselves and send `reasonCleared` from an effect when the gate lifts while a reason is shown. Directive specs: "clears a shown reason when the control is ungated while focused" and "sends no clear on ungate when the reason was never shown". Each picker has "clears a shown reason when the gate lifts under focus" and "sends no clear when the gate lifts with no reason shown".
- **m1 attach host**: `host: { class: 'contents' }` on `ptah-composer-attach-menu`, as on the voice button. New spec: "has no box of its own".
- **m2 track keys**: in groups mode, option row keys are now `${groupIndex}-${optionKey}`. The flat main-chat path is unchanged. New spec: "keys a command listed in two groups once per group" (unique keys, 2 options rendered).
- **m3a statusNote**: `replaceTrigger` now returns `boolean`. The path-text branch sets `statusNote` only when the insert happened. New spec: "sets no path-text note when there is no textarea to insert into".
- **m3b loading source**: `filteredSuggestions` returns `[]` while the `/` source state is `loading` (only the spinner row shows). Main chat uses `discovery` and is unaffected. New spec: "drops an older list while the source is loading".

Main chat behaviour and look are unchanged. The attach-menu host now uses `display: contents` (m1), which removes a possible line-box strut. This still needs the planned Electron visual check.

## Checks

- `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-ui` exited 0 with "2 tasks: 2 succeeded". From the Nx terminal output: chat ran 33 suites, 556 tests passed; chat-ui ran 5 suites, 67 tests passed. Log: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\fixp2-related.log`. The log shows no per-suite names. The run used Jest `--changedSince main`, so it covers the changed spec files.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,@ptah-extension/chat-ui` exited 0 with "4 tasks: 4 succeeded". Log: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\fixp2-lint.log`.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview` exited 0 with "1 task: 1 succeeded". Log: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\fixp2-templates.log`.
- Not run: the full gate and the Electron visual check (not in this brief).

## Files (modified)

- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-attach-menu.component.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-attach-menu.component.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-model-picker.component.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-model-picker.component.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-effort-picker.component.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-effort-picker.component.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-gated-control.directive.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-gated-control.directive.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\chat-input\chat-input.streaming-fold.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\file-suggestions\unified-suggestions-dropdown.component.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\file-suggestions\unified-suggestions-dropdown.component.spec.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\services\composer-input.controller.ts
- D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\services\composer-input.controller.spec.ts

## Decisions

- M4 location: the directive alone cannot cover the swap case, because of the Angular teardown order (evidence: `processCleanups` in `@angular/core` unsubscribes listeners before `ON_DESTROY_HOOKS`, and `OutputEmitterRef` drops emits after destroy). The fix is in two places: the directive covers hosts that keep the control, and the pickers cover the swap. This is reversible. Keeping one button across the swap would remove the picker code but would undo the batch-4 title work-around.
- M3: `linkedSignal` instead of a `close()` effect. It has no write in an effect and resets on every gate change. Angular 22.2 is in `package.json`, and `linkedSignal` is already used in `libs/frontend/canvas`.

## Out of scope (not touched)

- Focus is still lost when a focused gated pill swaps to the enabled pill (the executor noted this). It needs a single-button restructure.
- m4 (queued list `find()` no-op, unused `COMPOSER_PILL_CLASS`) is a note only in the review and was not in this brief.
- The worktree also has uncommitted `libs/frontend/chat-streaming` changes (`agent-monitor.store*`) from the other agent. I did not touch them.
