# Batch U04 logic review (TASK_2026_2274_eb79)

Review family: claude (implementer: codex)

**Score: 7/10. Verdict: REVISE.**

Reason: the core behaviour is sound. Three medium defects remain: wrong avatar error text, raw diagnostic text, and a focus loss in the popover. Each fix is small.

## Scope examined

Whole files: the three components and two specs in `libs/frontend/bots-ui/src/lib`. Also read: `bot-error-messages.ts`, `bot-avatar-cache.ts`, `rpc-bots.schemas.ts` (BotSkillRefSchema, BotDiagnosticSchema, unreadable item).

## Five logic questions

1. **Does it do what was asked?** Yes, with the defects below. Avatar icon, image, fallback, retry, runtime labels, chips, overlap warning and keyboard access are present.
2. **What fails at the boundaries?** Empty `lastEdit`, an unloaded tool catalog, duplicate ids in input, and cached avatar errors (D1, D2, D5, D6).
3. **What state can go stale?** `imageFailed` resets only when the image id changes. This is correct. The `requested` set is per instance. Correct for "once per image id".
4. **What did the author not test?** Image id change A to B, the focus after a checkbox uncheck, duplicate ids, empty `lastEdit`.
5. **What did the requirements leave open?** The error text for a missing avatar image. The store already has `avatarErrorMessage`.

## Defects

| # | Location | Severity | Defect | Fix |
|---|---|---|---|---|
| D1 | `bot-list-row.component.ts:231-236`, spec `bot-list-row.spec.ts:118-128` | Medium | The avatar load error uses `botErrorMessage(code)`. For `BOT_NOT_FOUND` it shows "This bot no longer exists. Refresh the list." The image is missing, not the bot. Other codes show "Your changes are still here", which is wrong for a list row. The store already provides `avatarErrorMessage(code, 'load')`. The spec locks in the wrong text. | Use `avatarErrorMessage(avatar.error.code, 'load')`. Update the spec. |
| D2 | `bot-list-row.component.ts:40` | Medium | Unreadable diagnostics print the mapped text and then the raw `diagnostic.message` from the wire. Unmapped codes show the generic "The bot request failed... Retry" text, which is wrong for a record that has no action. The carry-forward row says use `botErrorMessage` for any error text. The spec (line 159-161) requires the raw text. | Show one mapped sentence per diagnostic. Do not show `message` as text. If the raw text is needed, put it in a `title` or a details line, and mark it as diagnostic detail. Also use a stable `track` (`code` plus index), not the object. |
| D3 | `bot-skills-picker.component.ts:132-146` | Medium | `toggle()` calls `remove()` when a checkbox is cleared. `remove()` moves focus to a chip button or to the Add button. Focus leaves the open dialog on each uncheck. The keyboard user loses the place in the list. | Split `remove()` into a pure emit and a chip-only `removeChip()` that moves focus. The popover `toggle()` must use the pure emit. Add a spec. |
| D4 | `bot-list-row.component.ts:199-203` | Low | An empty `lastEdit` gives the name `..., anthropic sonnet, ` with a trailing separator. | Join only the non-empty parts. |
| D5 | `tool-id-chip-input.component.ts:32` | Low | Every chip shows "(unresolved)" while `knownIds` is empty, for example while the catalog loads or when it failed. The state looks like a user error. | Add a `catalogLoaded` input (default true). Show the marker only when the catalog is loaded. |
| D6 | `tool-id-chip-input.component.ts:26`, `bot-skills-picker.component.ts:35` | Low | The `track id` key is not unique if the wire data holds duplicate ids. Angular reports NG0955 and `remove` deletes both entries. | Track by `$index` plus id, or de-duplicate on display. State the choice. |
| D7 | `bot-list-row.component.ts:237-249` | Low | `avatarNeeded` is emitted from `ngOnChanges`, also when `avatar` is already `ready`. A parent that writes a store signal in the handler can cause NG0100 in dev mode, because the write happens during change detection. | Emit only when `avatar()` is null or not ready. Tell U05 to dedupe in the store and not to write synchronously in the handler, or to use `queueMicrotask`. |
| D8 | `bot-list-row.component.ts:217-225` | Low | A `ready` state with a data URL that does not match the PNG/JPEG/WebP pattern shows the default icon with no error and no retry. The restriction itself is correct. | Treat a non-matching URL as `avatarFailed`. |
| D9 | `bot-skills-picker.component.ts:32`, `tool-id-chip-input.component.ts:23` | Low | `aria-label` on a `div` without a role is not announced reliably. | Add `role="group"`. |
| D10 | specs | Low | No test for: image id A to B (one new request, `imageFailed` reset), the popover focus (D3), the empty `lastEdit`, duplicate ids. | Add them with the fixes. |

## Hunt list results

- `ngOnChanges` request logic: no repeat, no miss for the A to B path by reading. A to B to A does not request A again. This is correct if the store cache holds A. Not tested (D10).
- Image src: restricted by regex to `data:image/(png|jpeg|webp);base64,`. Passed. `file:` is rejected (tested).
- Nested interactive elements: none. The retry button is a sibling of the row button. Passed.
- Focus after removal: works for chip removal (tested). Fails for the popover checkbox (D3).
- Input array mutation: none. All emits create new arrays. Other refs keep identity (`filter`).
- Skill id vs name: wire `BotSkillRef` is `{ id }`. Picker maps `InstalledSkill.name` to `id`. Consistent. Duplicate source copies are collapsed by name.
- Accessible name: matches the design-spec format. Status text and name agree with the visible text.
- Angular rules: OnPush, `input()`/`output()`, no `ngClass`/`ngStyle`, no `[innerHTML]`. `[style.x]` bindings only. No `any`, `as unknown as` or `!` found.

## Check results

