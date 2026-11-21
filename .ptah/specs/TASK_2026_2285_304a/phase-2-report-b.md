# Phase 2 report, lane B (B2.3, B2.4, B2.5)

Status: complete. All three batches are implemented. Nothing is committed (the coordinator commits).
`CH/` = `libs/frontend/chat/src/lib/settings/`.

## Files changed (11, all in the write set)

| File | Batch |
|---|---|
| `CH/pro-features/agent-behaviour-section.component.ts` | B2.3 |
| `CH/pro-features/agent-behaviour-section.component.spec.ts` | B2.3 |
| `CH/output-style/output-style-config.component.ts` | B2.4 |
| `CH/output-style/output-style-config.component.spec.ts` | B2.4 |
| `CH/output-style/output-style-list.component.ts` | B2.4 |
| `CH/output-style/output-style-list.component.spec.ts` | B2.4 |
| `CH/output-style/output-style-editor.component.ts` | B2.5 |
| `CH/output-style/output-style-editor.component.spec.ts` | B2.5 |
| `CH/output-style/output-style-instructions-field.component.ts` | B2.5 |
| `CH/pro-features/system-prompt-drawer.component.ts` | B2.5 |
| `CH/pro-features/system-prompt-drawer.component.spec.ts` | B2.5 |

## B2.3 Agent behaviour (plan 2.4)

What changed in `agent-behaviour-section.component.ts`:
- `ptah-form-section` has `[icon]="BotIcon"`.
- Each of the 4 rows has `controlAlign="end"` and `edgePadding="trim"`. The row class
  `[border-bottom:...] last:[border-bottom:0]` is removed (the row host draws the divider, and the last row has none).
- Each note moved from the `[status]` span to the row `hint`, with `hintElementId="agent-behaviour-<row>-note"`.
  The 4 ids stay. `truncate`, `basis-full` and the `title` attribute are removed. The hint wraps.
- The `w-56 justify-start` wrapper is removed for the 3 toggles. The toggle is the default slot.
- "System prompt details" is an icon-only `ptahIconButton` (`PanelRightOpen`) in the `[action]` slot. It keeps
  `data-testid="agent-behaviour-prompt-details"` and `drawerOpen.set(true)`.
- The Ultracode `Info` popover (`ptah-native-popover`) is in the `[action]` slot. New test ids:
  `agent-behaviour-ultracode-info` (trigger) and `agent-behaviour-ultracode-info-text` (content).
- The effort select stays `w-56` and stays disabled while Ultracode is on.
- No handler changed: `onPromptModeChange`, `onUltracodeChange`, `writeUltracode`, `onWorkflowsChange`, `selectEffort`,
  load error + Retry, the sr-only `[meta]` status spans.
- Import `ChevronRight` replaced by `PanelRightOpen`.

Acceptance:

| Item | How it is met |
|---|---|
| 2.4 icon, rows, hints, slots | Template as above. Test "row layout (F3, F4, decision 29)" (2 tests) |
| Toggles share one right edge | `controlAlign="end"` on the 4 rows. The test asserts `justify-end` on each control column. Visual check necessary |
| Last row has no divider | The row class is removed. The `ptah-setting-row` host has `last:border-b-0`. Visual check necessary |
| Ids stay | Test "shows every description as the wrapping row hint and keeps its id" |
| Details query (`AB.spec:653`) | Query is `[aria-label="System prompt details"]`. The test also asserts the old test id |
| New A-14 test | "Ultracode info popover (A14)": opens, closes, Esc closes, focus is on the trigger |

## B2.4 Output style card and list (plan 2.5)

`output-style-config.component.ts`:
- The hand-built header is removed. The `<section>` keeps `id="advanced-output-style"`, `tabindex="-1"`,
  `data-glass-surface="content"` and `data-testid="output-style-card"`. It wraps
  `<ptah-form-section [level]="2" heading="Output style" [wide]="true" [icon]="PaletteIcon" [divider]="true">`.
- The description text is the form-section `description` (same copy).
- "New style" is in the `[aside]` slot with `variant="secondary"`, `Plus` + label. It keeps `#newStyleButton`,
  `data-testid="output-style-new-button"`, `aria-label="Create new output style"`, `onCreate`, `[disabled]="store.saving()"`.
- `aria-labelledby` of the section is the form-section `headingId` (template reference `#formSection`).
  The id `output-style-heading` does not exist now. No spec and no other file in `libs/` or `apps/` used it
  (`OSC.spec` had no query for it).
- The list and the `@defer (when view() === 'editor')` editor are the body of the form section. Focus return did not change.

`output-style-list.component.ts`:
- Built-in "Preview" is an icon-only `Eye` `ptahIconButton` with label "Preview {name}". New test id `output-style-preview-button`.
- Edit and Delete are icon-only `ptahIconButton` (`Pencil`, `Trash2`), size `xs`, labels "Edit {name}" / "Delete {name}".
  They keep their test ids, `[disabled]`, `[hidden]` for built-ins and the `title` with the reason.
