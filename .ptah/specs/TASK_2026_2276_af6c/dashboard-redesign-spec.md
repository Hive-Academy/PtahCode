# Dashboard redesign spec (TASK_2026_2276_af6c)

Supersedes the LAYOUT of `visual-spec.md`. Data semantics in `visual-spec.md` (selected provider =
`AuthStateService.activeProviderId()`, unit separation, unknown-is-text) stay in force.
Visual reference: `dashboard-mockup.html` (same folder; theme toggle for ptah-glass / ptah-glass-light).

## 1. Principles

1. One screen at 1400px: header, KPI strip, plan limits, daily chart + share, breakdown + sessions all visible
   without a scroll on a 1400x900 window; skills and builders last.
2. Limits are small cards (about 250x170) in a grid. Never a list, never a full-width block.
3. Numbers and bars first, words second. Each limit card has at most 4 text lines. Provenance (source,
   observed time, reset source, raw dates) lives behind `Details` (popover), never inline.
4. Page-level container queries (container = the page, not the viewport) so narrow Electron panels work.
5. Honest data: unknown is text ("No reading", "Unknown"), never 0%. A card shows exactly one unit family.

## 2. Layout grid

Page root: `<section class="@container/dash">` with `p-ptah-surface` padding (16px), `gap-ptah-section`
vertical stack (16px). Max content width 1400px, centered. Panel gap 16px, KPI/limit-card gap 12px.
Thresholds are the page container width (not the viewport).

| Container width | KPI strip | Plan limits grid | Chart row | Table row | Secondary |
| --- | --- | --- | --- | --- | --- |
| >= 1280 (desktop, target 1400) | 6 cols | auto-fill, min 15.5rem: 5 cols at 1368px | 8 / 4 cols of 12 | 8 / 4 | 6 / 6 |
| 960-1279 (1000px) | 3 cols x 2 rows | 3-4 cols | 8 / 4 (donut stacks legend below at < 1100) | 12 / 12 stacked | 6 / 6 |
| 640-959 | 3 x 2 | 2-3 cols | 12 / 12 stacked | 12 / 12 | 12 / 12 |
| < 640 (640px mock) | 2 x 3 | 1-2 cols (auto-fill gives 2 at 600) | 12 / 12, donut legend under donut | 12 / 12, table scrolls horizontally with sticky first column | 12 / 12 |

Row order, all breakpoints: Header+toolbar, KPI strip, Plan limits, Daily usage + Cost share,
Breakdown + Top sessions, Skills + Builders.
Implement the grid with CSS grid (`grid-cols-12` plus `@container` variants or the repo's existing
container-query mechanism; verify `@tailwindcss/container-queries` is configured, else add raw
`@container` rules in the component styles using tokens, not new daisyUI classes).

## 3. Panels

### 3.1 Header and toolbar
- `ptah-page-header`: title "Dashboard" (`text-lg font-semibold tracking-tight`), description
  "Usage, plan limits and spend across your providers" (`text-xs`, muted `text-bcm`).
- Actions slot is a single `ptah-toolbar`: workspace-scope chip (existing `ptah-badge`), range segmented control
  7d / 30d / 90d (existing control used by usage-dashboard), `ptahButton` "Refresh" (secondary), muted
  "Updated 4m ago" (`PlanLimitsStore` observed time or spend `generatedAt`).
- ONE range and ONE refresh for the whole page. The range drives only the spend/usage panels; refresh
  reloads both stores (`PlanLimitsStore.refresh()` and `AnalyticsUsageStore.refresh()`). Plan limits
  panel header shows no range (limits are windows, not ranges).
- Theme toggle in the mockup is not part of the page.

### 3.2 KPI strip (usage-kpi-strip, keep the 6 tiles)
- Shared: `ptah-stat` dense (`text-xl`; `text-2xl` only at >= 1280 where there is room, default size per
  decided rule) + `ptah-sparkline` in the tile footer + muted delta line.
- Tiles: Spend, Tokens, Sessions, Cache hit rate, Avg cost / session, Peak day. Source:
  `AnalyticsUsageStore` summary (`usage-summary.view-model.ts`); the sparkline is the daily series for the
  selected range (downsampled to 12 points). Delta vs previous equal range only if the RPC returns it;
  otherwise omit the delta (no fabricated trend). If the current build already has other 6 tiles keep those
  and only restyle.
