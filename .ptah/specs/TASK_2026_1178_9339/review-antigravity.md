# Review: danger button contrast (anubis themes)

**Verdict: approve.** There are no blocking findings. The minor notes below are optional.

Checked with `git diff`, file reads and a node/culori script. I did not run nx, jest, a build or axe, and I did not render a screenshot, so the real browser result is unconfirmed.

## 1. Cascade: correct

- **Specificity and order.**
  - `[data-theme='anubis']` and `[data-theme]` both have specificity (0,1,0).
  - `ptah-tokens.css` is imported at `styles.css:16`, and the new theme blocks sit at `styles.css:2417-2431`, so they come later and win.
  - I counted braces from line 2280 to 2440. The new blocks are at brace depth 0. The `@layer components` block that opens at 2293 closes at 2349.
  - If they were inside a layer, the unlayered tokens file would beat them. They are not.
- **Same element.** The tokens file declares `--ptah-btn-danger-bg-hover` and `--ptah-btn-danger-bg-active` on the `:root, [data-theme]` element, which is `<html data-theme=...>`. The `var(--ptah-btn-danger-shade)` inside them resolves on that same element, so the theme override is picked up.
- **Glass.**
  - No glass rule redeclares `--ptah-btn-danger-*`. In `ptah-tokens.css` they appear only at lines 128-142.
  - Glass rules do touch `.btn-error`: `styles.css:3360` sets the colour and `:3361` sets the hover background and `filter: brightness(1.08)`. These are class-level selectors, and `ptah-button.css:275/282/288` use `:is(.btn,#ptah-button)`, so the id wins for `data-ptah-button` buttons. For those buttons, glass only adds the brightness filter. The filter slightly lightens the fills, which leaves the dark-theme white ink above 4.5:1 and improves the light-theme dark ink.

## 2. Other users and themes: no regression found

- **Token consumers.** `--ptah-btn-danger-*` is consumed only in `ptah-button.css:276-291` and `:387` (the busy spinner border, which follows the new ink). I found no other consumer.
- **Other `.btn-error` users.** The other users (`canvas-lane-view`, `account-detail-view`, `agent-card-permission`, `agent-monitor-panel`, `git-confirm-dialog`, `hunk-toolbar`) are raw daisyUI buttons without `data-ptah-button`, so they never read these tokens.
- **Other themes.** The default `--ptah-btn-danger-shade: oklch(var(--bc))` is the same value the old `color-mix` used inline, so every other theme renders the same as before.
- **Selector reach.** Only the exact `data-theme='anubis'` and `'anubis-light'` blocks set the overrides.

## 3. Contrast recomputed

Error colours come from `tailwind.config.js`:

- anubis: `#dc2626`
- anubis-light: `oklch(64% 0.246 16.439)`, which is `#fe1c55`

The hover and active fills are the error colour mixed in oklch toward the shade, at 90% and 82% error.

| Theme | State | Fill | Ink | Contrast |
|---|---|---|---|---|
| anubis | rest | #dc2626 | #fff | 4.83 |
| anubis | hover | #bf2020 | #fff | 6.10 |
| anubis | active | #a91b1b | #fff | 7.38 |
| anubis-light | rest | #fe1c55 | #131317 | 4.86 |
| anubis-light | hover | #ff4766 | #131317 | 5.69 |
| anubis-light | active | #ff5d73 | #131317 | 6.42 |

All six are at or above 4.5:1.

The shade override is needed. With the old shade (toward base-content), the new ink would have failed on hover and active:

- anubis: 4.11 on hover and 3.63 on active.
- anubis-light: 4.15 on hover and 3.65 on active.

The old ink (`error-content`) measured 3.87 (dark) and 4.12 (light) at rest, which matches the reported axe values.

## 4. Would the new tests fail if the token were removed?

- **Removing `--ptah-btn-danger-fg` or `--ptah-btn-danger-shade` from a theme block in `styles.css`.** The `blockProperty` helper (`status-badge-contrast.spec.ts:104-113`) throws, so all three `ptahButton danger ink` cases fail. This works because the regex is anchored to the theme block.
- **Removing the default shade token from `ptah-tokens.css`.** The new `'btn-danger-shade'` entry in `ptah-tokens.spec.ts` (`:85`, checked at `:183-184`) fails, because the file would no longer contain `btn-danger-shade:`.
- **Reverting the hover and active `color-mix` to `oklch(var(--bc))`.** The `--ptah-btn-danger-bg-hover/-active ... var(--ptah-btn-danger-shade)` wiring tests fail.
- **A `ptah-button.css` rule that stops using `--ptah-btn-danger-fg`.** The "rest, hover and active" wiring test (expects 3 rules, each with `color: var(--ptah-btn-danger-fg);`) fails.

## Minor notes (optional)

1. **Duplicated mix shares.** The test hard-codes the hover and active shares `0.9` and `0.82` (`status-badge-contrast.spec.ts` ink test). They are not read from `ptah-tokens.css`, so changing the CSS percentages would not fail the test and the contrast numbers could go stale. A regex extraction would remove the duplication.
2. **Browser vs culori interpolation.** The test models black and white as achromatic oklch in culori, while browsers handle a powerless hue differently. The margins in the table (at least 4.83) absorb any difference, but only a real axe run in the e2e suite proves it.
3. **Formatting-only change.** The `customThemes` reformat in `status-badge-contrast.spec.ts` is unrelated to the fix. This is harmless.
4. **Untracked files.** `.ptah/specs/TASK_2026_1178_9339/` and `review-codex.md` are untracked. Keep them out of the commit.
