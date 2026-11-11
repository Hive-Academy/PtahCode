# Batch 0b: ratchet fix

## Files changed
- apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-shape.component.ts (319 -> about 227 lines)
- apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-shape-controls.component.ts (new, about 140 lines)
- apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-type.component.ts

## Form chosen
Class maps with literal keys, for example
`[class]="{ 'rounded-ptah-control': item.token === '--ptah-radius-control' }"`.
Each key is a full literal utility name, and every condition compares the literal `token` or `role` field.
One class per key: Angular does not split a key that holds two classes.
The icon svg keeps a static `class="text-base-content"`.
The data fields (`radiusClass`, `shadowClass`, and others) stay because the captions read `sizeClass`.
The shape file was above 220 lines. The control heights, icon sizes and state inks block moved to
`ptah-gallery-tokens-shape-controls`, which `GalleryTokensShapeComponent` imports and renders inside its section.
No change to `tools/ui-class-audit/**` and no spec change.

## Check results
1. Ratchet: `ui-class-audit: TOTAL 5570 blocked token(s) across 452 file(s); 0 token count(s) over baseline`
2. ngc strict templates: exit code 0 (run before the last small edit that split multi-class keys).
3. `npm run verify -- -p ui-class-audit,ptah-extension-webview`: `lock released ..., exit code 0`.
   The first run failed one spec (`.h-ptah-control-field` missing) because of a two-class key. I fixed it, and the second run passed.
