# Phase 2 fix report, lane C (fix round 1) - TASK_2026_2285_304a

Status: the 8 items are complete. Focused checks pass for the write set. No render was done.

Source: `phase-2-code-review.md` (Blocking 1, Serious 1-5, Minor 1, Minor 4) and `decisions.md` row 38.

`CH/` = `libs/frontend/chat/src/lib/settings/`. `CFG` = `CH/pro-features/claude-builtins-config.component.ts`,
`GRP` = `CH/pro-features/claude-builtins-group.component.ts`, `ROW` = `CH/pro-features/claude-builtins-row.component.ts`,
`FB` = `CH/feedback/settings-save-feedback.service.ts`. Each spec is the `.spec.ts` file next to its source.

Files changed: `CFG`, `GRP`, `ROW`, `FB` and their 4 specs. NEW: `CH/pro-features/claude-builtins-sync.service.ts`.

## Items

### 1. Blocking 1: a partial group save keeps Undo
- `FB:57` NEW type `SettingsGenericWriteResult`: the failure result has an optional `keepUndo`. `FB:183-190`: a
  failure with `keepUndo` and a request `undo` shows the one alert toast with `canUndo: true` and stores the Undo.
  A failure without `keepUndo` is the same as before, so the other callers of `saveGeneric` do not change.
- `CFG:735` `sequenceResult`: one message, `keepUndo` is true while at least one row saved. `CFG:611` `toggleGroup`:
  the Undo closure writes back only the ids in `saved`.
- Tests. `FB.spec`: "a partial failure with keepUndo keeps one alert toast with Undo…", "keepUndo offers no Undo when
  the request has none…". `CFG.spec`: "a partial failure (…) keeps one toast "k of n" with Undo; Undo writes only the
  rows that saved" (2 cases; another writer changes a failed row before the Undo, and the Undo does not touch it),
  "a failure of every row offers no Undo", "stops when the recovery read fails too (…): Retry focused, and Undo still
  writes back the row that saved" (2 cases).

### 2. Serious 1: a write or an Undo that ends after the card was destroyed
- NEW `claude-builtins-sync.service.ts`: root-scoped `ClaudeBuiltinsSyncService` with a `settled` signal (revision +
  source card) and `notifySettled(source)`.
- `CFG:405` `alive` flag, set to false in `DestroyRef.onDestroy`. A destroyed card still sends its calls, but
  `saveItem`, `saveItems`, `apply` and `toggle` write none of its signals.
- `CFG:748` `settling(...)` wraps each write and each Undo closure (single toggle and group) and calls
  `notifySettled(this)` when it ends. `CFG:506-513`: each mounted card that is not the source reads the stored lists
  again (`refresh`, `CFG:537`, no skeleton). `CFG:407` `readSequence` drops a read that ends after a newer answer.
- Tests (`CFG.spec`, "A write or an Undo that outlives the card"): "a group write that ends after the card was
  destroyed leaves its signals alone; the new card shows the result" (remount during a held write, then Undo after the
  remount), "Undo of a single toggle after a remount changes the mounted card", "a write of the mounted card causes no
  extra read of that card", "a failed held write of a destroyed card does not put the destroyed card in an error
  state".

### 3. Serious 2: explicit rejection and uncertain delivery
- `CFG:676` `saveItem` returns `saved`, `rejected` or `unconfirmed`. Only `success: false` from the host is an explicit
  rejection. A timeout, a transport error or an answer without lists is uncertain: the stored lists are read again, and
  a verified read settles the item (`saved` when the item has the requested state). With no verified read the item is
  `unconfirmed`.
- Single toggle (`CFG:726`): `unconfirmed` shows "Could not confirm whether {label} was saved."
  (`settingNotConfirmedMessage`). Group (`CFG:735`, `CFG:139`): "k of n changes could not be confirmed.", after the
  "not saved" sentence when the two occur.
- Tests (`CFG.spec`): "a write that commits while (the transport rejects | the call times out) is reconciled with the
  re-read: it is saved, with Undo", "an uncertain write that no re-read can settle is reported as unconfirmed…",
  "an uncertain write is unconfirmed when the re-read is not verified; the rows become read-only", "an explicit
  rejection from the host toasts the fixed sentence…", "counts a row as saved when its write commits and the transport
  rejects; the toast agrees with the rows" (group; the Undo set has the reconciled row).

### 4. Serious 3 (ruling): tri-state checkbox for the group control
- `GRP:62` `role="checkbox"` with `aria-checked` true / false / mixed. The look and the test id
  (`claude-tools-group-switch-<id>`) do not change. Row controls stay `role="switch"`.
- Tests. `GRP.spec`: the 3 state cases assert `role="checkbox"`, no `button[role="switch"]`, and the state.
  `CFG.spec`: "shows the state of the visible rows…" asserts the checkbox role of the group and the switch role of a
  row.