- Jest, the two specs: 2 suites, 18 tests passed.
- ESLint, the five files (plus `bots.store.spec.ts` picked up by the glob): no output (clean).
- `tsc --noEmit -p tsconfig.lib.json`: no output (clean).
- The coordinator reported nx lint, typecheck and typecheck-templates passed. I did not repeat them.

## Safe to carry forward to U05/U06

- `ptah-bot-list-row` inputs and outputs (`bot`, `unreadable`, `avatar`, `selected`, `lastEdit`, `selectedBot`, `avatarNeeded`, `avatarRetry`) and the accessible-name format. Keep them when D1-D2 are fixed.
- `ptah-tool-id-chip-input` and `ptah-bot-skills-picker` contracts (`ids`/`idsChange`, `skills`/`skillsChange`, `readonly`). Adding `catalogLoaded` is additive.
- The chip removal focus pattern and keyboard map.
- The data-URL restriction.

Do not carry forward as final: the avatar error text (D1) and the unreadable diagnostic text (D2).

---

## Re-review 1

Review family: claude (implementer: codex)

**Score: 8/10. Verdict: APPROVED.**

All ten defects are fixed. One new Low defect remains (N1). It does not block U05. Fix it in U04 or handle it in U05 as stated below.

### Previous defects

| # | Status | Evidence |
|---|---|---|
| D1 | Fixed | `bot-list-row.component.ts:251-256` uses `avatarErrorMessage(code, 'load')`. The spec at `bot-list-row.spec.ts:121` was updated. |
| D2 | Fixed | `bot-list-row.component.ts:43,176-181`: one mapped sentence, a neutral text for unmapped codes, no wire `message`. Track key is `code:index` (line 41). Spec at `bot-list-row.spec.ts:155,182`. |
| D3 | Fixed | `bot-skills-picker.component.ts:140-158`. `toggle` calls the pure `remove`. Only `removeChip` moves focus. Spec at `bot-selection-controls.spec.ts:7` asserts focus stays on the checkbox and the popover stays open. |
| D4 | Fixed | `bot-list-row.component.ts:207-220` joins only non-empty parts. Spec at `bot-list-row.spec.ts:208` (empty and blank). |
| D5 | Fixed | `tool-id-chip-input.component.ts:33,89`. Spec at `bot-selection-controls.spec.ts:42`. The default is `true`. U05 must bind it. |
| D6 | Fixed | `tool-id-chip-input.component.ts:95` and `bot-skills-picker.component.ts:110-115` show each id once. Inputs are not mutated. Spec at `bot-selection-controls.spec.ts:56`. |
| D7 | Fixed, with a new issue (N1) | `bot-list-row.component.ts:265` emits only when `avatar()` is null. Spec at `bot-list-row.spec.ts:222` covers loading, ready and error. |
| D8 | Fixed | `bot-list-row.component.ts:242-250`: a ready state with an unusable URL sets `avatarFailed`. Spec at `bot-list-row.spec.ts` (invalid URL case, line 121). |
| D9 | Fixed | `role="group"` at `bot-skills-picker.component.ts:34` and `tool-id-chip-input.component.ts:23`. Spec at `bot-selection-controls.spec.ts:97`. |
| D10 | Fixed | A to B: `bot-list-row.spec.ts:242`. Focus: line 7. Empty `lastEdit`: line 208. Duplicates: line 56. |

### New defects

1. **N1 (Low): no new request after cache eviction of an image that this row already requested.** `bot-list-row.component.ts:265-268`. The `requested` set is filled only when the row emits. If the row emits, the avatar becomes `ready`, and the store then evicts it (avatar input returns to `null`), the id is still in `requested`. The row shows the default icon, with no request and no retry action, because `avatarFailed` is false for `null`. The same happens for A to B to A if A was evicted while B was shown. The test at `bot-list-row.spec.ts:222` covers only the case where the row never requested before. Fix: clear the `requested` entry when the avatar input changes from non-null to null (or keep one `lastRequested` id and re-emit when `avatar()` is null and the state changed). Add a spec: null, request, ready, null, second request. The store must still dedupe in-flight requests. Alternative: accept it and let U05 note that the cache limit is above the visible row count (record this as an assumption).
2. **N2 (Info): duplicate ids are removed together.** `remove` filters every entry with the same id (`bot-skills-picker.component.ts:147`, `tool-id-chip-input.component.ts:117`). This is correct for display that shows each id once. Emitted arrays keep other duplicates unchanged (identity preserved). No fix needed.

### Checks on the fixes (no new defects found)

- Focus after the `remove` / `removeChip` split: `removeChip` reads `displaySkills()` for the index, and `buttons()` is in the same order. Correct. Tool input `remove` uses `displayIds()` for the same reason.
- De-duplicated display against emitted arrays: `toggle` uses `selectedIds` from the full input. Consistent.
- Accessible name: `trim()` filter handles blank parts. The format matches design-spec line 196.
- No `any`, `as unknown as` or `!`. OnPush, `input()`/`output()`, no `ngClass`/`ngStyle`, no `[innerHTML]`.

### Check results

- Jest, the two specs: 2 suites, 29 tests passed.
- ESLint, the five files: clean.
- `tsc --noEmit -p tsconfig.lib.json`: clean.

### Safe to carry forward to U05/U06

- All three component contracts, including the new `catalogLoaded` input (default `true`; U05 must pass `false` while the tool catalog loads or fails).
- The accessible-name format, the diagnostic text mapping, and the avatar error text.
- The chip focus pattern, the popover focus behaviour, and the data-URL restriction.
- U05 must: dedupe `avatarNeeded` in the store, avoid a synchronous store write that conflicts with change detection, pass `lastEdit` text, and handle N1 if the avatar cache can evict a visible row.
