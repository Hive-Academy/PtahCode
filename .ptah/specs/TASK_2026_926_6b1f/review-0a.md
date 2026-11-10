# Review 0a: foundation tokens

## Verdict

APPROVE. No blocker and no major finding. Six minor findings follow. None changes a pixel.

## Findings

1. minor, `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts:107-120`: The raw-value test is
   vacuous today. `TOKEN_ONLY_DIRS` is `['tokens']`. That folder holds only `.css` and `.spec.ts`
   files. The filter keeps only `.ts` and `.html` files that are not specs. Thus the file list is
   empty and the loop never runs. Fix: add `css` to the extension filter and exclude
   `ptah-tokens.css` itself (it must hold `oklch(` fallbacks and `px` values). Or add one
   assertion that `files.length` is greater than 0 once a first component folder is added.
2. minor, `ptah-tokens.spec.ts:88-90`: The test checks the token name only (`toContain('--x:')`).
   It does not check the value. A change of a value, for example `--ptah-gap-field`, passes. It
   also matches a name inside a comment. Fix: add a value table for the six gap tokens and the
   four control heights (`expect(CSS).toMatch(/--ptah-gap-field:\s*var\(--ptah-space-4\);/)`).
3. minor, `ptah-tokens.css:137-141`: The media query `(max-width: 639px)` leaves a gap for a
   viewport width between 639 px and 640 px (zoom gives fractional widths). Tailwind `sm` starts
   at `min-width: 640px`. Fix: use `@media (width < 640px)`, or `(max-width: 639.98px)`.
4. minor, `ptah-tokens.css:79-81` and `tailwind.config.js:106-107`: The focus ring has a color
   name (`ring-ptah-focus`) but no offset color. Tailwind uses white for `ring-offset-*` by
   default. On a dark glass surface, a ring with an offset shows a white gap. Fix: add
   `--ptah-focus-ring-offset-color` (the surface behind the control) and a `ringOffsetColor`
   name before the first control uses `ring-offset-2`. Or state in the contract that the offset
   is 0 on glass.
5. minor, `foundation-tokens.md` section 6: The contract does not list `ringColor` and
   `outlineColor` in the `theme.extend` list, but the config and the app spec (`design-tokens.spec.ts:162-173`)
   include them. Fix: add both to section 6 so that the contract and the guard match.
6. minor (design), `ptah-tokens.css:50-65`: Missing tokens that a button, an icon button and a
   floating-label field need. (a) Icon size (for example 14 px, 16 px, 20 px). An icon button
   is square and has the height as the width, so `w-ptah-control-sm` works only through the
   spacing key. (b) Disabled opacity. (c) Field padding-top for the floating label (the 52 px
   height has no top-padding rule). Add them in batch 0b. They are not required for zero pixel.

Type scale notes (no change required): section title (16/24/600) and group title (14/20/600)
differ by only 2 px, and page title is 20 px. The steps 20, 16, 14 are close, but each pair
differs in size or weight. Body and group title share 14/20 and differ in weight (400, 600) by
intent. Label and hint share 12/16 and differ in weight and color by intent. Caption at 11 px
with weight 500 and the muted color is the weakest role. Check the contrast of
`base-content-muted` at 11 px in the Look gate on `ptah-glass-light`.

## Checked and correct

1. Zero pixel, duplicate keys. Full `theme.extend` in `apps/ptah-extension-webview/tailwind.config.js`
   has these sections once each: `colors` (12), `fontSize` (44), `height` (65), `minHeight` (71),
   `spacing` (77), `borderRadius` (92), `boxShadow` (97), `transitionDuration` (102),
   `transitionTimingFunction` (107), `ringColor` and `outlineColor` (111-112), `fontFamily`,
   `animation`, `keyframes`. There is no duplicate section key. No key overwrites an earlier one.
