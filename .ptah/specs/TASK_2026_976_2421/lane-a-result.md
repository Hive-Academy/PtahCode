# Lane A result: C1 chart owners

## Files

New in `libs/frontend/ui/src/lib/charts/`:

- `chart.types.ts`: `PtahChartTone`, `PtahMeterTone`, `PtahChartSize`, `PtahStatTrend` (as in context.md).
- `chart-geometry.ts` (+ spec): tone-to-class maps (`CHART_BG`, `CHART_TEXT`), `isValidRange`,
  `percentOf`, `resolveInk` (auto rule with `NEAR_LIMIT_PERCENT`), `sparklinePoints`. Internal, not exported by the barrel.
- `meter.component.ts` (+ spec): moved from `foundation/`, extended.
- `ring.component.ts`, `sparkline.component.ts`, `stat.component.ts` (+ one spec each).
- `charts.a11y.spec.ts`.
- `index.ts`: barrel (types and the four components).

Changed:

- `libs/frontend/ui/src/index.ts`: one added line `export * from './lib/charts';` after the badge line.
  The file must stay a pure list of `export *` lines (R7 barrel guard), so the meter export moves through the barrels.
- `libs/frontend/ui/src/lib/foundation/index.ts`: removed the line `export * from './meter.component';`.
  This file was not in the lane list, but the move needs it (else a duplicate/missing export).
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`: `'charts'` added to `TOKEN_ONLY_DIRS`.
- Deleted `foundation/meter.component.ts` and `foundation/meter.component.spec.ts`
  (with `git rm`, so the deletion is staged in the index; nothing is committed).

## Public API (follows context.md exactly)

| Selector | Inputs |
|---|---|
| `ptah-meter` | `value`, `max`, `label` (req), `unit`, `tone` (`'auto'`), `size` (`'sm'`), `indeterminate` (`false`), `showValue` (`true`) |
| `ptah-ring` | `value`, `max`, `label` (req), `unit`, `tone` (`'auto'`), `size` (`'sm'`), `showValue` (`true`) |
| `ptah-sparkline` | `values`, `label` (req), `tone` (`'accent'`), `area` (`false`), `size` (`'sm'`), `valueFormat` |
| `ptah-stat` | `label`, `value` (req), `delta`, `trend`, `tone` (`'neutral'`), `hint`, `size` (`'sm'`) |

Tone mapping: `info` → `state-run`, `ok` → `state-done`, `warn` → `state-need`, `err` → `state-err`,
`neutral`/`accent` → `--ptah-badge-neutral-ink` / `--ptah-badge-accent-ink`, auto below near limit → `--ptah-gold`.
SVG marks use `currentColor` with a token text class. No hex/rgb/px in the folder (token guard passes).

## Behavior notes

- Default `ptah-meter` DOM is the same as before (same classes `text-xs`, `h-1.5`, track and fill classes, value text).
  Two attribute changes: `aria-valuenow` is now clamped to `max` when the value is over the max, and
  `aria-valuetext` (the real value text) is added only in that case. The value text and bar are unchanged.
- `showValue=false` on the meter keeps the value text as `sr-only`. On the ring it removes only the center percent;
  the value text beside the ring always shows.
- Ring `xs` hides the center percent (too small); the value text beside it stays.
- Indeterminate meter: `role="progressbar"`, `aria-label`, no ARIA values, text "In progress", fill `animate-pulse motion-reduce:animate-none`.
- Sparkline drops non-finite values; fewer than 2 points shows "No trend data". Line uses `vector-effect="non-scaling-stroke"`.
- Stat: empty, blank or non-finite value shows "Unavailable". No SVG ids anywhere.

## Verify

- `npm run verify -- -p ui`: lint + typecheck 2/2 succeeded, test 1/1 succeeded, exit code 0.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: 1/1 succeeded, exit code 0.

## Open points

- No visual review was done in Electron (out of lane scope; gallery is lane B).
- `foundation/index.ts` edit is outside the listed files but required by the move.
- The meter deletion is staged by `git rm`; the coordinator stages the rest.
