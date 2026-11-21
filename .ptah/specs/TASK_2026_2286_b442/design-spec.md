# Analytics / Usage dashboard: visual specification

Task: TASK_2026_2286_b442. Prototype: `prototype/index.html` (dark and light, widths 420/900/1200/1500, states).
Design system applied: the existing Ptah tokens (`libs/frontend/ui/src/lib/tokens/ptah-tokens.css`, themes `ptah-glass` and `ptah-glass-light` in `apps/ptah-extension-webview/tailwind.config.js`). No new palette, no new font, no new token.

Source tags: `[token]` = existing token or class, `[code]` = existing component or file, `[new-css]` = layout CSS the developer writes in the component `styles` (container queries; the repo already does this in `usage-dashboard.component.ts`).

## 0. Diagnosis (why it looks bad today)

1. The chart row grid stretches rows, but the left card does not let the chart grow, so the shorter card shows dead space. `ptahSurface` is on one wrapper `div` on the right, yet the donut and "By provider" read as bare because nothing separates them from the card and they carry their own `h4` headings in a different style.
2. Tables and KPI tiles use `bg-base-200/40` (translucent) or rely on the directive in a grid cell without a stable width, so they dissolve into the pyramid image. Rule: every block of content sits on `ptahSurface` or an inset tile inside one.
3. Plan-limit card: header holds mark, title and status text on one row, so the title gets about 100 px. `<ptah-ring>` is rendered without `centerOnly`, so the ring prints its own label ("Kimi Code CLI login · a6b0 Kimi Code · Monthly total used") and value text beside the ring, repeating the title. Cards are a fixed `minmax(15rem,1fr)` grid and the footer source text is `truncate`.
4. Repository section is unstructured `<p>` lines with raw numbers.

## 1. Page grid and section order

Order (unchanged from today, so parity holds): meta line, state panel or KPI strip, Plan limits (projected), chart row, cost quality row, table row, repository usage.

The page root stays `.usage-dashboard { container-type: inline-size }` `[code]`. All breakpoints are container queries on it, never viewport queries. Content widths below are the width of `.usage-dashboard`.

| Rule | Value | Source |
| --- | --- | --- |
| Vertical rhythm between bands | `gap-ptah-group` (24 px) on the root column (was `gap-ptah-section`, 32 px; 32 px made the page sprawl) | `[token]` |
| Gap between cards inside a band | `gap-ptah-field` (16 px) | `[token]` |
| Surface | `ptahSurface` (default variant, padding `md` = 16 px). Inner tiles use `variant="inset"` | `[code]` |
| No horizontal scroll | every grid child `min-w-0`; tables `table-layout: auto` with one `w-full` column that truncates; no `overflow-x-auto` anywhere | rule |

Per band and width:

| Band | 900 px | 1200 px | 1500 px |
| --- | --- | --- | --- |
| KPI strip | 3 cols x 2 rows (existing `@container 900`) | 3 cols x 2 rows (existing; it switches to 6 at 1300) | 6 cols x 1 row |
| Plan limits | cards 2 per row (flex-basis 50%), last row stretches | 4 per row (basis 25%, from 1120) | 4 per row |
| Chart row | 1 column: Daily usage full width, then Cost share full width with donut left, list right | `2fr / minmax(20rem,1fr)` (from 960), both cards equal height | same, chart grows |
| Cost quality | 4 columns (from 640) | 4 columns | 4 columns |
| Tables | stacked, each full width | stacked, each full width | side by side `5fr / 7fr` (from 1400, was 1440 and 1fr/1fr) |
| Repository | 1 column | 1 column; 2 columns from 1200 only when there are 2 or more repositories | same |

The 1400 px side-by-side threshold plus `5fr/7fr` gives Breakdown about 590 px and Top sessions about 830 px at 1500, so the session table needs no horizontal scroll (its fixed columns need about 470 px, see 7).

Dead-area rules: (a) the left chart card owns a flex column and the chart wrapper is `flex: 1 1 auto; min-height: 220px`, so the chart absorbs the height difference to the right card; (b) the right card content is `justify-content: space-around` for the provider list so it also fills; (c) flex-wrap rows (plan cards, no-reading rows) use `flex-grow: 1` so a last row never leaves an empty gap.

