# Code Logic Review P2 - TASK_2026_2320_lnpar (batches 2, 4, 8, 9)

Same-family review (Claude reviewing Claude subagent output): weaker evidence. No tests, builds or nx were run (per brief). Evidence is a read of the old vs new code (`536e0b01f^` chat-input 1870 lines, `433db608e^` selectors) and the new files in full.

## Summary

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Verdict | APPROVED (with 3 moderate follow-ups that should be fixed before the lane batches build on them) |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 4 |
| Minor | 4 |

## Main chat parity (batch 8): method-by-method result

Compared `handleAt*`, `handleSlash*`, `handleQueryChanged`, `scheduleSuggestionRefresh`, `refreshSuggestions`, file/command/prompt projection, cache (`MAX_CACHED_TRIGGER_QUERIES`, cleared after `ensureFilesLoaded`), `fetchAt/CommandSuggestions`, `handleSuggestionSelected`, `closeSuggestions`, `handleKeyDown`, `handlePaste`, `handleDragOver/Leave/Drop`, `insertTranscript`, aria id getters, restore focus (`replaceText` vs old `restoreContentToInput`).

- Same logic, line for line, in all of them. Debounce, cache, `slice(0, 40)`, remote merge, Home/End/Arrow/Enter/Escape routing and the "Enter with dropdown closed" path are unchanged (`composer-input.controller.ts:207-237, 349-545, 465-490`).
- Command Center / read-only send lock is kept in the `submit` callback (`chat-input.component.ts` connect block). `handleSend` re-checks the same gates, so Enter and the Send button stay equal. OK.
- Streaming fold: `overlayOpen` reads `composerInput.showSuggestions() || attachMenu()?.isOpen() || ...`; `dragging` reads the controller signal. Compact expand on dragover is kept (`handleDragOver` returns a boolean, host expands). Paste while folded still calls the controller's `handlePaste`. OK.
- Prompt pick: old `restoreContentToInput(text, {replace:true})`, new `replaceText(text)`. Same effect (set text, inert-aware focus). OK.
- Multi-pane drafts: the draft text stays in the host (`connect.text = _currentMessage`), controller is component-provided, so panes do not share state. Controller reads `ComposerAttachmentsService` from the same element injector. OK.
- Teardown: timeout cleared by `DestroyRef`; the host `ngOnDestroy` still saves the draft. The controller effect (status note) is bound to the controller injector. `connect()` is called once from the constructor; a second call would silently replace sources (no guard, see M3).
- Voice: `ComposerVoiceButtonComponent.toggle()` is the old `handleVoiceButton` with the same branches; the transcript is now trimmed before emit and again in `insertTranscript` (harmless). Electron check moved into the button. Uses the host's `VoiceInputService`. OK.
- Dropdown: main chat passes neither `groups` nor `notice`, so the flat path is the old code. `track row.key` for options uses the same key function as the old `trackBy`.

## Findings

### Moderate

- M1. `chat-input.streaming-fold.spec.ts` (the "never animates opacity on an element that holds a glass surface" test, about line 443): the assertion `toolbar.querySelector('[data-glass-surface]')).not.toBeNull()` was replaced by `toolbar.querySelector('ptah-composer-attach-menu')`. The test runs under `CUSTOM_ELEMENTS_SCHEMA`, so the real attach menu never renders; the guard no longer covers the glass overlay in the toolbar. `composer-attach-menu.component.spec.ts` has no `data-glass-surface` assertion either (grep: none). A regression that fades the toolbar over a glass surface would pass. Fix: assert `data-glass-surface="overlay"` and `data-composer-overlay` in the attach-menu spec, and make the fold test render the real menu (or assert on it).
- M2. Host-level wiring of the moved controls lost its test. The removed `chat-input.component.spec.ts` blocks ("hides/shows the mic button when (not) in Electron", record start, permission error, attach menu toggle) now live in child specs, but nothing in `chat-input` proves `<ptah-composer-voice-button>` and `<ptah-composer-attach-menu>` are rendered in the real template with the right outputs (`(pickFiles)`, `(pickImages)`, `(transcript)`, `(failed)`) under the host's `VoiceInputService`. Spec edits beyond a receiver rename were flagged by the executor; coverage of the glue is the gap. Add one rendered test (Electron true) that clicks Dictate with a mocked `VoiceInputService` and expects the draft text to change.
- M3. Gated pickers: `_isOpen` stays true while gated (`composer-model-picker.component.ts:354`, effort picker `menuOpen`). If a menu is open, a reason arrives (menu hides), then the reason clears, the menu pops open again with no user action. Fix: an effect or `close()` when `gated()` turns true, or clear `_isOpen` in the `@if` swap.
- M4. Gated to ungated swap while focused or hovered: the gated button is destroyed, so `blur` / `mouseleave` never fire and `reasonCleared` is never emitted (`composer-gated-control.directive.ts` `clear()` only fires from events). A lane status line that shows the revealed reason would keep it. Also focus is lost (executor noted). Fix: emit `reasonCleared` from the directive when `gated()` flips to false, or from the pickers on `disabledReason` change.

