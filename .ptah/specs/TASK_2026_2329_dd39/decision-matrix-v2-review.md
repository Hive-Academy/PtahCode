# Review — Decision matrix dashboard v2

## Verdict

**Changes needed**

The overall architecture (pure aggregation helper, focused store, OnPush standalone components, token-driven inline-SVG chart primitives with axe/a11y specs, and preserved read-back/Undo semantics in the three routing-control components) is clean and well-structured. However, there are **3 Blockers** and **5 Majors** that must be fixed before merge—most critically: (1) all 6 new Electron preview tests will fail on a theme-ID mismatch, (2) all 4 KPI rings render blank centers for any value `>= 10%`, and (3) real production data with default-model runs drops all top-half rollups to zero.

---

## Findings

### Blocker

#### B1. Electron design-preview helper clicks `Ptah Glass` / `Ptah Glass Light` but asserts `anubis` / `anubis-light`
- **Location:** `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts:324-338`
- **Problem:** `setDashboardTheme` opens the `Glass` tab of the theme picker and clicks `Ptah Glass` (dark) or `Ptah Glass Light` (light), which sets `data-theme="ptah-glass"` or `data-theme="ptah-glass-light"` (`libs/frontend/core/src/lib/services/theme.service.ts:108-109`). However, line 326 sets `const themeId = theme === 'dark' ? 'anubis' : 'anubis-light'` and line 336 asserts `await expect(html).toHaveAttribute('data-theme', themeId)`. Every one of the 6 new Electron preview tests will time out and fail.
- **Concrete fix:** Change line 326 to `const themeId = theme === 'dark' ? 'ptah-glass' : 'ptah-glass-light'` (matching `Ptah Glass` / `Ptah Glass Light` and glass-mode verification). If non-glass `anubis` / `anubis-light` verification is also desired, select `Anubis` / `Anubis Light` in a separate helper or branch so the clicked theme button matches the asserted `data-theme` value.

#### B2. All 4 KPI rings omit their center percentage for values `>= 10%` because `size="stat"` suppresses 2+ digit labels
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:57-60` (see `libs/frontend/ui/src/lib/charts/ring.component.ts:79-80,170-172`)
- **Problem:** Each KPI tile renders `<ptah-ring ... [centerText]="kpi.max ? undefined : '—'" [centerOnly]="true" size="stat" tone="gold" ... />`. In `PtahRingComponent`, `size="stat"` is 32×32 px and explicitly suppresses the center percentage whenever `rounded() >= 10` (`this.size() !== 'stat' || this.rounded() < 10`). Because `[centerOnly]="true"` also hides the side text and the adjacent markup only prints `{{ kpi.value }} of {{ kpi.max }} {{ kpi.unit }}`, every KPI at 10%–100% renders a tiny empty ring with no percentage anywhere on the tile (unlike the approved mock's 52 px ring with centered percentage).
- **Concrete fix:** Change `size="stat"` to `size="row"` (56 px, `text-sm`) or `size="tile"` (56 px, thicker stat-tile ring) so percentages `0%`–`100%` always display inside the ring. Add an assertion in `decision-matrix-page.component.spec.ts` verifying that the rendered KPI rings display their expected percentages (`67%`, `70%`, `17%`, `100%`) and `—` when `max === 0`.

#### B3. Default-model runs in real production data are dropped to zero across KPIs, Run pipeline, Outcome mix, and Who does the work
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:175-186` (interacting with `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts:255-265`)
- **Problem:** In the backend (`choice-evidence.ts:257-265`), whenever a run uses the default lane model (`row.model === LANE_DEFAULT_MODEL`) and the CLI reports a native `resolvedModel`, `deriveChoiceEvidence` writes that run into **both** the concrete model bucket (`resolvedModel`) and the family wildcard bucket (`'*'`). That is the standard out-of-the-box path for Codex and Claude lanes. In `runTotals` (`decision-matrix-dashboard.model.ts:183`), any `(family, task)` where both `models.get('*')` and any concrete model have `spawned > 0` is completely excluded (`if (fallback?.spawned && concrete.length) overlappingDefaults = true;`). On real workspace data this zeroes out `funnel.spawned`, causing "Approved on review", "Delivered", Run pipeline, Outcome mix by lane, and Who does the work to all render empty states—a defect masked by all happy-path test and preview fixtures omitting `model: '*'` alongside concrete models.
- **Concrete fix:** Add a deduplicated per-family (or per-family-task) funnel rollup to `AgentGetRoutingEvidenceResult` in `RoutingEvidenceService` / `deriveChoiceEvidence` (which already iterates `dedupeByRun(summaries)` before duplicating default runs into `[model, '*']`), and drive `runTotals` from that exact rollup instead of reconstructing totals by discarding overlapping buckets. Add a fixture and unit test with simultaneous `'*'` and resolved concrete-model runs.

