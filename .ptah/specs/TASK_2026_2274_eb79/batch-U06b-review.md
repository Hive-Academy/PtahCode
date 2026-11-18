# Batch U06b review (logic)

Review family: claude (implementer: codex)

Score: 7/10

Verdict: REVISE

The batch meets most criteria. Four defects need a fix. None of them loses saved data. Two of them show wrong UI state.

## Defects

1. **Medium** `bot-editor.component.ts:73-80`, `:423-426`. The Enabled switch can show a wrong state.
   - The template binds `[checked]="draft.enabled"`. The user clicks the switch. The DOM value changes first.
   - If `store.setEnabled` fails (error or revision conflict), `draft.enabled` does not change.
   - Angular sees no binding change. The switch stays in the new position, but the bot keeps the old state.
   - Fix: after the `setEnabled` promise settles, set `event.target.checked = this.store.draft()?.enabled`. Make `toggle()` async. Add a spec with a failed `setEnabled`.

2. **Medium** `bot-editor.component.ts:199-215` with `bots.store.ts:459-462`. Two alerts show in a conflict.
   - A conflict write calls `fail()`, so `store.error()` stays set. Then the store sets `conflict`.
   - The editor shows "Could not save" and "A newer revision exists" together. The retry button is hidden, but the alert stays.
   - The design shows one conflict alert only. The spec "owns one error display" does not cover this case.
   - Fix: show the error block only when `store.conflict()` is null. Add a conflict spec that counts `[role="alert"]` (expect 1).

3. **Medium** `bot-editor.component.ts:299-302`. `attempted` stays true for a new draft.
   - The linked signal source is `selection`. For new drafts the value is always `null`, so it never resets.
   - Flow: the user presses Create on an invalid new draft. Then the user opens another new draft (or presses Cancel and then New). The new blank form starts in the `invalid` state with an alert message.
   - Fix: also reset `attempted` when `store.draft()` is replaced. Use the `draft` identity or a store selection counter as a second source. Or call `attempted.set(false)` after every discard, create and select.

4. **Low** `bot-save-bar.component.ts:75-78` with `bot-editor.component.ts:247-254`. Discard works during a conflict.
   - `store.discard()` resets the draft to the old selected record (revision 4). The latest revision is not loaded.
   - The local work is lost in one click with no confirmation. The next save conflicts again.
   - Fix: in the `conflict` state, disable Discard, or send it to the `loadLatest` path. The design lists "Discard changes" here, so decide one behavior and add a spec.