2. Zero pixel, name collision. No Tailwind color has a `ptah-` name (`colors` has only
   `base-content-muted`, `state-*`, `surface-*`). Thus `text-ptah-*` has no color clash. A grep in
   `apps` and `libs` finds no class that starts with `text-ptah-`, `h-ptah-`, `gap-ptah-`,
   `p-ptah-`, `rounded-ptah-`, `shadow-ptah-`, `ring-ptah-`, `duration-ptah-` or `ease-ptah-`.
   The only hit, `peer-session-picker.component.ts:116`, is the string `ptah-ptah-extension-chat-`,
   not a class. Existing custom properties `--ptah-gold*`, `--ptah-link`, `--ptah-accent-ink`,
   `--ptah-motion-*`, `--ptah-ease-*` do not match any new token name.
3. Zero pixel, nothing consumes the tokens. `styles.css` has no `var(--ptah-text-`,
   `var(--ptah-control-`, `var(--ptah-gap-` or similar. The `[data-theme]` selector adds only
   custom properties, and no existing rule reads them.
4. CSS resolution. `--surface-border` and `--surface-border-strong` are declared on `[data-theme]`
   (`styles.css:161-166`), `[data-theme-mode='dark']` (173) and `:root[data-theme][data-glass='on']`
   (3560-3651). `--elev-shadow*` use the same selectors (169-176, 3606-3607). `data-theme` and
   `data-theme-mode` are both set on the root element (`display-window.component.ts:153`).
   Thus each reference resolves on the same element. `--glass-focus` (2882, 3495) and
   `--glass-shadow-overlay` (2879, 2917) exist only under glass. Both have a fallback in the token
   file (lines 81, 87). `--state-ink-*` exists only on stock themes (330-352). All four have a
   DaisyUI fallback (lines 94-97). `--ptah-motion-out`, `--ptah-motion-in`, `--ptah-ease-soft` and
   `--ptah-ease-gentle-in` are declared on `:root` (`styles.css:42-47`) with no fallback, and
   they inherit to any nested element. No token resolves to the guaranteed-invalid value.
5. Nested `data-theme`. A nested element recomputes each token against its own variables. This is
   the same behavior as the existing `--surface-*` block. Under glass, a nested element inherits
   the root `--glass-focus`. This is consistent with the existing glass tokens and not a defect.
6. Import. `styles.css:15-16` places the new `@import` after the other three `@import` lines and
   before `@tailwind base`, so no rule precedes it. The path `../../../libs/...` from
   `apps/ptah-extension-webview/src/` reaches the repository root (three levels). The build
   `styles` entry is `apps/ptah-extension-webview/src/styles.css` (`project.json:35`) with no
   `stylePreprocessorOptions`. The existing `gridstack` and `@angular/cdk` imports use the same
   esbuild resolver. The Electron `copy-renderer.js` copies build output and does not read
   `styles.css` by source path.
7. Contract match. Spacing (7), white-space (10), control (7), type (8 roles x 3), shape (6),
   focus (3), elevation (4), motion (5), state (4) and z (4) tokens exist in the CSS with the
   contract values, and `TOKEN_NAMES` in the ui spec lists the same set. No CSS token is missing
   from the contract. White-space ladder: label 4 < controls 8 < field 16 < group 24 < section 32.
   The gap inline (8) equals controls (8) by intent. Heading gap (12) lies between label and field.
8. Specs. Both specs have no `any` and no `@ts-ignore`. The ui spec imports only `node:fs` and
   `node:path` and stays in its lib. `it.each(TOKEN_NAMES)` has 61 entries. `it.each(ptahEntries)`
   is non-empty, and `used.length > 0` guards against an empty match. The section-list test
   fails if a section is added or removed. `require('../../tailwind.config.js')` is the same
   pattern as `elevation-tokens.spec.ts:5` (that file uses `require` with no cast and no ESLint
   disable). The typed cast is stricter and acceptable. `WORKSPACE_ROOT` (four levels up from
   `src/app`) is correct.
9. Reduced motion. The media block comes after the main block with the same selector, so it wins.
10. Privacy. A search of the new files and the contract for a drive path, user name or email finds
    nothing.
