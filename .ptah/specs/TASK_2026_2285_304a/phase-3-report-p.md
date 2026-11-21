# Phase 3 report P: lane P (B3.1 Modals, catalog hint popover, score card popovers)

Status: COMPLETE, with deviations (see `## Deviations`). No rendered check was done: this lane does not run the
Electron app. See `## Needs an Electron visual check`.

`PR/` = `libs/frontend/chat/src/lib/settings/providers/`, `PA/` = `libs/frontend/chat/src/lib/settings/ptah-ai/`.

## Item 1: B3.1 Modals on the shell

Files:
- `PR/add-cli-instance-modal.component.html`, `PR/add-cli-instance-modal.component.spec.ts`
- `PR/cli-tier-mapping-modal.component.html`, `PR/cli-tier-mapping-modal.component.spec.ts`
- `PR/provider-catalog-modal.component.ts`, `PR/provider-catalog-modal.component.spec.ts`

Changes:
- Each `<ptah-native-modal>` has `layout="shell"`.
- Add-cli header: `surface-3 -mx-6 -mt-6 mb-4 ... border-b px-5 py-3` became `flex items-center justify-between gap-2`.
  Footer: `surface-3 -mx-6 -mb-6 mt-5 ... justify-between ... border-t px-5 py-3` became
  `flex items-center justify-end gap-2`. Cancel (ghost) and the primary button are now together on the right.
- Tier header and footer: the same removal (`-mx-6 -mt-6 mb-4`, `-mx-6 -mb-6 mt-5`, border, `bg-base-200`, padding).
- Catalog header: `-mx-6 -mt-6 ... border-b border-base-300 bg-base-200 px-3 py-2.5` became `flex items-center gap-2`.
  Catalog body: `-mx-3 max-h-[50vh] space-y-3 overflow-y-auto pt-3 text-xs` became `space-y-3 text-xs`. No footer.
- The shell wrappers (`data-ptah-modal-part`) give the padding, the borders and the scroll.
- No `.ts` logic changed. All inputs, outputs, handlers and test ids are the same.

Acceptance and how it is met:
| Acceptance | How |
|---|---|
| Every modal fits at 800x600 | The shell box has `max-h-[var(--ptah-modal-max-h)]` (`calc(100dvh - 2rem)`) and one `max-width: min(32rem, 100vw - 2rem)`. Asserted by class in the 3 specs. Not measured in a window |
| The body scrolls | The form, the tier list and the catalog list are in the shell body part (`overflow-y-auto min-h-0 flex-1`). The catalog inner scroll box is removed, so the body is the one scroll owner. Asserted in the 3 specs |
| The footer stays visible | Footer part is `shrink-0` outside the scroll body. Asserted for add-cli (Cancel, primary) and tier (Done). The catalog footer part is empty (`empty:hidden`) |
| No negative-margin chrome | Each spec asserts that `.modal-box` has no element with `-mx-`, `-mt-6` or `-mb-6` |
| Test ids unchanged | `add-cli-instance-modal`, `add-cli-instance-form`, `add-cli-instance-submit`, `cli-tier-mapping-modal`, `cli-tier-mapping-done`, `provider-catalog-modal`, `provider-catalog-body`, `provider-catalog-search`, `provider-catalog-custom` are all kept. All tests that were there before pass unchanged |

New tests (one for each modal): "uses the modal shell: ... (B3.1)".

## Item 2: Catalog hint popover (decision 32/44)

Files: `PR/providers-settings.component.ts` (the `catalog-hint-text` list), `PR/providers-settings.component.spec.ts`.

Change: the `<ul data-testid="catalog-hint-text">` class `max-h-64 overflow-y-auto text-sm` became `text-sm`. The popover
keeps the default `capToViewport` (true). The capped panel (`.ptah-popover-capped`, `overflow-y: auto`) is the one
vertical scroll owner.

