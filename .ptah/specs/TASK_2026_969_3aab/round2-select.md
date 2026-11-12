# Round 2: rich select (`ptah-select`)

Scope: the owner `libs/frontend/ui/src/lib/form-controls/rich-select/**`, the panel token in
`libs/frontend/ui/src/lib/tokens/ptah-tokens.css`, and the UI gallery. The lane did not start
Electron or a browser. The lane did not take screenshots. Do a visual check in Electron.

## Defect 1: action icons move and are not at the inline end

### Causes (lines of `HEAD` e64e2a17f)

1. `ptah-select.css:103` `.ptah-select:has(.ptah-select__clear) .ptah-select__trigger` added
   `padding-inline-end` only when a clear button was in the DOM. The template
   (`rich-select.template.ts:34`) adds the clear button only when there is a value. The chevron
   was a flex item of the trigger with `margin-inline-start: auto` (`ptah-select.css:87`), so a
   value moved the chevron to the start by about 28 px.
2. `ptah-select.css:109-110` put the clear button at `position: absolute;
   inset-inline-end: calc(icon + space-2); top: 50%`. This is to the start of the trigger
   padding end. The result was "chevron, then X", with a gap to the edge.
3. `top: 50%` of the clear button used the host height. The panel is a child of the host. Before
   `FloatingUIService` sets `position: fixed` (`floating-ui.service.ts:180`, after an async
   compute), the panel is in flow. Thus the host grows when it opens and the clear button jumps.
4. In a floating field, the chevron had a negative `margin-block-start`
   (`ptah-select.css:96`). The clear button had no such rule. The two icons were on different
   lines.
5. The trigger kept `padding-inline: var(--ptah-control-px)` inside `ptah-field`
   (`ptah-select.css:25`; the field reset sets only `padding-inline-start: 0`). The chevron sat
   one control padding before the place of the text field clear action.

### Correction

- Template: one container `<span class="ptah-select__actions">` is a sibling after the trigger
  (a button cannot contain a button). It contains, in this fixed order, the clear button (when
  there is a value) and the chevron. The chevron is no longer in the trigger.
- CSS: the host is a one-cell grid (`display: grid; grid-template-columns: minmax(0, 1fr)`). The
  trigger and the action group both use `grid-area: 1 / 1`. The group has `justify-self: end;
  align-self: center`. Thus it is at the inline end and at the block center of the host in all
  states. The group lets pointer events through to the trigger (`pointer-events: none`). The
  clear button sets `pointer-events: auto`.
- Inset: standalone, `margin-inline-end: calc(var(--ptah-field-pad-x) +
  var(--ptah-border-width))`. This is the inset of `.ptah-field__action` in a text field (field
  border plus `--ptah-field-pad-x`). Inside `.ptah-field__body` the inset is `0`, because the
  field box already pads by `--ptah-field-pad-x`. Size xs uses `--ptah-control-px-xs`.
- The trigger keeps room for the group at all times. The room depends on the `clearable` input
  (host attribute `data-clearable`), not on the value. Thus the value width does not change when
  the clear action comes or goes.
- The panel has `position: fixed` in CSS. It is out of flow before and after positioning, so the
  open state does not change the host height.
- The open state only rotates the chevron (`transform: rotate(180deg)`) with
  `transform-origin: 50% 50%`. The chevron box does not move.
- Removed: the `:has(.ptah-select__clear)` padding rule, the absolute clear position, the
  `translateY(-50%)` and the floating chevron margin.

Why the defect is gone: one container holds both icons. Its position rules have no state
selector. The chevron is the last item, so it stays at the same point. The clear action appears
only to the start of the chevron.

## Defect 2: `ptah-select` as the standard select

### New inputs (backward compatible)

| Input | Type | Default | Effect |
|---|---|---|---|
| `size` | `PtahControlSize` (`'xs' \| 'sm' \| 'md'`) | `'sm'` | Host `data-size`. Trigger height `--ptah-control-h-xs/sm/md` (24, 32, 40 px), the same as `select[ptahSelect]`. xs also uses label type size and `--ptah-control-px-xs`. Inside `ptah-field` the field box sets the height. |
| `searchable` | `boolean \| undefined` | unset (auto) | Already existed. Unset: search from `PTAH_SELECT_SEARCH_MIN_OPTIONS` (8, exported) options, no search for a short list. `true` or `false` forces it. The value of the old rule (`> 7`) did not change. |

