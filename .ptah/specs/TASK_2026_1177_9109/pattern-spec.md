# Pattern layer spec: `libs/frontend/ui/src/lib/patterns`

Task: TASK_2026_1177_9109. Phase: P0 (spec only).
Host priority: Electron. Renderer: `apps/ptah-extension-webview`.

## 0. Scope and rules

### 0.1 Layers

| Layer | Folder | Owns | Must not |
| --- | --- | --- | --- |
| 1 Primitives | `ui/src/lib/{form-controls,button,badge,surfaces,card,foundation}` | One control or one box look | Set layout between siblings |
| 2 Patterns (new) | `ui/src/lib/patterns` | All spacing, layout, states, a11y wiring | Own feature data or RPC |
| 3 Features | `chat/src/lib/settings/**` | Data, signals, copy, RPC calls | Use raw `gap-*`, `p-*`, `m-*`, `space-*` utilities |

### 0.2 Spacing rule

- Write spacing only with the token in an arbitrary value. Example: `gap-[var(--ptah-gap-field)]`.
- Do not write `gap-controls`. It is not a valid class.
- Do not use the Tailwind theme aliases (`gap-ptah-field`) in the pattern layer. The lib must not depend on the app Tailwind config for spacing.
- Container queries: CSS does not accept `var()` in a container query condition. Write the break width as a literal in the class, as `ptah-list-detail` does (`[@container(min-width:640px)]:...`). The spec gives each break width once (section 0.4).

### 0.3 Shared component rules

- Angular 22 standalone, `ChangeDetectionStrategy.OnPush`.
- Signal `input()`, `input.required()`, `output()`, `model()` only when two-way is necessary.
- `inject()` for services. No constructor injection.
- Content projection with attribute selectors. Slot names are in section headers below.
- Heading level input uses the existing type `PtahSectionLevel` (`2 | 3 | 4`) and the same `numberAttribute` transform as `PtahSectionHeaderComponent`.
- Host gets `data-ptah-pattern="<name>"` for tests and for the class audit in P5.
- Each id is unique. Use one module counter per pattern: `ptah-<name>-<n>`.
- Errors: use `<div class="alert alert-error" role="alert">` until `ptah-alert` ships. Another team owns `ptah-alert`, `ptah-skeleton` and `ptah-spinner`. This spec does not specify them.
- Motion: use `--ptah-duration-fast` and `--ptah-ease-standard`. Add `motion-reduce:transition-none` to each transition.

### 0.4 Break widths (container queries)

| Name | Width | Used by |
| --- | --- | --- |
| `form-split` | 640px | `ptah-form-section`, `ptah-description-list` |
| `layout-split` | 768px | `ptah-settings-layout` |

Each pattern host sets `[container-type:inline-size]`. The pattern reacts to its own width, not to the window. This works in the Electron window and in a narrow VS Code side panel.

### 0.5 Proposed new tokens

Do not edit `ptah-tokens.css` in P0. P1 adds these tokens in one new block `/* ---- Pattern layer (TASK_2026_1177_9109) ---- */`. The P1 file plan counts that edit.

| Token | Value | Purpose |
| --- | --- | --- |
| `--ptah-form-section-aside-w` | `16rem` | Width of the title column of `ptah-form-section` at `form-split` |
| `--ptah-form-section-fields-max-w` | `36rem` | Max width of the field column |
| `--ptah-dl-term-w` | `12rem` | Width of the term column of `ptah-description-list` at `form-split` |
| `--ptah-dl-row-min-h` | `var(--ptah-control-h-md)` | Min height of one key/value row. View mode and edit mode then have near equal row height. |
| `--ptah-dl-empty-fg` | `oklch(var(--bcm, var(--bc)))` | Color of the empty-value placeholder |
| `--ptah-settings-nav-w` | `13rem` | Width of the side nav at `layout-split` |
| `--ptah-settings-content-max-w` | `52rem` | Max width of the content column |
| `--ptah-settings-nav-item-h` | `var(--ptah-control-h-md)` | Height of one nav item |
| `--ptah-settings-nav-active-bg` | `var(--ptah-btn-selected-bg)` | Fill of the active nav item |
| `--ptah-settings-nav-active-edge` | `oklch(var(--p))` | 2px marker of the active nav item |
| `--ptah-form-actions-bg` | `var(--ptah-card-bg-raised)` | Fill of the sticky action bar. It is opaque, so content does not show through. |
| `--ptah-form-actions-shadow` | `var(--ptah-elevation-2)` | Shadow of the sticky action bar |
| `--ptah-dirty-fg` | `var(--ptah-state-warn)` | Ink of the dirty indicator dot and text |

All other values come from existing tokens.

---

## 1. `ptah-form-section`

A two-column row. Left: title and description. Right: fields. It stacks on a narrow width.

### 1.1 Anatomy

```
<section aria-labelledby=titleId>                     host: block, container
  ┌───────────── aside ─────────────┐┌──────── fields ────────┐
  │ <hN id=titleId> title           ││ [fields] slot          │
  │ <p id=descId> description       ││ ...                    │
  │ [aside] slot (help link, badge) ││ [footer] slot          │
  └─────────────────────────────────┘└────────────────────────┘
  ─────────── divider (only when divider=true) ──────────────
```

