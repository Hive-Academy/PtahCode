# Batch 8 report: F2 composer input controller, main chat adoption

Status: COMPLETE. No commits (the orchestrator owns git). Required skills loaded:
angular-frontend-patterns, angular-developer.

## Tasks

- 8.1 `ComposerInputController` extracted. The dropdown gains optional group headers and a notice row. Done.
- 8.2 `chat-input` adopts the controller, `ptah-composer-attach-menu` and `ptah-composer-voice-button`. Done.

## Files (absolute)

- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\services\composer-input.controller.ts`
  - `@Injectable()`, provided per component. It follows the `ComposerCompactStore.connect` pattern.
  - It owns the `/` and `@` suggestion state, the trigger projection debounce (`TRIGGER_PROJECTION_DEBOUNCE_MS`) and the file query cache (`MAX_CACHED_TRIGGER_QUERIES`). It also owns the command cache, suggestion insertion (file tag, path text, command, prompt), paste, drag and drop, transcript insertion, keys and the aria ids.
  - It exports `ComposerCommandSource` (`discovery | loading | unsupported{reason} | ready{groups}`), `ComposerCommandGroup`, `ComposerFileMode` and `ComposerInputSources`.
  - `connect({ text, textarea, dropdown, commands, fileMode, prompts, submit, submitNow? })`.
- CREATED `...\libs\frontend\chat\src\lib\services\composer-input.controller.spec.ts` (16 tests). It covers:
  - discovery with prompts, and with prompts off;
  - an `unsupported` source, which gives one notice row and nothing selectable;
  - `loading`, which gives the spinner, then `ready` groups with an empty-group notice;
  - query filtering;
  - command insert, file reference, and path-text insert with a status note that clears on empty text;
  - the debounce;
  - Enter, Shift+Enter, Ctrl/Cmd+Enter with and without `submitNow`, and the dropdown taking keys;
  - transcript insertion at the caret, and the error hand-off.
- MODIFIED `...\libs\frontend\chat\src\lib\components\file-suggestions\unified-suggestions-dropdown.component.ts`
  - New optional `groups: SuggestionGroup[] | null` and `notice: string | null` inputs.
  - A `rows` computed builds the header, notice and option rows. Keyboard navigation and Enter work only on option rows.
  - The notice row is `role=option aria-disabled=true` with an Info glyph and `data-testid="suggestion-notice"`.
  - The flat path (main chat) renders the same command/prompt divider as before. The `trackBy` method was replaced by a row key (it had no other callers).
- MODIFIED `...\unified-suggestions-dropdown.component.spec.ts`: the host binds `groups` and `notice`. Three new tests: headers plus the notice row with only options selectable, a group with no items and no notice is left out, and a notice-only list where Enter selects nothing. The existing tests are unchanged.
- MODIFIED `...\libs\frontend\chat\src\lib\components\molecules\chat-input\chat-input.component.ts` (1870 → 1173 lines)
  - Providers: `VoiceInputService`, `ComposerCompactStore`, `ComposerAttachmentsService`, `ComposerInputController`. `VoiceInputService` stays per composer, as executor-notes asks.
  - The template binds the controller. The inline popover is replaced by `<ptah-composer-attach-menu (pickFiles) (pickImages)>`. The `@if (isElectron)` mic block is replaced by `<ptah-composer-voice-button (transcript) (failed)>`, which does its own Electron check.
  - The fold's `overlayOpen` now reads `attachMenu()?.isOpen()` instead of the removed local signal.
  - These stay in the component: send, drafts, restore (`restoreContentToInput`, now delegating focus to `replaceText`), compact fold, Stop, tab glue, the command-cache clear on tab change, and `handleInput`. The component owns the draft text, and the controller edits it through `connect.text`.
  - Removed as moved or dead: `isElectron`, the voice fields, `filePicker`, the attach-menu state and methods, `removeFile`, `removePastedImage`, and every suggestion field and method.
- MODIFIED `...\chat-input.component.spec.ts`
  - Setup: `ComposerInputController` is added beside the existing root-provided `ComposerCompactStore` and `ComposerAttachmentsService` (2 TestBeds).
  - Receiver-only change for the moved members: `component.X` became `component.composerInput.X` for `handleAt*`, `handleSlash*`, `handleQueryChanged`, `closeSuggestions`, `handleSuggestionSelected`, `showSuggestions`, `suggestionMode` and `filteredSuggestions`.
  - The "attach menu" and "voice input" blocks were rewritten to test what the host still owns (see Plan deviations).
- MODIFIED `...\chat-input.streaming-fold.spec.ts`
  - The controller is added to the override `providers`. Receiver change for `handleSlashActivated`.
  - Selector-only change: the glass test now checks that the toolbar holds `ptah-composer-attach-menu`. The test runs under `CUSTOM_ELEMENTS_SCHEMA`, so that child's overlay does not render.
- MODIFIED `...\chat-input.command-center-lock.spec.ts`: the controller is added to the override `providers`. Nothing else changed.
- NOT MODIFIED: `suggestion-option.component.ts`, although the write set lists it. The notice row lives in the dropdown and needs no new `SuggestionItem` variant.

## Stack observed

- Angular `~22.2.7` (root `package.json`).
- Signals with standalone OnPush components and component-provided stores (`composer-compact.store.ts`).
- Tailwind/DaisyUI and lucide-angular (`unified-suggestions-dropdown.component.ts`, `composer-card.ts`).

## Design fidelity

- Main chat look is unchanged.
- The attach and voice classes come from `COMPOSER_ICON_BUTTON_CLASS`, which is the same string. It adds `disabled:opacity-50`, which never applies to the attach button.
- The recording class is identical to before.
- The menu item classes and labels are identical. Batch 2 added `aria-hidden` on the icons.
- Main chat passes neither `groups` nor `notice` to the dropdown.
- Notice and headers follow design-spec 5.3 (`role=option aria-disabled`, info glyph).
- Not done here: the `@` footer line ("Chosen files are sent as file references." and the path-text variant). It is outside this batch's contract. Batch 11 adds it, or adds a dropdown `footer` input.

## States covered

- Loading: the spinner row, from a fetch or from a `loading` source.
- Error: `filePickerError` in `@` mode.
- Empty: "No matches found".
- Unsupported: one notice row.
- Empty group: a header plus a notice row.
- Path-text: the path is inserted as text and `statusNote` is set. The host renders it on the status line.
- Keyboard: arrows, Home, End, Enter and Escape go to the dropdown. A notice is never selectable.
- Combobox `aria-controls` and `aria-activedescendant` are unchanged.
- No extra per-keystroke listener. The one new effect tracks text only to clear the note, and it does no DOM work.

## Verification (logs in `WT\.ptah\tmp\`)

- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat` (`w3-b8-lint-typecheck.log`, rerun after the spec fix as `w3-b8-lint-typecheck-2.log`): `2 tasks: 2 succeeded`, exit 0.
- `npm run verify -- --related -p @ptah-extension/chat`:
  - First run (`w3-b8-related.log`) failed: `2 failed, 15 passed, 17 total`, 22 tests failed with NG0201. The fold and lock specs override component providers, so a root controller could not see the component-level `ComposerAttachmentsService`.
  - Fix: the controller moved into those two specs' override `providers`.
  - Rerun (`w3-b8-related-2.log`): `Test Suites: 17 passed, 17 total; Tests: 354 passed, 354 total`, exit 0.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview` (`w3-b8-templates.log`): `1 task: 1 succeeded`, exit 0.
- No verify run was killed for low memory. The first lint run waited about 200 s for memory, then ran.
- Not run, as the batch rules say: the full test gate, builds, and the Electron visual review (the orchestrator's later step).

## Plan deviations / decisions

- **Draft text stays owned by `chat-input`** and reaches the controller as `connect.text: WritableSignal<string>`. `handleInput` stays on the host.
  - Reason: send, draft and restore stay in `chat-input` by contract.
  - The multi-pane draft specs build several composers against one root-provided controller. Text held in the controller would mix their drafts there.
  - Reversible.
- **Extra `connect` fields** beyond the plan sketch: `text`, `textarea` and `dropdown` (viewChild signals). The controller needs them for caret edits and aria ids.
- **The command source is a union.** Beyond `unsupported` and `loading` from the acceptance, it has `discovery` (main chat) and `ready{groups}`. `ready{groups}` lets Batch 11 feed a lane's Commands and Skills without editing the controller.
- **Spec changes go beyond selector-only in two blocks.**
  - Attach menu: the open state now lives in `ComposerAttachMenuComponent`, whose spec covers toggle and choose. The host tests now check that `handleAttachFiles` and `handleAttachImages` open the pickers.
  - Voice: recording and errors are covered by `composer-voice-button.component.spec.ts`. The host tests now check transcript insertion (same strings as before) and the error hand-off.
  - Every other change is a provider line or the `component.composerInput.` receiver.
- **`console.log('File already selected')` was dropped** from `addFileTag` (debug noise). Behaviour is the same: a duplicate is still ignored.

## Out-of-scope observations

- The dropdown's option ids stay global (`suggestion-N`), as before. Two open composers can therefore share ids. This predates this batch and was not changed.
- Batches 6 and 7 left uncommitted changes in `agent-sdk`, `shared` and `chat-streaming` in this worktree. They were not touched. Chat tests import `shared` from source, so the related run included those in-flight edits, and it passed.