---

### Major

#### M1. Undefined `--ptah-text-muted` token collapses three Outcome Mix segments into the same color as each other and the empty bar track
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:31,74-75`
- **Problem:** `--ptah-text-muted` does not exist in `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` or `apps/ptah-extension-webview/src/styles.css`. Both `Unverified` (line 31) and `Unresolved revisions` (line 74) fall back to `var(--surface-border-strong)`, which is also the color of `Awaiting review` (line 75) and of `ptah-stacked-bar`'s empty track (`--ptah-meter-track: var(--surface-border-strong)` in `stacked-bar.component.ts:22`). Three distinct legend categories render with identical swatches and vanish against the track.
- **Concrete fix:** Map each category to a distinct existing token from `ptah-tokens.css` (e.g. `--ptah-state-ok`, `--ptah-state-err`, `--ptah-chart-warn`, `--ptah-gold`, `--ptah-state-info`, `--ptah-series-4`, `--ptah-series-3`, `--ptah-series-other`) so every segment in `Outcome mix by lane` and `Lost` is distinguishable from its neighbors and from `--ptah-meter-track` in both dark and light themes.

#### M2. Aggregation edge cases: dropped `stale`/`asOf` on multi-effort cells, unclamped percentages/`lostShare`, and `−0` funnel drops
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:59-68,75,81-98,221` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:35-37,82`
- **Problem:**
  1. When `effort === '*'` is absent and more than one concrete effort exists (`specific.length > 1`), `scored` is `undefined`, so `measuredCell` forces `stale: false` (line 97) and `asOf: null` (line 98) even when every constituent effort key is `stale: true`. Also line 81 filters `specific` only on `key.funnel.spawned > 0`, whereas line 82 checks `key.funnel.spawned > 0 || key.sampleCount > 0`.
  2. `lostShare` (line 221) uses `funnel.spawned ? lostTotal / funnel.spawned * 100 : 0` with no `[0, 100]` clamp and is bound directly to `[style.inline-size.%]="model.lostShare"` (`html:82`); inconsistent RPC data (`lostTotal > spawned`) will overflow the chart card.
  3. `percent(value, total)` (lines 59–61) does not validate `Number.isFinite(value)` or clamp `[0, 100]`, and `Awaiting review` (line 75) does not clamp `Math.max(0, funnel.delivered - funnel.reviewed)`.
  4. `pipeline` (line 66) emits `drop: 0` (and negative values if non-monotonic), so `html:35-37` renders `−0` (`aria-label="0 fewer runs"`) on every stage with no drop (unlike the mock, which hides `drop <= 0`).
- **Concrete fix:**
  - In `measuredCell`: compute `stale: scored ? scored.stale : counts.some((key) => key.stale)` and choose the newest non-null `asOf` across `counts` when `scored` is undefined; match `specific`'s predicate to `key.effort !== '*' && (key.funnel.spawned > 0 || key.sampleCount > 0)`.
  - Clamp `percent` to `0..100` when `Number.isFinite(value) && Number.isFinite(total) && total > 0`, clamp `lostShare` to `Math.min(100, Math.max(0, ...))` when `funnel.spawned > 0`, clamp `Awaiting review` to `Math.max(0, funnel.delivered - funnel.reviewed)`, and set `drop` to `null` when `index === 0 || delta <= 0`. Add unit tests in `decision-matrix-dashboard.model.spec.ts` covering stale multi-effort cells, `value > total`, and zero drops.

#### M3. Glass-theme regressions: translucent sticky table headers, broken `prefers-reduced-transparency` overrides, clobbered light-mode glass shadows, and non-token muted ink
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.css:13,29-36,126-131,187-190` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:183`
- **Problem:**
  1. `thead th` (`css:130`) uses `background: var(--ptah-card-bg)`, which resolves to semi-transparent `--glass-fill-tile` under `data-glass="on"` (`ptah-tokens.css:403`). Vertically scrolled matrix rows bleed through the sticky column headers (and through `border-spacing` gaps between `<th>` cells).
  2. `@media (prefers-reduced-transparency: reduce)` (`css:187-190`) sets `background: var(--ptah-card-bg)` on `[data-glass-surface]` and `background: var(--ptah-card-bg-inset)` on `[data-variant='inset']`. With Angular view encapsulation specificity, this overrides `styles.css:2981-3009` (which already maps glass tokens to distinct opaque `--b1`/`--b2` fills for both `prefers-reduced-transparency: reduce` and `prefers-contrast: more`), and because both `--ptah-card-bg` and `--ptah-card-bg-inset` point to `--glass-fill-tile`, it flattens the inset detail card into the outer surface.
  3. Lines 32–36 overwrite `box-shadow` on `content`, `tile`, and `plate` under `data-glass="on"`, clobbering the light-mode tile shadow in `styles.css:3253-3255` and `content`'s `--glass-content-shadow` in `styles.css:3240`. Using `data-glass-surface="plate"` on the Outcome matrix card (`html:183`) also opts out of `.settings-page [data-glass-surface='content']`'s `var(--ptah-card-padding-lg)` padding and directional `::before` rim (`styles.css:3227-3261`), making it visually inconsistent with the `content` cards above it.
  4. `.muted` (`css:13`) uses `color: color-mix(in srgb, currentColor 74%, transparent)` instead of the contrast-audited `--bcm` token (`oklch(var(--bcm))`, verified >= 4.5:1 across dark/light glass themes in `styles.css:3094,3139-3146`).
- **Concrete fix:**
  - Give sticky `thead th` an opaque surface background (e.g. `oklch(var(--b2))` or `oklch(var(--b1))`) and ensure no gaps reveal scrolled cells behind the header row.
  - Remove lines 32–36 and lines 187–190 so `styles.css` owns glass elevation shadows and `prefers-reduced-transparency` / `prefers-contrast` solid fallbacks cleanly; switch the Outcome matrix section (`html:183`) from `data-glass-surface="plate"` to `data-glass-surface="content"`.
  - Change `.muted` (`css:13`) to `color: oklch(var(--bcm));`.

#### M4. User-relied data from removed `RoutingEvidenceComponent` is now unreachable (`decisionModels`, model effort provenance/support, `inCatalog`, per-effort scores)
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:259-328` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:79-113,195-230`
- **Problem:** Removing `RoutingEvidenceComponent` made several user-facing diagnostics unreachable anywhere in Settings:
  1. `evidence.decisionModels` (each decision model's proposals, accepted count, mean confidence, and outcome funnel) is ignored completely.
  2. Per-model `efforts` provenance (`native` / `ptah-fallback` / `unknown`), supported effort list, default effort, and `!model.inCatalog` ("Outside current catalog" warning) are omitted even from the selected-cell detail panel (the approved mock at `decision-matrix-mock/index.html:156` included effort provenance next to "Effort split").
  3. Per-effort measured scores/staleness (e.g. `high` vs `medium`) are unreachable; when `'*'` is absent and >1 concrete effort exists, the cell shows `—` / `Unscored` while hiding the individual effort scores.
  4. Conversely, catalog-only models with zero runs (previously collapsed under `<details>Catalog models without evidence</details>`) now render as full all-dashed rows in the Measured outcomes heatmap, which clutters the table on lanes with large catalogs (e.g. OpenRouter).
- **Concrete fix:**
  - Preserve `efforts` (`provenance`, `supported`, `default`) and `inCatalog` on `DashboardRow`, display effort provenance/default and an `"Outside current catalog"` badge in the selected-cell detail panel, and show each concrete effort's score alongside its run count in the effort legend.
  - Restore a compact collapsible "Decision models" summary (e.g., below Catalog health when `evidence.decisionModels.length > 0`) unless explicitly approved for permanent removal.
  - Consider hiding or collapsing zero-evidence catalog-only rows from the Measured outcomes heatmap table (while retaining them in Matrix coverage if desired).

#### M5. Orphaned dead code left behind after component removal: `MatrixScoreComponent`
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/matrix-score.component.ts:1-45`
- **Problem:** `CapabilityMatrixSettingComponent` was the sole importer/consumer of `MatrixScoreComponent` (`ptah-matrix-score`). After deleting `capability-matrix-setting.component.ts`, `matrix-score.component.ts` has zero references across `apps/` and `libs/`.
- **Concrete fix:** Delete `libs/frontend/chat/src/lib/settings/ptah-ai/matrix-score.component.ts`.