### 1.2 Tokens per slot

| Slot / part | Property | Token |
| --- | --- | --- |
| Host | padding block | `--ptah-gap-group` (top and bottom) |
| Host | divider | `border-bottom: var(--ptah-border-width) solid var(--ptah-border-color)` when `divider` |
| Grid (wide) | columns | `var(--ptah-form-section-aside-w) minmax(0, var(--ptah-form-section-fields-max-w))` |
| Grid (wide) | column gap | `--ptah-gap-section` |
| Grid (narrow) | row gap | `--ptah-gap-heading` |
| Title | type | `--ptah-text-section-title-size/leading/weight` |
| Title to description | gap | `--ptah-gap-label` |
| Description | type, color | `--ptah-text-hint-size/leading/weight`, `text-base-content-muted` |
| Aside slot | top gap | `--ptah-gap-controls` |
| Fields column | gap between fields | `--ptah-gap-field` |
| Footer slot | top gap | `--ptah-gap-group` |

### 1.3 States

| State | Visual and behavior |
| --- | --- |
| Default | Two columns at `form-split` or more. |
| Hover | No change. The section is not interactive. |
| Focus | No ring on the section. Fields show their own `--ptah-focus-ring-*`. |
| Disabled | `disabled` input sets `inert` and `aria-disabled="true"` on the fields column. Fields column opacity `--ptah-field-disabled-opacity`. The title stays at full contrast. |
| Saving | Not owned. `ptah-editable-section` owns it. |
| Error | `error` input (`string \| null`). Shows `alert alert-error` with `role="alert"` at the top of the fields column. The text id joins `aria-describedby` of the section. |
| Empty | When the fields slot is empty, the pattern shows nothing extra. A feature shows `ptah-state-panel` inside the slot. |
| Narrow | Below `form-split`: one column. Aside first, then fields. Fields take full width. |

### 1.4 Accessibility

- The host template renders `<section>` with `aria-labelledby` = title id.
- The title is a real heading. Level comes from `level` (default 3).
- `aria-describedby` = description id (and error id when present).
- Do not repeat the title as a field label.

### 1.5 TypeScript API

```ts
// libs/frontend/ui/src/lib/patterns/form-section/form-section.component.ts
@Component({
  selector: 'ptah-form-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-ptah-pattern': 'form-section', class: 'block [container-type:inline-size]' },
})
export class PtahFormSectionComponent {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly level = input<PtahSectionLevel, unknown>(3, { transform: toSectionLevel });
  readonly divider = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly error = input<string | null>(null);
  /** Read by ptah-editable-section to label its region. */
  readonly headingId: string; // `ptah-form-section-<n>-title`
}
```

Slots:

| Selector | Content |
| --- | --- |
| `[aside]` | Optional extra under the description: a badge, a doc link |
| default | Fields, `ptah-description-list` or `ptah-editable-section` |
| `[footer]` | Optional content under the fields, for example a danger button |

---

## 2. `ptah-description-list`

Read-only key/value rows for view mode. Each row has a term and a value. An empty value shows a placeholder.

### 2.1 Anatomy

```
<dl>                                        host: block, container
  <div row>  <dt> term </dt>  <dd> value | placeholder </dd>  [row actions] </div>
  <div row>  ...
</dl>
```

Two APIs give the rows. Use one per list.

1. Data API: the `items` input. The pattern renders the rows. Use it for plain text values.
2. Projection API: child `ptah-description-item` components. Use it when a value has a badge, a status dot, a chip list or a row action.

### 2.2 Tokens per slot

| Slot / part | Property | Token |
| --- | --- | --- |
| List | gap between rows | `0` with a row divider, or `--ptah-gap-controls` when `divided=false` |
| Row | min height | `--ptah-dl-row-min-h` |
| Row | padding block | `--ptah-gap-controls` |
| Row | divider | `border-bottom: var(--ptah-border-width) solid var(--ptah-border-color)` except on the last row, when `divided` |
| Row (wide) | columns | `var(--ptah-dl-term-w) minmax(0, 1fr) auto` |
| Row (wide) | column gap | `--ptah-gap-field` |
| Row (narrow) | gap term to value | `--ptah-gap-label` |
| Term | type, color | `--ptah-text-label-size/leading/weight`, `text-base-content-muted` |
| Value | type, color | `--ptah-text-body-size/leading/weight`, `text-base-content` |
| Value (mono) | font | `--ptah-font-mono`, `--ptah-text-code-size/leading` |
| Value inline items | gap | `--ptah-gap-inline` |
| Placeholder | color | `--ptah-dl-empty-fg`, italic off, text "Not set" |
| Row actions | gap | `--ptah-gap-controls` |

### 2.3 States

