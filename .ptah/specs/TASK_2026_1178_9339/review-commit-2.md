# Review: commit 4cd5de7de (danger button ink, seven themes)

VERDICT: APPROVE

Read-only review via `git show` and file reads. I did not run the spec (nx/jest were disallowed), so the 4.5:1 results below are from reading code, not from a computation I ran.

## 1. CSS correctness and specificity
- CONFIRMED: the new blocks win by source order, not by specificity. `ptah-tokens.css:9` and :312 use `[data-theme]`, and the new `[data-theme='retro']...` rules (`styles.css:2438-2450`) are also one attribute selector (0,1,0). `styles.css:16` imports tokens.css first. The overrides sit at about line 2438, so they come later and win. The anubis and anubis-light blocks (`styles.css:2423-2430`) rely on the same ordering.
- CONFIRMED: the defaults are declared at `ptah-tokens.css:128-142`. Hover and active fills use `var(--ptah-btn-danger-shade)` on the same element, so overriding `--ptah-btn-danger-shade` per theme takes effect in both mixes.
- CONFIRMED: no theme in the two blocks is also in the anubis blocks, so the new rules overwrite nothing existing. No other picker theme gets an override. They keep the stock ink (`--erc`) and shade (`--bc`), and the new spec measures those too.
- CONFIRMED: the overrides touch only `--ptah-btn-danger-fg` and `--ptah-btn-danger-shade`. `ptah-button.css:276-291` and :387 are the only consumers, and all of them are danger/btn-error rules. No non-danger component changes.
- SUSPECTED, low risk: whether any picker theme is still below 4.5:1 depends on the spec's numbers, which I did not run. The spec iterates over all `DAISYUI_THEMES` entries (spec ~L195-232), so a failing theme would fail the test.

## 2. Test quality
- CONFIRMED: the `themeToken()` regex (spec ~L153-165) is correct for the new blocks. `(?:^|\n)((?:\[data-theme='[^']+'\],?\s*)+)\{([^}]*)\}` matches a multi-line selector list that starts at the line start. `selectors.includes("[data-theme='x']")` picks the right group, and the property regex is applied to the block body only.
- CONFIRMED: the comment in the anubis block mentions `--ptah-btn-danger-fg` without a colon, so the property regex `prop:\s*` does not match it.
- CONFIRMED: hover and active are computed like the CSS. `interpolate([shade, fill], 'oklch')(0.9)` gives 90% fill and 10% shade, which equals `color-mix(in oklch, er 90%, shade)`. The same holds for 0.82. The fallbacks are `--erc` for ink and `--bc` for shade, matching `ptah-tokens.css:131` and :142.
- SUSPECTED, low: possible false passes.
  - The spec parses styles.css text. It does not render the cascade, so a later, more specific rule that overrides the token would not be caught.
  - The disabled test only checks the text of the `:is(:disabled...)` rule.
  - culori's `wcagContrast` may clamp out-of-gamut oklch differently from the browser. The shades are pure black or white, so any difference should be sub-0.1 ratio. If a theme is near 4.5, add a margin.
- SUSPECTED, nit: `themeToken()` would silently miss a block with a trailing selector such as `[data-theme='x'] .y`. That is intended, since those blocks are not token blocks.

## 3. Other users of `--ptah-btn-danger-fg`
- CONFIRMED: the only other consumer is the busy spinner, `ptah-button.css:386-388` (`border-color: var(--ptah-btn-danger-fg)`). It draws on the danger fill, so it uses the same ink the tests cover and stays visible. It sits on the rest fill, which is measured.
- CONFIRMED: no other file under `libs/` or `apps/` that I grepped consumes it. The grep covered tokens.css, button.css and styles.css only.

## 4. Rules
- CONFIRMED: the diff has no `any`, `ts-ignore`, `console` or `eslint-disable`. The new code uses `unknown` and `as ThemeSource`. The `require(...)` calls follow the existing file pattern.

## Summary
No blocking findings. Optional hardening: assert contrast with a small margin, such as >= 4.6, to absorb gamut-clamp differences.
