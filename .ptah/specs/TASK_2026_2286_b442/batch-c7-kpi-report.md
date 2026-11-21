# Batch 7 (KPI strip) report

## Changed
File: `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-kpi-strip.component.ts` (only file touched).

- The six tiles moved from `rounded-lg bg-base-200/40 p-3` to `<div ptahSurface variant="inset" padding="sm">`. They are still `div` elements, so the `[data-testid="usage-kpis"] > div` length 6 assertion still holds. `PtahSurfaceDirective` comes from `@ptah-extension/ui`. `inset` and `sm` are members of `PtahCardVariant` and `PtahCardPadding` in `libs/frontend/ui/src/lib/card/card.types.ts`.
- The grid gap changed from `gap-3` to `gap-ptah-field`. The grid breakpoints (2 / 3 at 900 / 6 at 1300) are unchanged.
- Every `text-[10px]` is now `text-[11px]`: sub lines, deltas, output, uncached and the footnote.
- The Sessions, Messages and Subagents values now go through `formatCount` (`usage-formatting.ts`, Intl separators).
- Values keep `text-xl font-semibold tabular-nums` (spec section 2, Big number).

## Parity preserved
Kept unchanged: the Unknown and `≥ ` lower-bound cost labels, the cost `title` tooltip, the savings copy, the "Cached %" caption and its title, the three session-identity tile titles, the conditional sparklines with their "Daily cost" and "Daily tokens" labels, and the delta lines, which never render for null. No data-testid, aria-label or title was removed, and no visible text changed.

## Checks
- `npx eslint usage-kpi-strip.component.ts`: exit 0, no output.
- Jest was not run. No `usage-kpi-strip.component.spec.ts` exists. The KPI assertions live in `usage-dashboard.component.spec.ts`, which is outside this write set and is being edited by another agent.
- Assertions checked by grep (read-only): the counts are 2 / 3 / 1 (`Subagents1`), and the costs are `$5.00`, `≥ $5.00`, `$6.00` and so on. Separators do not change values under 1,000, so no asserted value differs.

## Deviations
None. Every count got its separator, because no assertion conflicts.

## Open items
- The coordinator should run the dashboard spec and `typecheck-templates`, since this is a template change.
- Check the inset tile contrast on the image in Electron (visual review).