| State | Visual and behavior |
| --- | --- |
| Default | Term and value on one line at `form-split` or more. |
| Hover | No change. Rows are not interactive. A row action keeps its own `ptahButton` hover. |
| Focus | No focus on rows. Row actions get `--ptah-focus-ring-*`. |
| Disabled | Not applicable. View mode has no input. |
| Saving | Not applicable. The parent shows saving. |
| Error | Not owned. A per-value error is value content (for example a `ptahBadge tone="err"`). |
| Empty value | Value is `null`, `undefined` or `''` (after trim). Show `emptyText` (default "Not set"). Add `<span class="sr-only">` with the term + "not set" so a screen reader reads a full phrase. |
| Empty list | No rows. Show `emptyText` once in one row with no term. |
| Long value | `break-words` and `min-w-0`. No truncation by default. `truncate` item input adds `truncate` and a `title`. |
| Narrow | Below `form-split`: term above value. Row actions go below the value, at the start. |

### 2.4 Accessibility

- Use real `<dl>`, `<dt>`, `<dd>`. A row wrapper `<div>` inside `<dl>` is valid HTML.
- `ariaLabel` input sets `aria-label` on `<dl>` when the list has no visible heading near it.
- Status dots inside a value are `aria-hidden="true"`. The text next to the dot carries the meaning.

### 2.5 TypeScript API

```ts
export interface PtahDescriptionItem {
  readonly key: string;          // track key
  readonly term: string;
  readonly value: string | number | null | undefined;
  readonly mono?: boolean;
  readonly truncate?: boolean;
}

@Component({
  selector: 'ptah-description-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-ptah-pattern': 'description-list', class: 'block [container-type:inline-size]' },
})
export class PtahDescriptionListComponent {
  readonly items = input<readonly PtahDescriptionItem[] | null>(null);
  readonly divided = input(true, { transform: booleanAttribute });
  readonly emptyText = input('Not set');
  readonly ariaLabel = input<string | null>(null);
}

@Component({
  selector: 'ptah-description-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Renders the row wrapper with dt and dd. The parent dl gives the grid.
  host: { 'data-ptah-pattern': 'description-item', class: 'contents' },
})
export class PtahDescriptionItemComponent {
  readonly term = input.required<string>();
  /** When set and empty, the placeholder shows instead of the projected value. */
  readonly value = input<string | number | null | undefined>(undefined);
  readonly mono = input(false, { transform: booleanAttribute });
  readonly truncate = input(false, { transform: booleanAttribute });
}
```

Slots of `ptah-description-item`:

| Selector | Content |
| --- | --- |
| default | Rich value: text, `ptahBadge`, status dot + word, chip list |
| `[actions]` | Row action, for example a copy `ptahIconButton` |

Rule: `ptah-description-item` shows the placeholder when the `value` input is bound and empty, or when it is unbound and the default slot has no content. Detect projected content with a `contentChildren`-free method: wrap the slot in a `<span #valueSlot>` and read `childNodes.length` in `afterRenderEffect`.

---

## 3. `ptah-form-actions`

An action bar for Save and Cancel. It can be sticky. It can show a dirty indicator.

### 3.1 Anatomy

```
<div role="group" aria-label=label>                       host: block
  [status] slot or dirty indicator (● Unsaved changes)     [start] slot … [Cancel] [Save]
</div>
```

Buttons are projected. The bar does not create the buttons, so the feature keeps button labels and `type`. `ptah-editable-section` projects its own Save and Cancel (section 4).

### 3.2 Tokens per slot

| Slot / part | Property | Token |
| --- | --- | --- |
| Bar | layout | `flex flex-wrap items-center justify-end` |
| Bar | gap | `--ptah-gap-controls` |
| Bar | padding top (inline) | `--ptah-gap-group` |
| Bar (sticky) | padding | `--ptah-surface-pad` |
| Bar (sticky) | fill, shadow | `--ptah-form-actions-bg`, `--ptah-form-actions-shadow` |
| Bar (sticky) | top edge | `var(--ptah-border-width) solid var(--ptah-border-color)` |
| Bar (sticky) | radius | `--ptah-radius-surface` (bottom corners only) |
| Bar (sticky) | layer | `z-index: var(--ptah-z-raised)`, `position: sticky; bottom: 0` |
| Dirty dot | size, color | `--ptah-status-glyph`, `--ptah-dirty-fg` |
| Dirty text | type, color | `--ptah-text-hint-size/leading/weight`, `--ptah-dirty-fg` |
| Dirty dot to text | gap | `--ptah-gap-label` |
| Start group | margin end | `margin-inline-end: auto` (pushes buttons to the end) |

### 3.3 States

| State | Visual and behavior |
| --- | --- |
| Default | Buttons at the end. No dirty indicator. |
| Hover / focus | Owned by each `ptahButton`. |
| Disabled | `disabled` input sets `aria-disabled="true"` on the group. It does not disable buttons. The parent disables them. |
| Saving | `saving` input. Sets `aria-busy="true"` on the group. The Save button shows `busy`. The parent binds it. |
| Error | Not owned. The parent shows the alert above the bar. |
| Dirty | `dirty=true` shows the dot and "Unsaved changes" at the start. |
| Empty | No projected buttons: the host has `hidden`. |
| Narrow | Bar wraps. When the bar width is below 320px (`[@container(max-width:319.98px)]`), buttons take full width and stack, primary first (`flex-col-reverse`). |

