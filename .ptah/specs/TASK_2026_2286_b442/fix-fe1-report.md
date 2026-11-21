# Fix round FE1: KPI money format, provider bar width, segment gaps

## Changes (libs/frontend/dashboard/src/lib/components/usage-dashboard/)

- `usage-kpi-strip.component.ts` (defect 4a): `costLabel` now calls `formatCostCell(total, unpricedFacts > 0, 'Unknown')`, and `savingsValue` calls `formatCostCell(savings, unknownFacts > 0)`. The tooltip reuses `savingsValue`. The `formatUsd` import is removed. "Unknown", the "≥ " lower-bound prefix and the "—" fallback for missing savings all render as they did before. `formatTableUsd` only differs from `formatUsd` below $0.01, so the dashboard spec's expectations still hold: `$6.00`, `Cache savings $2.40`, `Cache savings ≥ $2.00` and `a lower bound`.
- `usage-cost-summary.component.ts` (defect 5): the bar width is now `barWidthPercent(row.shareOfCost, 1)`. That is the same share the caption prints, with a 2% minimum for a non-zero share and 0 when the share is zero or null. The `maxCost` computed is removed.
- `usage-breakdown-table.component.ts` (defect 8): `gap-px` is removed from the Model-mode concentration strip and from the peak-day cost bar. Segments drop `shrink-0` and get the new `.usage-tbl-seg` class (`box-sizing: border-box; min-width: 2px; flex-shrink: 1`). Every segment except the last draws its divider inside its own box with `box-shadow: inset -1px 0 0 oklch(var(--b1))` (DaisyUI 4 surface variable, as used in `surface-renderer.component.ts`). If the segments add up to more than the track, they shrink to fit instead of clipping the last one, and a non-zero last segment stays at least 2px wide. Test ids, titles and aria attributes are unchanged.
- New `usage-kpi-strip.component.spec.ts`: sub-cent cost and savings ($0.0034 / $0.0012), the lower-bound prefix, "Unknown", and dollar amounts above a cent ($6.00 / $2.40).
- New `usage-cost-summary.component.spec.ts`: a two-provider fixture (60 / 40) asserts the bar widths 60% / 40% next to the captions "60% of cost" / "40% of cost". It also asserts a 2% sliver for a tiny share and 0% for a zero or unknown share.
- `usage-table-rows.ts` and its spec are unchanged, because the fix needed no helper.

## Checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath <2 new specs> .../usage-table-rows.spec.ts`: 3 suites passed, 20 tests passed (`.ptah/tmp/fix-fe1-jest.log`).
- `npx eslint` on the 5 touched or new files: exit 0, no output.

## Not done

- `usage-dashboard.component.spec.ts` was not run, because it is outside this brief's check list and another agent is editing that component. The coordinator's gate covers it.
- The template was not checked with `typecheck-templates`. That is the coordinator's step.
- Defect 8 has no visual check yet (no browser in this lane).
