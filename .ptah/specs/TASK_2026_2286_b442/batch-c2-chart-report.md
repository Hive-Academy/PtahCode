# Batch 3 (daily stacked bar chart) — audit and completion report

Write set: `libs/frontend/dashboard/src/lib/components/usage-dashboard/stacked-bar-chart.{component.html,component.ts,geometry.ts,geometry.spec.ts}`.

## Already on disk (previous agent)

- The plot wrapper `relative min-h-[220px] w-full flex-1` (`data-testid="usage-chart-plot"`). The SVG is `absolute inset-0 h-full w-full` and keeps `preserveAspectRatio="none"`. The axis labels are HTML, outside the SVG, now in muted ink.
- `barWidth(dayCount)` sets the width to slot * 0.64, clamped to 2..28. A single day keeps the 48-unit bar.
- `roundedTopPath()` gives a 3-unit rounded top. Only the last segment of each day is a `<path>`. The lower segments stay `<rect>` with `x`, so the page spec at about line 747, which reads `bars[0].x`, still holds.
- Segments have a 1 px `stroke-base-200` stroke with `vector-effect="non-scaling-stroke"`. Gridlines use `var(--ptah-meter-track)` at 1 px, non-scaling.
- The `dayTotals` computed is shared by the bars and the gridlines. `peakDayIndex()` was added.
- The aria-label names the metric (new `metricLabel` input), the range, the peak day and the Breakdown Day tab.
- A geometry spec with 5 cases.

## Changed in this pass

- Host is now `flex h-full min-h-0 flex-1 flex-col`. Root is `flex h-full min-h-0 w-full flex-1 flex-col gap-ptah-heading`. The token is checked in `apps/ptah-extension-webview/tailwind.config.js:88`. The legend `mb-2` and readout `mt-2` are removed because the gap replaces them.
- Fixed a bug in the aria-label: an unpriced peak read "peak Oct 18 at at least $2". It now reads "peak Oct 18: at least $2" (priced: "peak Oct 18: $2"). The `days[peak]!` assertion was replaced by `?? ''`.
- Added guards in the geometry: `barWidth` returns the single-day width for 0, NaN or a count of 1 or less, so it never divides by zero. `roundedTopPath` clamps a NaN, negative or zero width or height to 0, so the path never contains NaN.
- Added 4 cases to the geometry spec: zero and NaN day counts, zero/negative/NaN segment paths, a single-day peak and a range with one non-zero day, and `sanitizeSeriesValue` for negative, NaN and Infinity.

## Parity check (unchanged, confirmed in the template)

The focusable day columns (`tabindex=0`, `role=img`, per-column aria) are kept, with arrow-key `onColumnKeydown`, the focus marker line, the `role=status` live readout (day total plus per-provider items), the idle prompt, the unpriced hatch columns and their legend entry, and the empty "No usage in this range." (now `min-h-[220px]`). No `data-testid` or aria label was removed. No assertion was weakened.

Edge cases: a zero-value segment is skipped. A day with one segment draws as a path, which is both the bottom and the top. A day with all zeros draws no bars, so `yMax` never divides by zero for drawn bars. Values pass `sanitizeSeriesValue`. The geometry uses only x and width, with no left/right-specific CSS, so it is RTL-neutral.

## Checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath .../stacked-bar-chart.geometry.spec.ts`: `Tests: 9 passed, 9 total`. There are no other stacked-bar-chart spec files.
- `npx eslint` on the 4 files: exit 0, 0 errors, 3 warnings (`no-non-null-assertion` at component.ts lines 188, 212, 273). All 3 predate this batch: no added line contains `!`.
- TypeScript: `ptah_get_diagnostics` was still running when this report was written. The previous agent reported that the lib tsc passed. Retry is pending.
- Not run, because it is outside the allowed checks: `usage-dashboard.component.spec.ts`, which holds the chart DOM assertions, and `typecheck-templates`. The coordinator should run both.

## Deviations

- The host also carries `flex-1 min-h-0` next to `h-full`. The page sets `flex-1` on the host inside a flex column, and `min-h-0` lets the column shrink.

## Open items

1. The page `usage-dashboard.component.html` (line ~93, not in my write set) does not bind `[metricLabel]`. Until it passes `[metricLabel]="chartMode()"` (or "cost"/"tokens"), the aria-label leaves out the metric. Owner: the page-layout agent.
2. The coordinator should run `usage-dashboard.component.spec.ts` and `typecheck-templates -p ptah-extension-webview`. I found no conflicting chart assertion: the lines at about 479-492 (SVG classes, plot wrapper) and 747 (`bars[0].x`) match the current DOM.
