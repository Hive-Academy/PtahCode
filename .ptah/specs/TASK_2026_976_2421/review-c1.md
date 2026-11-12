# C1 code logic review

## Verdict

**NEEDS_REVISION — 6/10.** The owner and gallery wiring match the requested API, and the existing specs cover common values, ARIA roles, and reduced-motion classes. Three confirmed numeric boundary defects remain. This is above the 3–4 band because ordinary inputs and the public exports work; it is below the 7–8 band because a valid input can crash rendering and other valid inputs give wrong output.

## Numbered findings

1. **Major — large sparkline inputs crash rendering.** `libs/frontend/ui/src/lib/charts/chart-geometry.ts:58-59` spreads the entire `values` array into `Math.min` and `Math.max`. A 200,000-point finite array throws `RangeError: Maximum call stack size exceeded` in Node; Angular's computed `points` then fails instead of rendering the chart. The `readonly number[]` API has no length limit. **Fix:** scan the series in one loop for min and max, then build points without argument spreading; add a long-series test.
2. **Major — finite extremes generate invalid SVG points.** `libs/frontend/ui/src/lib/charts/chart-geometry.ts:58-65` computes `span = max - min`. For `[-1e308, 1e308]`, both input numbers pass the finite filter in `sparkline.component.ts:35`, but `span` is `Infinity` and the second y coordinate becomes `NaN`. A valid two-point trend produces `0,22 100,NaN`, so the SVG cannot faithfully draw it. **Fix:** normalize with overflow-safe arithmetic or explicitly handle a non-finite span while retaining the endpoints; test finite extremes.
3. **Minor — negative values are spoken as zero while the visible value stays negative.** `libs/frontend/ui/src/lib/charts/meter.component.ts:18,36-40` and `ring.component.ts:16,37-41` clamp `aria-valuenow` to 0 for negative finite input but set `aria-valuetext` only when the percent exceeds 100. Thus `-5 / 100` is visible while a screen reader gets a value of 0. **Fix:** set `aria-valuetext` to the actual value for below-min inputs too, or classify negative values as unavailable if that is the intended domain; add an ARIA assertion for negative values.

## Five logic questions

1. **Silent failure:** finite extreme sparkline data passes the filter yet writes a `NaN` coordinate (`chart-geometry.ts:58-65`).
2. **Unexpected user action:** opening a chart fed a long time series throws during Angular rendering (`chart-geometry.ts:58-59`).
3. **Wrong answer from input:** negative meter and ring data has conflicting visible and spoken values (`meter.component.ts:18,36-40`; `ring.component.ts:16,37-41`).
4. **Dependency failure:** there is no external service or asynchronous dependency in these owners. The supplied `valueFormat` callback is invoked directly (`sparkline.component.ts:41-42`); failure handling for a throwing callback is unspecified, so this is **unconfirmed** as a requirement gap.
5. **Unspecified case:** the contract does not cap series length or magnitude. The geometry helper needs bounded, overflow-safe handling for any finite `readonly number[]` (`chart-geometry.ts:51-65`).

## Scope and evidence

Read the complete chart owner files and specs, gallery family and registration diff, prior meter implementation, C1 context, epic sections 3A.3 and 4–7, root guidance, token CSS, and renderer Tailwind config. The `state-*` utilities are defined in the renderer Tailwind config; `--ptah-badge-*-ink` is defined in `ptah-tokens.css`; `--ptah-gold` and `--surface-border-strong` are existing theme variables in renderer styles, including glass overrides for the latter. Dynamic chart classes appear as complete literals in source. Components use standalone, OnPush, signal inputs, and no `innerHTML` or `any`. The default meter retains its layout, size, and auto-tone paths; the exported meter moves through the charts barrel. The gallery registers all four types and samples their tones, sizes, and primary states.

The implementation lanes report successful scoped UI verify, renderer template check, and gallery test. I did not rerun them. `ptah_get_diagnostics` returned unavailable because its TypeScript check exceeded 45 seconds. No Electron screenshot was available in this read-only review, so rendered dark and glass-light appearance remains **unconfirmed**. The tests assert ordinary geometry and ARIA attributes, but omit the three cases above. Step 2 is the current scope; the epic's later look, adoption, and removal gates are outside this verdict.

## Decisions

- Treat finite negative values as valid because `isValidRange` accepts them and the owner comments explicitly say geometry clamps them. Options were to reject them or preserve the real value in `aria-valuetext`; preserving it follows the current visible text and is reversible.