### 3.4 Accessibility

- `role="group"` with `aria-label` (default "Form actions").
- The dirty text is in a `role="status"` live region (`aria-live="polite"`). It announces once when `dirty` turns true.
- Button order in the DOM: Cancel, then Save. Save is the last focus stop.
- Sticky mode must not cover the focused field. The parent scroll area sets `scroll-padding-bottom` to the bar height. `ptah-settings-layout` sets it (section 5).

### 3.5 TypeScript API

```ts
@Component({
  selector: 'ptah-form-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-ptah-pattern': 'form-actions', class: 'block [container-type:inline-size]' },
})
export class PtahFormActionsComponent {
  readonly sticky = input(false, { transform: booleanAttribute });
  readonly dirty = input(false, { transform: booleanAttribute });
  readonly saving = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input('Form actions');
  readonly dirtyText = input('Unsaved changes');
}
```

Slots:

| Selector | Content |
| --- | --- |
| `[start]` | Left content: a hint, a "Reset to default" link button |
| default | The buttons, in DOM order Cancel, Save |

---

## 4. `ptah-editable-section`

One section with two modes. View mode shows read-only content and one Edit button. Edit mode shows the fields and a Save/Cancel bar.

### 4.1 Anatomy

```
<section role="region" aria-labelledby=titleId>
  header: <hN id=titleId> heading </hN>  description   [status] slot      [Edit] (view mode only)
  ── view mode ──
    [view] slot  (normally ptah-description-list)
  ── edit mode ──
    <form novalidate (submit)>
      error alert (role="alert")    when error
      [edit] slot (fields)
      ptah-form-actions  dirty saving   [Cancel] [Save]
    </form>
  confirm-discard dialog (ptah-native-modal, size sm)
</section>
```

The header uses `ptah-section-header` (existing). The Edit button goes in its `[actions]` slot.

### 4.2 Tokens per slot

| Slot / part | Property | Token |
| --- | --- | --- |
| Host | layout | `flex flex-col`, gap `--ptah-gap-heading` |
| Host (surface) | fill, edge, radius, padding | when `surface=true`: `--ptah-card-bg`, `--ptah-card-border`, `--ptah-card-radius`, `--ptah-surface-pad` |
| Header | as `ptah-section-header` | `--ptah-section-*` tokens (existing) |
| Edit button | look | `ptahButton variant="secondary" size="sm"` |
| Form | gap between error, fields, bar | `--ptah-gap-field` |
| Error alert | padding, radius | DaisyUI `alert`. No extra spacing classes. |
| Form actions | see section 3 | `ptah-form-actions` |
| Mode change | transition | `opacity` with `--ptah-duration-fast`, `--ptah-ease-standard`. None with reduced motion. |

### 4.3 States

| State | Visual and behavior |
| --- | --- |
| Default (view) | Header + Edit button + `[view]` slot. |
| Hover | Edit button hover from `ptahButton`. |
| Focus | Edit button ring from `ptahButton`. In edit mode, fields show their own ring. |
| Disabled | `disabled` input. Edit button gets `aria-disabled="true"` and the `disabledReason` text in `aria-describedby` and `title`. It does not emit `edit`. |
| Editing | `editing=true`. `[edit]` slot in a `<form>`. Edit button is not rendered. |
| Dirty | `dirty=true`. The bar shows the dirty indicator. Cancel and Escape ask for confirmation first. |
| Saving | `saving=true`. Save `busy`. Cancel `disabled`. Form `aria-busy="true"`. Fields in the `[edit]` slot get `inert` through a wrapping `<fieldset [disabled]>`. Escape does nothing. |
| Error | `error` is a string. Alert at the top of the form, with `role="alert"`. Focus moves to the alert after a failed save (`saving` true → false with `error` set). The section stays in edit mode. |
| Empty (view) | When the `[view]` slot has no content, show `emptyText` (default "Nothing set yet") as muted body text. The Edit button label changes to `emptyActionLabel` (default "Add"). |
| Narrow | Header wraps. Edit button stays on the heading row while room exists, then wraps below. The bar follows the `ptah-form-actions` narrow rule. |

### 4.4 Behavior

1. The parent owns `editing`. The pattern does not change modes by itself. It emits `edit`, `save` and `cancel`.
2. Edit button click → emit `edit`.
3. Form submit (Enter in a field, or Save click) → emit `save`. The Save button is `type="submit"`. It is disabled when `!dirty` or `saving`.
4. Cancel click or Escape key in the form:
   - When `dirty=false` → emit `cancel`.
   - When `dirty=true` → open the confirm-discard dialog. "Discard changes" emits `cancel`. "Keep editing" closes the dialog and focus goes back to Cancel.