## 2. Shared type scale, color, formats

Type (all `[token]`, `text-*` Tailwind sizes already in use on this page):

| Role | Class | Use |
| --- | --- | --- |
| Section title | `ptah-section-header` size `section` (16/24, 600), level 2 | Plan limits, Repository usage |
| Group title | `ptah-section-header` level 3 (14/20, 600) | every card title |
| Description | `text-xs text-base-content-muted` | under a title |
| Big number | `text-xl font-semibold tabular-nums` (20/28) | KPI, quality, repository stats |
| Body / cells | `text-xs` (12/16), numbers `tabular-nums` | tables, lists |
| Caption | `text-[11px] text-base-content-muted` | label above number; remove the `text-[10px]` sizes (below 11 px is hard to read on the image) |

Color: text `text-base-content`; secondary `text-base-content-muted`; status ink `text-state-err | text-state-need | text-state-done` (`state-*` Tailwind colors exist). Provider colors stay exactly `PROVIDER_ACCENTS` in `provider-accent.ts` (anthropic `#d97757`, codex `#10a37f`, grok `#71717a`, unknown/ollama `#9ca3af`, kimi-code `#4f46e5`, antigravity `#8b5cf6`, ...). Never use a provider color for text.

Number formats (one source: `usage-formatting.ts`; add the missing helpers there, do not duplicate in templates):

| Value | Format | Example | Rule |
| --- | --- | --- | --- |
| Currency in tables and totals | `formatUsd` | `$1,066.33` | thousands separator, 2 decimals |
| Currency under one cent, above zero | `<$0.01` (new `formatUsdPrecise` branch) | `<$0.01` | never `$0.00` for a non-zero value |
| Currency lower bound | `>= ` prefix with the real sign `≥ ` (existing) | `≥ $2,003.25` | when unpriced or unknown facts exist |
| Currency on chart axis | `formatChartUsd` (existing) | `$75`, `$1.2K` | |
| Tokens in cells | `formatCompactTokens` | `797.4M`, `1.1B`, `32.4K` | cell `title` = full value with separators: `797,412,398 tokens` |
| Tokens where the full value is shown (repository) | compact as the headline, full `1,200,424,998` below in `font-mono text-[11px]` muted | `1.2B` / `1,200,424,998` | replaces raw `1200424998` |
| Percent | `formatPercent`, one decimal | `37.7%` | exactly 0 shows `0%`; above 0 and below 0.1% shows `<0.1%`; null shows `—` |
| Count | `Intl.NumberFormat` | `8,914` | KPI counts get separators |
| Relative time | existing `lastActiveLabel` | `2h ago` | `title` = absolute time |

Contrast (criterion: WCAG 2.2 AA, 4.5:1 text and 3:1 non-text; the project states none). Measured on sRGB approximations of the surface (`#1e2126` dark, `#f1ecf9` light):

| Pair | Dark | Light |
| --- | --- | --- |
| text on surface | 14.4 | 14.5 |
| muted text on surface (approx.) | 11.3 | 6.3 |
| state-need ink | 9.0 | 5.4 |
| state-err ink | 7.7 | 6.5 |
| state-done ink | 9.7 | 6.3 |
| gold primary | 8.7 | 5.6 |
| anthropic bar | 5.2 | 2.7 |
| codex bar | 5.1 | 2.8 |
| grok bar | 3.3 | 4.2 |
| unknown/ollama bar | 6.4 | 2.2 |
| kimi-code bar | 2.6 | 5.4 |

Finding: in light theme the anthropic, codex, unknown and ollama marks, and in dark theme kimi-code, are under 3:1 against the surface. The brief fixes provider colors, so the mitigation is: bars and slices are always paired with a text value (a decorative encoding, `aria-hidden`), segments get a 1 px surface-colored stroke, and in light theme every bar fill gets `box-shadow: inset 0 0 0 1px rgb(0 0 0 / .22)`. The developer must re-measure with real resolved tokens (`--bcm` is an oklch value; the muted numbers above are approximations).

## 3. Section: meta line

