# Design-system plan: one owner per control family

Date: 2026-11-10. Task: TASK_2026_924_8ac1. Scope: the Electron renderer
(`apps/ptah-extension-webview` and `libs/frontend/*`). This document is a plan. It changes no
production code.

Input: `renderer-component-inventory.md` (this folder), TASK_2026_904 (component system, top-down
plan) and TASK_2026_919_8ffc (Settings forms, pull request #1056).

## 1. Goal and rules

The goal is one consistent application. Each control family has one owner in `libs/frontend/ui`.
A feature lib gives data and handlers. A feature lib does not write control markup or DaisyUI
control classes.

The user approved these rules on 2026-11-10. This plan does not reopen them.

1. Work family by family across the full renderer, not page by page.
2. Three layers: tokens, behavior, components.
3. Extract first behind a DOM-equality gate. Change the look one time per family after that.
4. A lint ratchet closes each completed family. The violation count can only go down.
5. One gallery page in Electron shows each component in each state and theme.
6. Forms: no native select at the end, a rich select, floating-label inputs, built in Angular
   with the CDK. HyperUI and Preline are a visual reference only.

## 2. What exists today

The plan extends these items. It does not build them again.

| Item | Location | State |
|---|---|---|
| Lint ratchet | `tools/ui-class-audit/check-ui-classes.ts`, `baseline.json`, Nx project `ui-class-audit` | Blocks 8 class roots outside `libs/frontend/ui`: `alert`, `badge`, `btn`, `card`, `input`, `select`, `skeleton`, `textarea`. Baseline: 5572 tokens in 451 files. |
| Gallery | Route `ui-gallery` in `apps/ptah-extension-webview/src/app/app.routes.ts`, component `ui-gallery.component.ts` | Electron only (`canMatch: [electronOnlySurface]`), `data: { standalone: true }`. No product navigation links to it. |
| Pixel gate | `apps/ptah-electron-e2e/src/visual-parity/**`, `visual-parity.config.ts` | Playwright-Electron harness from TASK_2026_904 Wave 1. Zero changed pixels on the source page. |
| Extracted components | `libs/frontend/ui/src/lib/extracted/` | `ptahSetupAction`, `ptahRailIconAction`, `ptahSetupField` (TASK_2026_904 Wave 1). |
| Generic components | `libs/frontend/ui/src/lib/foundation/`, `surfaces/` | `ptahButton`, `ptahFieldControl`, `ptah-field`, `ptah-state-panel`, `ptah-page-header`, `ptah-toolbar`, `ptah-list-row`, `ptah-ui-status-badge`, `ptah-meter`, surface cards (pull request #1028). |
| Native components | `libs/frontend/ui/src/lib/native/`, `overlays/`, `selection/` | Modal, drawer, popover, dropdown, autocomplete, option, tab group, card, marks, Floating UI and keyboard services. |
| Settings forms work | TASK_2026_919_8ffc worktree | `extracted/settings-field` and `forms/{field,select,shared}` contracts, not exported at this time. |
| Behavior packages | `package.json` | `@angular/cdk` 22.2, `@angular/aria` 22.2.6, Floating UI. No new dependency is necessary. |

The style sheet `apps/ptah-extension-webview/src/styles.css` has 419 custom-property
declarations. They cover motion (`--ptah-motion-*`), glass (`--glass-*`), brand
(`--ptah-gold-*`), state ink (`--state-ink-*`), surface borders and elevation. Height tokens
exist (`--btn-height-xs|sm|md` 24, 28, 32 px and `--input-height` 32 px, `styles.css:86-89`), but
no template in a feature lib reads them. No token sets control radius, control padding or a
shared focus ring (only `--glass-focus` and `--composer-focus-ink`). Each feature writes these
values as utility classes.

Inside `libs/frontend/ui`, the older CDK layer (`overlays/` and `selection/`: `ptah-dropdown`,
`ptah-popover`, `ptah-autocomplete`, `ptah-option`) has 0 uses outside the lib. The native layer
replaced it. Three button recipes exist (`ptahButton`, `ptahSetupAction`, `ptahRailIconAction`),
two card APIs (`ptah-native-card` 13 uses, `ptah-surface-card` 2 uses) and three badge
components. The gallery shows only the `foundation/` and `surfaces/` layer.

## 3. The three layers

### 3.1 Tokens

Add the control tokens to `apps/ptah-extension-webview/src/styles.css` on `:root`. Each token
gets its value from a DaisyUI theme variable or an existing Ptah token, so each theme works.
Batch 0 adds a token only when a family in this plan reads it.

| Token | Purpose | First value (source) |
|---|---|---|
| `--ptah-control-h-xs` | Height of dense controls (rows, toolbars) | 1.5rem (`btn-xs`, replaces `--btn-height-xs`) |
| `--ptah-control-h-sm` | Height of compact controls | 2rem (`btn-sm`, `input-sm`); 2.25rem for the compact field (919 decision) |
| `--ptah-control-h-md` | Default height of a field | 3.25rem (919 decision, floating label) |
| `--ptah-control-radius` | Radius of buttons and fields | DaisyUI `--rounded-btn` |
| `--ptah-surface-radius` | Radius of cards, dialogs, menus | DaisyUI `--rounded-box` |
| `--ptah-chip-radius` | Radius of badges and chips | DaisyUI `--rounded-badge` |
| `--ptah-control-px`, `--ptah-control-gap` | Horizontal padding, icon gap | From the extracted button source |
| `--ptah-focus-ring-color`, `--ptah-focus-ring-width`, `--ptah-focus-ring-offset` | One focus ring | `--glass-focus` when glass is on, DaisyUI primary if not |
| `--ptah-field-bg`, `--ptah-field-border`, `--ptah-field-border-hover` | Field shell colors | `--glass-input-*`, `--surface-border-*` |
| `--ptah-state-ok`, `--ptah-state-warn`, `--ptah-state-err`, `--ptah-state-info` | Status colors for badge, alert, field error | Existing `--state-ink-run|need|err|done`, then DaisyUI `success`, `warning`, `error`, `info` |
| `--ptah-text-muted` | Hint and helper text | Existing `text-base-content-muted` utility |
| `--ptah-overlay-z-*` | Order of menu, dialog, toast, tooltip | Values in use in `native/` |
| `--ptah-density` | Switch between comfortable and compact | 1 (comfortable) |

Rule from TASK_2026_904 that stays: a token is not a design step. A token records a value that
two or more extracted sources share.

### 3.2 Behavior

Behavior has no look. One implementation per behavior, in `libs/frontend/ui`.

| Behavior | Implementation | Families that use it |
|---|---|---|
| Anchored overlay in the top layer | Existing Floating UI service and `popover` attribute in `native/popover` | select, menu, combobox, popover, tooltip |
| Listbox, option, typeahead, roving focus | `@angular/aria` (listbox, combobox, menu, tabs) | select, combobox, menu, tabs, segmented control |
| Modal focus trap, restore focus, Escape | Native `<dialog>` in `native/modal`, `native/drawer` | dialog, drawer, confirm dialog |
| Live region | One `aria-live` host | toast, inline status, field error |
| Value contract | `value = model<T>()` (919 decision). No ControlValueAccessor in new code. | all form controls |

The 919 decision D7 stays: use `@angular/aria` in the combobox only after a parity test with the
current keyboard service passes.

### 3.3 Components

A component owns the look of one family. It reads tokens and uses one behavior. Its API takes
data and gives events. It does not take class strings, except one `class` on the host for
layout (margin, grid position, width).

## 4. Method for each family

Each family goes through the same four steps. Each step is one or more small pull requests.

1. **Extract.** Take the best current markup as it is and move it into `libs/frontend/ui`.
   The source is a polished page when one exists (TASK_2026_904 tier map: chat, canvas, voice,
   setup wizard and onboarding). Adopt the component on the source first.
2. **Adopt.** Replace the duplicates, lib by lib. Order: poor pages (machines, reviews), then
   semi pages (marketplace, Thoth, tasks, Settings, analytics, apps, command center), then the
   remaining polished pages.
3. **Close.** Add the ratchet rule for the family. Lower the baseline after each adoption batch.
4. **Restyle.** Change the look one time, in the component and the tokens only. The user reviews
   the gallery in Electron before the merge.

### 4.1 Gates

| Gate | Applies to | Pass condition |
|---|---|---|
| DOM equality | Each extract and adopt batch | A Jest test renders the consumer before and after the change. The serialized DOM is equal after normalization (Angular scope attributes, comment nodes, generated ids). The snapshot of the old markup is committed first, in the same pull request. Method origin: TASK_2026_919 phase 2 (`phase2/batch-01-*.md`). |
| Zero pixel | A batch that touches a polished source page | The visual-parity harness reports 0 changed pixels on each source state. Run it under `node scripts/verify.mjs --exec`. |
| Declared DOM delta | An adopt batch where the old markup differs from the owner (a different class recipe) | The pull request lists each class that changes and why. A screenshot pair in Electron shows the consumer before and after. This is the only step where a consumer page can change its look before step 4. |
| Accessibility | Each extract batch | The component spec asserts name, role, keyboard path and focus ring. The gaps that the inventory lists for the family are closed or listed as open. |
| Gallery | Each extract and restyle batch | The gallery shows the component in each state. The gallery spec renders it. |
| Scoped checks | Each batch | `npm run verify -- -p <ui>,<consumer>,ui-class-audit`. Never a workspace-wide run. |

### 4.2 Batch size

- One batch has a maximum of six write files and two Nx projects (`@ptah-extension/ui` and one
  consumer lib). This is the 919 limit.
- One batch is one pull request. Batches of the same family are file-disjoint, so two lanes can
  work at the same time.
- Shared files have one owner, the coordinating session: `libs/frontend/ui/src/index.ts`, the
  group `index.ts` files, `ui-gallery.component.ts`, `tools/ui-class-audit/*` and `styles.css`.
  A lane reports the lines that it needs in these files. It does not edit them.
- Large libs split by folder. Examples: `chat` splits into `chat-input`, `session-inspector`,
  `execution`, `templates`. `marketplace`, `onboarding` and `tasks-ui` split by component folder.

## 5. Family order

The order uses three inputs: count, reach across pages, and dependency. Tokens, the gallery and
the ratchet come first because each family uses them. Counts are from the inventory. "Ratchet
baseline" is the sum in `tools/ui-class-audit/baseline.json` at commit `f26db123d`.

| Order | Family | Count in renderer | Ratchet baseline | Reach | Why this position |
|---:|---|---|---|---|---|
| 0 | Tokens, gallery, ratchet, gate | not applicable | 5572 total | all | Each family depends on them. |
| 1 | Button and icon button | 1489 `<button>` tags | `btn` 3531 | 26 of 26 lib groups | Largest family. Dialogs, alerts, menus, cards and rows contain buttons. |
| 2 | Field shell, text input, textarea | 241 `<input>` (141 are not checkbox or radio), 31 `<textarea>` | `input` 336, `textarea` 49 | 22 lib groups | Work is in progress (919). The select trigger and the combobox use the field shell. |
| 3 | Toggle, checkbox, radio | 74 checkbox, 26 radio | none today | 18 lib groups | Small and fast. Same field label and hint as family 2. |
| 4 | Select, combobox, menu | 67 `<select>`, 42 menu, listbox or combobox roles, 36 DaisyUI menu or dropdown class attributes | `select` 110 | 15 lib groups | Closed user decision (no native select). Needs family 2 and the overlay behavior. |
| 5 | Badge, chip, status | 259 class attributes | `badge` 772 | 18 lib groups | Second largest ratchet root. No dependency. |
| 6 | Spinner, skeleton, empty state | 130 `loading`, 34 `animate-spin`, 251 skeleton or pulse | `skeleton` 96 | 16 lib groups | Buttons (busy state), tables and cards use the spinner. |
| 7 | Alert, banner, toast | 78 `alert` class attributes, 571 `role="alert"` or `role="status"` | `alert` 174 | 25 lib groups | Uses buttons, status tokens and the live region. |
| 8 | Dialog, drawer, popover, tooltip | 40 `<dialog>`, 65 `modal`, 669 `title` attributes | none today | 24 lib groups | Uses buttons. Components exist in `native/`. Mainly adoption and one tooltip. |
| 9 | Tabs and segmented control | 71 tab, 48 `join` | none today | 13 lib groups | Uses buttons. One source (`electron-shell`) and `native/tab-group` exist. |
| 10 | Card, panel, section header | 188 glass surfaces, 27 `card`, 88 collapsible | `card` 22 | all page libs | Highest number of distinct looks. Needs families 1, 5 and 6 inside it. |
| 11 | Table and list row | 24 `<table>`, 241 `<li>` | none today | 21 lib groups | Uses badges, buttons and cards. Largest layout risk. |
| 12 | Avatar and mark | 62 mark tags | none today | 6 lib groups | Owners exist (`ptah-brand-mark`, `ptah-provider-mark`, `ptah-monogram-tile`). Only a ratchet rule. |
| 13 | Other: stat, stepper, link, meter, kbd | about 160 | none today | about 12 lib groups | Low count for each item. Do them when a page needs them. |

Families 5, 6 and 7 do not depend on families 2 to 4. A second lane can do them at the same
time as the form families, because the write sets are disjoint.

## 6. Plan for each family

Each section gives the extraction source, the duplicates that the family removes, an API sketch,
the gate and the ratchet rule. An API sketch shows intent. The extract batch sets the final API
from the source markup.

### 6.0 Batch 0: tokens, gallery, ratchet, gate

- **Tokens:** add the tokens of section 3.1 that families 1 and 2 read. No visual change: each
  token starts with the value in use.
- **Gallery:** keep the route `ui-gallery`. Split the page into one section component per family
  in `apps/ptah-extension-webview/src/app/ui-gallery/`. Add a theme switch and a density switch
  to the page. Each section shows each variant, size and state (default, hover, focus, disabled,
  busy, error).
- **Out of navigation:** the route stays Electron only and has no link in the product
  navigation. `app.routes.spec.ts` gets an assertion that no navigation item points to
  `ui-gallery`. Open it with the route address during a review.
- **Ratchet:** extend `tools/ui-class-audit/check-ui-classes.ts` with two abilities. First, a
  list of blocked roots that can grow one family at a time. Second, a tag rule that counts raw
  tags (`<select>`, `<dialog>`, `<table>`) and attribute patterns (`type="checkbox"`, `title=`).
  Each new rule gets its baseline from the `update-baseline` target in the same pull request.
- **Gate:** add one DOM-normalization helper for Jest (shared test utility in
  `libs/frontend/ui`), so each batch uses the same comparison.

### 6.1 Button and icon button

- **Source:** `ptahSetupAction` (`libs/frontend/ui/src/lib/extracted/setup-action/`, from
  onboarding) for the text button. `ptahRailIconAction` (`extracted/rail-icon-action/`, from the
  canvas rail) for the icon button. The chat send and stop buttons (TASK_2026_904 Wave 1b) for
  the primary action in a composer.
- **Duplicates removed:** 416 raw class recipes (sum of the three lanes, an upper limit). The five largest are
  `btn btn-ghost btn-xs` (167), `btn btn-ghost btn-sm` (68), `btn btn-primary btn-sm` (54),
  the button with no class (83) and `btn btn-ghost btn-square btn-xs` (13). The generic
  `ptahButton` (pull request #1028) merges into the owner. See user decision U3.
- **API sketch:**

  ```ts
  // button[ptahButton], a[ptahButton]
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger' | 'link'>('secondary');
  size = input<'xs' | 'sm' | 'md'>('sm');
  busy = input(false);            // shows the spinner, sets aria-busy, blocks a second click
  // button[ptahIconButton]: the same inputs and
  label = input.required<string>(); // becomes aria-label and the tooltip text
  ```

- **Gate:** DOM equality on each adopt batch. Zero pixel on onboarding, canvas rail and chat.
  The recipes that differ from the owner (for example `btn-outline`, `btn-circle`) use the
  declared-delta gate, or become a variant when three or more libs use them.
- **Ratchet:** root `btn` exists. Baseline 3531 (`chat` Settings 839, `chat` 404, marketplace
  345, onboarding 249, git-ui 245, chat-ui 215, tasks-ui 172). New tag rule: a `<button>` in a
  feature lib without `ptahButton`, `ptahIconButton` or an owner from another family. Estimate of
  the first baseline: 1464.
- **Accessibility closed here:** icon button without a name (11 on feature pages) and `title` as
  the only name (42). `label` is a required input, so the gap cannot come back.
- **Batches:** about 60, one per lib folder. Start: machines-ui, review-runs-ui, then
  skill-synthesis-ui and memory-curator-ui (the highest share of `btn btn-ghost btn-xs`).

### 6.2 Field shell, text input, textarea

- **Source:** 919 extraction sources. Field shell from
  `session-budget-settings.component.ts`. Text input from `provider-model-picker.component.ts`.
  The work in the 919 worktree (`extracted/settings-field`, `forms/field`) is the first batch.
  `ptahSetupField` (TASK_2026_904 E3) and `ptah-field` / `ptahFieldControl` (pull request #1028)
  merge into this owner.
- **Duplicates removed:** 51 input recipes outside Settings. The largest are
  `input input-bordered` (9), `input input-bordered input-sm` in two class orders (12) and
  `input input-bordered input-sm text-xs font-mono` (4). Textarea: 18 recipes for 25 elements.
- **API sketch:**

  ```ts
  // <ptah-field label hint error state>  projects one control
  label = input.required<string>();
  hint = input<string>();
  error = input<string>();
  state = input<'idle' | 'pending' | 'saved' | 'error'>('idle');
  density = input<'default' | 'compact'>('default');
  // input[ptahInput], textarea[ptahTextarea]: value = model<string>()
  // slots: [ptahFieldPrefix], [ptahFieldSuffix]
  // <ptah-secret-input>: masked value, reveal button, saved state
  // <ptah-search-input>: search icon, clear button (11 search bars use `join` today)
  ```

- **Gate:** DOM equality. The floating label is step 4 (restyle), not step 1.
- **Ratchet:** roots `input` (336) and `textarea` (49) exist. New tag rule: `<input>` (not
  checkbox, radio, hidden, file) and `<textarea>` in a feature lib without `ptahInput` or
  `ptahTextarea`.
- **Accessibility closed here:** input without a label (5 in chat, 29 candidates on feature
  pages). `label` is required.
- **Exception:** the chat composer textarea (`chat-input.component.ts:283`) keeps its own look.
  It uses the tokens and the focus ring only. See user decision U2.

### 6.3 Toggle, checkbox, radio

- **Source:** 919 sources. Toggle and checkbox from `plugin-catalog-panel.component.ts`. Radio
  from `install-scope-field.component.ts`.
- **Duplicates removed:** 27 recipes. `checkbox checkbox-sm` (10), `checkbox checkbox-xs`
  (10), `toggle toggle-sm toggle-primary` (5), `toggle toggle-xs` (2), inputs with no style (6).
- **API sketch:**

  ```ts
  // <ptah-toggle>, <ptah-checkbox>: checked = model(false); label = input.required<string>();
  //   hint, disabled, size: 'xs' | 'sm'
  // <ptah-radio-group value = model<T>() label orientation> with <ptah-radio [value] label hint>
  ```

- **Gate:** DOM equality. One toggle look after step 4 (919 decision D3).
- **Ratchet:** new roots `toggle`, `checkbox`, `radio`. New attribute rule `type="checkbox"` and
  `type="radio"`. Estimate of the first baseline outside Settings: 50 checkbox, 13 radio.
- **Accessibility closed here:** toggle without a name (3 in chat, 16 candidates on feature
  pages).

### 6.4 Select, combobox, menu

- **Source:** the select skin from `extracted/setup-field`. The combobox from
  `provider-model-search-field` and `native/autocomplete` (919). The menu from the glass menu in
  chat (TASK_2026_904 Wave 1b) and `native/dropdown`. The suggestions panel in chat
  (`unified-suggestions-dropdown.component.ts`) is the source for an option row with icon,
  description and badge.
- **Duplicates removed:** 67 native `<select>` (17 in Settings, 13 inside the ui lib, 37 in
  other feature code), 5 popover selects in Settings, about 20 custom menus (tasks-ui has the
  most: facet menus, card menus), DaisyUI `dropdown` and `menu` lists.
- **API sketch:**

  ```ts
  // <ptah-select [options] value = model<T>()>  inside <ptah-field>
  options = input.required<readonly SelectOption<T>[]>(); // label, value, icon?, hint?, group?, disabled?
  placeholder = input<string>();
  // <ptah-combobox>: the same and query = model(''), allowCustomValue = input(false), loading
  // <ptah-menu [trigger]> with <button ptahMenuItem>, <ptah-menu-group label>, separator,
  //   checkbox item and radio item
  ```

- **Behavior:** `@angular/aria` listbox, combobox and menu patterns in the existing top-layer
  popover. The trigger is a button inside the field shell, not a native select.
- **Gate:** a native select and `ptah-select` cannot have equal DOM. This family uses a
  behavior-parity test in place of DOM equality: the same options, the same value events, the
  full keyboard path, the same accessible name. Zero pixel applies to the closed trigger on
  polished pages.
- **Ratchet:** root `select` exists (110). New tag rule `<select>`. New roots `dropdown`,
  `dropdown-content`, `menu`. The target for `<select>` is zero in feature libs and in the ui
  lib.
- **Accessibility closed here:** custom menu without role or keyboard handler (3 in chat, 20
  candidates on feature pages).

### 6.5 Badge, chip, status

- **Source:** `ptah-ui-status-badge` (`foundation/status-badge`), `ptah-file-status-badge`
  (`native/`), `ptah-delivery-status` and `ptah-workflow-badge` (local to chat).
- **Duplicates removed:** 197 raw recipes. `badge badge-sm`, `badge badge-ghost badge-sm`,
  `badge badge-outline badge-sm|xs`, state colors in three sizes, and the status dot
  (`h-2 w-2 rounded-full`, 28 uses).
- **API sketch:**

  ```ts
  // <ptah-badge tone size appearance>text</ptah-badge>
  tone = input<'neutral' | 'info' | 'ok' | 'warn' | 'err' | 'accent'>('neutral');
  appearance = input<'soft' | 'outline' | 'solid'>('soft');
  size = input<'xs' | 'sm'>('sm');
  // <ptah-status-dot tone label>, <ptah-chip removable (removed)>, <ptah-count-badge [count]>
  ```

- **Gate:** DOM equality for the recipes that map 1 to 1. Declared delta for the others.
- **Ratchet:** root `badge` exists. Baseline 772 (chat 166, Settings 147, chat-ui 85, tasks-ui
  71, marketplace 66).

### 6.6 Spinner, skeleton, empty state

- **Source:** `ptah-state-panel` (`foundation/`) for the empty, error and busy states of a
  panel. The spinner recipe `loading loading-spinner loading-xs` (74 uses in chat and the feature page libs) for the spinner.
- **Duplicates removed:** spinners in two systems (DaisyUI `loading` 130, Lucide icon with
  `animate-spin` 34), skeleton blocks (`skeleton`, `animate-pulse`), and empty-state paragraphs
  with no shared structure. `ptah-state-panel` has 0 uses on the 17 feature page libs.
- **API sketch:**

  ```ts
  // <ptah-spinner size label>   label is the accessible name
  // <ptah-skeleton shape="text|block|circle|row" [count]>
  // <ptah-empty-state icon title description> with projected actions
  // <ptah-state-panel state="loading|empty|error|ready"> keeps its API and uses the three above
  ```

- **Ratchet:** root `skeleton` exists (96). New roots `loading`, `animate-spin`,
  `animate-pulse` (first baseline estimate: 127, 34, about 150).

### 6.7 Alert, banner, toast

- **Source:** `ptah-auth-required-banner` and the banners in chat for the banner. The
  notification-center lib for the toast. The inline error text `text-error` at size `text-xs` or `text-sm` (26 uses) for
  the inline message.
- **Duplicates removed:** DaisyUI `alert` recipes (marketplace 43, setup-wizard 26,
  review-runs-ui 20, skill-synthesis-ui 17) and many `<p>` messages with `role="alert"` or
  `role="status"` and custom classes.
- **API sketch:**

  ```ts
  // <ptah-alert tone title dismissible (dismissed)> body and projected actions
  // <ptah-banner tone>  page-level, full width
  // <ptah-inline-message tone>  one line below a control or in a row, uses the live region
  // ToastService.show({ tone, title, body, action? })  one toast host in the app shell
  ```

- **Ratchet:** root `alert` exists (174). New root `toast`.

### 6.8 Dialog, drawer, popover, tooltip

- **Source:** `native/modal`, `native/drawer`, `native/popover` and `ptah-confirmation-dialog`
  (chat, 3 uses). The owners exist. This family is mainly adoption.
- **Duplicates removed:** 40 native `<dialog>` elements with the recipe `modal modal-open` and
  local action rows (`modal-action`, 9), 3 local confirm dialogs, and drawers written by hand.
  The tooltip has no owner: 669 `title` attributes do this work and 3 DaisyUI tooltips exist.
- **API sketch:**

  ```ts
  // <ptah-dialog [open] (closed) title size> body, [ptahDialogActions]
  // ConfirmService.confirm({ title, body, confirmLabel, tone }) : Promise<boolean>
  // <ptah-drawer side size title>, <ptah-popover [anchor]>
  // [ptahTooltip]="text"  directive, top layer, keyboard focus opens it
  ```

- **Gate:** DOM equality for dialog and drawer. The tooltip is a declared delta (see U4).
- **Ratchet:** new tag rule `<dialog>`. New roots `modal`, `modal-box`, `modal-action`,
  `drawer`, `tooltip`. A `title=` rule only if the user approves U4.
- **Accessibility closed here:** dialog without a label (3 in chat, 1 in chat-ui, 1 in setup-wizard). `title`
  is a required input.

### 6.9 Tabs and segmented control

- **Source:** the tab strip in `electron-shell.component.ts` (17 elements, 3 looks) and
  `native/tab-group`. The segmented control from the `join` button groups (48 class attributes in 8 lib groups, most in
  memory-curator-ui and dashboard) and the 3 segmented controls in Settings.
- **API sketch:**

  ```ts
  // <ptah-tabs value = model<string>()> with <ptah-tab value label icon badge>
  // <ptah-segmented [options] value = model<T>() size label>
  ```

- **Behavior:** `@angular/aria` tabs. The segmented control is a radio group.
- **Ratchet:** new roots `tab`, `tabs`, `join`, `join-item`.

### 6.10 Card, panel, section header

- **Source:** the onboarding section recipe (`section rounded-[22px] border border-base-300`,
  13 uses) and the glass surfaces of chat. The owners `ptah-surface-card`,
  `ptah-surface-section`, `ptah-surface-tile`, `ptah-stat-card`, `ptah-native-card`,
  `ptah-catalog-card`, `ptah-page-header` and `ptah-toolbar` exist. They have 65 uses, 23 of
  them in the gallery.
- **Work:** adoption and the removal of overlap between `native/card` and `surfaces/`. This
  family has the most distinct looks (248 raw recipes for 440 elements), so most elements are one of a
  kind. The first batch must reduce the looks to a short list of variants in the gallery, and
  the user approves that list (U1) before adoption.
- **API sketch:** `<ptah-card variant="plain|glass|outline" padding>`, `<ptah-section title
  description>` with projected actions, `<ptah-collapsible title [open]>` (replaces `collapse`
  and `<details>`), `<ptah-page-header>` and `<ptah-toolbar>` as they are.
- **Ratchet:** root `card` exists (22). New roots `collapse`, `stat`. An attribute rule for
  `data-glass-surface` outside the ui lib (first baseline estimate: 188).

### 6.11 Table and list row

- **Source:** `ptah-list-row`, `ptahInboxRow`, `ptah-list-detail`, `ptah-inbox-layout`
  (`foundation/`, `surfaces/`). Tables: the CLI matrix in Settings and
  `review-findings-table.component.ts`.
- **API sketch:** `<ptah-list>` and `<ptah-list-row selected interactive>` with slots for
  leading, title, meta and actions. `table[ptahTable]` with `density` and sticky header. A table
  with sort or selection uses the CDK table only when a page needs it.
- **Ratchet:** new tag rule `<table>`. New roots `table`, `menu-title`.
- **Accessibility closed here:** clickable `div` without role or keyboard (2 in chat, 3 on
  feature pages). An interactive row renders a button or a link.

### 6.12 Avatar and mark, and other controls

- Owners exist: `ptah-brand-mark`, `ptah-provider-mark`, `ptah-monogram-tile`, `ptah-mark-svg`.
  Add `ptah-avatar` only for the chat transcript image (`avatar chat-image`, 1 use).
- Other: `ptah-meter` exists. Add `ptah-stat` (61 class attributes with DaisyUI `stat` parts), `ptah-stepper`
  (onboarding has a local one with 9 uses), `a[ptahLink]`, and `ptah-kbd` when their turn comes.
- **Ratchet:** new roots `avatar`, `stat`, `steps`, `link`, `progress`, `kbd`.

## 7. How TASK_2026_904 and TASK_2026_919 merge into this plan

| Task | State today | In this plan |
|---|---|---|
| TASK_2026_904 | Wave 1 merged (3 extractions, 2 consumer libs). Wave 1b offered, not started. | Close it after Wave 1. Wave 1b does not start as a separate wave. Its items move: chat send and stop to family 1, composer layout to family 2 (exception in 6.2), suggestions frame and glass menu to family 4. Its tier map (`polish-map.md`), its zero-pixel gate and its rule "extract as is from a polished page" stay in force as step 1 of each family. |
| TASK_2026_919_8ffc | Pull request #1056 open. Inventory (114 controls), plan and phase 2 batch 01 (field shell). | It continues as the Settings stream of families 2, 3 and 4. Its inventory and decisions stay valid. Its `forms/` contracts and `extracted/settings-field` become the first batch of family 2. Its later batches follow the family order of this plan, not a tab order. Its open decisions D3 and D5 to D8 move to section 9. |
| Pull request #1028 generics | `ptahButton`, `ptahFieldControl`, `ptah-field`, `ptah-state-panel`, `ptah-page-header`, `ptah-toolbar`, `ptah-list-row` | Each one merges into the owner of its family when that family starts. The name can stay. The look comes from the extracted source. |

**Owner of `libs/frontend/ui`:** TASK_2026_924_8ac1 is the umbrella task from now on. Each family
is a child task of it (`parent: TASK_2026_924_8ac1`). Only the session that coordinates the
umbrella edits the shared files listed in section 4.2. TASK_2026_919_8ffc becomes a child task
after pull request #1056 merges. No other task adds a component to `libs/frontend/ui` without a
row in this plan.

**What was in conflict:** TASK_2026_904 said "do not put generic components on polished pages"
and "zero pixel". The approved method says "then change the look one time per family". The two
agree when they are in sequence. Steps 1 to 3 keep each page as it is (904 rule). Step 4 changes
the look in one place, with user review in the gallery, and the polished pages change with it
(see U2).

## 8. Risks

| Risk | Effect | Control |
|---|---|---|
| Counts are source-level and partly approximate | A batch plan is too small or too large | The ratchet baseline is the measured number. Each family starts with an `update-baseline` run for its new rules. |
| Many one-of-a-kind recipes (cards, banners, rows) | DOM equality fails for most adoptions | Declared-delta gate with screenshots. Approve the variant list in the gallery first. |
| The ratchet counts classes, so a wrapper with the same classes hides a duplicate | False progress | Tag rules count raw tags. Feature libs cannot use `<button>`, `<input>`, `<select>` without an owner directive. |
| Two tasks write `libs/frontend/ui` at the same time | Merge conflicts in index files and the gallery | One owner for shared files. Lanes report the lines that they need. |
| Step 4 changes polished pages | The user does not accept the new look | Gallery review before the merge. One pull request per family, so a revert is one commit. |
| `@angular/aria` behavior differs from the current keyboard service | Keyboard regressions in chat (suggestions, model picker) | Parity test first (919 D7). Chat adopts last in family 4. |
| About 60 button batches | Long calendar time, review load | Parallel lanes on disjoint libs. Mechanical batches, same review checklist. The ratchet shows progress per lib. |
| 4 Ptah themes, the stock DaisyUI themes, and glass on or off | A token works in one theme only | Each token reads a theme variable. The gallery has the theme switch. Visual review in Electron on a dark, a light and a glass state. |
| VS Code host uses the same renderer | A change for Electron breaks the other host | No host-specific code in components. The scoped checks include `ptah-extension-webview`. |
| Memory limits of the developer machine | Wide runs stop the machine | Only `npm run verify -- -p ...` and the verify lock. One heavy run per lane. |

## 9. Decisions

### 9.1 Decisions of this plan

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| P1 | Extend the existing ratchet and the existing gallery. | Extend, or build new ones | Both exist and are in CI (`ui-class-audit` lint target, route `ui-gallery`). | Yes |
| P2 | Button family first after batch 0. | Button first, or forms first | `btn` is 63 % of the ratchet baseline (3531 of 5572) and each later family contains buttons. Forms work continues in parallel in the 919 stream, so the order does not stop it. | Yes |
| P3 | DOM equality is the default gate. Zero pixel applies only when a batch touches a polished source. | Zero pixel on each batch, or DOM equality | The pixel harness needs a built Electron app and one verify slot per run. DOM equality runs in Jest. | Yes |
| P4 | A declared-delta gate exists for adoptions where the old recipe differs. | Never change a consumer before step 4, or permit a declared delta | The inventory shows 416 raw button recipes. Without this gate, the owner must copy each recipe as a variant. | Yes |
| P5 | Tag rules in the ratchet, not only class roots. | Class roots only, or class roots and tags | 83 buttons and 6 selects have no class, so a class rule does not see them. | Yes |
| P6 | The select family uses behavior parity in place of DOM equality. | Keep the native select until step 4, or replace in step 1 with parity | The closed user decision removes the native select. Equal DOM is not possible. | No (the native select goes away) |
| P7 | One umbrella task owns `libs/frontend/ui` and the shared files. | One umbrella, or one task per page area | Two tasks (904, 919) wrote the same lib in the same week. | Yes |
| P8 | Batch limit: six write files, two Nx projects, one pull request. | Larger batches by lib, or the 919 limit | The 919 limit is in use and matches the memory rules. | Yes |

### 9.2 User-reserved decisions

The plan continues with the recommendation until the user gives a different answer. No batch
that depends on an open decision merges before the answer.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| U1 | Visual direction for the families that have no stated direction (button, badge, alert, card, tabs, table). | (a) Keep the look of the polished pages (onboarding buttons, chat glass) as the final look. (b) New direction for each family, shown in the gallery first. | (a) for steps 1 to 3. Decide (b) family by family at step 4, in the gallery. |
| U2 | Can step 4 change the look of the polished pages (chat, canvas, voice, setup wizard and onboarding)? | (a) Yes, each family has one look in the full application. (b) No, polished pages keep a variant of their own. | (a), with two exceptions that keep their look: the chat composer and the canvas rail. |
| U3 | Removal of overlap inside `libs/frontend/ui`: `native/` against `overlays/` and `selection/`, `ptah-field` and `ptahSetupField` against the new field shell, `native/card` against `surfaces/`. | (a) Merge into one owner per family and delete the others after adoption. (b) Keep all and mark the old ones deprecated. | (a). Each deletion is its own pull request with a preserve list. |
| U4 | Replace native `title` tooltips (669) with a shared tooltip. | (a) Replace all. (b) Replace only on icon buttons (the `label` input gives it). (c) Keep `title=`. | (b). It closes the accessibility gap with no bulk edit. |
| U5 | New dependency. | (a) None. (b) Add a table or virtual-scroll package later. | (a). `@angular/cdk`, `@angular/aria` and Floating UI cover each family. |
| U6 | Density. | (a) One comfortable density and a compact one for dense areas (session inspector, task board, CLI matrix). (b) One density. | (a). The inventory shows the `xs` size in 167 ghost buttons, so a dense size is necessary. |
| U7 | Close TASK_2026_904 after Wave 1 and fold Wave 1b into families 1, 2 and 4. | (a) Close and fold. (b) Run Wave 1b first as planned. | (a). |
| U8 | Settings decisions that 919 left open: D3 (one toggle look `toggle-sm toggle-primary`), D5 (popover selects become `ptah-select`), D6 (one combobox with `allowCustomValue`), D7 (`@angular/aria` in the combobox after a parity test), D8 (the model search field becomes a wrapper of `ptah-combobox`). | Accept each 919 recommendation, or change it. | Accept all five. They agree with this plan. |
| U9 | Does the VS Code host get the restyle at the same time? | (a) Yes, same renderer. (b) Electron first, the other host later behind a flag. | (a). A flag doubles the looks that the gallery must show. |

## 10. First steps after approval

1. Create the child task for batch 0 (tokens, gallery sections, ratchet tag rules, DOM helper).
2. Start family 1 with the extract batch on onboarding and canvas, then machines-ui and
   review-runs-ui.
3. In parallel, merge the 919 field-shell batch as the first batch of family 2.
4. Start family 5 (badge) on a second lane when batch 0 is merged.
