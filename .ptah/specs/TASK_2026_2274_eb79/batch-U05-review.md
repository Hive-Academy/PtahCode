# Batch U05 review: form sections and delete dialog

Review family: claude (implementer: codex)

**Score: 7 / 10. Verdict: REVISE** (one blocking defect in the delete dialog, one medium upload race).

## Decision judged: "No memory" option omitted

**Correct. Not a defect.** `rpc-bots.schemas.ts:67-70` allows only `private` and `workspace` for `BotMemoryScopeSchema`. `BotEditableSchema` (line 121) has no third value. A "No memory" tile would need a wire value that does not exist. The design spec lists three tiles (`design-spec.md:54`, `:187`), so the spec and prototype disagree with the contract. Action: the coordinator records a spec note that the prototype tile is dropped on purpose. Do not map "No memory" to `private`, because that would mislead the user.

The same applies to the approval levels. `design-spec.md:95` lists ask/plan/auto-edit/yolo, but the schema (`rpc-bots.schemas.ts:112`) has ask/auto/deny. The implementation follows the schema. Correct.

## Defects

1. **High: an archived bot cannot be deleted.** `bot-delete-dialog.component.ts:121-123`: `disabled()` is `store.readonly() || blockedReason() !== null`. `readonly()` is true when `archivedAt != null` (`bots.store.ts:192-197`). Every radio and the confirm button are therefore disabled for an archived bot. The design menu offers "Delete…" for an archived bot (`design-spec.md:88`). Fix: do not use `readonly()` in the dialog. Block only on `selecting`, `saving` and `conflict`, or add a dialog input that says what to block. Add a spec for an archived bot.
2. **Medium: the dialog offers "Archive" for an already archived bot.** The dialog has no input for the archived state (`bot-delete-dialog.component.ts:117-120`). Fix: add `archived = input(false)`. When it is true, hide the Archive option and start in `delete`.
3. **Medium: avatar upload race and silent drop.** `bot-identity-runtime-section.component.ts:538-555`.
   - A second file chosen while the first read is pending starts a second `FileReader`. The reads can finish out of order. The older file can call `uploadAvatar` last and win.
   - The `store.draft() === originalDraft` check fails after any keystroke in another field, because every `patchDraft` makes a new draft object. The upload is then dropped with no message. The user sees nothing.
   - Fix: keep one pending-read token (increment on each change, abort the old reader). Compare scope and avatar, not the whole draft object. Show a status message when the read is dropped.
4. **Low: invalid files make a real RPC call.** Lines 527-537. A wrong type or an oversize file calls `store.uploadAvatar` with `dataBase64: ''` and an invented `image/png` type. The call depends on the main process to reject it. The error text is correct ("Choose a PNG, JPEG or WebP up to 2 MB…"), but the flow is indirect and costs a round trip. It also writes a wrong `mediaType` for the request. Accept as a carry-forward, or add a store method that sets the validated error without RPC.
5. **Low: lane kind selects an unavailable lane.** Line 418: `setKind('lane')` takes `lanes()[0]` even if `available` is false. Prefer the first available lane.
6. **Low: delete dialog state resets only when `isOpen` changes** (`bot-delete-dialog.component.ts:124-131`). If the parent reuses an open dialog for another bot, the choices stay. Add `name()` to the reset source, or document that the parent must close the dialog first.
7. **Low: the dirty warning uses store state** (line 34). "Unsaved changes are lost." shows when any bot is dirty, even if the dialog targets a bot that is not the selected one. Pass the flag as an input in U06b.
8. **Low (design deviation): Effort is a free-text input.** `design-spec.md:94` says `ptah-select` with Default/low/medium/high. Free text can store a value that the runtime rejects. Not a logic failure, but U06b or U06a should align it.
9. **Low: the section shows `store.error()` itself** (line 60). If U06b also shows the editor error, the user sees it twice. Decide one owner in U06b.
10. **Low: the skills and tools section takes catalog state as inputs** (`bot-skills-tools-section.component.ts:85-93`) although the store has `catalogLoading`. If U06b forgets to bind `catalogLoaded`, the chip input stays at `false`, which is safe but shows no catalog check. U06b must bind all three inputs.

## Checks against acceptance

| Item | Result |
| --- | --- |
| Floating labels (`ptah-field`) | Pass |
| Defaults (private, ask, Default runtime, no avatar) | Pass |
| Runtime kind selector inside Runtime | Pass |
| Provider picker only for Main | Pass (spec line 133) |
| Lane target, model, tier, effort | Pass |
| No stale fields after kind or target switch | Pass. Each patch builds a new union member. `setLane` drops model, tier, effort on purpose. Spec covers all 9 kind pairs. |
| Symbolic Default | Pass. No provider call. |
| Unresolved selections preserved | Pass (lane `(unresolved)` option, `extraProviders`) |
| Avatar unset/icon/image/load-error, no path input | Pass. Upload goes only through `store.uploadAvatar` with no scope. See defects 3 and 4. |
| Root validation | Pass (`fieldError`, `rootError`) |
| Triggers inactive | Pass (no control, `track` on a stable string) |
| Delete dialog: archive default, four choices, no execution control | Pass (defaults). Fails for archived bots (defect 1). |
| Radio groups: arrow keys, checked state, labels, roving tab | Pass. Offsets 0/2/4 match DOM order, because the history rows exist only in delete mode. |
| Controls disabled from `blockedReason()`/`readonly()` | Pass for sections. Conflict stays editable. |
| Failed avatar retry uses `loadAvatar(botId, imageId, true)` | Pass (spec line 256) |
| Error text only through `botErrorMessage`/`avatarErrorMessage` | Pass. Two literals in the template ("Loading avatar…", "Some runtime choices are unavailable…") are status text, not error mapping. |
| Draft writes only through `patchDraft` | Pass. No direct writes. `uploadAvatar` is a store method. |
| Angular rules | Pass. OnPush, `input()`/`output()`, `[class]` strings only, no `ngClass`/`ngStyle`/`[innerHTML]`. |
| No `any`, `as unknown as`, `!` | Pass |
| Files below 700 lines | Pass (largest 557) |

