# Batches 4-5 (cost share card, cost quality strip): audit report

## Already on disk (from the killed agent), audited against the checklist

- `usage-cost-donut.geometry.ts`: `DONUT_RADIUS = 62`, `DONUT_CIRCUMFERENCE = 2π·62` (exported), `DONUT_ARC_GAP = 2`. The gap applies only when there are 2 or more visible slices, and `Math.max(0, length - gap)` stops a tiny slice from getting a negative length. Offsets advance by the full share, so arcs plus gaps close the ring. A zero total gives fraction 0, not NaN.
- `usage-cost-donut.component.ts`: level-3 header with the Provider/Model toggle. `viewBox 0 0 140 140`, r = `DONUT_RADIUS`, stroke 16, drawn at 148 px. An HTML center (aria-hidden; the svg aria-label carries the same text) shows "Known cost", the total via `formatCostCell(…, 'unpriced')` and "N days" (new optional `dayCount` input; `null` hides the caption). The legend stays in both modes and is keyboard-reachable (`tabindex=0`, aria-label and title, focus-visible outline). Shares go through `formatShare`. A container query puts the donut beside the legend from 560 to 959 px.
- `usage-cost-summary.component.ts`: the `h4 By provider` is gone and `aria-label="By provider"` is on the `ul`. Each row is a grid of provider mark, name and cost. The 6 px bar uses `barWidthPercent(cost, maxCost)` and shows only for a known cost. The caption is still `formatShare(...) of known cost|of cost · N tokens`. The no-price and partial-price titles and the lower-bound `≥` (via `formatCostCell`) are kept.
- `usage-cost-quality.component.ts`: level-3 header with a description. An aria-hidden composition bar `data-testid="usage-quality-bar"` shows segments only for shares that are finite and > 0. NaN or null shares are filtered out, widths are capped at 100, and an empty bar is hidden. Swatches, `border-inline-start` dividers from 640 px (container query), `text-xl` values, `text-[11px]` captions and `formatShare`. Savings has three states via `formatCostCell`: "—", "$x", or "≥ $x". When the figure is a lower bound, the savings cell gets `tabindex=0`, `aria-describedby` pointing to an sr-only note, the DaisyUI tooltip and a focus-visible outline. The ids are unique per instance (module counter `usage-quality-savings-note-N`).
- All `data-testid` values, aria labels and titles of the previous version are present. No money format path outside `usage-formatting.ts`.

## Changed by me

- CREATED `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-donut.geometry.spec.ts` with 6 cases: radius and circumference, empty input, 1 slice (full ring, no gap), 2 slices (gap, offsets, ring closes), tiny slice (length 0, not negative), Other folding and unpriced items (no arc, no NaN).
- No change to the four component and geometry files; the audit found no gap.

## Checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath <geometry spec> <usage-dashboard.component.spec.ts>`: 45 passed, 45 total (exit 0). The dashboard spec was only run, not edited.
- `npx eslint` on the four files and the new spec: 0 errors. 6 `no-non-null-assertion` warnings, all pre-existing: they are in `geometry.ts`, as on `main`, and at `donut.component.ts:83`, the existing slice-input mapping. I removed the one warning the new spec had.
- Not run: `typecheck-templates` (ngc), and `nx` or `verify` (not allowed for this lane). The coordinator should run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

## Deviations

- The donut legend is kept in both modes instead of the spec's "merge legend into list". This is a binding parity constraint; a spec asserts the lowercase `unpriced` text.
- The savings cell gets `tabindex=0` and `aria-describedby` only while a missing-fact description exists, instead of always. A focus stop with nothing to describe adds a tab stop with no information. The parity rule (an accessible description and a focus-visible style for the missing-fact tooltip) holds.
- Provider bars now scale to the largest known provider cost (checklist), not to the share of the total.

## Open items

- `dayCount` is a new input of `ptah-usage-cost-donut`. The page layout (owned by another agent) must bind it, for example the range day count. Until it does, the "N days" caption stays hidden.
- `typecheck-templates` is still to be run by the coordinator.
