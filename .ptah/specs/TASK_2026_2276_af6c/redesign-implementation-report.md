# Redesign implementation report (TASK_2026_2276_af6c)

## Part A

Status: in progress.

### Item 1 — ui primitives and series tokens (done)

- `ptah-meter` already has `size="xs"` (`h-1`, 4px track) and `auto` tone already resolves warn at 90%
  (`NEAR_LIMIT_PERCENT`) and error at 100% (`resolveInk` in `charts/chart-geometry.ts`). No change needed.
- `ptah-ring` already has an `xs` size (24px, used by existing consumers) and default thresholds
  `{ warn: 90, danger: 100 }`. The 60px card gauge uses the existing `row` size (56px), which is inside the
  spec's 56-64px band (spec section 5, gap 1). No ring change; `xs` is not redefined because that would
  break its current 24px consumers.
- MODIFIED `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` — `--ptah-series-1..5` and `--ptah-series-other`,
  dark and light values.
- CREATED `libs/frontend/ui/src/lib/tokens/series-tokens.contrast.spec.ts` — 3:1 on both themes' surfaces.
- Check: `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath
  .../series-tokens.contrast.spec.ts .../ptah-tokens.spec.ts` — PASS (169 tests).

### Item 2 — KPI previous-period deltas (done)
- `services/kpi-delta.ts` (+ spec): `widerRangeFor`, `slicePreviousPeriod`, `periodTotals`,
  `fractionalDelta`, `computeKpiDeltas`. `AnalyticsUsageStore.previousPeriod` and `kpiDeltas`
  (`{ spend: number | null; tokens: number | null }`).
- `analytics:spendSummary` accepts only 7/30/90. A 7-day load also requests 30, a 30-day load
  requests 90, and the previous period is the N days before the current range. The 90-day range
  has no delta. The delta is null when the period is not fully covered, has no facts, or its
  total is <= 0, or when the wider request fails (it never sets `loadError`). The main request
  is sent first; the wider one only feeds deltas.
- `dashboard-rpc.testing.ts`: `mainUsageCalls(rpc)` skips the wider companion call in specs.

### Item 3 — plan-limits panel (done)
- New `components/plan-limits/`: `provider-limit-card.view-model.ts`, `provider-limit-card.component.ts`,
  `provider-limit-chip.component.ts`, `plan-limits-panel.component.ts`, `refresh-failed-notice.ts`,
  with specs. Kept model files unchanged (plan-window, plan-owner, plan-accounting,
  provider-account-grouping, plan-tile-view, plan-tile.types).
- Card: `ptah-ring size="row"` (56px), up to 2 `ptah-meter size="xs"` rows, "+N more in Details",
  one source/age line ("Provider API · observed 1m ago"), cooldown/status notice, action button
  (Go to chat / Add key), Details popover (`ptah-native-popover` + `ptah-description-list`) with
  the absolute times. Selected provider first with the gold border; others sorted limit reached,
  near limit, available, aged, unknown, then by name. Providers without a reading are chips.
  Header badges "N limits reached" / "N near limit".
- Removed: provider-account-card, -feature, -summary-row, quota-window components and specs.

## Part B — page shell and rows (done)
- `dashboard-grid`: page header (title, description) with one `ptah-dashboard-toolbar`
  (Updated Nm ago, 7d/30d/90d, one Refresh that reloads usage and plan limits). Rows:
  KPI strip, plan limits (projected into `ptah-usage-dashboard` via `[dashboardLimits]`),
  daily usage + cost share (2fr/1fr at >= 960px container), breakdown + top sessions
  (2fr/1fr at >= 1280px), repository usage, then skills + builders (6/6 at >= 960px).
  Max width 1400px.
- `usage-kpi-strip`: cost and processed-token tiles get a sparkline (daily totals, at most 12
  points, `usage-trend.ts`) and a delta line ("+12% vs previous 7d"); null hides the line.
- `analytics-card` wrapper removed (unused).
- e2e harness: `plan-limits-visual.e2e.spec.ts` uses `ptah-plan-limits-panel`, the card/chip
  test ids and the toolbar `dashboard-refresh` button.

## Deviations from the mockup
- Ring size 56px (`row`), not a new `xs`: the existing `xs` ring (24px) is used elsewhere.
- Cost summary card kept under the donut (its honest unpriced rendering is tested); the
  cost-quality card is kept, not yet a badge.
- Details popover state is local to each card (stable `track` keeps it across updates);
  there is no parent-owned expansion state any more.
- Deltas only for spend and tokens; the 90-day range never shows a delta.

## Checks (coordinator)
- `npm run verify -- --related -p @ptah-extension/dashboard,@ptah-extension/ui`: pass after fixes.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/dashboard,@ptah-extension/ui,@ptah-extension/webview-e2e-harness`: pass.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: pass.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: 0 over baseline.
- Gate `npm run verify -- -p @ptah-extension/dashboard,@ptah-extension/ui,@ptah-extension/webview-e2e-harness`: exit 0.
