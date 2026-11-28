# Frontend Fix Review — PR #1532

Verdict: APPROVED
Review family: claude (implementer: antigravity)

Scope: `git diff -- libs/frontend/declarative-dashboard` read in full (4 sources, 6 specs). Static review only; no tests were run (the lane reports 25/25 suites, 327/327 tests, tsc and eslint clean). Angular template typecheck and live layout were not verified by anyone.

## Findings (confirmation of the six originals)

1. Blocking, trust-boundary / budget specs: FIXED, protection intact.
   - `trust-boundary.spec.ts`: the series fixture now has 2 series, so the legend (`ul li`) renders and the check expects 4 literal `markup` items. The description selector is `h3 + p`. For categorical x values the old "svg text equals markup" count drops from 3 to 2 (axis labels only). The category label is now checked separately: the truncated prefix is a literal prefix of `markup` and ends in `…`, and `<title>` equals the full `markup`. `expectInert` is still called. Every display text field is still asserted as text and not as HTML, so nothing is weakened. A truncated label cannot equal the full string, so the changed assertion is correct.
   - `budget-render.spec.ts:218-223,379,398`: the count moves from the expand button to `ptah-dashboard-stat [data-testid="stat-value"]`. That `<p>` is unconditional (`dashboard-stat.component.ts:74`), so it is one per stat and still catches silently dropped nodes. The limits asserted (200, 50, 4) are unchanged.
   - Minor: the old count also proved distinct focus-key ids per stat, and that is no longer covered. The `${id}:expand` focus key is still covered by the stat spec when `hasDetails` is true.
2. High, `.dp-stat-group` inside rows: FIXED. `surface-layout.component.ts:106` adds `.dp-stat-group.dp-row-item { display: grid }`. It has higher specificity than `.dp-row-item`, so source order is irrelevant. It keeps the flex-basis and min-width from `.dp-row-item`. Correct.
3. High, vertical divider: FIXED. `rowItemClass()` (`:382-385`) gives a vertical divider `dp-row-item-divider` (`flex:0 0 auto; align-self:stretch`). The `flex-1` on `ptah-surface-node` and on `ptah-dashboard-divider` (`surface-node.component.ts:115,232`) carries the height down. The divider host already has `self-stretch flex` when vertical (`dashboard-divider.component.ts:29-33`), so the chain row-item, node, divider is consistent. Horizontal dividers still use `dp-row-item`. The `[class]` binding does not clobber the `data-testid` attribute.
4. Medium, flex-1 propagation: FIXED. The host class is `flex-1` only when `!inlineKind()`; inline kinds keep `items-start` and their intrinsic size. Tailwind `flex-1` has basis 0% and is harmless in auto-height columns (vertical stacks, apps panel and display panel, which size to content). The only residual risk is a consumer with a fixed-height flex column. Content cannot shrink below its min-content size, so there is no clipping. The risk is cosmetic extra growth only. Not blocking.
5. Medium, negative bar labels: FIXED. The value label for a negative bar sits at `barY + barHeight + 17` (`dashboard-chart.component.ts:145`), up to about y=237. The viewBox grows to 300, the category labels move to 262 and the x label to 290, only when `showValueLabels && minY < 0` (`:203-206`). Positive charts are unchanged (280 / 242 / 270). Line charts are unaffected because `showValueLabels` requires `bar-chart`. Tick labels are untouched, since they track the plot (the minimum maps to y=220).
6. Low, stat Escape guard: FIXED. `collapse()` now returns early when `!hasDetails()` (`dashboard-stat.component.ts:132`). That prevents `stopPropagation` and a focus call on an expand button that does not exist, so Escape reaches the parent. The `[hidden]` binding on the details container is consistent with the guard.

## New issues

- Minor, `dashboard-chart.component.ts:24,27`: `flex-1` is added to both the host and the inner section. It is harmless but redundant, because the host is already a flex column and the section has `h-full`.
- Minor: the chart host changed from the default inline display to `flex`. It was previously a custom element with no display, so it is now a block-level flex container. This is intended and desirable; no regression found.

Residual uncertainty: jsdom specs check class names and DOM structure, not rendered layout. A visual check in Electron of a horizontal stack with a vertical divider, a stat group and a negative bar chart is still advisable.