- Surface: `--ptah-stat-bg` (surface-2), `rounded-ptah-surface`, padding `--ptah-stat-pad-y/x`.
- Tile states: loading `ptah-skeleton` (value + sparkline), empty `-` with muted "No data", error: the tile
  shows `Unavailable` text and the page-level `ptah-alert` appears under the toolbar.
- Cost-quality is NOT a tile: it is a `ptah-badge` ("Cost quality 94% exact") under the donut (3.5).

### 3.3 Plan limits panel
- Container: `ptah-card` surface (surface-1), `ptah-section-header` "Plan limits", subtitle "Most
  constrained window per provider", right side: summary badges `ptah-status-badge` (error "2 limits reached",
  warning "1 near limit"; omit when zero).
- Body: grid `grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr))`, gap 12px.
- Sorting: selected provider first, then limit reached, near limit, available, local-only. Stable by name.
- Below the grid, the "No readings" row (3.3.3).
- Empty state (no providers at all): `ptah-state-panel` compact, "No provider accounts yet", action "Add provider".
- Loading: 3 skeleton cards of the same height. Error: `ptah-state-panel` with retry; keep last data if present.

#### 3.3.1 Provider limit card anatomy (new component `provider-limit-card`)
Surface `--surface-2`, border `--surface-border`, `rounded-ptah-surface`, padding 12px, internal gap 10px,
min-height 168px (cards in a row stretch to equal height via grid).

```
[selected label: 10px caps gold, only when selected]
[mark 22px] Name (13px/600, truncate)                  [status badge]
[ring 60px: used %]  Window label (13px/600)
                     Resets in 2d 4h (12px muted)
[mini rows, max 2:  label | thin bar 5px | %]
------------------------------------------------------
Source/age (11px muted, 1 line, truncate)      Details
```

Element to component mapping:
- Provider mark: `ptah-provider-mark` size 22.
- Status: `ptah-status-badge` (glyph + text, never colour alone).
- Primary gauge: `ptah-ring` `size="sm"` (60px), `value`=used%, `max`=100, `thresholds` {warn 90, danger 100} (matches
  decided 90/100), `centerText` "94%", `label` = "<Provider> <window> used" for a11y. Tone `auto`.
- Secondary windows: `ptah-meter` `size="xs"` (or `sm` if xs does not exist), `hideLabel`, label text rendered by the card in the
  `mini row` grid (`4.2rem 1fr 2.4rem`), `showValue=false`, value in `<em class="tabular-nums">`.
  If more than 2 secondary windows, show 2 and a `+N more` text button that opens Details.
- Details: `ptah-button` ghost xs "Details" opening `ptah-native-popover` (320px max) with a
  `ptah-description-list`: used source, reset source, observed (absolute local time, not raw ISO), account id suffix,
  plan name, accounting note, raw status. This replaces every inline provenance line from the old build.
- Primary window selection = existing `plan-window.model.ts` "most constrained" logic (highest used%, ties: nearest reset).

Card states (all use the same skeleton; only the listed parts change):

