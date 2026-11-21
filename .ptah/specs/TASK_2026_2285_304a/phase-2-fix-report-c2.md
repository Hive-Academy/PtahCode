# Phase 2 fix report, lane C (fix round 2) - TASK_2026_2285_304a

Status: the 6 items are complete. Focused checks pass for the write set. One new ESLint warning (`max-lines`) stays, see
"Not done". No render was done.

Source: `phase-2-code-review-2.md` and `decisions.md` rows 38 and 40.

`CH/` = `libs/frontend/chat/src/lib/settings/`. `CFG` = `CH/pro-features/claude-builtins-config.component.ts`,
`SYNC` = `CH/pro-features/claude-builtins-sync.service.ts`, `FB` = `CH/feedback/settings-save-feedback.service.ts`.
`CFG.spec` and `FB.spec` are the spec files next to them.

Files changed: `CFG`, `CFG.spec`, `SYNC`, `FB`, `FB.spec`. The group and row components and their specs did not change.

## Items

### 1. Serious 1: a remounted card stays busy until the refresh for the settlement applied
- `CFG:452` NEW computed `syncing`: true from the moment another card instance settles a write or an Undo
  (`settled.revision > appliedRevision`), and while the newest read is in flight (`readPending`, `CFG:427`). It reads
  the sync signal directly, so it is true before the refresh effect runs.
- `CFG:466` NEW computed `busy` = `saving() || readOnly() || syncing()`. Each row and each group control binds it.
- `toggle` and `toggleGroup` (`CFG:672`) return before a write when `syncing()` is true. So no write starts and no
  Undo is registered from the old lists.
- `CFG:543-556`: the effect sets `appliedRevision` when the read for that settlement ended.
- Test (`CFG.spec`): "the remounted card keeps its controls busy, and starts no write, until the refresh for the
  settlement applied" (held batch, remount, held refresh: a click, a group click and the direct calls send no write,
  the Undo of the batch stays in the toast; after the refresh the card works as usual).

### 2. Serious 2 (decision 40): an unchanged re-read is unconfirmed, not "not saved"
- `CFG:750-776` `saveItem`: only `success: false` from the host gives `rejected`. After a timeout, a transport error or
  an answer without lists, a verified re-read with the requested state gives `saved`; each other re-read gives
  `unconfirmed` (`CFG:775`). The sequence continues after an unconfirmed row when the re-read is verified.
- Single toggle toast: "Could not confirm whether {label} was saved." Group toast: "k of n changes could not be
  confirmed.", and the row is not in the "not saved" count.
- Tests (`CFG.spec`): "a timeout whose re-read shows the old state, with a late commit, is unconfirmed and not "not
  saved"", "a row that times out, with an old re-read and a late commit, is unconfirmed and not in the failed count"
  (group; the Undo sends no call for the unconfirmed row), "a lost answer for every row reports all rows as
  unconfirmed and offers no Undo". Updated: the 3 lost-answer cases of the single toggle, the synced lost-answer
  test, "a failed write re-reads…", and the lost-answer case of the partial failure test now expect the unconfirmed
  text.

### 3. Serious 4: an Undo sends no write until a read is verified
- `CFG:422` `lastPolicy` keeps the policy of the newest read answer (set in `read`, `CFG:876-882`, also for a
  destroyed card). `CFG:582` `undoRefused`: when the newest read was not verified, the Undo reads first. An unverified
  answer refuses the Undo with `CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED` (`CFG:135`) and `keepUndo: true`. A verified
  answer lets the Undo continue. The two Undo closures (single toggle and group) use it.
- `FB:176` NEW private `runGeneric(request, undoRun)`. `FB:195`: when an Undo run fails with `keepUndo`, the toast
  offers the same Undo again. `saveGeneric` has the same behaviour as before for each other caller.
- Tests. `CFG.spec`: "with an unverified recovery read, Undo stays in the toast but sends no write until a read is
  verified" (2 refused tries with 0 writes, then a verified read and 1 write). `FB.spec`: "an Undo that fails with
  keepUndo stays in the toast and runs again; without keepUndo it is dropped".

### 4. New Serious 1: Retry and partial Undo do not leave the card in `loading`
- `CFG:824-835` `settling`: when a write or an Undo ends while the card is in `loading` (its answer replaced the read
  of a Retry), the card reads the stored lists again inside the save. The save stays busy until that read applied.
- `CFG:592-602` `refresh` and `CFG:427` `readPending`: only the newest read counts as pending. A read that a newer
  answer replaced is dropped and the card does not wait for it.
- Tests (`CFG.spec`), the two completion orders: "Retry, then Undo: the Undo ends before the read of the Retry, and the
  card is not stuck in loading", "Undo, then Retry: the write answer replaces the read of the Retry, and a new read
  ends the loading state".

