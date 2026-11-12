# Lane A fix result (review-c1 findings)

## Changes

1. `charts/chart-geometry.ts`: `sparklinePoints` no longer spreads into `Math.min` / `Math.max`.
   A new private `extent()` finds min and max in one loop.
   Test: `chart-geometry.spec.ts` "maps a series of 200000 points without a stack overflow".
2. `charts/chart-geometry.ts`: overflow-safe normalization. When `max - min` is finite, the ratio is
   `(v - min) / span`. When it overflows to Infinity, the ratio is `(v / 2 - min / 2) / (max / 2 - min / 2)`.
   Test: `[-1e308, 1e308]`, `[-MAX_VALUE, 0, MAX_VALUE]` and `[MAX_VALUE, -MAX_VALUE, 1]` give only
   finite coordinates. `[-1e308, 1e308]` gives `'0,22 100,2'`.
3. `charts/meter.component.ts`, `charts/ring.component.ts`: new computed `outOfRange` (value < 0 or
   over the max). `aria-valuetext` is the real value text (`<value><unit> / <max><unit>`) when
   `outOfRange()` is true. `aria-valuenow` stays clamped to `[0, max]`.
   Tests in `charts.a11y.spec.ts` (meter and ring): value -5 gives `aria-valuenow="0"` and
   `aria-valuetext="-5 t / 200 t"`. A value in range has no `aria-valuetext`.

No other files changed.

## Verify

`npm run verify -- -p ui`: lint + typecheck 2/2 succeeded, test 1/1 succeeded, exit code 0.