5. **Low** `bot-identity-runtime-section.component.ts:577` (carry-forward #3 trick). It works but has small side effects.
   - `patchDraft({avatar})` bumps `uploadSequence` and clears the upload state. This is the intended cancel. `deepEqual` ignores undefined keys, so `dirty` does not change. The revision does not change.
   - Side effect: `patchDraft` always resets `saveState` to `pristine` or `dirty`. A visible `saved` or `error` bar state disappears after a bad file pick.
   - The server may keep an orphan image from the cancelled upload. This is the same as before the batch.
   - Fix (optional): add a store method `cancelAvatarUpload()`. Until then, document the side effect in `## Decisions`.

6. **Low** `bot-editor.component.ts:199`. The error title "Could not save" is fixed text.
   - `store.error()` also holds select, archive, restore and delete failures. The title and the "Your changes are still here" text can be wrong for them.
   - Fix: use a neutral title such as "Could not complete the action", or choose the title from the error code.

7. **Low** `bot-editor.component.ts:337-340`. `afterRenderEffect` calls `focusName()`, which reads the `editor()` signal.
   - The effect now also tracks `editor()`. It focuses Name again each time the article element is re-created while `isNew()` is true.
   - Fix: read `isNew()` first and wrap the DOM lookup in `untracked`.

## Checked, no defect

- Gating: `ordinaryBlocked()` and `fieldsBlocked()` use `readonly()` and `blockedReason()`. Fields unlock in a conflict only after Edit mine. `resubmit`, `loadLatest` and compare stay usable (gated by `readonly()` only).
- Store is the only state writer. The editor uses only store methods. Local signals hold view state only.
- Draft preservation: open and close of compare, error, toggle and edit mine keep the draft. `patchDraft` copies the edit into `conflict.mine`.
- `comparing` resets when `conflict` changes. This is safe, because the drawer blocks edits while it is open.
- `editingConflict` uses a boolean source. It does not reset on each `patchDraft`. It resets when the conflict clears.
- Resubmit: the invalid path goes to edit mine and focus. The valid path calls `resubmitConflict` (rebase to latest revision, then save). A double click is not possible because the conflict alert disappears.
- Load latest: explicit button only. It clears the conflict and goes to pristine.
- Save bar: eight states, disabled rules, `role="alert"` only for invalid, spinner with `motion-reduce`. Archived bar is not rendered.
- `displayState` priority (saving, conflict, invalid, error/saved, new, dirty, pristine) is correct.
- Delete dialog: saved name from `store.selected()`, `archived`, `dirty`, mounted closed. `removing` resets on selection change. `remove()` closes then calls archive or delete.
- Restore: disabled while saving, selecting or in a conflict. The test for a pending restore passes.
- Menu keyboard and focus return work. `ptah-native-dropdown` emits `closed` only for backdrop or Escape, so Rename focus is not stolen.
- Carry-forward rows: skills inputs and catalog flag (loaded forced false while loading or failed), no scope passed by the editor, one error owner, `setEffort(null)` clears like `setTier(null)`.
- No `innerHTML`, no `ngClass`, no execution control, no import of page or barrel. Text is interpolated (escaped).
- Electron: no host API use. Visual review is not done in this batch (coordinator task).

## Command results

- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: pass, 19 tests.
- tsc and eslint: not run again (coordinator already reported pass).

## Safe to carry forward to U06a

Yes, with conditions. The editor API (inputs `installedSkills`, `knownToolIds`, `catalogLoaded`, `catalogLoading`, `catalogFailed`) is stable. U06a must:

- Provide `PROVIDER_MODELS_LOADER` above the runtime picker.
- Show `store.error()` when `store.draft()` is null. The editor hides itself then (for example, the new-bot scope error from `newDraft`).
- Confirm discard before it changes selection (store contract).
- Fix defects 1 to 3 in U06b before the integration, or log them as U06a carry-forward rows.

## Re-review 1

Review family: claude (implementer: codex)
Score: 8/10
Verdict: REVISE (one Medium defect, caused by the D3 fix)

### D1-D7 status

| # | Status | Evidence |
| - | ------ | -------- |
| D1 Enabled switch | Fixed | `bot-editor.component.ts:435-444`. `toggle` is async. The `finally` block sets `checkbox.checked` from the draft after `setEnabled` settles. Spec at `bot-editor.component.spec.ts:153` passes. |
| D2 Two alerts | Fixed | `bot-editor.component.ts:210`. The ordinary alert shows only when `!store.conflict()`. |
| D3 `attempted` for new drafts | Fixed for replacement, but see N1 | `bot-editor.component.ts:310-313`. `linkedSignal` resets on selection or draft change. Cancel then New and New after New now start valid. |
| D4 Discard in conflict | Fixed | `bot-save-bar.component.ts:80-84`. `discardDisabled` includes `conflict`. Conflict drawer paths stay open. |
| D5 Avatar trick | Accepted | Unchanged. Documented in the report. Not a blocker. |
| D6 Error title | Fixed | `bot-editor.component.ts:212`. Title is neutral. The draft sentence stays inside the draft block. |
| D7 Focus effect | Fixed | `bot-editor.component.ts:348-351`. Only `isNew` is tracked. `focusName` runs in `untracked`. |

### New defects

N1. **Medium** `bot-editor.component.ts:310-313` with `bots.store.ts:295-297`.
`attempted` depends on `store.draft()`. `patchDraft` makes a new draft object on every edit. So `attempted` becomes false at the first keystroke after a failed save.
- Result: the save bar leaves `invalid` and shows `dirty` or `new` while fields can still be invalid. The "Fix N fields" message disappears after one keystroke. The save bar then shows no sign of the problem. The Save button is enabled again, which is correct.
- Field errors stay. They come from `fieldError()` and the store validation, not from `attempted`. So the loss is only in the save bar summary.
- This also makes the D3 spec description wrong. The report says draft patches reset `attempted` on purpose. That is a side effect of the fix, not the design.
- Fix: do not key `attempted` on the draft object. Use a draft identity that patches do not change (for example a counter that increments in `store.startNew()` and `select()`), or reset `attempted` only when `selection()` changes or on New and Cancel. Add a spec: failed save, type one character in another field, the save bar still shows `invalid` while the issue remains.

### ptahButton / ptahBadge check

- Button type: the directive defaults `type` to `button` (`button.directive.ts`, `buttonHostType`). All buttons also keep an explicit `type="button"`. No accidental form submit. The form submits only through the Enter key and `submit($event)`, as before.
- Disabled: `[disabled]` bindings are unchanged on all buttons (`bot-save-bar.component.ts:43,52`, `bot-editor.component.ts:195,219`, delete dialog `disabled()`).
- Busy: Save uses `[busy]` while saving. The `busy` input blocks activation and sets `aria-busy`. `saveDisabled` also includes `saving`, so behaviour is the same.
- Delete dialog confirm: `[variant]="method() === 'archive' ? 'primary' : 'danger'"`. Archive stays primary. Delete stays danger. Cancel is ghost. No change in tone.
- Icon button: `ptahIconButton label="More actions"` keeps the accessible name. `aria-haspopup`, `aria-expanded` and the `#menuTrigger` reference are kept.
- Badge: `span[ptahBadge]` keeps the text "Not available yet".
- No new defect from the directive change.

### Checked, no defect

- Conflict alert shows once. Resubmit, edit mine and load latest stay usable during conflict (`blockedReason` 'conflict' is excluded from save bar `blocked`; `fieldsBlocked` allows editing after Edit mine).
- Save bar still has eight states and the same messages.
- Delete dialog binding: `archived`, `dirty` and `name` unchanged. The dialog stays mounted and closed.
- `store` remains the only writer. The new code only reads the store and calls store methods.
- Toggle `finally` runs also when `ordinaryBlocked()` is true, so a blocked toggle snaps back.

### Command results

- `npx jest ... bot-editor.component.spec.ts bot-form-sections.spec.ts bot-delete-dialog.spec.ts`: 3 suites, 61 tests passed.
- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- I did not run eslint again. The coordinator reported lint, typecheck, ui-class-audit and template typecheck as passed.

### Safe to carry forward to U06a

Yes, with N1 fixed or logged as a carry-forward row. N1 does not block data safety. It only affects the save bar message after a failed save.

## Re-review 2

Review family: claude (implementer: codex)
Score: 9/10
Verdict: APPROVED

### N1 status: Fixed

- `bot-editor.component.ts:310-313`. `attempted` uses only `store.draftEpoch` as its source. A new draft object from `patchDraft` no longer resets it.
- `bots.store.ts:252`, `:286`, `:324`, `:386`. The epoch increases after a successful select, newDraft, discard and loadConflictLatest. It does not increase in `patchDraft`, `save`, `setEnabled` or `resubmitConflict`.
- After a failed save, a keystroke keeps `attempted` true. The "Fix N fields" state stays while issues remain. When the user fixes all fields, `invalidCount` is 0 and the state moves to `dirty` as expected.
- Spec `bot-editor.component.spec.ts:223` covers the keystroke case. Spec `bots.store.spec.ts:138` covers the epoch rules.

### D3 replacement cases: still pass

- New after New, Cancel then New, and select each increase the epoch, so `attempted` resets (`bot-editor.component.spec.ts:191`).
- Discard increases the epoch. The editor also sets `attempted` to false in `discard()`. Both agree.

### Side effects checked

- Select failure: the epoch is inside the success branch only (`bots.store.ts:248-253`). A failed select keeps the old draft and the old `attempted`. Correct.
- newDraft refusal: both `return false` paths come before the epoch update. No change. Correct.
- Stale select response: the `token` check returns before the epoch update. Correct.
- Select of the same dirty bot returns early. No reset. Correct.
- `resubmitConflict` success then a new save attempt: the epoch does not change, so `attempted` stays true. The draft is valid after the save, so no false invalid state shows. If the user then breaks a field, the invalid state shows at once. This is acceptable and consistent with the post-failure behaviour.
- Other linkedSignals (`comparing`, `editingConflict`, `removing`, `menuOpen`) use other sources. The epoch is not read by them. No effect.
- The epoch is a private writable signal with a readonly public view. The store stays the only writer.
- Low note (no action): archive, restore and delete do not increase the epoch. `attempted` can stay true across them. This does not show a false error because the display needs `invalidCount` above 0 too.

### New defects

None.

### Command results

- `npx jest ... bot-editor.component.spec.ts bots.store.spec.ts`: 2 suites, 73 tests passed.
- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint bots.store.ts bot-editor.component.ts`: exit 0.

### Safe to carry forward to U06a

Yes. All defects from the first review and N1 are closed.