5. Dialog copy: title "Discard changes?", body "Your edits to {heading} will be lost.", buttons "Keep editing" (default focus) and "Discard" (`variant="danger"`).
6. When the parent sets `editing` from false to true: focus moves to the first focusable element in the `[edit]` slot.
7. When the parent sets `editing` from true to false: focus moves back to the Edit button. This applies after Save and after Cancel.
8. Focus moves happen in `afterNextRender` after the mode change, so the target exists.
9. First focusable: query `input, select, textarea, button, [tabindex]:not([tabindex="-1"])` inside the slot wrapper, and skip `[disabled]` and `[inert]`. When none exists, focus the form heading (`tabindex="-1"`).

### 4.5 Accessibility

- `<section role="region">` with `aria-labelledby` = heading id. Real heading with `level` input.
- The Edit button has an accessible name with the heading: `aria-label="Edit {heading}"`. The visible text stays "Edit".
- Edit mode `<form>` has `aria-labelledby` = heading id.
- Error alert id joins `aria-describedby` of the form.
- The dialog uses `ptah-native-modal` with `ariaLabelledby`. Focus goes back to Cancel after "Keep editing".
- Escape inside an open `ptah-select` panel must not reach the form handler. Handle `keydown.escape` only when `event.defaultPrevented` is false.

### 4.6 TypeScript API

```ts
@Component({
  selector: 'ptah-editable-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahSectionHeaderComponent, PtahButtonDirective, PtahFormActionsComponent, NativeModalComponent],
  host: { 'data-ptah-pattern': 'editable-section', class: 'block' },
})
export class PtahEditableSectionComponent {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly level = input<PtahSectionLevel, unknown>(3, { transform: toSectionLevel });
  readonly surface = input(false, { transform: booleanAttribute });

  readonly editing = input(false, { transform: booleanAttribute });
  readonly dirty = input(false, { transform: booleanAttribute });
  readonly saving = input(false, { transform: booleanAttribute });
  readonly error = input<string | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly disabledReason = input<string | null>(null);

  readonly editLabel = input('Edit');
  readonly saveLabel = input('Save');
  readonly cancelLabel = input('Cancel');
  readonly emptyText = input('Nothing set yet');
  readonly emptyActionLabel = input('Add');
  readonly stickyActions = input(false, { transform: booleanAttribute });

  readonly edit = output<void>();
  readonly save = output<void>();
  readonly cancel = output<void>();
}
```

Slots:

| Selector | Content |
| --- | --- |
| `[status]` | Badge next to the heading (passed to `ptah-section-header [status]`) |
| `[view]` | View-mode content, normally `ptah-description-list` |
| `[edit]` | Edit-mode fields: `ptah-field` + `ptahInput`, `ptah-select`, `ptahToggle` |
| `[actions-start]` | Extra content in the `ptah-form-actions [start]` slot |

Rule: the `[edit]` slot is rendered with `@if (editing())` around the `<ng-content>`. Angular projects content once, so the feature must also guard its fields with `@if` or use an `<ng-template>`. Recommendation: the `[edit]` slot takes `<ng-template ptahEditTemplate>`. The pattern renders it with `ngTemplateOutlet` only in edit mode. Then a draft signal resets each time. Add the directive `PtahEditTemplateDirective` (selector `ng-template[ptahEditTemplate]`) in the same file.

---

## 5. `ptah-settings-layout`

The settings page frame. Side nav of tabs, content column with max width, and a page header.

### 5.1 Anatomy

```
host (container)
┌────────── nav ──────────┐┌──────────────── main ────────────────┐
│ <nav aria-label>        ││ <header>                              │
│  [nav-header] slot      ││   <h1|h2> title   description  [actions]│
│  tab item (active)      ││ </header>                             │
│  tab item               ││ <div role="tabpanel"> default slot   │
│  …                      ││   (max width --ptah-settings-content-max-w)
│  [nav-footer] slot      ││                                       │
└─────────────────────────┘└───────────────────────────────────────┘
Narrow: nav becomes a top strip that scrolls on the x axis, above the header.
```

### 5.2 Tokens per slot

| Slot / part | Property | Token |
| --- | --- | --- |
| Host (wide) | columns | `var(--ptah-settings-nav-w) minmax(0, 1fr)` |
| Host (wide) | column gap | `--ptah-gap-section` |
| Host | padding | `--ptah-page-gutter` |
| Nav | gap between items | `--ptah-gap-label` |
| Nav (wide) | position | `sticky; top: 0`, `align-self: start` |
| Nav item | height, padding x | `--ptah-settings-nav-item-h`, `--ptah-control-px` |
| Nav item | radius | `--ptah-radius-control` |
| Nav item | icon size, gap | `--ptah-icon-md`, `--ptah-gap-inline` |
| Nav item | type | `--ptah-text-body-size/leading`, weight 500, active weight 600 |
| Nav item (hover) | fill | `--ptah-btn-ghost-bg-hover` |
| Nav item (active) | fill, marker | `--ptah-settings-nav-active-bg`, 2px start edge `--ptah-settings-nav-active-edge` |
| Nav item (focus) | ring | `--ptah-focus-ring-width/offset/color` |
| Nav strip (narrow) | gap, edge | `--ptah-gap-controls`, bottom `var(--ptah-border-width) solid var(--ptah-border-color)` |
| Nav strip (narrow) | active marker | 2px bottom edge `--ptah-settings-nav-active-edge` |
| Header | bottom gap | `--ptah-gap-group` |
| Header | title type | `--ptah-text-page-title-size/leading/weight` |
| Header | title to description | `--ptah-gap-label` |
| Header | description | `--ptah-text-body-size/leading`, `text-base-content-muted` |
| Header actions | gap | `--ptah-gap-controls` |
| Content | max width | `--ptah-settings-content-max-w` |
| Content | gap between sections | `--ptah-gap-section` |
| Scroll area | scroll padding bottom | `calc(var(--ptah-control-h-md) + 2 * var(--ptah-surface-pad))` for a sticky bar |

