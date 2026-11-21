# Batch C1 report — design-spec batches 1-5 (TASK_2026_2286_b442)

Status: INCOMPLETE. The session hit its budget handoff after spec batch 1 and the view-model
field. Spec batches 2-5 are NOT applied. No check has run.

Base path: `libs/frontend/dashboard/src/lib/components/usage-dashboard/` in the worktree.

## Changed files

| File | Change |
| --- | --- |
| `usage-formatting.ts` | Added `formatCount(value)` (`1,200,424,998`). `formatTokenCount` now calls it. Added `repositoryDisplayName(id)`: the last segment of a `/`, `\` or `:` path, without `.git`. It falls back to the id. |
| `usage-formatting.spec.ts` | Tests for `formatCount` and `repositoryDisplayName` (POSIX path, trailing `.git/`, Windows path, ssh remote, bare id, `.git`-only fallback). |
| `usage-summary.view-model.ts` | Repository rows have 3 new fields: `displayName`, `knownCostUsd`, and `knownCostShare` (`shareOf(knownCostUsd, totalCostUsd)` capped at 1, else `null`). `knownCostLabel` now goes through `formatTableUsd`, the one money path (constraint 6), and no longer uses `toFixed(2)`. |
| `usage-summary.view-model.spec.ts` | The existing repository assertion checks the new fields. A new test covers the display name, a 0.25 share and the unpriced row (`null` share, label `No priced cost recorded`). |

## Spec batch 1 status

1. `<$0.01` branch: not added, per coordinator constraint 6 (one money path). The existing
   `formatTableUsd` already keeps a sub-cent cost non-zero (`$0.0034`). Batches 4 and 5 should use
   `formatTableUsd` / `formatCostCell` instead of `formatUsd`.
2. Percent rule: already provided by the existing `formatShare` (`0%`, `<0.1%`, `—`, `>99.9%`).
   `formatPercent` is unchanged. Components should call `formatShare`.
3. Full token count: `formatTokenCount` already exists (with the `tokens` suffix). This batch
   added `formatCount` for the repository full-value line.

## Not done (next agent: start here)

- Spec batch 2 (`usage-dashboard.component.html/.ts/.spec.ts`):
  - Root `gap-ptah-group`, bands `gap-ptah-field`.
  - Chart row `minmax(0,2fr) minmax(20rem,1fr)` at 960. Replace the wrapper `div ptahSurface` with
    one `section ptahSurface` that holds the donut and the summary, using a `usage-share-body` flex
    that is a row only at container 560-959.
  - Table row at 1400 with `5fr/7fr`.
  - Repository tile using `displayName`, `formatCount(recordedTokens)`, `knownCostShare` and
    `FolderGit2` from lucide-angular.
  - Keep visible text `Token coverage incomplete; some usage is unknown.` (constraint 3), and keep
    the worktree `ul aria-label="Worktree paths"` always expanded.
  - The spec at `usage-dashboard.component.spec.ts:122-123` asserts `Recorded tokens: 15` and
    `Partial cost (known priced rows only): $0.25`. Update it only when the DOM moves, and keep a
    check that the partial cost title stays.
- Spec batch 3 (chart):
  - Host and root flex column, wrapper `relative flex-1 min-h-[220px]`, SVG `absolute inset-0`.
    Keep `preserveAspectRatio="none"`: the axis labels are already HTML percentages.
  - Bar width `slot*0.64`.
  - Rounded top on the last segment only. Use a `path` for the top segment. The spec at line ~716
    reads `x` of bars[0], the bottom segment.
  - 1 px `vector-effect="non-scaling-stroke"` segment stroke.
  - Gridlines `var(--ptah-meter-track)`, muted axis ink.
  - Add metric and peak day to the aria-label, plus a mention of the Breakdown Day tab.
  - Keep the focus columns, arrow keys, marker, live readout, idle prompt and unknown hatch
    (constraint 1).
- Spec batch 4 (donut and summary):
  - Header level 3. Donut viewBox 140, r 62, stroke 16, rendered at 148 px.
  - Update `DONUT_CIRCUMFERENCE` in the geometry file. Add a 2-unit arc gap when there are 2 or
    more slices.
  - HTML center: "Known cost" / total / "N days".
  - Remove the `h4 By provider` and keep `aria-label="By provider"` on the `ul`.
  - Row grid, 6 px bar via `barWidthPercent(cost, maxCost)`.
  - Keep the share caption text `100% of known cost · 3.2K tokens`. The spec asserts it.
  - Keep the donut legend in both modes. Constraint 2 requires it, and the spec asserts
    `text('usage-cost-donut')` contains lowercase `unpriced`. Record this as a deviation from
    "merge legend into list".
- Spec batch 5 (quality):
  - Header with description, then an `aria-hidden` composition bar
    (`data-testid="usage-quality-bar"`).
  - Swatches, `border-s` dividers at 640, `text-xl` values, `text-[11px]` captions, `formatShare`.
  - The savings cell gets `tabindex="0"`, an `aria-describedby` sr-only description and a
    `focus-visible` outline (constraint 5).

## Check results

None run (budget handoff before the check round). Required:
`npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath <usage-formatting, usage-summary.view-model, usage-dashboard.component specs>`,
`npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json`, and `npx eslint` on the
changed files.

## Coordinator constraints, where they hold

- 6 (one money path): `usage-summary.view-model.ts`, repository `knownCostLabel` now uses
  `formatTableUsd`. No second `formatUsd` variant was added.
- 1-5: not yet applied; the batch 2-5 files are untouched, so current behaviour is intact.

## Open risks

- The new view-model test depends on the `usageFact` helper. That import is confirmed at
  `usage-summary.view-model.spec.ts:23`.
- Repository `knownCostShare` uses `totalCostUsd`, the window's priced total. If repository totals
  cover a different window than the facts, the share is capped at 1.