Structure: one flex-wrap row `gap-x-ptah-field gap-y-ptah-controls`: date span (`text-xs muted`), `partial` badge, "Ledger captured since ...". Keep markup and `data-testid`s. Only change: the partial badge keeps its `tooltip` and focus behavior; no visual change. States: partial badge only when `isPartial`; coverage line only when `coverageStartDay`.

## 4. Section: KPI strip (`usage-kpi-strip.component.ts`)

Light touch. Replace `rounded-lg bg-base-200/40 p-3` with `ptahSurface variant="inset" padding="sm"` so tiles are opaque on the image. Raise `text-[10px]` to `text-[11px]`. Counts use thousands separators. Sparkline stays (`ptah-sparkline` size `xs`, tone `accent`, `[area]="true"`). Grid breakpoints stay (2 / 3 at 900 / 6 at 1300); gap `gap-ptah-field`. Delta text (`+12% vs previous 30d`) stays muted; never render for null. The footnote `* estimated at API rates; not your bill` stays at `text-[11px]`. Raw cost tile keeps the `title` tooltip.

## 5. Section: Plan limits (`plan-limits-panel`, `provider-limit-card`, `provider-limit-chip`)

Panel (`[code]` already `surface-1 rounded-ptah-surface p-ptah-surface`): switch to `ptahSurface` so it matches the other sections (same look, directive is the project's owner). Header: `ptah-section-header` level 2 as today; the summary badges stay in the `actions` slot.

Card grid: replace `grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]` with `flex flex-wrap gap-ptah-field`; each card `flex: 1 1 calc(50% - 8px); min-width: 15rem`. From container width 1120: `flex-basis: calc(25% - 12px)`. Below 560: `flex-basis: 100%`. Because items grow, the last row stretches and no empty strip is left at the right. [new-css]

Card (`ptahSurface variant="inset" padding="md"`, `flex flex-col gap-ptah-heading h-full`; selected card keeps `border-color: var(--ptah-gold)`):

1. Header row `flex items-start gap-ptah-heading`: provider mark (`ptah-provider-mark`, 28 px box), a `min-w-0 flex-1` text block, and the "Selected" badge (`ptahBadge`, short text; the longer "Selected for chat" moves to its `title`/`aria-label`). Title: `ptah-section-header`-sized text (`text-sm font-semibold`) with `line-clamp-2` instead of `truncate`, `title` attribute with the full label. Under it a `text-xs muted line-clamp-2` account line (the account part of today's long string: `login · a6b0`, plan name). The status text no longer lives in the header, so the title has the full width.
2. Body row `flex items-center gap-ptah-field`: `<ptah-ring size="row" [centerOnly]="true" ...>` (56 px, percent in the center, the semantic label stays on the ring role through `ariaLabel`). `centerOnly` removes the repeated side text; this is the fix for the "Kimi Code CLI login · a6b0 ..." wrap. Beside it a column `gap-ptah-label`: status badge (`ptahBadge`, tone err/warn/ok mapped from state, with a glyph so color is never alone: limit reached `⚠`, near limit `▲`, available `✓`, other states no glyph), window label (`text-xs muted`, e.g. "Monthly total used"), value (`text-sm font-semibold tabular-nums`, e.g. `100 / 100`), reset line (`text-xs`, e.g. "Resets in 6d 4h"). No title text in this column.
3. Notice (cooldown or status) `text-xs`, wraps.
4. Mini rows (max 2): label left, `tabular-nums` percent right, `ptah-meter size="xs"` below. "+N more in Details" `text-xs muted` when hidden.
5. Footer `mt-auto border-t border-[var(--surface-border)] pt-ptah-heading flex flex-col gap-ptah-controls`: source line on its own row, `text-xs muted line-clamp-2` with `title` (no one-line truncation, so "Provider API · observed 2m ago" is fully visible); under it, right-aligned, the existing ghost `xs` buttons: action (Go to chat / Add key) and Details popover. Only one primary action per surface: both are ghost.

Ring tones (existing `STATE_TONES`): err, warn, accent (ok). States kept: limit-reached forces ring to 100; aged uses `fadeArc`; estimate shows `~` prefix in the center; no ring shows `primaryValueText`; not-confirmed / estimate-only / unknown render their status badge as neutral.

"Without usage readings": a sub-section inside the panel separated by `border-t border-[var(--surface-border)] pt-ptah-field`. Heading `text-xs font-semibold muted` "Without usage readings" plus a neutral count badge (replaces the inline label text). Chips become rows: `<ul class="flex flex-wrap gap-ptah-controls">`, each `<li>` `flex: 1 1 18rem`, `flex items-start gap-ptah-controls rounded-ptah-chip border border-[var(--surface-border)] px-3 py-2`, mark, then two lines: name (`text-xs font-semibold`) and reason (`text-xs muted`, wraps; no truncation; today's `· ` prefix is dropped). The reason text stays lower-cased as the view-model gives it. `data-testid="provider-limit-chip"` and `plan-limits-chips` stay.

Panel states kept: loading, error, empty `ptah-state-panel`; refresh-failed `ptah-state-panel state="partial"`; "Provider discovery is incomplete" line; "No usage reading returned for the selected provider" line; summary badges (limits reached, near limit).

## 6. Section: Chart row

### 6a. Daily usage card (`ptahSurface`, `flex flex-col gap-ptah-heading`)

Header row (title left, Cost/Tokens toggle right, buttons `ptahButton size="xs"`, primary when selected, as today). Legend row under the header (existing `ul`, dots 8 px, label in text ink). The chart wrapper `relative flex-1 min-h-[220px]` and the SVG `absolute inset-0` (replace the fixed `h-[clamp(220px,15vw,260px)]`), so the card height follows the row.

Dataviz rules: stacked bars, one series per provider in provider colors in a fixed order (Anthropic, Codex, Grok, Unknown); bar width about 64% of the day slot (thin marks), 3-4 px rounded top end on the last segment only, 1 px surface stroke between segments (the skill asks 2 px; 1 px kept because 30 bars at 900 px are narrow), grid lines `var(--ptah-meter-track)` 1 px, recessive; y axis 4 gridlines with `formatChartUsd` in muted ink; x labels every fifth day, `shortDay`. Unpriced days keep the existing hatch pattern (legend entry "unpriced usage (cost unknown)"). No dual axis. Hover: a per-day tooltip (existing readout) with a color dot, provider name in text ink, and a value; hit target is the full day column. A table view exists as the Breakdown "Day" tab; mention it in the chart `aria-label`. Chart `aria-label` includes range, metric and peak day. Legend is present (4 series), color is never the only identity. Empty: existing "No usage in this range." centered in the same min-height.

### 6b. Cost share card (one `ptahSurface`)

One card replaces the bare donut, the bare "By provider" list and its two `h4`s. Header: `ptah-section-header` level 3 "Cost share" + Provider/Model toggle (as today).
Body (`share-body`): donut 148 px centered, then the provider list.

- Donut: ring 16/140 stroke, 2 px gaps between arcs, track `ptah-meter-track`; center: caption "Known cost" (`text-[11px] muted`), total `text-base font-semibold tabular-nums` (`≥ ` prefix when unpriced), "30 days" caption. The center and the SVG `aria-label` stay.
- List `ul` (`aria-label="By provider"`, `gap-ptah-heading`): per row a 3-col grid: mark, name (`text-xs truncate`, `title`), then right `cost` (font-semibold) and `· share` muted, below a 6 px bar (provider color, width relative to the largest provider, `aria-hidden`, min 1%). The donut legend is merged into this list (it was the same data twice); its `legendLabel` text moves to each row's `title`.
- Model mode: the same list from `modelRows` with `MODEL_COLORS` (existing behavior, the colors are not provider colors by design); show at most the top 5 slices plus "Other" folded (existing `buildCostSlices`), list matches slices.
- Layout by container width: at 1200/1500 the card is about 360-480 px wide: donut above list. At 900 (chart row single column) and from 560 to 959: donut left, list right (`flex-row items-center gap-ptah-group`). Below 560: stacked again.
- Unpriced rows: cost label `unpriced`, share `—`, bar hidden, as today.

## 7. Section: Cost quality (`usage-cost-quality`), full width under the chart row

Move is already requested; this is the final look. `ptahSurface padding="md"`, `flex flex-col gap-ptah-heading`.
- Header: `ptah-section-header` level 3 "Cost quality" + description "How each token was priced" (`text-xs muted`, right aligned from 640).
- Composition bar (new, `aria-hidden`, 10 px high): the three token shares as one segmented 100% bar in this order: Provider reported (primary gold), Model priced (gold mixed 45% into the surface), Unpriced (the existing hatch pattern, 45 degrees). These three sum to 100% so the part-to-whole form is valid. One hue plus a pattern, no status colors (status colors are reserved).
- Four cells `grid grid-cols-2 gap-ptah-field`, `@container (min-width: 640px)` 4 columns with a `border-s border-[var(--surface-border)] ps-ptah-field` divider between cells. Cell: swatch (10 px, same fill as its bar segment) + label (`text-xs muted`), value (`text-xl font-semibold tabular-nums`), caption `text-[11px] muted` ("share of tokens", "vs raw token cost"). Cache savings has a green-ink outline swatch (not a fill) and keeps the `≥ ` prefix and the "N facts without savings data" tooltip (`data-tip`).
- Values: percent per rule (`<0.1%`, `0%`, `—` for null). The bar is hidden when all three shares are null.

## 8. Section: Tables

Both tables live in a card that is also a CSS container (`container-type: inline-size; container-name: tbl`), so column rules follow the card, not the page. Cards: `ptahSurface`, `flex flex-col gap-ptah-heading`. Table: `ptah-table size="sm" density="compact"` as today; header row `text-xs font-semibold` muted with a `border-b` in `--surface-border-strong`; body rows separated by `--surface-border`, row hover `bg-base-content/5`; cell padding 8 px vertical/horizontal. `<th scope="col">`, row header `<th scope="row">` for the first text cell (already so in Breakdown; add it in Top sessions to the session title).

### 8a. Breakdown

Header: title + description line "9 models · $1,066.33 known cost" (day mode: "30 days · busiest day Nov 9"), toggle Model/Day (`ptahButton xs`).
Concentration strip (model mode only, new, `aria-hidden`, 10 px): one segmented bar of provider cost shares in provider colors, same order as the chart; the text is in the table and the Cost share card.
Model columns: Model (`w-full`, mark 20 px, name `font-semibold truncate` with `title`, provider `ptahBadge size xs` neutral) | Cost (`font-semibold`, `title` = cost note, `—` + title for unpriced) | Share (6 px x 56 px bar in the provider color relative to the largest row, min 2% for any non-zero share, then percent in a `min-w-[3.2rem]` right-aligned span; header text "Share" or "Share of known cost" with the existing title) | Tokens (compact, muted, `title` full value).
Day columns: Day | Cost (stacked bar 72 px in chart provider colors, `gap-px`, relative to the busiest day, then value) | Share | Tokens | Top model (hidden below card width 640). Day mode lists all days (existing); keep the existing row count behavior and sort.
At card width below 420 the share bar hides, the percent stays.

### 8b. Top 5 sessions

Header: title + description "$525.43 · 49.3% of known cost" (sum of the five rows / total known cost; hidden when the total is unknown).
Columns, left to right: `#` rank (20 px square chip `rounded-md bg-base-content/10`, `text-[11px]`, sr-only "Rank" header) | Session (`w-full`, `font-semibold truncate`, `title`) | Model (mark + name, `max-w-36 truncate`, `title` = model id) | Cost (36-56 px bar in provider color relative to the top session, then `font-semibold` value, `title` = cost note) | Tokens (compact muted, full in `title`) | Last active (relative, `title` = absolute).
Fixed-width columns sum to about 470 px (rank 28, model 144, cost 150, tokens 72, last 80), leaving at least 160 px for Session at a 630 px card. Below card width 640 the Model and Last active columns are `display: none` and appear instead as a second line under the session title (`sub-line`: mark, model name, `· 2h ago`), so nothing is lost and nothing scrolls. Below 420 the cost bar hides. `display: none` removes the duplicate from the accessibility tree.
Empty: existing "No session-linked usage in this range." in `text-xs muted`.

## 9. Section: Repository usage

Section `ptahSurface`, `flex flex-col gap-ptah-field`, `aria-labelledby`; header `ptah-section-header` level 3 (kept `[level]="3"`) with description "Tokens and known cost by git repository". `data-testid="usage-repositories"` stays on the section, `usage-repository` on each repository.

Repository tile (`ptahSurface variant="inset"`, `flex flex-col gap-ptah-heading`), `repo-grid` 1 column, 2 columns from container 1200 when there are 2 or more:
1. Header: 28 px neutral icon box (repository glyph; use the project's existing icon set, not a new one), name (`text-sm font-semibold`, the last path segment without `.git`, e.g. `ptah-extension`), full path below (`text-xs muted font-mono break-all`, kept whole because paths are the identity). If the view-model keeps only `repositoryId`, derive the name in the template helper; `repositoryId` stays in `title`.
   Right: when `hasUnknownTokens`, `ptahBadge tone="warn"` with `▲ Coverage incomplete` and `title`/`aria-label` "Token coverage incomplete; some usage is unknown." (the original sentence stays available as visible text in the tooltip and `sr-only` span).
2. Stats `grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-ptah-field`:
   - "Recorded tokens": `text-xl font-semibold tabular-nums` compact (`1.2B`), `title` and a muted `font-mono text-[11px]` line with the full value `1,200,424,998`.
   - "Known cost": `text-xl ...` `$730.43` with a neutral `partial` badge whose `title` is "Partial cost (known priced rows only)"; below, a 6 px bar (primary gold, `aria-hidden`) of this repository's share of the total known cost and a caption "68.5% of $1,066.33 known cost" (hidden when the total is unknown). When the repository cost is null, show `—` and hide the bar (view-model already returns a label).
3. Worktrees: `<details class="wt">` with summary "Worktrees (4)" (muted, disclosure chevron, keyboard accessible). Open by default when 3 or fewer. List `aria-label="Worktree paths"`, items `font-mono text-xs break-all rounded-md bg-base-content/10 px-2 py-1`, `gap-ptah-label`. No bullets.
Empty: the section is not rendered when no repositories (unchanged).

## 10. States that exist today (all kept)

| State | Where it shows in the new design |
| --- | --- |
| Loading (no data yet) | `ptah-state-panel state="loading"`, `role="status"`, replaces KPI strip row only; plan limits still render |
| Error with no data | `ptah-state-panel state="error"` with Retry action |
| Refresh failed with old data | `state="partial"` panel above the content |
| Stale / updating | content `opacity-60` on each band (unchanged) + "Updating usage..." status line |
| No usage in range | `ptah-state-panel state="empty"`; partial variant adds `emptyPartialMessage` |
| Partial sources | meta `partial` badge with tooltip |
| Unpriced costs | `≥` prefixes, "Share of known cost", hatched legend and quality segment |

## 11. Accessibility

- Every card is a `section`/`article` with an accessible name. One `h2` per top-level section (Plan limits, Repository usage use level 2 only if the page title is level 1; keep the levels the code uses today).
- Tables: real `table`, `th scope="col"`, `th scope="row"`; right-aligned numeric columns use `ptahNumeric`.
- Decorative bars, rings' arcs, donut slices' duplicate legend and composition bar are `aria-hidden="true"` and always sit next to the text value. The ring keeps `role="meter"` with `aria-label` ("<provider> <window> used") and `aria-valuenow`.
- Status never relies on color: badge text plus glyph. Hover tooltips (`title`, `data-tip`) have focus equivalents: the partial badge already focuses; the savings tooltip needs `tabindex="0"` on its cell.
- Focus rings: existing `ptah-focus` outline tokens on all buttons, summaries and rows with actions.
- Motion: no new animation; spinner and ring fade already honor `prefers-reduced-motion`.
- Light theme: use the bar edge rule from section 2.

## 12. Parity list (nothing removed)

| Capability | Today | New location |
| --- | --- | --- |
| Date span, partial badge + tooltip, ledger-since | meta row | same, section 3 |
| KPI tiles: raw cost (tooltip, delta, sparkline), processed tokens (per active day, output, delta, sparkline), cached % (cached, uncached, cache writes), sessions, messages, subagents, footnote | KPI strip | same, section 4 |
| Plan limits header, summary badges, loading/error/empty, refresh failed, discovery incomplete, no selected reading | panel | same, section 5 |
| Card: mark, title, selected marker, status text, ring, window label, value, reset line, notice, mini rows, "+N more", source line, action button, Details popover | card | same fields; status text moved to a badge in the body; title no longer truncated |
| Without-readings chips (mark, label, reason) | chip row | no-readings list, section 5 |
| Daily usage: Cost/Tokens toggle, legend, unknown-day hatch and legend, tooltip readout, empty text, aria-label | chart card | same, section 6a |
| Cost share: Provider/Model toggle, donut, center total, slices (with Other), unpriced marking, aria-label, legend text | donut | same toggle and donut; legend text merged into the list rows' `title` and visible rows |
| By provider: mark, name, cost, share, bar, unpriced label | list | list inside Cost share card, section 6b |
| Cost quality: provider reported, model priced, unpriced, cache savings (lower-bound + tooltip) | strip | full row, section 7; plus composition bar |
| Breakdown: Model/Day toggle, columns Model (mark, name, provider chip), Cost, Share (bar + %), Tokens; day columns incl. top model; unpriced `—` + titles; share denominator heading and title | table | same, section 8a |
| Top sessions: rank, session, model (mark), cost (bar + value), tokens, last active, titles, empty text | table | same six columns; Model and Last active fold into a sub-line only below card width 640 |
| Repository: id, recorded tokens, partial cost, incomplete-token warning, worktree path list | text lines | structured tile, section 9 |
| Usage states (loading, error+retry, stale, refresh-failed, empty, partial-empty) | top of content | same, section 10 |
| Stale `opacity-60` on bands | each band | unchanged |
| `data-testid`s | all | unchanged; new elements get new test ids (`usage-quality-bar`, `usage-breakdown-strip`, `usage-repository-share`) |

### Removal proposals (need user approval)

None.

Optional, not required: the Cost share "Model" mode could use provider-tinted ramps instead of `MODEL_COLORS`; left as is.

## 13. Implementation checklist (grouped by file; apply in this order)

Do not rework the in-flight changes for the stat strip move and the table surfaces; refine them toward the values below.

Batch 1: `usage-dashboard/usage-formatting.ts` (and spec)
1. Add `formatUsd` branch for non-zero values below one cent (`<$0.01`), keep `formatUsd` for the rest.
2. `formatPercent`: exact 0 gives `0%`; above 0 and below 0.001 gives `<0.1%`.
3. Add `formatTokenCount` full-value helper (separators) if `tokenCountFormat` is not exported; use it in `title`s.

Batch 2: `usage-dashboard/usage-dashboard.component.html` and `.ts` (styles)
1. Root gap `gap-ptah-group`; bands `gap-ptah-field`.
2. Chart row: `@container (min-width: 960px) { grid-template-columns: minmax(0,2fr) minmax(20rem,1fr) }`; both children direct `section ptahSurface`; remove the wrapper `div ptahSurface` around donut and summary; put donut and by-provider in one `ptah-usage-cost-share` area (see Batch 4) or keep both components inside one `section ptahSurface`.
3. Table row: breakpoint `1400px`, columns `5fr / 7fr`.
4. Repository section: replace the text lines by the tile markup in section 9; add template helpers `repoName(id)` and `repoShare(repo)` (or view-model fields); keep ids and test ids.

Batch 3: `usage-dashboard/stacked-bar-chart.component.html` (+ `.ts`, `.geometry.ts` if needed)
1. Root `flex h-full flex-col gap-ptah-heading`; chart wrapper `relative flex-1 min-h-[220px]`; SVG `absolute inset-0` with `preserveAspectRatio="none"` replaced by measured width/height (ResizeObserver or the existing `viewW/viewH` with `none` plus HTML axis labels).
2. Bar width 64% of slot, rounded top end on the last segment, 1 px surface stroke between segments.

Batch 4: `usage-cost-donut.component.ts`, `usage-cost-summary.component.ts`
1. Remove the section-level headings that duplicate the card (`h4 By provider`); the donut component keeps its header (title + toggle) and is promoted to level 3.
2. Donut 148 px; center caption/total/caption; slice gaps 2 px.
3. Provider list: 3-col row grid, merged legend, bar 6 px, `title` carries the legend label; `justify-content: space-around`.
4. Container rules: stacked above 960, donut-left/list-right between 560 and 959, stacked below 560 (container queries on the page).

Batch 5: `usage-cost-quality.component.ts`
1. Add the header, composition bar (`aria-hidden`, test id), swatches and cell dividers; `text-xl` values; `text-[11px]` captions; `tabindex="0"` on the savings cell.

Batch 6: `usage-breakdown-table.component.ts`, `usage-top-sessions.component.ts`, `usage-table-rows.ts`
1. Container wrapper (`container-type: inline-size; container-name: tbl`), description lines, concentration strip (model mode), top-5 share description.
2. Share and cost bars: min width 2% for non-zero; `tabular-nums`; `th scope="row"` for session title; 20 px rank chip.
3. Sub-line below 640 and `display:none` for Model and Last active; hide bars below 420.
4. Row builders: add `costBarPercent`/`shareBarPercent` minimum, `tokensTitle` with separators, share label via the new `formatPercent`.

Batch 7: `usage-kpi-strip.component.ts`
1. Tiles to `ptahSurface variant="inset" padding="sm"`; `text-[11px]` captions; separators on counts; `gap-ptah-field`.

Batch 8: `plan-limits/plan-limits-panel.component.ts`, `provider-limit-card.component.ts`, `provider-limit-chip.component.ts`, `provider-limit-card.view-model.ts`
1. Panel to `ptahSurface`; card container to flex-wrap with the basis rules in section 5.
2. Card: header without status, `line-clamp-2` title with `title`, account sub-line (add `accountLine` to the view-model if it does not exist; do not concatenate it into the ring label), body with `<ptah-ring size="row" [centerOnly]="true" [ariaLabel]=...>`, status as `ptahBadge`, footer as in section 5, `ptahSurface variant="inset"`.
3. View-model: the ring `label` stays `"<provider> <window> used"` for the accessible name only; keep `windowLabel` and `primaryValueText`/value text for the visible column. Update `provider-limit-card.view-model.spec.ts` and the card spec for the new fields.
4. Chip becomes a two-line list item; "Without usage readings" becomes a heading with a count badge; keep `data-testid`s.

Batch 9: verification (coordinator, not this lane)
- `npm run verify -- --related -p dashboard,ui`, then `-t lint,typecheck`, then `typecheck-templates` for `ptah-extension-webview`; review screenshots in Electron at 900, 1200, 1500 content widths, dark and light.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Root gap 24 px, band gap 16 px | keep 32 px; 24/16 | the screens show tall sprawl; tokens `gap-ptah-group`/`field` exist | yes |
| Tables side by side from 1400 px at 5fr/7fr | keep 1440 and 1fr/1fr | six-column session table needs about 630 px; 1fr/1fr at 1500 gives about 730 minus padding, tight | yes |
| Fold Model/Last active into a sub-line only when the card is under 640 px | horizontal scroll; remove columns | no scroll and no removal requested | yes |
| Merge donut legend and By provider list | keep both | same data twice, doubled height | yes |
| Plan cards flex-wrap with grow instead of a fixed grid | auto-fill grid; auto-fit grid | auto-fill leaves empty tracks at the right (screenshot) | yes |
| Light-theme bar edge for low-contrast provider colors | recolor providers | brief says keep provider colors | yes |
| Plan limits stays between the KPI strip and the chart row | move it to the bottom | parity with today; it is the most actionable block | yes |

## Visual notes for the prototype

The prototype draws provider marks as lettered color squares (the app uses `ptah-provider-mark` vendor logos), uses generated 30-day data that matches the totals given (`$1,066.33`; Anthropic `$730.43`, Codex `$320.27`, Grok `$12.41`, Unknown `$3.22`), and mirrors the dark and light tokens above. Gate 1.7: not passed; prototype awaits the cross-side review. Screenshots were not captured (no browser run in this lane).
