# Round 2: field edge

The gallery case is a floating `ptah-field` on base-200 with a focused `ptahInput`. The same field owner covers stacked fields, both sizes, textarea, native select, and the rich select trigger. The glass rules also reach the native controls because the directives add `.input`, `.textarea`, or `.select`.

## Edge sources and cascade

| Source | Selector and specificity | Paint and state |
|---|---|---|
| `libs/frontend/ui/src/lib/form-controls/ptah-field.css:19` | `.ptah-field__box` `(0,1,0)` | One border and fill at rest. `overflow: hidden` clips the child, not the box's own edge. |
| `ptah-field.css:166` | `.ptah-field__box:hover:not(:has(:disabled))` `(0,3,0)` | Hover border and fill. |
| `ptah-field.css:171` before this fix | `.ptah-field__box:has(.ptah-field__body :focus-visible)` `(0,3,0)` | A 2 px outline outside the existing border, with a positive offset. This made the two concentric edges. Text inputs can match `:focus-visible` after a mouse click in Chromium. |
| `ptah-field.css:125,172` | Body control reset `(2,0,1)` for native controls; focus reset `(2,1,1)` | Removes the inner border, fill, shadow, and outline. The focus reset now also matches plain `:focus`. The rich select trigger uses the same id-weighted body selector. |
| `ptah-field.css:192,196` | Invalid box and rail `(0,4,0)` | Error border and a bottom rail only for invalid state. The rail lies on the box's bottom edge. |
| `ptah-field.css:232,244` | Disabled and read-only box `(0,4,0)` | Disabled border/fill/opacity; read-only dashed border. |
| `ptah-field.css:250` | `.ptah-field .ptah-field__box:has(.ptah-field__body :focus)` `(0,4,0)` | Focus border plus a 1 px inset band of the same color. It comes after invalid and read-only rules, so focus remains visible. The border width stays fixed. |
| `libs/frontend/ui/src/lib/form-controls/ptah-form-controls.css:19,123` | Family base `(1,2,0)` and focus `(1,3,0)` | Own border and offset outline for standalone controls. The field body reset has two id weights and wins inside a field. |
| `apps/ptah-extension-webview/src/styles.css:1060,1105` | `input/select/textarea:focus-visible` `(0,1,1)`; `:focus:not(:focus-visible)` `(0,2,1)` | Global outline for keyboard focus and removal for other focus. Both lose to the field reset. |
| `styles.css:2581` | `.input/.textarea/.select` `(0,1,0)` | Base fill and border color. The body reset wins. |
| `styles.css:3357,3365,3373` | Glass base `(0,3,0)`, glass focus `(0,4,0)`, glass disabled `(0,4,0)` | Glass fill, border, inset shadow; on focus, a second offset outline, a 5 px shadow, and a border color. The body focus reset wins by specificity. These focus paints could cause the thin lines at the child's left and right clipped edges when they survived. |
| `styles.css:3990` | Glass surface utility override `(0,4,0)` | Changes the control fill on base-100/200/300 or surface utility classes. The field reset wins. |
| `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:19,40` | Trigger base `(0,1,0)` and focus `(0,2,0)` | Trigger border and offset outline outside a field. The field body reset wins inside a field. |

DaisyUI `^4.12.24` supplies the `.input`, `.textarea`, and `.select` host look. Their directive host classes in `input.directive.ts:17`, `textarea.directive.ts:15`, and `select.directive.ts:16` activate that look and the glass selectors. `field.component.ts:49-85` places the control in `.ptah-field__body` inside the bordered box and places the rail on that box. The inner left and right lines were the child's edge or clipped focus paint; removing its border and shadows in both focus states removes those lines.

## Correction

`ptah-field.css` now draws focus on the box border and an adjacent inset band. The combined width is the 2 px focus token, with no offset outline and no layout shift. The focus token uses `--glass-focus` when available; round 1 measured that color above 3:1 against dark glass and `ptah-glass-light` adjacent surfaces. On invalid focus, the focus edge remains visible while the rail keeps the error state. `form-controls-look.spec.ts` pins the single box edge and the native and rich trigger resets for both focus selectors. No template, directive, renderer style, or other lane file was changed.

## Verification

- `npm run verify -- -p @ptah-extension/ui`: exit 0. Lint and typecheck: 2 tasks succeeded. Test: 1 task succeeded.
- `npm run verify -- -t test -p ptah-extension-webview -- --testPathPatterns=design-tokens`: exit 0. One test task succeeded.
- `git diff --check`: exit 0.

No browser or Electron session was started, per task instruction. Visual quality was not checked from a rendered screenshot.