### 5.3 States

| State | Visual and behavior |
| --- | --- |
| Default | Side nav, active tab marked. |
| Hover | Nav item fill `--ptah-btn-ghost-bg-hover`. |
| Focus | Nav item ring. Arrow keys move focus (roving `tabindex`). |
| Disabled tab | `disabled` on the tab item: `aria-disabled="true"`, muted text, no `selectedChange`. A `disabledReason` shows as `title` and `sr-only` text. |
| Saving | Not owned. |
| Error | Not owned. Each section shows its own error. |
| Empty | No tabs: nav is not rendered. Content takes full width. |
| Badge on tab | Optional `badge` (number or string) on a tab item, shown with `ptahBadge size="xs"` at the end. |
| Narrow | Below `layout-split`: nav is a horizontal strip above the header. It scrolls on the x axis (`overflow-x: auto`, no visible scroll bar). The active item scrolls into view (`scrollIntoView({ inline: 'nearest' })`). Labels stay visible. |

### 5.4 Accessibility

- Pattern: tabs with a manual activation model.
  - Nav container: `role="tablist"`, `aria-orientation` = `vertical` (wide) or `horizontal` (narrow), `aria-label` = `navLabel`.
  - Item: `<button role="tab">`, `aria-selected`, `aria-controls` = panel id, `id` = tab id.
  - Content: `role="tabpanel"`, `aria-labelledby` = active tab id, `tabindex="0"`.
- Keys: Arrow Up/Down (vertical) or Left/Right (horizontal) move focus. Home and End go to the first and last item. Enter or Space selects.
- Page title is a real heading. `titleLevel` input: `1 | 2`, default 2. The Electron app shell already has an `h1`.
- On tab change, focus stays on the tab. The panel does not take focus.
- Keep the e2e hooks: each item keeps its visible label as the button name. The current Settings page tests call `getByRole('button')`. P4 moves those tests to `getByRole('tab')`. That move is a decision for the P4 PR (see Decisions).

### 5.5 TypeScript API

```ts
export interface PtahSettingsTab<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly icon?: LucideIconData;
  readonly badge?: string | number | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
}

@Component({
  selector: 'ptah-settings-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, PtahBadgeDirective],
  host: { 'data-ptah-pattern': 'settings-layout', class: 'block [container-type:inline-size]' },
})
export class PtahSettingsLayoutComponent<TId extends string = string> {
  readonly tabs = input.required<readonly PtahSettingsTab<TId>[]>();
  readonly selected = input.required<TId>();
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly titleLevel = input<1 | 2>(2);
  readonly navLabel = input('Settings sections');

  readonly selectedChange = output<TId>();
}
```

Slots:

| Selector | Content |
| --- | --- |
| `[nav-header]` | Above the tab items (wide only). For example an app label. |
| `[nav-footer]` | Below the tab items (wide only). For example a version line. |
| `[actions]` | Page header actions, end aligned |
| default | Tab panel content. A stack of `ptah-form-section` and `ptah-editable-section` |

Note: `lucide-angular` is already a dependency of `libs/frontend/ui` through the existing primitives. Confirm in P3 with `dependency-boundaries.spec.ts`. When it is not allowed, take `icon` as a projected template instead.

---

## 6. Accounts tab mapping

Source: `libs/frontend/chat/src/lib/settings/providers/accounts/`.

### 6.1 View mode and edit mode by part