Host attributes added: `data-size`, `data-clearable`. No selector, input or class was removed.
The keyboard and ARIA paths did not change (all old specs pass).

### Gallery changes

- `gallery-components.component.ts`: the Fields demo "Repository" and the toolbar sort slot
  ("Newest first / Oldest first") use `ptah-select`. The sort uses `size="xs"`,
  `label="Sort runs"`, `[(value)]="sort"`.
- `gallery-form-controls-family.component.ts`: the "Page size" row uses `ptah-select` in xs, sm
  and md (clearable, 3 options, no search). One native demo stays, with the label "Legacy
  ptahSelect (native menu)". The hint of "Model" is now "8 or more options: search is on".
- `gallery-form-controls.data.ts`: new `PAGE_SIZE_OPTIONS`, `SORT_OPTIONS`,
  `REPOSITORY_OPTIONS`.

## Defect 3: translucent panel

### Cause

`ptah-tokens.css:152` (HEAD) `--ptah-select-panel-bg: var(--glass-fill-overlay,
oklch(var(--b1)))`. With glass on, `--glass-fill-overlay` has alpha (`styles.css:2857`
`oklch(var(--b1) / 0.9)`, `styles.css:2904` `oklch(var(--b2) / 0.88)`). The panel also had
`backdrop-filter: var(--glass-blur-overlay, none)` (`ptah-select.css:162`). The glass rules for
`.dropdown-content` and `[data-glass-surface]` do not match the panel (it has neither), so they
did not cause it.

### Correction

- `--ptah-select-panel-bg: var(--surface-3)`. `--surface-3` is `color-mix(in oklch,
  oklch(var(--b3)) 86%, oklch(var(--b2)))` (`styles.css:170`): two opaque theme colors, no alpha,
  also with glass on. It is the raised surface of the `.surface-3` layer. The sticky group
  header uses the same token, so it is also opaque.
- The panel has no `backdrop-filter` now. Edge: `--ptah-select-panel-edge` (strong control
  edge). Shadow: `--ptah-elevation-3`. Both did not change.
- Contrast: option text is `--ptah-field-fg` (base-content). The description, group header and
  icon use base-content-muted. `design-tokens.spec.ts` already checks muted >= 4.5:1 on
  `surface-3` for `ptah-glass` and `ptah-glass-light`. It checks base-content and the
  selected/active color mix (primary 62% in base-content) on base-200 and base-300.
  `surface-3` is a mix of base-200 and base-300. Thus these colors keep WCAG AA in the panel.
- The panel search keeps the round 1 quiet focus rule (`.ptah-select :is(.ptah-select__search,
  #ptah-select):focus-visible...`: no outline, no shadow, the row border marks focus). A spec pins
  it.

## Changed files

- `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-look.spec.ts` (new)
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` (one token value)
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts`
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-form-controls-family.component.ts`
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-form-controls.data.ts`

## Specs added (`rich-select-look.spec.ts`, 7 tests)

1. One `.ptah-select__actions` after the trigger. Order: clear, then chevron. No chevron in the
   trigger.
2. Same group element and class name when the panel opens and when the value goes away.
3. CSS text: the group uses `grid-area: 1 / 1`, `justify-self: end`, `align-self: center` and the
   field inset. The only `[data-open]` rule is the chevron rotation. The chevron has a centered
   origin and no margin. The clear rule has no position, inset or transform. No
   `:has(.ptah-select__clear)`.
4. `size` sets `data-size` (default `sm`). The xs, sm and md rules use the control height tokens.
5. Search: off for 2 options, on for 8 options, on when `searchable` is set.
6. The panel rule uses `position: fixed`, `var(--ptah-select-panel-bg)`, the edge and the shadow,
   and has no `backdrop-filter` or `opacity`. The token is `var(--surface-3)`.