### 5. New Minor 2: the sync service publishes a number
- `SYNC`: `ClaudeBuiltinsSettled` is `{ revision, sourceId: number }`. NEW `nextInstanceId()`.
  `notifySettled(sourceId: number)`. The service keeps no component reference.
- `CFG:417` `instanceId`. The effect and `syncing` compare `sourceId` with it.
- Test (`CFG.spec`): "the sync service publishes a number for the source card, not the card".

### 6. New Minor 3: the Undo of a group switch has its own confirmation
- `FB:63`: a success result can have a `message` that replaces "Saved {label}." (`FB:203`).
- `CFG:138` `claudeBuiltinsGroupRestored`: "Restored Built-in tools (4 turned off)." The group Undo closure returns it
  with the count of the rows it wrote back and the direction of the Undo.
- Tests. `CFG.spec`: the partial failure test (2 cases) expects "Restored Built-in tools (4 turned off)."; the full
  batch test expects "(5 turned off)"; the recovery-read tests expect "(1 turned off)". `FB.spec`: "a success with its
  own message shows that message in place of "Saved {label}."".

## Checks

| Command | Exit code | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <row, group, config, save feedback specs>` | 0 | 4 suites, 131 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no error |
| `npx eslint <the 9 files>` | 0 | 0 errors, 1 warning (`max-lines` in `CFG`) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` (extra) | 2 | 384 errors, 0 in the write set, same count as before |

Logs: `.ptah/tmp/lane-c-fix2-jest.log`, `lane-c-fix2-tsc-lib.log`, `lane-c-fix2-tsc-spec.log`, `lane-c-fix2-eslint.log`.

`CFG.spec`: the `settle()` helper now does 6 passes of 20 microtasks (before: 3 of 10). A row write with a recovery
read has more async steps than before.

## Not done

- ESLint warning: `CFG` has 713 code lines, the limit is 700 (`max-lines`, level `warn` in `eslint.config.mjs:520`;
  lint-staged uses `--max-warnings=-1`, so it does not stop a commit). I did not split the file in the last fix round.
  A follow-up can move the write and reconcile logic out of the component.
- No render and no screenshot (lane rules).
- I did not run the specs of the other `saveGeneric` callers (outside the write set). The service change is additive:
  an optional `message` on a success result, and the Undo re-offer only for a result with `keepUndo`. `tsc` passes.
- The coordinator must run `typecheck-templates` for `ptah-extension-webview`: the `CFG` template changed (`busy()`).
- An unconfirmed row is not in the Undo set. If the host commits it late, the Undo does not write it back. The card
  shows the row when a later answer has the stored lists.
- The toast timer (8 s) also ends a kept Undo. This is the existing behaviour of the service.

## Visual check necessary

1. After a return to Advanced during a group save: the rows and group controls have the disabled look until the
   refresh ends, then they are live.
2. The toast texts: "… could not be confirmed.", "Restored Built-in tools (4 turned off).", and the refused Undo text
   with the Undo button still shown.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Item 3: an Undo is refused only by an `unverified` read answer. A read with no answer does not refuse it | (a) refuse only on `unverified`; (b) refuse also when the read fails | The re-review accepts the round 1 Undo after a failed recovery read (Blocking 1 "resolved … including when recovery fails"). `unverified` is the fail-closed signal of the host. | yes |
| Item 3: the Undo reads first only when the newest read was not verified | (a) read only then; (b) read before each Undo | A-27 tests require an Undo without a read in the usual case ("Undo sends the inverse per-item call without a read"). | yes |
| Item 3: the re-offer of an Undo is in the service (`undoRun`), through the existing `keepUndo` field | (a) reuse `keepUndo`; (b) new result field | One field, one meaning: "keep the Undo in the toast". No other caller sets it. | yes |
| A group Undo that restores only a part stays in the toast | (a) keep; (b) drop | Each call sets a state, so the Undo is safe to run again. | yes |
| Item 4: a new read after the write, not a refused Retry | (a) new authoritative read; (b) disable Retry while a save runs | The task permits the two. (a) changes no control state and covers the two orders. | yes |
| Item 1 and 4: only the newest read keeps the card busy | (a) newest read; (b) each read in flight | With (b) a dropped read of a Retry kept the controls busy until its answer or its timeout. | yes |
| Item 2: an answer `success: true` without lists is also uncertain | (a) uncertain; (b) saved | Same rule as before round 1: the card shows only lists that the host returned. | yes |
| Item 6 wording: "Restored {group} ({n} turned {on|off})." | (a) this; (b) "Undid …" | Count and direction of the Undo, as the re-review asks. Fixed text, no host text (D15). | yes |
| The single toggle Undo keeps "Saved {name} {kind}." | (a) keep; (b) new text | Not in the re-review. Existing behaviour and tests. | yes |