Why this option and not `[capToViewport]="false"`: with the opt-out, the panel is 16rem plus padding and the window can
cut it when the trigger is low on the page (the pre-Phase 1 defect). With the cap, the `size()` middleware sets the
panel height to the free space, so the full list is always reachable by one scroll at 800x600. A catalog that fits in
the free space shows with no scroll. Cost: a long catalog list can now be taller than 16rem when there is space.

Test: the existing hint test also asserts that the list has no `max-h-` and no `overflow-y-auto` class.

## Item 3: Score card popovers (decision 32/44)

Files: `PA/capability-matrix-setting.component.ts` (2 places: the table cell popover and the collapsed detail popover),
`PA/capability-matrix-setting.component.spec.ts`.

Change: the projected card class `max-w-64 bg-base-100 text-xs shadow-lg` became `max-w-64 bg-base-100 text-xs`. The cap
stays (no `capToViewport` binding). The panel (`popover-panel surface-3 rounded-xl p-2`) has its own surface.

Test: the "one open detail" test also asserts that the open card has no `shadow` class.

## Checks

| Command | Exit | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` + the 5 specs (3 modal specs, `providers-settings.component.spec.ts`, `capability-matrix-setting.component.spec.ts`) | 0 | 5 suites, 168 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | 0 errors |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | 2 | 384 errors in 73 spec files. 0 in the 3 modal specs and the capability spec. 6 in `providers-settings.component.spec.ts` at lines 119, 2286, 2291, 2296, 2301, 2310 (`transportTimeout` missing, a route type): not lines of this lane (the lane added 4 lines after line 1562). Not compared with `main` (no git checkout permitted) |
| `npx eslint` + the 10 changed files | 0 | 0 errors, 1 warning: `max-lines` on `providers-settings.component.ts` (1453 lines, was there before) |

Logs: `.ptah/tmp/lane-p-jest.log`, `lane-p-tsc-lib.log`, `lane-p-tsc-spec.log`, `lane-p-eslint.log`.

Not run: `npm run verify`, `nx`, `typecheck-templates` (coordinator), specs of other components that mount the modals
(`PA/cli-orchestration-matrix*.spec.ts`: other lanes edit that area now).

## Deviations

1. Header icon (plan 3.1 "icon + h2 + Close"): not added for the add-cli and tier modals. An icon needs a new field
   and import in the `.ts` files, and these are not in the write set. The catalog header keeps its Search icon.
2. Catalog header has no Close button. It stays the search palette of today (sr-only `h2`, search, `ESC` hint).
   Esc and the backdrop close it.
3. Footer hint (plan 3.1 "hint left"): no hint text added. The templates have no such text today, and the prototype
   text "Applies to new tasks." is a product claim that this lane did not verify.
4. Tier footer keeps only "Done" (no Cancel). Each tier save is immediate, so there is nothing to cancel.
5. Header and footer no longer have the `surface-3` / `bg-base-200` band. A background without negative margins would
   show as an inset box in the shell padding. The shell borders divide the parts.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Hint popover: remove the inner cap, keep `capToViewport` | (a) remove inner `max-h-64 overflow-y-auto`; (b) `[capToViewport]="false"` | `native-popover.component.ts` `.ptah-popover-capped` scrolls the panel; decision 32 asks for one scroll owner; (b) restores the window cut | yes, 1 class |
| Score card: remove `shadow-lg`, keep `bg-base-100` | remove the shadow; move it in the padding; also remove the background | The panel has its surface; `p-2` cannot hold a `shadow-lg` (about 25px). The background is not part of the defect | yes |
| Catalog body: remove `-mx-3` and `pt-3` with the scroll classes | keep `-mx-3` | Acceptance "no negative-margin chrome"; the shell body gives `px-5 py-4` | yes |
| Add-cli footer: `justify-end` | keep `justify-between` (Cancel left) | Plan 3.1 "Cancel (ghost) + one primary right"; prototype `.modal-foot` | yes |
| Deviations 1-4 above | add the parts | Write set limit; no verified hint text; no pending state in the tier modal | yes |

## Proposed Removals

None. No capability, control or test id was removed.

## Changes by other writers (not this lane)

`git status` also shows `PA/lanes-table.component.*`, `PA/lanes-table*.spec.ts`, `PA/lane-order-list.component.ts`,
new `PA/lane-model-effort-cell.component.ts`, `PA/lane-order-drag.ts`, `PA/lane-order-drag.spec.ts`,
`phase-3-report-1.md` and `decisions.md`. These belong to the chain lanes and the coordinator.

## Needs an Electron visual check

1. Add / Edit Ptah CLI instance modal at 800x600: the box fits, the form scrolls, Cancel and the primary stay visible.
   Also examine the header and footer without the `surface-3` band, both themes.
2. Tier mapping modal at 800x600 with an open model search list and the manual id row: the list is usable in the
   scroll body, "Done" stays visible.
3. Catalog modal at 800x600 with the full catalog: the search header stays fixed, the list and the custom endpoint row
   scroll. Examine the row inset (the rows had `-mx-3`, now they are in the `px-5` body).
4. Settings toast while a modal is open (it is a `popover="manual"` top-layer element in the footer): it must not be
   cut by the shell `overflow-hidden`.
5. Catalog hint popover at 800x600 with a long catalog: one scroll bar, the last provider is reachable.
6. Capability matrix score card popover (table cell and collapsed detail row): no cut shadow, the card is readable
   on the panel surface, both themes.

## Follow-up (decision 45)

Ruling: FIX deviations 1 and 2, ACCEPT 3, 4 and 5. Deviations 1 and 2 of `## Deviations` are now closed.