- Radiogroup, same-selection guard, shadowed rows, delete confirm, help popover, invalid files: no change.

Acceptance:

| Item | How it is met |
|---|---|
| 2.5 config | Test "labels the card with the form-section heading and shows the section icon (F7, F20)" |
| New A-19 test | Test "\"New style\" opens the editor for a new draft; it is off while a save runs (A-19)" |
| Focus return (`OSC.spec:283`) | Both focus tests pass with no change |
| 2.5 list | Test "opens the built-in preview without changing selection" uses `button[aria-label="Preview default"]` |

## B2.5 Output style editor and system prompt drawer (plan 2.6, 2.7)

`output-style-editor.component.ts`:
- The discard, conflict and stale confirms moved from before the form to after `</form>`, inside the drawer body `div`.
- Each confirm has the strip classes `sticky bottom-0 z-[var(--ptah-z-raised)] border-t border-base-300 bg-surface-2 p-3`
  and the new attribute `aria-modal="false"`. `role`, `aria-label`, the local `(keydown.escape)` handlers, `#safeChoice`
  and the focus effect did not change. All test ids and all 5 variants with their actions stay.
- New `confirmOpen` computed (plan text). Save and Cancel have `[disabled]="confirmOpen()"`.
- `submit()` returns after `preventDefault()` when `confirmOpen()` is true.
- `requestClose()`: the first branch is `if (this.confirmOpen())` (focus `#safeChoice`, return). The two lines that
  cleared `conflict` and `stale` before the discard prompt are removed, because that branch now runs only with no prompt open.
  This is the accepted behaviour change (decision 31).

`output-style-instructions-field.component.ts`: textarea `min-h-32 max-h-[50dvh] resize-y [field-sizing:content]`,
preview `max-h-[min(16rem,40dvh)] overflow-y-auto`.

`system-prompt-drawer.component.ts`:
- Footer `px-5 py-3`. Error, status and metadata boxes `p-3`. Preview box `max-h-[min(24rem,50dvh)]`.
- The 8 mojibake sequences are replaced (`—` and `…`).
- `FileTextIcon` (new) only on the empty-state icon. Header and preview control keep `SparklesIcon`.
- No handler changed.

Acceptance:

| Item | How it is met |
|---|---|
| `grep -c 'â€' .../system-prompt-drawer.component.ts` = 0 | Result: `0` |
| 2.6 guard tests | New block "confirm-state guards (2.6)": 9 tests (3 confirms x render position / `aria-modal` / Save and Cancel disabled; 3 x `submit()` and the form submit event write nothing; conflict and stale x Esc on the drawer and backdrop keep the prompt and the focus; "Replace it" still saves). New test "Back on the reload confirm returns to the Overwrite / Reload / Cancel variant" |
| Dialog test ids and focus assertions unchanged | No existing test id or focus assertion was edited. One expectation changed, see Deviations |
| 2.7 tests | New block "copy and icons (F24, F41)": 3 tests |

## Decision 33: glass card padding

- No file in the write set had its own copy of the `1.25rem` card padding rule, so there was no copy to remove.
- Agent behaviour: the `ptah-form-section` host has the class
  `[[data-glass=on]_&>section]:py-0 [[data-glass=on]_&>section]:[border-bottom:0]`. With glass on, the card padding from
  the global rule is the one block inset. With glass off, nothing changes.
- Output style: the old `py-[var(--ptah-gap-group)] border-b` on the `<section>` is removed. The form section now owns
  that spacing (`py` of the form section and `[divider]="true"`), so glass off looks the same as before.
  With glass on, the same two classes as Agent behaviour apply. See Decisions, row 1.

## Checks

Run from the worktree root. Logs are in `.ptah/tmp/lane-b-*.log`.

