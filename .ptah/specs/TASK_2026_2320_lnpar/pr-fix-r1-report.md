# PR #1501, CodeRabbit round 1: fix report

Source: `pr-review-comments-r1.md` (13 unresolved threads, review of `46488d5d4`). I checked each
comment against the current code (head `2aba18e6e`). The final fix round (`1de7b2641`, `a0a1e28ec`)
did not touch any of these paths, so none was already fixed. All 13 were valid and are fixed. Thread 5
is fixed with a different rule than the bot proposed. The reason is in its entry.

## Threads

### 1. PRRT_kwDOPngTds67Z1C3 / 4681300473: recheck release after settings apply
- **Outcome:** fixed in `f52972bed`.
- **Reply:** Fixed. After the turn pre-flight await, `continueConversation` now runs the same admission
  checks again (`assertLaneAdmitsTurn`, `agent-process-manager.service.ts:3293`). These are: released,
  stopped (stop() stamps `stopped` before its kill), replaced, paused, budget. So a lane that stop()
  released during `applyTurnSettings` gets `released`, before agent:spawned or continue() runs. A
  live, admitted handle still continues. New spec: "refuses the turn when the subprocess is released
  while settings apply".

### 2. PRRT_kwDOPngTds67Z1DA / 4681300490: keep admission valid across the pre-flight await
- **Outcome:** fixed in `f52972bed`.
- **Reply:** Fixed. `continueConversation` now reserves the lane (`continuationsInFlight`, line 3399)
  from the admission check until the record is `running`. The reservation is released in a `finally`.
  A second continuation, text-only included, gets `busy` before it writes any turn state. New spec:
  two text-only continuations race, one is refused busy, `continue()` runs once and `turnSeq` moves
  by one.

### 3. PRRT_kwDOPngTds67Z1DH / 4681300500: blocked-model check on the cold-resume model
- **Outcome:** fixed in `f52972bed`.
- **Reply:** Fixed. The Ptah CLI resumer now passes `params.model` to `prepareSdkHandleSpawn`
  (`ptah-cli-lane-resumer.ts:124`), so the R9.5 check covers the model the resume launches. New spec:
  the resumer passes that model, and a refusal launches nothing.

### 4. PRRT_kwDOPngTds67Z1DM / 4681300511: keep cold-resume settings on the new record
- **Outcome:** fixed in `f52972bed`.
- **Reply:** Fixed. `spawnFromSdkHandle` takes optional `model` and `reasoningEffort` and writes them
  on the new record (`agent-process-manager.service.ts:1767`). The resumer passes the resolved values,
  so a later resume keeps B/high. When no override exists, both stay unset and the configuration
  fallback is unchanged. Specs cover the resumer pass-through and the recorded fields.

### 5. PRRT_kwDOPngTds67Z1DV / 4681300525: confirm a model pick against the current model
- **Outcome:** fixed in `907d0e987`, with a different rule than the one proposed.
- **Reply:** The stale value was real: on a continued turn, the monitor's reopen path did not refresh
  `model`. It now does, on spawn and on exit (`agent-monitor.store.ts:1669`, `:2031`). The store now
  compares a pick with `record.model`, the same value the host compares it with. It uses
  `observedModel` only when no model is recorded (`lane-turn-settings.store.ts:81`). We did not prefer
  `observedModel`. It lags one turn behind an applied change, so preferring it would drop a pick of
  the previous model the same way. New specs cover both cases.

### 6. PRRT_kwDOPngTds67Z1D4 / 4681300578: effort options not keyboard-selectable
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. The pill and the open menu handle keydown (`composer-effort-picker.component.ts:444`,
  shared map in `composer-menu-keys.ts`). ArrowDown or ArrowUp opens the menu. The arrows, Home and
  End move the active row, Enter or Space selects it through `choose(option)`, Escape closes the menu
  and Tab closes it. `KeyboardNavigationService` is configured with the option count, and each open
  starts on the selected level. The pill sets `aria-activedescendant`. A pointer-opened menu still
  shows no active row until a key or a hover. Three new specs.

### 7. PRRT_kwDOPngTds67Z1EB / 4681300593: model rows not keyboard-selectable
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed with the same key map. The navigation service is configured with the visible row
  count: primary rows, then the "Other versions" toggle as a row, then that section's rows while it is
  open. The template's `rowIndex` uses the same numbers, so `isActive` matches. Enter on the toggle
  expands the section and the new rows can be reached. Both hosts inherit this. New specs cover
  primary selection, keyboard expansion of "Other versions", and Escape.