### 5. Serious 4: unverified policy shows the catalog read-only
- `CFG:809` `apply` stores the returned lists for an unverified read and sets `loadState` to `unverified`.
  `CFG:429-431` `readOnly`, `hasCatalog`. Template `CFG:203`: the error alert (own message, Retry) and the rows are
  shown together. Rows and group controls get `saving() || readOnly()`, so they are `aria-disabled` and keep focus.
  `toggle` and `toggleGroup` refuse each write as before (`!loaded()`).
- A read failure with no data shows the error and no rows, no group, no summary bar.
- Tests (`CFG.spec`): "an unverified capability policy shows its own error with Retry and the returned catalog
  read-only" (click and direct calls start no write; Retry with a verified policy makes the controls live), "a read
  failure with no data shows no rows…", "an unverified policy shows the synced rows read-only and refuses their
  writes".

### 6. Serious 5: no id collision
- `ROW:21` `toIdPart`: each character outside `[A-Za-z0-9-]`, the underscore included, becomes `_<hex code>_`. The
  encoding is injective.
- Tests (`ROW.spec`): "encodes an id without collisions", "two rows whose names differ only by a dot and an underscore
  have different ids, each resolved to its own row".

### 7. Minor 1: disclosure while a filter is active
- `GRP:109` NEW input `expandLocked`. `GRP:38` `aria-disabled="true"`, `GRP:129` activation ignored, focus kept.
  `CFG` passes `[expandLocked]="filtering()"` (lines 262, 297, 333). Groups with a match stay expanded.
- Tests. `GRP.spec`: "expandLocked exposes the disclosure as unavailable, keeps it focusable and ignores activation".
  `CFG.spec`: the filter test asserts `aria-disabled` during the filter, and normal open and close after Clear.

### 8. Minor 4: saving status live region
- `CFG:218` the `role="status"` region is `sr-only` and always rendered with the summary bar (no `empty:hidden`).
  `CFG:219-221` a separate visible copy with `aria-hidden="true"` (`claude-tools-group-progress-visual`) shows only
  while a group save runs.
- Test (`CFG.spec`): "shows "Saving i of n" in a status region…" asserts the same element before, during and after
  the save, class `sr-only`, no `hidden`, no `aria-hidden`, and the separate visual copy.

## Checks

| Command | Exit code | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <row, group, config, save feedback specs>` | 0 | 4 suites, 121 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no error |
| `npx eslint <the 9 files>` | 0 | no error |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` (extra) | 2 | 384 errors, 0 in the write set, same count as in the first round |

Logs: `.ptah/tmp/lane-c-fix-jest.log`, `lane-c-fix-tsc-lib.log`, `lane-c-fix-tsc-spec.log`, `lane-c-fix-eslint.log`.

## Not done

- No render and no screenshot (lane rules).
- `saveGeneric` has callers in 19 source files. The change is additive (an optional field), and `tsc` passes, but I did
  not run the specs of those callers: they are outside the write set. The coordinator gate covers them.
- The coordinator must run `typecheck-templates` for `ptah-extension-webview`: the `CFG` and `GRP` templates changed.
- An Undo that runs while the card shows its load error writes the stored lists, but the card stays in the error state
  until Retry. The test covers this.

## Visual check necessary

1. Unverified policy: the error alert, the summary bar and the read-only rows are shown together. The rows and the
   group controls must have the disabled look.
2. Group save: the visible "Saving i of n" text shows in the summary bar and goes when the save ends.
3. Filter active: the disclosure button of each shown group has the disabled look (`aria-disabled="true"`).

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Item 2: a root-scoped revision signal, and the mounted card reads again | (a) revision signal + reload; (b) move the catalog and the writes to a Settings-scoped store | The task names (a) as an example. (b) changes `settings.component.ts`, outside the write set. | yes |
| The card that wrote does not read again while it is mounted | (a) skip the source; (b) each card reads | The source already shows the lists of the answer. A second read would change the "no fresh read" tests of A-27. | yes |
| Only `success: false` in the host data is an explicit rejection | (a) this; (b) each `RpcResult` failure is a rejection | `claude-rpc.service.ts` reports a timeout as an `RpcResult` failure, so a failure result can hide a committed write. | yes |
| An uncertain write that a verified re-read shows in its old state counts as not saved | (a) not saved; (b) unconfirmed | The review: reconcile against verified state. "Unconfirmed" stays for the case with no verified read. | yes |
| A sequence stops when the recovery read is not verified. Ids that were not sent count as not saved | (a) stop; (b) continue | Same rule as in round 0. No later write can be confirmed then. | yes |
| `keepUndo` is a field of the failure result, not a new method | (a) optional field; (b) new `savePartial` method | The smallest change. The other callers keep their behaviour. | yes |
| The live region is `sr-only`, with a separate `aria-hidden` visible copy | (a) two elements; (b) one visible element with a minimum width | The review asks for a separate visual status. | yes |
| Focus after a failed write prefers the control, then Retry (ordered selectors) | (a) ordered; (b) document order | With the read-only catalog, Retry is before the control in the document. Document order moved focus off the control. | yes |
| The test id `claude-tools-group-switch-<id>` and the input names `switchState`, `switchLabel` stay | (a) keep; (b) rename to "checkbox" | The plan lists the test id. The control keeps its switch look. | yes |
