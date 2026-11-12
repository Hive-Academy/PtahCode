# Round 3: glass form edge

## Cause and cascade

`ThemeService` sets `data-glass='on'` for `ptah-glass` and `ptah-glass-light`. `styles.css:18-21` imports the form, field and rich select owners before Tailwind. Tailwind v3 and DaisyUI v4 emit component rules at `@tailwind components`; glass rules at `styles.css:2811` are in `@layer components` after DaisyUI. The imported owner rules are unlayered at source, but Tailwind processes the imports; the id-weighted owner selectors win by specificity. No `!important` is needed.

| Source | Specificity | Paint and state |
|---|---:|---|
| `styles.css:2849,2859,2887,2906,2926` glass tokens | n/a | Inner radius 14px; dark/light input fill alpha 0.66/0.58; focus ink. `ptah-tokens.css:111,136,167` passes fill, radius and focus ink to the owners. |
| `styles.css:3133-3154,3228-3245` surface and pseudo selectors | `(0,3,0)` for surface; `(0,3,1)` for pseudo | Surface shadow, `::after` blurred fill, `::before` rim at rest. Gallery fields are descendants of panels, not `[data-glass-surface]` hosts; no pseudo edge is on the control. |
| `styles.css:3357` glass `.input/.select/.textarea:not([data-ptah-control])` | `(0,4,0)` | Fill, strong border color and inset shadow at rest. The `:not` exception now excludes family hosts. Raw DaisyUI controls retain this look. |
| `styles.css:3364-3373` glass textarea/focus/disabled | `(0,4,0)` radius; `(0,5,0)` focus and disabled | Raw textarea radius; offset 2px outline plus 5px shadow on both mouse and keyboard focus; disabled fill and edge. Family hosts are excluded. This focus rule was the primary second edge on standalone family controls, particularly mouse focus where the family owner had only `:focus-visible`. |
| `styles.css:3420-3422` `.join` | `(0,5,0)` fill/edge, `(0,4,0)` focus offset | Only direct join children or descendants. The id-weighted family and field resets win; gallery field boxes are not join children. |
| `styles.css:3475-3477` global glass focus and dark halo | `(0,3,0)` and `(0,4,0)` | Offset outline and dark 5px halo on any focused element. The new glass family and rich trigger focus selectors override both; the field reset overrides them inside a field. |
| `styles.css:3778,3980` card rim and tone glow | `(0,0,0)` in `:where` and up to `(0,7,0)` tone rule | Card shadow or tone halo at rest. These require `.card` or `.border.rounded-*` and color utility classes; gallery field boxes and controls do not match. |
| `styles.css:3990-3994` control surface utility override | `(0,4,0)` and `(0,5,0)` disabled | Fill only when a base/surface utility is on a control. No extra stroke; id-weighted family and field rules win. |
| `ptah-field.css:20,171,250` box and field reset | `(0,1,0)` box; `(2,1,1)` focused native reset; `(0,4,0)` focused box | Box border is the field edge. Inner native control and rich trigger lose their border, outline and shadow. Focus box uses adjacent border and inset band in the same color. |
| `ptah-form-controls.css:19,122,132,145,154` family | `(1,2,0)` base; `(1,3,0)` standard focus; `(1,5,0)` glass focus | Standard themes retain the offset outline. Glass mouse and keyboard focus use one 2px border, with no outline or shadow. |
| `rich-select/ptah-select.css:25,94` trigger | `(0,1,0)` base; `(0,2,0)` focus | Standalone trigger has a border and its own offset outline; glass global focus could add a second edge. The new glass scoped family rule wins and uses one border. Field reset remains stronger. |

Glass only had the strong inset control shadow, offset focus outline, 5px focus halo, and translucent fill. The owner focus selector covered keyboard focus but not mouse focus. In a field, the id-weighted inner reset already wins, but the translucent field fill can show under its semi-transparent border and make a second tonal line. `background-clip: padding-box` removes that possible inner tint line.

## Correction

`ptah-form-controls.css` gives standalone family controls and the rich select trigger one focus-colored border for mouse and keyboard focus in glass. It clears outline and shadow and clips the translucent fill to the padding box. `styles.css` excludes `[data-ptah-control]` from its base, radius, focus and disabled glass recipes. Raw glass inputs and non-glass themes keep their rules. Focus uses `--ptah-focus-ring-color`, backed by `--glass-focus`; `design-tokens.spec.ts` checks the focus theme primary against base 100/200/300 at >=3:1.

The other lane owns `ptah-field.css`. Add this exact rule there after the box base rule to stop translucent fill under the field border:

```css
:root[data-glass='on'] .ptah-field__box {
  background-clip: padding-box;
}
```

No field owner file was edited here. Until this rule lands, the field's translucent border may still show a tonal inner line.

## Files and verification

Changed here: `apps/ptah-extension-webview/src/styles.css`, `apps/ptah-extension-webview/src/app/glass-form-edge.spec.ts`, `libs/frontend/ui/src/lib/form-controls/ptah-form-controls.css`, `libs/frontend/ui/src/lib/form-controls/form-controls-look.spec.ts`, and this report. The specs read CSS text and pin the glass exceptions and single focus border.

- `npm run verify -- -p @ptah-extension/ui`: exit 0; lint/typecheck 2 tasks and test 1 task passed.
- `npm run verify -- -t test -p ptah-extension-webview -- --testPathPatterns="design-tokens|glass"`: exit 0; 1 task passed.
- `npm run verify -- -t lint -p ui-class-audit`: exit 0; 1 task passed.
- `git diff --check`: exit 0.

The rich select trigger rule and its spec assertion were added after these verify commands. This final addition has not been checked by a new verify run, as each scoped command was allowed once. No browser or Electron was started, as requested. In Electron, inspect field and standalone input, textarea, native select and rich select in both glass themes at rest, hover, keyboard focus, mouse focus, invalid, disabled and read-only. Look for one edge at the field box or standalone control, including left/right corners and the translucent border.
