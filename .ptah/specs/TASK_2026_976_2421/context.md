# TASK_2026_976_2421: C1 chart owners (meter, ring, sparkline, stat)

Binding plan: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md` sections 3A.1 (Q1, Q2),
3A.3, row C1 of 3A.4, sections 4 to 7. Source: `.ptah/specs/TASK_2026_970_fa60/charts-timers-proposal.md`
sections 1.1, 2, 3 and 4.1.

Scope: step 2 "Component and gallery" only. No library, no `package.json` change, no adoption
in consumers, no look sheet, no removal, no timer or clock work (a parallel session does T1).

## Decisions

- New folder `libs/frontend/ui/src/lib/charts/`. It is added to `TOKEN_ONLY_DIRS` in
  `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`.
- `ptah-meter` moves from `foundation/meter.component.ts` to `charts/meter.component.ts`
  (with its spec). The selector, the class name `PtahMeterComponent` and the existing inputs
  stay. The public export in `libs/frontend/ui/src/index.ts` points to the new path.
  Reason: the owner must be token-only, and all C1 owners live in one guarded folder.
- Default meter behavior stays equal (tone `auto` = gold below `NEAR_LIMIT_PERCENT`, warn at
  or above it, err at or above 100). The DOM of the default meter stays as near to equal as
  possible, because consumers adopt it later with zero pixels where the DOM is equal.

## API contract (shared by the owner lane and the gallery lane)

`charts/chart.types.ts`:

```ts
export type PtahChartTone = 'neutral' | 'accent' | 'info' | 'ok' | 'warn' | 'err';
export type PtahMeterTone = PtahChartTone | 'auto';
export type PtahChartSize = 'xs' | 'sm' | 'md';
export type PtahStatTrend = 'up' | 'down' | 'flat';
```

| Selector | Class | Inputs |
|---|---|---|
| `ptah-meter` | `PtahMeterComponent` | `value` (req, number), `max` (req, number), `label` (req, string), `unit` (`''`), `tone` (`'auto'`), `size` (`'sm'`), `indeterminate` (`false`), `showValue` (`true`) |
| `ptah-ring` | `PtahRingComponent` | `value` (req), `max` (req), `label` (req), `unit` (`''`), `tone` (`'auto'`, same rule as meter), `size` (`'sm'`), `showValue` (`true`, centered percent text) |
| `ptah-sparkline` | `PtahSparklineComponent` | `values` (req, `readonly number[]`), `label` (req), `tone` (`'accent'`), `area` (`false`), `size` (`'sm'`), `valueFormat` (optional `(n: number) => string`) |
| `ptah-stat` | `PtahStatComponent` | `label` (req), `value` (req, `string \| number`), `delta` (optional string, for example `'+12%'`), `trend` (optional `PtahStatTrend`), `tone` (`'neutral'`), `hint` (optional string), `size` (`'sm'`) |

States that each owner handles: valid, empty or invalid data (`Unavailable` text, no ARIA value),
zero, over the max (clamped geometry, real value in text), and for meter `indeterminate`.

## Accessibility contract

- Meter and ring: `role="meter"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`,
  `aria-label`. Indeterminate meter: `role="progressbar"` without `aria-valuenow`.
- Sparkline: the SVG has `role="img"` and an `aria-label` "<label>: trend from X to Y, N points"
  (formatted with `valueFormat`). Fewer than 2 points: text "No trend data".
- Stat: text value always shown. Trend has a text alternative (visually hidden "up", "down",
  "flat"), the glyph is `aria-hidden`.
- Color is never the only signal. The value text is always present.
- Reduced motion: every transition and the indeterminate animation use
  `motion-reduce:transition-none` / `motion-reduce:animate-none`.
- Colors only from `--ptah-*` / existing token utilities (`state-*`, `var(--surface-*)`),
  correct in dark and in `ptah-glass-light`. SVG uses `currentColor` or `var(--…)` for
  `stroke` and `fill`. No raw hex, rgb or hsl.

## Lanes

| Lane | Owns |
|---|---|
| A (Claude Api) | `libs/frontend/ui/src/lib/charts/**`, `libs/frontend/ui/src/lib/foundation/meter.component*.ts` (move), `libs/frontend/ui/src/index.ts` (additive), `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts` (one list entry) |
| B (Codex) | `apps/ptah-extension-webview/src/app/ui-gallery/gallery-charts-family.component.ts` (new), the gallery registration file (minimal additive edit), the gallery spec |
| C (review) | read only, writes `review-c1.md` |