## Command results

- Jest, the two specs: 2 suites, 20 tests, all passed.
- ESLint, six files: exit 0, no output.
- `tsc`: not re-run. The coordinator reported nx lint and typecheck passed.
- Gap in tests: no spec for an archived bot in the delete dialog (would catch defect 1). No spec for a `FileReader` success path, a reader error, or the stale-draft drop (defect 3).

## Safe to carry forward to U06b and U06a

- All three section components, the store contract they use, and the `BotRemovalIntent` output type.
- The decision to omit "No memory" and to follow the schema approval modes.
- The rule that Default stores `{ kind: 'default' }` only.

U06b must: bind `installedSkills`, `knownToolIds`, `catalogLoaded`, `catalogLoading`, `catalogFailed`; choose one owner for `error()`; pass the archived and dirty state to the delete dialog; mount the dialog closed and toggle `isOpen`.

## Re-review 1

Review family: claude (implementer: codex)

**Score: 9 / 10. Verdict: APPROVED** (two low defects, no blocker).

### D1-D10

| # | Original defect | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Archived bot cannot be deleted | Fixed | `bot-delete-dialog.component.ts:123-126` blocks on every reason except `archived`. Spec `bot-delete-dialog.spec.ts:143`. |
| D2 | Archive offered for archived bot | Fixed | `archived` input (line 119), `methods()` hides Archive (141-156), start method is `delete` (134-135). Spec line 143. |
| D3 | Upload race and silent drop | Fixed | Read token and `abort()` of the old reader (`identity:556-559`). Context check uses bot id, scope and avatar, not the draft object (545-552, 588). A drop shows a message (589-591). Specs 248 (typing does not drop), 268 (out-of-order). |
| D4 | Invalid file made an RPC call | Fixed | Local type and size check, local error, no store call (`identity:567-576`). Spec 259 and the reader-error path. |
| D5 | Lane picked an unavailable lane | Fixed | `identity:439-442` prefers `available`. Spec 318. |
| D6 | Reset only on `isOpen` | Fixed | `resetSource` has open, name and archived (`dialog:127-140`). Spec 173. |
| D7 | Dirty warning from store | Fixed | `dirty` input (line 120, template 34). Spec 185. |
| D8 | Effort was free text | Fixed | `ptah-select` with Default/low/medium/high plus an `(unresolved)` stored value (`identity:346-355`, template 275). Spec 340. |
| D9 | Duplicate `error()` display | Fixed | The section has no `store.error()` and no `botErrorMessage`. Spec 366. |
| D10 | Catalog inputs must be bound | Carried to U06b | Unchanged by design. See carry-forward. |

### New defects

1. **Low: literal "?" in user text.** `identity:582-583` shows "Reading the new image?" and "Reading image?". The ellipsis character was lost. The text reads as a question. Fix: use "…" as in "Loading avatar…".
2. **Low: stale local read error.** `avatarReadError` clears only on the next upload (`identity:560`). If the user then picks an icon or removes the avatar, the old "Choose a PNG…" alert stays. Fix: clear it when `setAvatar`, `setIcon` or remove runs.
3. **Low: an invalid second file does not cancel an upload in flight.** `identity:567-576` returns before any store call. An earlier valid upload (RPC pending) can still apply, so the user sees an error and then an image. Accept, or cancel by a store method.
4. **Info: `setEffort(null)` returns without clearing** (`identity:496`), while `setTier(null)` clears. The select does not emit `null` for the Default option unless `clearable` is set, so this is safe now. Make both consistent.

### Checked, no defect

- Read token versus store upload sequence: the token guards only the read. The store token guards the RPC. A newer file aborts the older reader and bumps the store token on upload. No conflict.
- Radio focus offsets with one method option: archived gives count 1, memory offset 1, history offset 3, method index 0 (`dialog:203-207`). Correct. Non-archived keeps offsets 0/2/4.
- Reset on name or archived change: covered by spec 173 and 143.
- Unresolved effort value: kept and shown as `(unresolved)`.
- `disabled()` of the dialog does not use `readonly()` any more. Saving and conflict still block.

### Command results

- Jest, two specs: 2 suites, 35 tests, all passed.
- ESLint, six files: exit 0.
- `tsc --noEmit -p libs/frontend/bots-ui/tsconfig.lib.json`: no output (pass).
- Files below 700 lines (identity 614, dialog 217).

### Safe to carry forward to U06b and U06a

- All four components and their inputs and outputs. `BotRemovalIntent` is unchanged.
- U06b must pass the target bot's `archived`, `dirty` and `name` to the dialog, mount it closed, and toggle `isOpen`.
- U06b must bind `installedSkills`, `knownToolIds`, `catalogLoaded`, `catalogLoading`, `catalogFailed`, and own the editor `error()` display.
- Fix the new low defects 1 and 2 in U06b or a later polish step. Neither blocks.

## Coordinator fixes after re-review 1

- New defect 1 fixed: the read status text uses "…" (`Reading image…`).
- New defect 2 fixed: `setAvatar` (icon or unset) and `setIcon` clear `avatarReadError`.
- New defects 3 and 4 stay open (low/info). Carry them to U06b polish.
- `npm run verify -- -t lint,typecheck -p bots-ui` and `--related -p bots-ui`: exit 0.
