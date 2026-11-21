# Fix round fe2 — chart readout precision, peak wording, repository token assertion

## Changed (libs/frontend/dashboard/src/lib/components/usage-dashboard/)

- `stacked-bar-chart.component.ts` — new optional input `detailFormat` (default: `valueFormat`).
  The focused-day readout (day total and per-provider values), the per-day column `aria-label`s
  and the peak value in the chart `aria-label` use it; the axis gridline labels keep `valueFormat`.
  The chart `aria-label` peak clause now comes from the pure helper `peakSummary`.
- `stacked-bar-chart.geometry.ts` — `peakSummary(totals, unknownDays, dayLabel, format)`: says
  "peak <day>: <value>" when every day is priced, "highest known cost <day>: <value>" when any
  day in the range is unpriced (defect 9). Token mode passes no unknown flags, so it keeps "peak".
- `usage-dashboard.component.ts/.html` — `chartDetailFormat`: `formatTableUsd` in cost mode,
  `formatCount` in tokens mode, bound as `[detailFormat]` (defect 4b). Added
  `data-testid="usage-repository-token-count"` on the full-count element of the repository tile.
- `usage-dashboard.component.spec.ts` — repository tile now also asserts the exact trimmed text
  `15` of the count element (old substring checks kept) (defect 10b). Readout / day-label
  expectations updated to the precise values (`$2.00`, `at least $3.00`, `Anthropic: $3.00`,
  `total 2,000`, `total 1,200; … OpenCode: 1,000`); each is at least as strict as before.
  New chart tests: detail vs axis formats; "peak" vs "highest known cost" in the chart label.
- `stacked-bar-chart.geometry.spec.ts` — `peakSummary` tests for both wordings, the lower-bound
  prefix and the empty range.

## Decisions

- Tokens mode readout uses `formatCount` (full count) rather than the compact format, so the
  readout is precise in both modes. Reversible by passing `formatCompactTokens` instead.
- Per-day column aria labels use the detail format too ("focused-day values and their aria text").

## Checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false
  --runTestsByPath …usage-dashboard.component.spec.ts …stacked-bar-chart.geometry.spec.ts`:
  2 suites passed, 52 tests passed.
- `npx eslint` on the 7 files: 0 errors, 18 warnings (pre-existing non-null assertions and
  empty arrow functions in the spec; none from this change's new lines' rules).
- Not run: `typecheck-templates` (not allowed in this round); the coordinator should run it,
  since the dashboard template gained a binding.