---

### Minor

#### m1. Double divider in Routing controls card and orphaned `<label for>` during loading/error states
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.css:79-83`, `host-routing-setting.component.ts:74-99`, `performance-routing-setting.component.ts:43-60`, `lane-rotation-setting.component.ts:64-86`
- **Problem:** `PtahSettingRowComponent` renders `border-b border-surface-border last:border-b-0` on its host (`setting-row.component.ts:20`). In `HostRoutingSettingComponent` and `LaneRotationSettingComponent`, `<p class="sr-only">` follows `<ptah-setting-row>` inside the same `<div>`, so `<ptah-setting-row>` is not `:last-child` and draws a bottom border. Combined with `.routing-controls > :is(ptah-performance-routing-setting, ptah-lane-rotation-setting)`'s `border-block-start`, this creates a double hairline between rows 1 and 2 and an extra hairline between row 3 and its rotation chips. In addition, all three components pass a static `controlId` even while the `<input>` is omitted during `'loading'`/`'error'`, producing an orphaned `<label for>`.
- **Concrete fix:** Move the `sr-only` help `<p>` outside the `<div>` wrapping `<ptah-setting-row>` (or remove the redundant border on `.routing-controls > ...` / suppress `ptah-setting-row`'s bottom border inside `.routing-controls`), and pass `[controlId]="<controlRendered> ? '<id>' : null"`.

#### m2. `aria-live="polite"` on the entire detail `<aside>` over-announces and re-triggers on `<ptah-relative-time>` clock ticks
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:259,267`
- **Problem:** Marking the entire `<aside class="matrix-detail">` as `aria-live="polite"` causes screen readers to recite every nested meter, stacked bar, legend, and `<dl>` entry on each selection, and to fire unprompted announcements every time `<ptah-relative-time [value]="measured.asOf" />` updates via `PTAH_CLOCK`.
- **Concrete fix:** Remove `aria-live="polite"` from `<aside>` and add a dedicated `<p class="sr-only" aria-live="polite">` driven by `detail()` that announces a concise summary only when the selected cell changes.