| Command | Exit code | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <5 specs>` | 0 | 180 passed, 180 total (5 suites) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no error (run after the last library edit) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | 2 | 384 errors in the project. One is in the write set, in old code (see below). No error is in code that this lane added or changed |
| `npx eslint <11 changed files>` | 0 | no error, no warning |
| `grep -c 'â€' libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts` | 1 (grep with count 0) | `0` |

Spec type check: the errors are in spec files across `libs/frontend/chat` (for example `components/atoms/resize-handle.component.spec.ts`,
`settings/providers/*`, `settings/ptah-ai/*`). The lane did not make a base run without its changes, so the report does
not prove that all 384 are old. The one error in the write set is
`system-prompt-drawer.component.spec.ts(594,33): TS2322 Type 'void' is not assignable to type 'undefined'`
(`releaseStatus = () => resolve(rpcSuccess(running));`). `git diff` shows that the lane hunks are at lines 5 and 144-173 only,
so this line is old code. The lane did not change it.

Not run (repository rule for lanes): `npm run verify`, `nx`, `typecheck-templates`, build. `tsc` does not compile the
templates. The Jest specs compile them at run time.

## Deviations from the plan

1. `OSE.spec` "keeps Save disabled ... (N2)": the plan said that no existing editor test breaks. This test expected Save
   to be enabled when the stale dialog shows. The new guard keeps Save disabled while the dialog is open. The test now
   expects `disabled` with the dialog open and `enabled` after `dismissConflict()`.
2. `AB.spec` "deviation 6: colour classes sit only on icons": the assertion `coloured.length > 0` is removed. The only
   coloured icon in that state was the `text-secondary` chevron of the old Details button. The rule "only on icons" is still asserted.
3. `AB.spec` "M1: one-line row descriptions" is rewritten for F9 (hint paragraph, no `truncate`, no `title`). The ids are still asserted.
4. `SPD.spec` "the empty status value is —": no state can render that branch. `regenerationElapsedSeconds()` is `null`
   only when `regenerationStartedAt()` is `null`, and then the status box is not in the DOM. The test instead asserts that
   the rendered status box has no wrongly decoded character. The subtitle test is as planned.
5. The confirm strip classes include `border-base-300 text-xs text-base-content` in addition to the plan list
   (border colour and the text classes that the confirms had before).

## Not done

- No visual check (the coordinator does it in Electron).
- The old spec type error at `system-prompt-drawer.component.spec.ts:594` is not fixed.

## Other writers (not changed by this lane)

`git status` shows changes of the other lanes in `styles.css`, `settings.component.*`, `advanced-settings.component.*`,
`advanced/*`, `license/*`, `mcp-port-config`, `vscode-lm-config`, `claude-builtins-*`. This lane did not touch them.

Extra reads beyond the read set: `UI/button/icon-button.directive.ts` and `UI/button/button.types.ts` (signatures);
`UI/native/drawer` and `UI/native/popover` (grep for slot padding and the Escape handler); `git diff` of lane A files,
filtered to glass padding lines, to use the same class as lane A; `phase-1-code-review.md:59-67`; `styles.css` (grep only).

## Visual check necessary (Electron, 800x600 with nav and 1600x900, dark and light, glass on and off)

- Agent behaviour: the 3 toggles and the select share one right edge. The action slot (details, info) is left of the toggle.
  The Dynamic workflows row has an empty action slot (`empty:hidden`), so make sure that its toggle is on the same edge.
  Hints wrap. The last row has no divider. No doubled block padding with glass on.
- Output style: heading with `Palette` icon and "New style" (secondary) in the aside column. With a container under 640px
  the aside is above the cards. The card grid uses the full width of the fields column.
- Both cards with glass on: one block inset of 1.25rem, and no bottom border line inside the card. Confirm that the arbitrary
  variant class `[[data-glass=on]_&>section]:py-0` is in the built CSS (lane A uses the same class).
- Output style cards: icon-only Preview / Edit / Delete have the same size. Tooltips show the labels.
- Editor drawer: each confirm is a strip at the bottom of the scroll body, above the footer, also when the form is
  scrolled. Save and Cancel look disabled while it is open. The textarea grows with its content up to 50dvh and resizes.
- System prompt drawer: footer padding, `p-3` boxes, preview height in a short window, `FileText` on the empty state,
  correct "—" and "…".

## Decisions

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| 1 | With glass on, the card owns the block inset for Agent behaviour and Output style. The form section gets `py-0` through a class on its host | (a) card owns the inset, inner `py-0` (chosen). (b) keep the inner 1.5rem and set the card block padding to 0 with a local rule of higher specificity | The global rule (decision 33) is the card inset. `phase-1-code-review.md:67` permits "either on the card or on the inner form section". Lane A uses the same class in `license`, `mcp-port-config` and `vscode-lm-config`, so all cards agree. After B2.4, Output style does not own a block inset (the form section does), so the "specific local rule" is not necessary | yes |
| 2 | With glass on, the form-section divider of the two cards is hidden (`[border-bottom:0]`) | (a) hide (chosen). (b) keep | With `py-0` and a trimmed last row, the divider line touches the last control. The card edge already separates the sections. Glass off keeps the divider. Lane A does not add this class, so the coordinator can remove it for one look if the visual check prefers the line | yes |
| 3 | The confirm strip classes go on each of the 3 `alertdialog` elements, not on a new wrapper | (a) on each confirm (chosen). (b) one wrapper `div` | Only one confirm shows at a time. No wrapper keeps `role`, test ids and `#safeChoice` on the same elements, so the focus assertions do not change | yes |
| 4 | Edit and Delete keep `[attr.title]="actionTitle(...)"` | (a) keep (chosen). (b) only the `ptahIconButton` tooltip | The title gives the reason when a style is not editable (plugin or built-in note). Parity A-18 | yes |
| 5 | The old id `output-style-heading` is not kept | (a) drop, use `headingId` (chosen, plan 2.5). (b) add an sr-only second heading | The plan says to label by the form-section `headingId`. A second `h2` would be a duplicate heading. grep found no other use of the id | yes |

## Proposed Removals

None.