### 8. PRRT_kwDOPngTds67Z1EI / 4681300606: background actions while the loss dialog is open
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. While the dialog is open, the queued list and the whole composer stage are `inert`
  (`lane-composer.component.html:13`, `:53`). The dialog's own buttons stay usable. As a second guard,
  `send`, `requestNow` and `requestQueuedNow` return early while the dialog is open, so the dialog's
  target cannot change. Focus goes back to the field after the render that removes `inert`. New spec:
  a queued Send now click during the dialog does not retarget it.

### 9. PRRT_kwDOPngTds67Z1EQ / 4681300615: recheck failed receipts when their owner leaves
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. The receipt effect now also tracks the mounted-composer map
  (`lane-delivery.controller.ts:285`). When the owner unmounts or leaves the lane, a composer that was
  already preferred checks pending receipts again and restores the failed message. While the owner is
  still mounted, the other composer still declines. New spec for the same-flush case. It fails without
  the change.

### 10. PRRT_kwDOPngTds67Z1Ed / 4681300630: do not send a copy of a still-queued message
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. A fold now takes the earlier message out of the queue before it sends the combined
  one (`takeForFold`, line 577). The three outcomes:
  - The earlier message already started: the draft is sent on its own.
  - The cancel fails: nothing is sent and the draft stays, with an error.
  - The combined send is refused or fails: the earlier text and attachments go back in front of the
    draft.

  So A cannot run twice and is never lost silently. The old "both messages may be delivered" path is
  gone. Specs were updated to the new order, plus four new specs.

### 11. PRRT_kwDOPngTds67Z1Eo / 4681300647: bind send completion to the composer visit
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. Each lane visit has a token. A send whose visit ended counts as switched
  (line 388), so it never clears a later visit's draft or tray, and a refusal is held for its lane.
  `sending` now belongs to a busy-operation token (`endBusy`, line 517), so an older send ending does
  not clear the busy state of a newer one. Receipts are still remembered against the original lane.
  This also covers line 379. New spec: send on A, switch away and back, same text. The draft and the
  busy state of the second send are kept.

### 12. PRRT_kwDOPngTds67Z1E0 / 4681300661: keep unresolved messages on lane-cap eviction
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. `remember()` now evicts only entries whose receipt can no longer restore them:
  settled, cancelled, or no longer known to the store (`restoreSettled`, line 694). An unresolved
  message keeps its text and attachments past the caps until its receipt settles. The host queue
  (8 pending plus the running turn) bounds how many there are. New spec: a ninth message no longer
  drops the oldest unresolved one, which then restores on failure.

### 13. PRRT_kwDOPngTds67Z1E9 / 4681300678: ignore IME composition Enter in handleKeyDown
- **Outcome:** fixed in `907d0e987`.
- **Reply:** Fixed. The composition guard (`isComposing` or `keyCode 229`) is now at the top of
  the shared `ComposerInputController.handleKeyDown` (`composer-input.controller.ts:482`). It covers
  the dropdown path and the submit path, in main chat and in the lane composer. The lane composer's
  own copy was removed. New spec for both paths.

## Commits

- `f52972bed` fix(cli-agent-runtime): guard lane turns and keep cold-resume settings (threads 1-4)
- `907d0e987` fix(chat,chat-streaming): keyboard pickers and safer lane delivery (threads 5-13)
- this report: docs(docs)

## Checks (focused only; CI runs the gate, as the user asked)

- jest cli-agent-runtime: `agent-process-manager.service.spec.ts` and `ptah-cli-lane-resumer.spec.ts`:
  324 passed.
- jest chat-streaming: `lane-turn-settings.store.spec.ts` and `agent-monitor.store.spec.ts`: 248 passed.
- jest chat: `composer-input.controller.spec.ts`, `lane-composer.component.spec.ts`,
  `lane-delivery.controller.spec.ts`, `composer-effort-picker.component.spec.ts`,
  `composer-model-picker.component.spec.ts`, `model-selector.component.spec.ts` and
  `effort-selector.component.spec.ts`: 160 of 162 passed. The 2 failures were lane-composer fold specs
  that asserted the old send-then-cancel order. I updated them to the cancel-first order, and the
  rerun of `lane-composer.component.spec.ts` passed 40 of 40. The controller spec passed 41 of 41.
- Mutation check: with each fix reverted (mount tracking, eviction guard, visit token), its new spec
  failed: 3 of 41 in the controller spec.
- `npx eslint` on all changed files: 0 errors. The 13 warnings were already there (max-lines,
  non-null assertions in older specs, `any`, an empty function).
- `check-degradation.ts`: 0 unsuppressed sites. `check-ui-classes.ts`: 0 token counts over the
  baseline. No dynamic `[class]` binding was added; the toggle row uses `[class.bg-surface-2]`.
- Not run, as instructed: `npm run verify`, `nx`, project `tsc`, `typecheck-templates` (templates
  changed in both pickers and the lane composer), builds.