| Part (today) | File and test id | Mode | Pattern that composes it |
| --- | --- | --- | --- |
| Tab heading "Accounts", stale badge, "Try again", "Add account" | `accounts-tab` `accounts-tab-header` | View | `ptah-form-section` title + `[aside]` stale badge. "Add account" moves to `ptah-section-header [actions]` of the list section. |
| Ambient login row ("Existing Claude login", status, "Used by", Check) | `ambient-account-row` | View | List row (stays a row). Row content uses `ptah-description-item` for status and "Used by". Check stays a row action. |
| Account rows (initial, name, status, chips, Sign in, Manage) | `accounts-tab` `accounts-tab-row` | View | Stays a list (not a form). The list sits in the default slot of `ptah-form-section` "Accounts". Row spacing comes from the list primitive (see Decisions D4). |
| Load error | `accounts-tab-error` | View, error | `alert alert-error role="alert"` in `ptah-form-section [error]` input, plus the Try again button |
| Loading / "Open a workspace" | `accounts-tab-loading` | View, empty | `ptah-state-panel` in the default slot |
| Add account form (Account name, Cancel, Add) | `add-account-form` | Edit (create) | `ptah-editable-section` heading "New account", parent sets `editing=true` at once. `[edit]` = `ptah-field` + `ptahInput`. Actions from `ptah-form-actions` via the pattern. `saving` = `pending`. |
| Detail header (back, initial, name, state, runs badge, resume badge) | `account-detail-view` top block | View | `ptah-settings-layout` is not used here. Back button + `ptah-section-header` with `[status]` badges. |
| Sign-in actions (Sign in / Sign out / Cancel sign-in, Check status, Use terminal, script) | `account-detail-view` second block | View (commands) | `ptah-form-section` "Sign-in". Buttons are commands, not form edits. They go in the default slot through `ptah-form-actions` with `justify` start (no Save/Cancel). Script `<pre>` stays. |
| Account facts (name, state, active runs, used by) | new, from `account-presentation.ts` | View | `ptah-description-list` inside `ptah-editable-section` `[view]` |
| Rename (Name input + Save when edited) | `account-detail-view` `<form>` | Edit | Same `ptah-editable-section` "Details". `[edit]` = Name field. `dirty` = `edited()`. `saving` = busy rename. `disabled` = `pending()` with `disabledReason` = `copy.signInLocked`. |
| Remove account + confirm modal | `account-detail-view` remove block | View (danger command) | `ptah-form-section` "Danger zone" `[footer]` slot. Keep the existing `ptah-native-modal` confirm. |

### 6.2 Composition sketch (detail view, after P4)

```html
<button ptahButton variant="ghost" (click)="back.emit()">← Accounts</button>
<ptah-section-header [heading]="account().label" [level]="3">…status badges…</ptah-section-header>

<ptah-form-section heading="Sign-in" description="Connect this account to Claude." divider>
  …sign-in command buttons…
</ptah-form-section>

<ptah-form-section heading="Details" description="The name shows in the account list." divider>
  <ptah-editable-section heading="Account details" [level]="4"
      [editing]="editing()" [dirty]="edited()" [saving]="renaming()" [error]="renameError()"
      [disabled]="pending()" [disabledReason]="copy.signInLocked"
      (edit)="startEdit()" (save)="submitRename()" (cancel)="stopEdit()">
    <ptah-description-list view [items]="facts()" />
    <ng-template ptahEditTemplate>
      <ptah-field label="Name" for="account-detail-name">
        <input ptahInput id="account-detail-name" … />
      </ptah-field>
    </ng-template>
  </ptah-editable-section>
</ptah-form-section>

<ptah-form-section heading="Danger zone">
  <button footer ptahButton variant="danger" (click)="askRemove()">Remove account</button>
</ptah-form-section>
```

The feature template then has no `space-y-*`, `gap-*`, `p-*` or `m-*` classes.

### 6.3 Behavior changes the pilot introduces (P4)

- Rename becomes explicit edit mode. Today the input is always editable and Save shows when edited. This change is a UX change. P4 must update `account-detail-view.component.spec.ts`.
- Escape and Cancel with a dirty draft now confirm first.

---

## 7. File plan

Folder: `libs/frontend/ui/src/lib/patterns/`. Each pattern has its own subfolder. One `patterns/index.ts` barrel. The root `libs/frontend/ui/src/index.ts` gets `export * from './lib/patterns';` (keep it a pure `export *` list).

Gallery: one new family file `apps/ptah-extension-webview/src/app/ui-gallery/gallery-patterns-family.component.ts` with section ids `patterns-form-section`, `patterns-description-list`, `patterns-form-actions`, `patterns-editable-section`, `patterns-settings-layout`. `gallery-unique-sections.spec.ts` requires each family in the host, so the first PR also edits `ui-gallery.component.ts`.

The limit is six write files for each PR. P1 has three components, so P1 has two PRs.

### P1a: tokens, form-section, form-actions (6 files)

| # | File | Change |
| --- | --- | --- |
| 1 | `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` | Add the token block from section 0.5 |
| 2 | `libs/frontend/ui/src/lib/patterns/form-section/form-section.component.ts` | New |
| 3 | `libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts` | New |
| 4 | `libs/frontend/ui/src/lib/patterns/form-actions/form-actions.component.ts` | New |
| 5 | `libs/frontend/ui/src/lib/patterns/form-actions/form-actions.component.spec.ts` | New |
| 6 | `libs/frontend/ui/src/lib/patterns/index.ts` | New barrel (form-section, form-actions) |

The root `src/index.ts` export and the gallery go in P1b, so P1a ships no public export yet. That is safe: no consumer exists.

### P1b: description-list, exports, gallery (6 files)

| # | File | Change |
| --- | --- | --- |
| 1 | `libs/frontend/ui/src/lib/patterns/description-list/description-list.component.ts` | New (list + item) |
| 2 | `libs/frontend/ui/src/lib/patterns/description-list/description-list.component.spec.ts` | New |
| 3 | `libs/frontend/ui/src/lib/patterns/index.ts` | Add description-list export |
| 4 | `libs/frontend/ui/src/index.ts` | Add `export * from './lib/patterns';` |
| 5 | `apps/ptah-extension-webview/src/app/ui-gallery/gallery-patterns-family.component.ts` | New. Sections for form-section, description-list, form-actions |
| 6 | `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` | Import and render `<ptah-gallery-patterns-family />` |