Files:
- `PR/add-cli-instance-modal.component.ts` (import `Boxes`, field `TitleIcon`), `.html`, `.spec.ts`
- `PR/cli-tier-mapping-modal.component.ts` (import `Layers`, field `TitleIcon`), `.html`, `.spec.ts`
- `PR/provider-catalog-modal.component.ts` (imports `X`, `PtahIconButtonDirective`, field `CloseIcon`, template), `.spec.ts`

Changes:
- Add-cli header: `<lucide-angular [img]="TitleIcon">` (`Boxes`, the prototype icon) before the `h2`, `aria-hidden="true"`,
  `data-testid="add-cli-instance-title-icon"`. Tier header: the same with `Layers` and
  `data-testid="cli-tier-mapping-title-icon"`.
- Icon size: `h-4 w-4` (1rem), the size of the Close icon and of the catalog Search icon in these headers. The token
  `--ptah-icon-md` does not exist in `apps/ptah-extension-webview/src/styles.css` (only `--ptah-icon-sm` and `-xs` are used).
- Header layout of both modals: `flex items-center gap-2`, the `h2` has `min-w-0 flex-1`, so Close stays at the right.
- Catalog header: a Close button (`ptahIconButton`, `label="Close"`, lucide `X` with `aria-hidden`,
  `data-testid="provider-catalog-close"`) after the `ESC` hint. It calls `closed.emit()`, the path of Esc and the backdrop.
  It is after the search in the DOM, so `showModal()` still focuses the search first. Test ids `provider-catalog-modal`
  and `provider-catalog-body` are kept. One new test id: `provider-catalog-close`.

Tests:
- Add-cli and tier shell tests: the title icon is `aria-hidden` and is immediately before the `h2`. Add-cli also asserts
  that the Close icon is `aria-hidden`.
- Catalog: new test "the header Close button comes after the search and asks the parent to close, the same as Esc"
  (label, `aria-hidden` icon, search first and Close last in the header, one `closed` event).

Checks:
| Command | Exit | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` + the 3 modal specs | 0 | 61 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | 0 errors |
| `npx eslint` + the 8 changed files | 0 | 0 errors |

Logs: `.ptah/tmp/lane-p-jest2.log`, `lane-p-tsc-lib2.log`, `lane-p-eslint2.log`.

Not run: `tsconfig.spec.json` type check (not in the check list of this follow-up), `typecheck-templates` (coordinator),
a rendered check.

Added to the Electron visual check: the title icons in both themes, and the catalog header at 800x600 (search, `ESC`
hint and Close on one line, the search has focus when the modal opens).