#### m3. `Current pick per task kind` lacks tie-breaking against `model: '*'` / out-of-catalog rows and uses unformatted scores in `valueText`
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:152-162` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:168`
- **Problem:** `picksFor` sorts `measuredRows` solely by `b.score - a.score`, allowing a `model: '*'` ("Family default") or `inCatalog: false` row to beat a named in-catalog model on an equal score. In `html:168`, `[valueText]` interpolates raw `winner.score` and `pick.runnerUp.score` (potentially long decimals) instead of matching the `1.0-1` format used on line 170.
- **Concrete fix:** Prefer `inCatalog && row.model !== '*'` rows in `picksFor` (at least as a tie-breaker, or exclude out-of-catalog rows), and format scores to at most one decimal place in `valueText`.

#### m4. `laneName(null, family)` bypasses `RoutingDisplayNamesStore`, and rating `stale` is hidden in Measured mode
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.ts:103-105` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:262,306-317`
- **Problem:** When `laneId === null` (ratings-only family or while evidence failed to load), `laneName` returns raw `family` (e.g. `'codex'` or `'pc-...'`) instead of `this.names.executor(family).text`. Also, when viewing a cell in `Measured outcomes` mode, line 262 only reflects `detail.active.stale` (the measured cell), while the Rating provenance `<dl>` (lines 306–317) omits `rating.stale` (which `CapabilityMatrixSettingComponent` previously displayed).
- **Concrete fix:** Resolve `this.names.executor(laneId ?? family).text` when `laneId ?? family` is non-empty, and add `<div><dt>Stale</dt><dd>{{ rating.stale ? 'Yes' : 'No' }}</dd></div>` to the Rating provenance `<dl>`.