### Minor

- m1. `ptah-composer-attach-menu` has no `host: { class: 'contents' }` (the voice button does). The host becomes an inline custom element, as a flex item it wraps an `inline-block` popover, so the line box can add a line-height strut under the 28 px button and shift toolbar alignment by a few px. Verify visually in Electron or add `contents` (`composer-attach-menu.component.ts` @Component host).
- m2. `suggestionGroups` / dropdown in groups mode: a command that appears in two groups (Commands and Skills) gives duplicate `@for` track keys (`optionKey` = `command-<name>`; `unified-suggestions-dropdown.component.ts` rows). Lane-only today. Include the group index in the key.
- m3. `handleSuggestionSelected` path-text branch sets `statusNote` even when `replaceTrigger` bailed out for a missing textarea (`composer-input.controller.ts:416-419`, `replaceTrigger` returns early). Set the note only after a successful insert. Also in `loading` source state `filteredSuggestions` returns the stale `_localSuggestions` (line 233); lane-only.
- m4. Queued list: `withdraw` / `sendNow` now resolve the id with `find()` against the current list and silently no-op if the item was delivered in between (`queued-follow-ups.component.ts:105-117`). Safer than before; note only. `COMPOSER_PILL_CLASS` is unused and its focus style differs from the pickers' ring (the executor flagged it).

## Batch 4 check (pickers)

- Model list loading / refresh-on-open: `opened` output relays to `onDropdownOpened()` -> `refreshModels()` with a logged catch (`model-selector.component.ts:156-163`); same as before. Spinner, "Loading models..." and "No models available" conditions are the old conditions (`loading() && rows()==0`, `loaded() && rows()==0`). OK.
- Selected id and provider hint: `selectedModelId` returns the listed id for tier names, so `isSelected`, the pill name and the accent hint match the old `effectiveListedModel` behaviour. OK.
- Effort ids: `effort-<instance>-<i>` unique per instance; model ids already instance-scoped. OK. `selectEffort(Pick<..., 'value'>)` and `effortChanged` kept.
- Gated pill as `ptah-native-dropdown` trigger: `@if/@else` with one `trigger` button each relies on control-flow single-root projection; the 354 chat tests passed per the report, so projection works. Click is swallowed in capture phase by the directive, so the dropdown's trigger click never fires. OK, subject to M3/M4.

## Batch 9 check (queued list)

- Old rules vs new: Withdraw disabled when `submitting || pending` = `busy`; Send now disabled when `phase !== 'queued' || pending` = `busy || !sendable` (submitting implies not queued, so equivalent). Title, aria-labels, 100 char preview, `hidden` when `!canSendNow`, and the double-click `track` guard are the same. OK.
- The only intended visual change is the contrast fix (`text-base-content`, `text-state-need`; token defined at `apps/ptah-extension-webview/tailwind.config.js:34` with a warning fallback). Needs the planned visual check in both themes.
- `unavailable` state: no click handler and `aria-disabled`, `aria-describedby` id per item id; fine.

## Batch 2 check

`ComposerAttachMenu`, `ComposerVoiceButton`, gated directive and approval chip: read in full. No leaked listener (capture listener removed in `DestroyRef`). Directive host `[attr.title]` writes null when not gated (known, worked around in batch 4); any later use on a titled element must use the same `@if` pattern.

## Spec-change audit

- `model-selector.spec`: grouping tests moved to the picker spec, `switchModel not called` assertions kept (lines 324, 342, 421). OK.
- `effort-selector.spec`: one assertion on a removed member dropped, covered by the next line. OK.
- `chat-input.spec`: receiver-only renames for suggestion tests (assertions intact); attach/voice blocks rewritten (see M2).
- `streaming-fold.spec`: glass guard weakened (M1).
- `queued-follow-ups.spec`: stronger (adds ink and in-flight tests).
- `unified-suggestions-dropdown.spec`: existing tests unchanged, three added.

## Five logic questions (short)

1. Silent failure: statusNote on a failed path-text insert (m3); stale reason after ungate (M4).
2. Unexpected user action: gate then ungate reopens a menu (M3).
3. Wrong data: duplicate command names across lane groups (m2).
4. Dependency failure: model refresh failure is logged, list kept; file fetch failure logged and spinner cleared in `finally`. OK.
5. Missing: tests for the host glue (M1, M2).

## Verdict

APPROVED, score 7/10, confidence MEDIUM (no run; same-family review). Main chat behaviour matches the old implementation on every path read. Fix M1-M4 before batch 11 reuses these parts.