### P2: editable-section (4 files)

| # | File | Change |
| --- | --- | --- |
| 1 | `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.ts` | New (component + `PtahEditTemplateDirective`) |
| 2 | `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.spec.ts` | New |
| 3 | `libs/frontend/ui/src/lib/patterns/index.ts` | Add export |
| 4 | `apps/ptah-extension-webview/src/app/ui-gallery/gallery-patterns-family.component.ts` | Add section `patterns-editable-section` with view, edit, dirty, saving, error demos |

### P3: settings-layout (4 files)

| # | File | Change |
| --- | --- | --- |
| 1 | `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts` | New |
| 2 | `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts` | New |
| 3 | `libs/frontend/ui/src/lib/patterns/index.ts` | Add export |
| 4 | `apps/ptah-extension-webview/src/app/ui-gallery/gallery-patterns-family.component.ts` | Add section `patterns-settings-layout` (wide and narrow frame) |

### Spec test minimums (each pattern)

- Renders the heading at the `level` input (h2, h3, h4).
- `aria-labelledby` points at the heading id.
- Host carries `data-ptah-pattern` and `[container-type:inline-size]` (when listed).
- Spacing classes use only `var(--ptah-...)` arbitrary values. Add one spec assertion: no class on the rendered pattern matches `/\b(gap|p|px|py|m|mx|my|space-[xy])-\d/`.
- `ptah-description-list`: placeholder for `null`, `undefined`, `''` and `'  '`. Not for `0`.
- `ptah-form-actions`: hidden with no projected button. Dirty status text appears in a `role="status"` node.
- `ptah-editable-section`: focus to first field on `editing` false → true. Focus to Edit on true → false. Dirty Cancel opens the confirm. Clean Cancel emits `cancel` once. Escape while `saving` emits nothing. Save disabled when not dirty.
- `ptah-settings-layout`: arrow keys move focus, Enter emits `selectedChange`, disabled tab emits nothing, `aria-orientation` follows width (mock the container width with a class toggle helper).

### Verification for lanes

- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath <new specs>`
- `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/ui-gallery/gallery-unique-sections.spec.ts`
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`
- `npx eslint <changed files>`
- The coordinator runs `npm run verify -- -p ui,ptah-extension-webview` and `-t typecheck-templates -p ptah-extension-webview`. Lanes do not run `npm run verify` or `nx`.

### Later phases (not in this plan's file limits)

- P4 Accounts pilot: `account-detail-view.component.ts` + spec, `add-account-form.component.ts` + spec, `accounts-tab.component.ts` + spec (6 files).
- P5 class audit: an ESLint rule or spec that rejects raw spacing utilities in `libs/frontend/chat/src/lib/settings/**` templates.
- `settings-field` and `setup-field` (in `extracted/`) merge into `ptah-field` + `ptah-form-section`. Do this after P4, when no settings template uses them. Delete the two folders then. Do not keep shims.

---

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Patterns react to their own width with container queries, not media queries. | Media queries; container queries | `ptah-list-detail` already uses `[container-type:inline-size]`. The settings page runs in an Electron window and in a narrow VS Code panel. | Yes |
| D2 | Break widths are literals (640px, 768px) in classes. Tokens do not hold them. | Token; literal | CSS does not accept `var()` in a container query condition. | Yes |
| D3 | `ptah-editable-section` takes edit fields through `ng-template[ptahEditTemplate]`. | Plain `ng-content`; template | Angular projects `ng-content` once and keeps it alive. A template gives a fresh field and draft on each Edit. | Yes |
| D4 | The account list stays a list, not a description list. | Description list; list | Each row has its own actions and state. A form pattern does not fit. Row spacing goes to a later list primitive. | Yes |
| D5 | `ptah-settings-layout` uses `role="tablist"` with manual activation. | Plain nav with `aria-current`; tabs | One page shows one panel at a time. Today the nav uses `aria-current="page"` and buttons. P4 must move e2e selectors from `button` to `tab`. Flag this in the P4 PR. | Yes |
| D6 | P1 splits into P1a and P1b. | One PR; two PRs | Three components + specs + barrel + export + gallery + host = 10 files. The limit is six. | Yes |
| D7 | Proposed tokens go in P1a, not in P0. | Edit now; edit in P1a | The P0 brief forbids a CSS edit. | Yes |
| D8 | Page title level defaults to 2. | 1; 2 | The Electron app shell and `ptah-page-header` already render an `h1`. | Yes |

## Notes

- The `ui-ux-designer` skill is not in this host's skill list. This spec uses the project tokens and primitives as the design system. No asset generation was necessary.
- No `docs/design-system/` token source exists. `docs/design-system/` has only `ptah-content-brand.md`. The authority is `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`.