#### m5. Duplicate `agent:getCapabilityMatrix` RPC on load, and header Refresh leaves rotation chips and stale `Updated` timestamp behind
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.store.ts:26-47`, `decision-matrix-page.component.html:18-23`, and `lane-rotation-setting.component.ts:200-221`
- **Problem:** Mounting the page fires `agent:getCapabilityMatrix` twice in parallel (`DecisionMatrixDashboardStore.loadRatings()` and `LaneRotationSettingComponent.readLastPicks()`). Clicking the header Refresh button reloads the dashboard store but does not refresh the rotation chips in `LaneRotationSettingComponent`, and if `loadEvidence()` fails during refresh, the header continues to show the previous `"Updated <time>"` timestamp alongside the error banner.
- **Concrete fix:** Either share the capability-matrix result/refresh signal with `LaneRotationSettingComponent` (or trigger its `retryPicks()` on header refresh), and hide `Updated` in the header when `store.evidence() === 'error'`.

#### m6. Existing Electron preview check `settings-field-info.shot.ts` risks wrapping at 1168 px in the narrower `5fr` Routing controls column
- **Location:** `apps/ptah-electron-e2e/src/design-preview/settings-field-info.shot.ts:323-329,394` and `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.css:175-177`
- **Problem:** `settings-field-info.shot.ts:394` asserts that `"Suggestions appear before a lane starts."` stays on 1 line at 1168 px viewport width. Moving `HostRoutingSettingComponent` from a full-width card into the `5fr` column of `.routing-grid` at `@container (min-width: 46rem)` shrinks its text column to ~250–270 px at 1168 px, where the 40-character hint is likely to wrap to 2 lines.
- **Concrete fix:** Run `settings-field-info.shot.ts` during Electron verification and, if it wraps at 1168 px, raise the `.routing-grid` two-column container breakpoint (e.g. to `58rem`) or adjust the column ratio / hint copy so the 1-line check passes.

---

### Nit

#### N1. Undefined `--ptah-card-text` token, legacy `--state-ink-*` tokens, and dead/redundant CSS declarations
- **Location:** `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.css:54,67,75-76,157,170`
- **Problem:** `--ptah-card-text` (lines 67, 157) is undefined, so `.legend strong` inside `.legend.muted` inherits the muted color instead of base foreground text. Lines 75–76 reference legacy `--state-ink-err` / `--state-ink-done` instead of `--ptah-state-err` / `--ptah-state-ok`. Line 54's `grid-template-columns` is unconditionally overridden by lines 59 and 95, and line 170's `.health { display: flex; }` duplicates lines 16–17.
- **Concrete fix:** Replace `var(--ptah-card-text, inherit)` with `oklch(var(--bc))`, use `--ptah-state-err` / `--ptah-state-ok` on lines 75–76, and remove the dead/duplicate declarations.

#### N2. Minor accessibility, typing, and line-ending consistency polish
- **Locations:**
  - `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.html:108,127,280` — add `aria-hidden="true"` to `<i class="swatch">` to match `<i class="dot" aria-hidden="true">` on lines 238, 255, 344.
  - `libs/frontend/ui/src/lib/charts/stacked-bar.component.ts:20` and `libs/frontend/ui/src/lib/charts/donut.component.ts:14` — add `focusable="false"` on `<svg>` to match `ring.component.ts:89`.
  - `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-dashboard.model.ts:205-212` — narrow `laneId`, `approval`, and `share` to non-null types (`string` / `number`) after filtering `laneId !== null && group.funnel.spawned > 0`.
  - `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-decision-matrix.{e2e.spec,fixtures}.ts` — normalize CRLF line endings to LF.