7. The panel search focus rule keeps `outline: none` and `box-shadow: none`.

`ui-gallery.component.spec.ts` needed no change: it passes.

## Change the field lane must make (exact)

The lane did not edit `form-controls-look.spec.ts` (field lane file). One of its tests pins the
removed chevron margin and now fails. In
`libs/frontend/ui/src/lib/form-controls/form-controls-look.spec.ts`, replace the test
`'grows the rich select and centers its chevron in a floating field'` with:

```ts
  it('grows the rich select and centers its action group in the field', () => {
    expect(select).toMatch(/\.ptah-field__body > \.ptah-select \{\s*flex: 1 1 auto;/);
    expect(select).toMatch(/\.ptah-select__actions \{[^}]*justify-self: end;[^}]*align-self: center;/);
    expect(select).not.toContain('margin-block-start');
  });
```

No change in `ptah-field.css` is necessary. The field reset of `.ptah-select__trigger` still
applies. The field focus edge of round 2 (`.ptah-field .ptah-field__box:has(.ptah-field__body
:focus)`) also covers the trigger.

## Later migration of native selects to `ptah-select`

### `ptahSelect` usages outside the UI library and the gallery (grep of `libs/` and `apps/`)

| File | Count |
|---|---|
| `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts` | 2 |
| `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts` | 2 |
| `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts` | 1 |
| `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts` | 3 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts` | 2 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts` | 2 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts` | 1 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts` | 1 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts` | 1 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts` | 1 |

Raw `<select>` without the directive also exists in about 30 more files (for example
`provider-model-picker.component.ts` with 11, `review-findings-panel.component.ts` with 4,
`task-bulk-bar.component.ts` with 3, and files in tasks-ui, git-ui, review-runs-ui, cron and
setup-wizard). Count them again before the migration.

### Gaps to close per template

- Options: a native `<option>` list must become a `PtahSelectOption[]` array in the component
  (`value`, `label`, optional `group`, `description`, `disabled`). `<optgroup>` maps to `group`.
- Forms: `ptah-select` is a `ControlValueAccessor` (`ngModel`, `formControl`) and supports
  `[(value)]`. A template that reads `$event.target.value` in `(change)` must change to
  `(valueChange)` or `ngModelChange`. The value is the option value, not a string.
- Native form submission: `ptah-select` has no `name` and no hidden input. A `<form>` that posts
  natively or reads `FormData` does not get the value. No such usage was found in the grep, but
  check each form.
- Sizes: map `ptahSelect [size]` xs/sm/md to `ptah-select [size]`. The `[&_select]:text-xs`
  rules of the toolbar do not apply: use `size="xs"`.
- Name: a select outside `ptah-field` needs the `label` input (the accessible name). An
  `aria-label` attribute on the host does not name the trigger.
- Tone: `ptah-select` has no `tone` input (`mono`, `compact`). Add it before you migrate selects
  that use it.
- Width: the native select used content width. `ptah-select` is a grid host with `min-width: 0`.
  Give it a width class (`w-40`, `min-w-32`) where it is not in a flex field body.
- Native `size`/`multiple` attributes: `ptah-select` is single select only. Keep native for
  `multiple`.

## Verify results

- `npm run verify -- -p @ptah-extension/ui`: lint and typecheck passed (2 tasks). Test: 1000
  passed, 2 failed. The 2 failures were (a) the new look spec, which the lane then corrected,
  and (b) `form-controls-look.spec.ts` "grows the rich select and centers its chevron in a
  floating field" (field lane file, see above).
- `npm run verify -- -t test -p @ptah-extension/ui` (second run): Test Suites 65 passed, 1
  failed. Tests 1001 passed, 1 failed. The failed test is only the field lane test above.
- `npm run verify -- -t test -p ptah-extension-webview -- --testPathPatterns="design-tokens|ui-gallery"`:
  2 suites, 88 tests passed.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: passed.
- `ui-class-audit` (`check-ui-classes.ts` under the verify lock): 0 token counts over baseline.