| State | Ring / body | Badge | Footer | Border |
| --- | --- | --- | --- | --- |
| Available (< 90%) | ring `accent` tone, % | success "Available" | "Provider API - 4m ago" | `--surface-border` |
| Near limit (90-99%) | ring `warning` | warning "Near limit" (diamond glyph) | same | border unchanged |
| Limit reached (100%) | ring `error`, full arc, "100%" | error "Limit reached" (square glyph) | same | 1px error 55% mix |
| Aged / stale (observation older than the store's stale threshold) | ring tone kept but `fadeArc` | neutral "Aged" replaces availability badge only if no stronger badge; otherwise footer shows "3h ago (aged)" | footer text turns `text-bcm` + "(aged)" | unchanged |
| Estimated (reset or used% estimated) | normal | normal | reset line shows "Resets in ~12d (estimated)"; ring value prefixed "~" in centerText | unchanged |
| Unknown (window exists, used% unknown) | `ptah-ring` `indeterminate`-free: render dashed empty ring with centerText "?" via `centerText`, `value=0` and `fadeArc`; aria label "usage unknown" | neutral "Unknown" | "No reading yet" | unchanged |
| Local activity only (no quota) | no ring; `text-2xl` number "484M" + "tokens recorded locally" + muted "Since Dec 31, 2025 - no quota reading" | neutral "Local usage only" | "Local CLI accounting - 4m ago" | unchanged |
| Unavailable / no source | NOT a card: collapses into the chip row (3.3.3) | - | - | - |
| Selected provider | any of the above plus label "Selected for chat" | unchanged | unchanged | 1px gold (`--ptah-gold`) border + inset 1px gold ring |

Units rule: a card never shows both a percent window and a recorded-token figure; a provider with both
(quota + local activity) shows quota in the card and the local figure only inside Details. Balances (currency)
render like the local-activity body (big number + unit) with a "Balance" badge, not a ring.
"Limit reached" appears together with the reset line ("Resets in 1d 4h").

Relative times use the existing time pipe/util (`libs/frontend/ui/src/lib/time`), absolute in Details with the
user locale; never raw ISO strings.

#### 3.3.2 Selected provider
Not a separate block. It is the first card with the gold marker. Selection is changed in chat settings, not here
(optional: card overflow action "Use for chat", out of scope).

#### 3.3.3 No readings row
`ptah-badge` chips (outline, 11px), each: 14px muted provider mark + "Name - reason" ("no usage source",
"sign in to read limits"). Prefix label "No readings" (11px muted). Wraps. Renders only when at least one exists.

### 3.4 Daily usage chart (reuse `stacked-bar-chart`, restyle)
- Card `ptah-card` + `ptah-section-header` "Daily usage" + subtitle "Last N days, by provider"; right: segmented
  Cost / Tokens toggle (local signal, default Cost; this toggle replaces today's separate cost/tokens views).
- Chart: stacked vertical bars, one bar per day; x = date (label every 5th day, `MMM d`), y = linear 0..nice max
  with 4 dashed gridlines, tick labels 10px muted tabular (`$420` or `120M`). Series = provider (max 5 + "Other"),
  stack order stable by total. Bar width = 72% of the slot, radius 1.5px, 0.6px gap between segments.
- Colors: categorical series tokens, not hex: s1 `--ptah-gold`, s2 `accent`, s3 `info`, s4 violet (`--ptah-series-4`, add if missing,
  dark `#c39bff`, light `#7a45c9`), s5 neutral (`bcm`-ish gray). Verify >= 3:1 against surface-1 in both themes
  and always pair with a legend (direct labels above the plot) so colour is not the sole carrier.
- Legend: 9px squares + provider name, above the plot, click-to-isolate optional.
- Tooltip (hover/focus on a day): date, per-provider values, total. Keyboard: bars are focusable groups per day
  (role `img` per day with aria-label "Nov 4, total $96.40").
- Loading: skeleton of 30 grey bars. Empty: `ptah-state-panel` compact "No usage in this range". Error: inline alert.
- Height: SVG viewBox 760x230 scaled to width; card min-height 300 at desktop.

### 3.5 Cost share donut (reuse `usage-cost-donut`)
- Card "Cost share" subtitle "by provider". Donut 150px, stroke 18, 2px gaps between arcs, same series colors,
  centre: total ("$1,285") 20px/700 tabular + "30 days" 10px muted. Legend right (or below when < 380px): swatch,
  name, `$cost - %`. Sorted desc; > 5 slices collapse to "Other".
- Under it: `ptah-status-badge` "Cost quality 94% exact" + muted "6% estimated from tokens" (replaces the
  `usage-cost-quality` card; its detail moves into a popover on the badge).
- Empty: neutral ring outline + "No spend". Cost summary per provider (today a separate card) is merged into this legend.

### 3.6 Breakdown table (reuse `usage-breakdown-table` + `ptah-table`)
- Card "Provider and model breakdown", subtitle "Sorted by cost". Columns: Provider/model (mark + name + muted model),
  Sessions, Input, Output, Cache read, Cost (bold). Numbers right-aligned `tabular-nums`; headers 11px caps muted,
  sticky header, row height 36px, hairline `--surface-border` separators, no zebra. Max 8 rows then "Show all" row
  toggling the rest. Local-only providers show "-" and "local only" in the Cost column.
- Horizontal scroll inside the card below 720px with a sticky first column (`ptah-table` reflow already supports this; check `table-reflow`).

### 3.7 Top sessions (reuse `ptah-list-row`)
- Card "Top sessions", subtitle "by cost". 5 rows: rank (11px muted), title (13px/600 truncate), muted line
  "Provider - model - 212M tokens", right: cost bold tabular. Row click opens the session (existing handler).
- Empty: `ptah-state-panel` compact.

### 3.8 Skills + Builders (secondary)
Two half-width `ptah-card`s at the bottom with `ptah-section-header`s; content unchanged except: lists capped at 3 rows with
"Show all" and each row `ptah-list-row` compact. Not above the fold at 1400 by design.

## 4. Typography and spacing tokens

| Element | Style / token |
| --- | --- |
| Page title | `text-lg font-semibold tracking-tight` (decided) |
| Panel title | 13px, 600 (`ptah-section-header` default) |
| Panel subtitle / metadata | 11px, `text-bcm` |
| KPI value | `text-xl` dense / `text-2xl` default, 700, `tabular-nums`, tracking -0.01em |
| KPI label | 11px caps +0.05em, `text-bcm` |
| Table body | 12px; header 11px caps |
| Page padding | `p-ptah-surface` (16px); panel padding 14px (`p-ptah-surface` minus 2) -> use `p-ptah-surface` for panels too, 12px only inside limit cards via `p-3` |
| Panel gap | `gap-ptah-section` 16px; card-grid gap `gap-ptah-card` 12px (use existing gap-ptah-* names from `ptah-tokens.css`; if names differ, map 16 -> space-4, 12 -> space-3) |
| Radius | `rounded-ptah-surface` panels and cards; `--ptah-radius-control` for chips/buttons |
| Surfaces | page bg theme; panels `--surface-1`; inner cards/tiles `--surface-2`; borders `--surface-border`; muted text `text-bcm` (`--bcm`) |
| Status ink | use `--state-ink-*` / status-badge, never raw `warning`/`error` for text on glass |

Colors in the mock are approximations of `ptah-glass` (base-100 #17191d, 200 #202329, primary #e4b94a, accent #45d0be,
info #6aa6ff, success #3fd08a, warning #ff9f45, error #ff6b6b) and `ptah-glass-light` (base-100 #f7f3fd, primary #7c5700,
accent #0b7f77, error #cf3a3a). Real implementation must use tokens, not those hex values.

Contrast: pairs to measure at implementation (WCAG AA, 4.5:1 text, 3:1 graphics/bars): status ink on surface-2 in both
themes (existing `state-ink-contrast.spec.ts` covers `--state-ink-*`), series colors on surface-1 (3:1), muted `bcm` on
surface-1/2 (existing tier). Not measured in this mock; the implementer adds a spec for the 5 series tokens.

## 5. Shared component usage and gaps

Existing and sufficient: `ptah-page-header`, `ptah-toolbar`, `ptah-card`/surface, `ptah-section-header`, `ptah-stat`,
`ptah-sparkline`, `ptah-ring` (already a radial gauge with thresholds, centerText, fadeArc, hideZeroArc), `ptah-meter`
(bar with `size`, `hideLabel`, `marker`), `ptah-status-badge`, `ptah-badge`, `ptah-list-row`, `ptah-table`, `ptah-disclosure`,
`ptah-native-popover`, `ptah-state-panel`, `ptah-skeleton`, `ptahButton`, `ptah-provider-mark`.

Gaps:
1. Radial gauge: NOT a gap, `ptah-ring` exists. Verify a 60px size: `PtahRingSize` may only offer `sm`/`md`; if `sm` is larger or smaller than
   56-64px, add size `xs` to the ring (extend, do not fork).
2. Mini-bar: extend `ptah-meter` with `size="xs"` (4-5px track) rather than a new primitive, if not already present (check `PtahChartSize`).
3. Segmented control (range, metric): check for an existing shared control in `form-controls`/`button`; usage-dashboard already has a range
   control. If none is shared, promote that one into `libs/frontend/ui` as `ptah-segmented` (needs its own spec). Do not add raw daisyUI `join`/`btn-group` classes.
4. Series color tokens: add `--ptah-series-1..5` (and "other") to `ptah-tokens.css`, per theme, validated for contrast.
5. Donut and stacked bar stay dashboard-local (`usage-cost-donut`, `stacked-bar-chart`); no shared chart lib component exists beyond ring/meter/sparkline. Optional follow-up to promote.
6. Container-query utilities: confirm availability; else component-scoped CSS.

`tools/ui-class-audit/baseline.json` must not grow: all new markup uses the components above and Tailwind layout utilities (grid, gap, flex, text sizes),
no new `btn`, `badge`, `card`, `stat`, `table`, `join`, `tooltip` daisyUI classes.

## 6. Removed or moved versus today

- Removed: the "Selected for chat" tall block, the "Other provider accounts" list, the identity column, the per-row provenance lines (used source, reset source,
  observed time, ISO date range, accounting notes), the "Go to chat" button in the selected block, the standalone cost summary card, the standalone cost-quality card,
  the separate cost/tokens charts (now one toggle), per-panel refresh buttons and ranges.
- Moved: provenance -> Details popover; cost quality -> badge under donut (+ popover); cost summary per provider -> donut legend; skills and builders -> bottom row;
  range and refresh -> page toolbar; unavailable providers -> chip row.
- Kept: data stores, view models (`plan-window`, `plan-owner`, `plan-accounting`, `provider-account-grouping`, `plan-tile-view`), top sessions, breakdown table,
  usage RPC, 90/100 meter thresholds.

## 7. Implementation outline (every file < 700 lines, OnPush, signals, `inject()`)

Under `libs/frontend/dashboard/src/lib/components/`:

| File | Action |
| --- | --- |
| `dashboard-grid/dashboard-grid.component.{ts,html}` | Rewrite as page shell: header+toolbar, owns `range` and `metric` signals, calls both store refreshes, composes sections below. Provide `@container` root. |
| `dashboard-grid/dashboard-toolbar.component.ts` | New (range segmented, refresh, updated-at). |
| `plan-limits-panel/plan-limits-panel.component.{ts,html}` | New: section header, summary badges, sorted grid, no-readings row, loading/empty/error. Reads `PlanLimitsStore` + `AuthStateService.activeProviderId()`. |
| `plan-limits-panel/provider-limit-card.component.{ts,html}` | New: card anatomy 3.3.1, input = `ProviderLimitCardVm`. |
| `plan-limits-panel/provider-limit-details.component.ts` | New: popover content (`ptah-description-list`). |
| `provider-account-card/provider-limit-card.view-model.ts` (+ spec) | New: pure mapper from existing `plan-owner`/`plan-window`/`plan-tile-view` models to `ProviderLimitCardVm` (tone, centerText, primary + up to 2 mini windows, state enum, footer text, details rows, sort rank). Reuses existing models; no new data fetching. |
| `provider-account-card/provider-account-card.component.ts`, `-feature`, `-summary-row`, `provider-quota-window` | Delete after migration (replace, do not keep legacy variants); migrate their specs' assertions to the new view-model and card specs. |
| `usage-dashboard/usage-kpi-strip.component.ts` | Restyle to dense `ptah-stat` + sparkline; accept `range`. |
| `usage-dashboard/usage-dashboard.component.{ts,html}` | Becomes presentational sections (`kpis`, `charts row`, `tables row`) driven by the page's range; remove its own toolbar. |
| `usage-dashboard/stacked-bar-chart.*`, `usage-cost-donut.*` | Restyle to section 3.4/3.5; metric input from page; series colors via tokens. |
| `usage-dashboard/usage-cost-summary.component.ts`, `usage-cost-quality.component.ts` | Fold into donut legend and badge; delete. |
| `usage-dashboard/usage-breakdown-table.component.ts` | Restyle per 3.6. |
| `libs/frontend/ui/src/lib/charts/{ring,meter}.component.ts` | Only if size gap confirmed (section 5). |
| `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` | Add series tokens. |
| `skill-selection-card`, `builders-card` | Cap rows at 3, move last. |

Specs: view-model spec (all states in 3.3.1 incl. unknown never 0%, units never mixed), card render spec per state, layout spec update
(`dashboard-grid.layout.spec.ts`: row order, no horizontal overflow at 1400/1000/640), `dashboard-grid.scroll-owner.spec.ts` kept,
series-token contrast spec. Gate: scoped `npm run verify -- --related -p dashboard,ui,core`, then
`-t typecheck-templates -p ptah-extension-webview`, and an Electron-only screenshot review at 1400, 1000, 640 in both glass themes.

## 8. Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use `ptah-ring` for the primary gauge, bars for secondary windows | bar only; ring only | Ring exists with thresholds and fadeArc; ring gives a compact, scannable hero; bars fit multiple windows | Yes |
| Selected provider = first card with gold marker, not a separate block | separate hero block | User feedback: limits take the page; ordering + marker keeps hierarchy cheaply | Yes |
| Single page toolbar (range + refresh) | per-panel controls | Reduces chrome; plan limits are not range-dependent | Yes |
| Container queries on the page, not viewport media queries | media queries | Electron panels narrower than the window | Yes |
| Mini rows capped at 2 secondary windows | unlimited | Keeps card height constant | Yes |
