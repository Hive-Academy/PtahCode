# Batch C2 (page layout + repository tile) — audit report

## Already on disk (from the killed agent), audited against the checklist

1. Root `gap-ptah-group`; content column `gap-ptah-group`; bands (chart row, table row, repo grid) `gap-ptah-field`. OK.
2. Chart row: `@container (min-width: 960px) { grid-template-columns: minmax(0, 2fr) minmax(20rem, 1fr) }`.
   Both children are direct `section ptahSurface` (Daily usage, `usage-cost-share`). No wrapper surface.
   Donut + summary sit in `.usage-share-body` (flex-col), a row only at `@container (min-width: 560px) and (max-width: 959px)`. OK.
3. Table row: `@container (min-width: 1400px)` `minmax(0,5fr) minmax(0,7fr)`. OK.
4. Cost quality in its own full-width row `data-testid="usage-quality-row"` between the chart row and the table row. OK.
5. Repository tiles: `FolderGit2` (lucide-angular), `displayName` (title = repositoryId), full path, compact tokens with
   `formatCount(recordedTokens)` full value and title, known cost + neutral `partial` badge (title kept), share bar
   (`aria-hidden`) and `formatShare(knownCostShare) of formatTableUsd(totalCostUsd) known cost` caption; 2 columns from
   1200 when more than 1 repository. OK.

Parity constraints, checked on disk:
- `Token coverage incomplete; some usage is unknown.` is visible text (`usage-repository-coverage`); the warn badge is `aria-hidden` with the same title.
- Worktree list `ul aria-label="Worktree paths"` is always expanded (no `<details>`) and renders only when paths exist.
- The repository section sits outside `@if (vm.hasUsage)`.
- `<ng-content select="[dashboardLimits]" />` sits between the KPI/state row and the chart row, outside every state branch, so plan limits show in loading, error, empty and data states.
- Money: only `formatTableUsd` / `formatShare` from `usage-formatting.ts` (plus the existing view-model `knownCostLabel`).

## What I changed

- `usage-dashboard.component.spec.ts` (~line 482): replaced the stale `h-[clamp(220px,15vw,260px)]` assertion with the new
  chart contract: SVG has `absolute`, `inset-0`, `h-full`; its parent is `[data-testid="usage-chart-plot"]` with
  `min-h-[220px]` and `flex-1`. All other assertions of the test kept.
- `usage-dashboard.component.html`: added `class="flex min-h-0 min-w-0 flex-1 flex-col"` to the `<ptah-stacked-bar-chart>`
  host so the chart's own `flex-1` root can grow inside `.usage-chart-fill` (the host element is otherwise an inline,
  non-flex box and the chart would not fill the card height).

## Checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath .../usage-dashboard.component.spec.ts`:
  Test Suites 1 passed; Tests 39 passed, 39 total.
- `npx eslint` on the 3 files: exit 0, 0 errors, 15 warnings (pre-existing style: non-null assertions and empty arrow functions in the spec).
- Not run (not permitted for this lane): `npm run verify`, `typecheck-templates`. The coordinator should run
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview` because the template changed.

## Deviations from the design spec (parity constraints win)

- Section 9 asks for a `<details>` worktree disclosure; kept an always-expanded list with a `Worktrees (N)` caption.
- Section 9 puts the coverage sentence in a tooltip / `sr-only`; kept it as visible text, the badge is decorative (`aria-hidden`).
- The repository section uses `aria-label="Repository usage"` rather than `aria-labelledby` (existing label kept; the test asserts it).

## Open items

- Visual check in Electron that the daily chart fills the card height at 960-1500 px container widths.
- The host class on `<ptah-stacked-bar-chart>` could move to a host binding in the chart component (owned by another agent).
