# Round 3: notch label for `ptah-field` (appearance `floating`)

No browser or Electron session ran. The design comes from the CSS and the templates. The user must do the visual check (see "Look at in Electron").

## Design

The label is a pure CSS notch label. CSS state selectors drive it. There is no JavaScript measurement, no ResizeObserver and no keyframes. The template did not change. The label stays in `.ptah-field__body`, so its inline start is the control text start.

### States and selectors (`ptah-field.css`)

| State | Selector | Result |
|---|---|---|
| Base (rest) | `.ptah-field[data-appearance='floating'] .ptah-field__label` | `position: absolute`, `top: 50%`, `translateY(-50%)`, body text size, transparent fill |
| Rest, explicit | `...floating']:has(.ptah-field__body :is(input, textarea):placeholder-shown) .ptah-field__label` | body text size, transparent fill |
| Rest, textarea | `...floating'] .ptah-field__body:has(textarea) .ptah-field__label` | `top` = textarea top padding + half a text line (first line) |
| Floated | `...floating']:is(:focus-within, :has(... :not(:placeholder-shown)), :has(... :autofill), :has(... [placeholder]:not([placeholder=' '])), :has(.ptah-field__body select), :has(.ptah-field__body .ptah-select:is([data-open], [data-ptah-filled]))) .ptah-field__label` | `top: calc(var(--ptah-border-width) * -1)` and `translateY(-50%)` (centered on the top border line), float size, opaque fill `var(--ptah-field-notch-bg)` |
| Focus color | `.ptah-field__box:focus-within .ptah-field__label`, `.ptah-field:has(.ptah-select[data-open]) .ptah-field__label` (not changed) | `--ptah-field-label-fg-active`. Value without focus keeps the muted label color. |
| Error | existing invalid rule (not changed) | `--ptah-state-err` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` | `transition: none` on the label |

- `rich-select.component.ts` host attributes: `data-open` (open) and `data-ptah-filled` (selected or open). The floated rule uses both.
- Transition: one `transition-property: top, font-size, line-height, color, background-color` with `--ptah-duration-base` and `--ptah-ease-standard`. `transform` is the same in both states, so only `top` moves.
- Inline position: the label has `padding-inline: var(--ptah-field-notch-pad-x)` and `inset-inline-start: calc(var(--ptah-field-notch-pad-x) * -1)` in all states. Thus the label text stays on the control text start, and the padding cuts the border on both sides when floated.
- Leading slot decision: the label is in the body, so the rest label and the floated label both sit at the text start after the leading icon. The border line stays visible above the icon. This needs no extra selector.
- The required marker stays in the label. The stacked appearance did not change.
- The focus edge of round 2 (`.ptah-field .ptah-field__box:has(.ptah-field__body :focus)`) did not change. The label is a positioned descendant of the box, so it paints above the border and the inset band.

### Box clip and rail

- `.ptah-field__box` has no `overflow: hidden` now. The label can cross the top border.
- The rail must stay in the rounded corners. `.ptah-field__rail` now covers the padding box (`inset: 0`) with `border-radius: calc(var(--ptah-field-radius) - var(--ptah-border-width))`. A `mask-image: linear-gradient(to top, var(--ptah-field-rail-color) var(--ptah-field-rail-h), transparent var(--ptah-field-rail-h))` shows only the bottom band. The background is clipped to the radius, so the band follows the corners. Error (`scaleX(1)`), busy sweep (background image) and reduced motion work as before.
- Other content that used the clip: none found. The controls are transparent with no border or shadow. The ptah-select panel is `position: fixed`.

## Tokens (`ptah-tokens.css`, new only)

- `--ptah-field-notch-bg: oklch(var(--b1))`. Opaque base-100. It is not `inherit`, not transparent, not a glass fill.
- `--ptah-field-notch-pad-x: var(--ptah-space-1)`.
- `--ptah-field-textarea-pad-y: var(--ptah-space-3)` (floating textarea top and bottom padding, and the rest label line).

### A field on another surface

Set the token on an ancestor of the field:

- base-200: `--ptah-field-notch-bg: oklch(var(--b2))`
- base-300: `--ptah-field-notch-bg: oklch(var(--b3))`
- glass panel: its opaque base, for example `var(--surface-1)` or `var(--surface-3)` (opaque mixes in `styles.css`). Do not use `--glass-fill-*`, which has alpha.

In Angular: `[style.--ptah-field-notch-bg]="'oklch(var(--b2))'"`. The gallery tint panels now do this (`TintPanel.notchBg`).

Contrast: the label colors on base-100, base-200 and base-300 are already checked in `design-tokens.spec.ts` (muted and `--ptah-field-label-fg-active` >= 4.5:1). The notch fill is one of these surfaces, so the floated label keeps AA text contrast.

## Removed

- `overflow: hidden` on `.ptah-field__box`.
- The floating control padding rule (`padding-top: var(--ptah-field-pad-top)`, `padding-bottom: var(--ptah-field-pad-bottom)`) for input, select, textarea and `.ptah-select__trigger`. The control text is now vertically centered in the box.
- The floating textarea `padding-top: calc(var(--ptah-field-pad-top) + var(--ptah-space-2))`. It is now `padding-block: var(--ptah-field-textarea-pad-y)`.
- The use of `--ptah-field-label-float-top` and `transform: none` in the floated rule. The `ease-emphasis` timing on the label.
- The rail `height` and bottom-only inset (replaced by the mask, see above).
- Note: the tokens `--ptah-field-pad-top`, `--ptah-field-pad-bottom` and `--ptah-field-label-float-top` are still declared in `ptah-tokens.css` but have no usage now. My scope was "only new field tokens", so I did not delete them. Delete them in a follow-up if no adopter uses them.

## Changed files

- `libs/frontend/ui/src/lib/form-controls/ptah-field.css`
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` (3 new tokens)
- `libs/frontend/ui/src/lib/surfaces/field.component.ts` (doc comment of `PtahFieldAppearance` only, no API change)
- `libs/frontend/ui/src/lib/form-controls/field-notch-label.spec.ts` (new)
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-form-controls-family.component.ts` (tint panels set `--ptah-field-notch-bg`)

No change to `rich-select/**`: the host attributes already exist. The ptah-select placeholder stays hidden at rest in a floating field (`ptah-select.css`, not changed). Public selectors and inputs did not change.

## Specs (`field-notch-label.spec.ts`, reads the CSS text)

1. Rest rule uses `:placeholder-shown` and the body text size. Base rule: absolute, `top: 50%`, notch padding and negative start. Textarea rest line.
2. Floated rule covers `:focus-within`, value, `:autofill`, real placeholder, native select, ptah-select `[data-open]` / `[data-ptah-filled]`.
3. Floated label: on the top border, float size, `background-color: var(--ptah-field-notch-bg)`, not inherit or transparent. The token is opaque. Notch padding token exists.
4. Focus color only in the focus rule. Error color in the invalid rule.
5. One transition. The only `@keyframes` is `ptah-field-busy`. `transition: none` under reduced motion.
6. The box has no `overflow`. The rail has `inset: 0`, the inner radius and the bottom mask.
7. No `--ptah-field-pad-top`, `--ptah-field-pad-bottom` or `--ptah-field-label-float-top` in the field CSS. Floating textarea uses `--ptah-field-textarea-pad-y`.

`field.component.spec.ts` and the rich-select specs pin no removed rule, so they did not change. `form-controls-look.spec.ts` (not my file) pins no removed rule. No change is necessary there.

## Look at in Electron

For each control: input ("Name on base-200"), textarea ("Instructions"), native select ("Legacy ptahSelect"), ptah-select ("Provider", "Region", "Repository"). For each state: empty, focus, value. Do this in dark glass, `ptah-glass-light` and one non-glass theme.

1. Empty, no focus: the label is at the text start, text size, vertically centered (textarea: first line). ptah-select empty and closed: label inside, no placeholder.
2. Click and Tab into the field: the label moves up onto the top border, small, focus color. The border line is cut behind the label with a small gap on both sides. One focus edge, no inner lines.
3. With a value, no focus: the label stays on the border, muted color. The value is vertically centered and does not touch the label.
4. ptah-select: open it (label floats), close without a value (label goes back), select a value (label stays up).
5. On the base-200 and base-300 panels the notch fill matches the panel. On glass: check that the notch fill matches the surface behind the field. If a glass panel shows a patch, set `--ptah-field-notch-bg` on that panel.
6. Error field: label in error color on the border, rail at the bottom inside the rounded corners. Busy textarea: sweep inside the corners.
7. Leading icon field: label at the text start after the icon, at rest and floated.
8. Disabled and read-only (dashed): the label still cuts the border.
9. OS reduced motion on: the label jumps with no transition.

## Verify results

- `npm run verify -- -p @ptah-extension/ui`: exit 0 (lint, typecheck, test). A second run with `-t test` and a path filter ran the full ui suite: 67 suites, 1010 tests passed.
- `npm run verify -- -t test -p ptah-extension-webview -- --testPathPatterns="design-tokens|ui-gallery"`: exit 1. 87 passed, 1 failed: "scopes every rule of the form controls look to directive hosts". The failed selector is `:root[data-glass='on'] .ptah-select .ptah-select__trigger:is(:focus, :focus-visible)` in `ptah-form-controls.css`. That file belongs to the parallel glass-edge lane (uncommitted work). It is not from this round. The other lane must move that rule to `ptah-select.css` (starts with `.ptah-select`) or scope it with `[data-ptah-control]`. All field and token tests in this spec passed.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: exit 0.
- `npm run verify -- -t lint -p ui-class-audit`: exit 0. No baseline change.
- One extra direct `npx nx test @ptah-extension/ui` run happened outside the verify lock by mistake (same result, 1010 passed). No other command ran.
