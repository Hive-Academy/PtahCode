# Cross-Family Code Review — Command Output Cards Visual Upgrade

**Verdict:** `NEEDS_REVISION`

**Scope reviewed:** Uncommitted changes on `feat/command-output-cards` (PR #1532) across `libs/shared`, `libs/frontend/declarative-dashboard`, and `.claude/skills/ptah-surface-authoring/references/ptah-ui.md`.

## Verification Run

- Focused Jest (`libs/shared`, 8 suites): **509/509 passed** (`index.zod-free`, `ptah-ui-parser`, `ptah-ui-converter`, `surface-validator`, `surface-text-fallback`, `surface-selection`, `ptah-ui-pipeline`, `local-command-output`).
- Focused Jest (`libs/frontend/declarative-dashboard`, 10 suites): **168/168 passed** (`dashboard-leaderboard`, `dashboard-meter`, `command-output-render`, `dashboard-table`, `dashboard-list`, `surface-node`, `surface-renderer`, `surface-view-model`, `trust-boundary`, `budget-render`).
- Focused Jest (`libs/frontend/chat-ui`, `ptah-ui-block.component.spec.ts`): **38/38 passed** (including light/dark axe checks).
- Focused Jest (`libs/frontend/mcp-apps-page`, 2 suites): **27 passed, 1 failed** (`apps-surface-panel.component.spec.ts:235`, see Finding 1).
- ESLint on all 23 modified/added source `.ts` files: **0 errors**, 1 pre-existing `max-lines` warning in `surface.schemas.ts`.
- Not run per review rules: `nx` targets, `typecheck-templates`, and Electron visual checks.

## Findings

### Serious

1. **[serious] Regression in `mcp-apps-page`: hiding the filter on `<= 10`-row tables breaks an existing spec**
   - **Evidence:** `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:21,63,161`; `libs/frontend/mcp-apps-page/src/lib/components/apps-surface-panel.component.spec.ts:41,232-235`.
   - **Detail:** `AppsSurfacePanelComponent › keeps focus inside the picked surface when the agent updates another one` creates a 3-row table (`makeTable(3, 2)`) and asserts `element.querySelector('ptah-dashboard-table input[type="search"]')` is non-null. Because the filter now renders only above 10 rows, that spec fails (`Received: null`).
   - **Fix:** Update `apps-surface-panel.component.spec.ts` to use a >10-row table (e.g. `makeTable(12, 2)`) in that test (or focus an always-present control such as a sort header button `th button`) and re-run the `mcp-apps-page` spec.

2. **[serious] Vacuous `/4` schema rejection test in `surface-validator.spec.ts`**
   - **Evidence:** `libs/shared/src/mcp-apps-contracts/surface-validator.spec.ts:1436-1461` (line 1460); `libs/shared/src/mcp-apps-contracts/surface.schemas.ts:712-737`.
   - **Detail:** `rejects out-of-contract $kind` runs `SurfaceEnvelopeSchema.safeParse(v4Document(component))`, where `SurfaceEnvelopeSchema` only accepts `dashboard-catalog/3` while `v4Document()` sets `catalogVersion: 'dashboard-catalog/4'`. Every one of the 10 invalid cases fails immediately on `catalogVersion` (a valid `v4Document(leaderboard)` would also fail), so none of the leaderboard/meter schema bounds (empty groups/segments, unknown icon, share > 100, >50 entries across groups, >8 groups, >12 segments, negative/infinite amount, non-boolean `muted`) are actually verified by the test.
   - **Fix:** Validate each case with `documentOf(v4Document(component))` (asserting `.ok === false`) or `SurfaceCatalog4EnvelopeSchema.safeParse(v4Document(component))` (asserting `.success === false`), and assert that valid `leaderboard` and `meter` documents pass the same schema.

3. **[serious] Active filter becomes hidden and un-clearable if a live table or list shrinks to `<= 10` rows**
   - **Evidence:** `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:63-77,160-163`; `libs/frontend/declarative-dashboard/src/lib/components/dashboard-list.component.ts:40-54,116-124`.
   - **Detail:** If a user filters a live table/list (`$diff`, `$agents`, `$limits`, or an MCP App surface) while it has >10 rows, and a subsequent update reduces its row/item count to `<= 10`, `collapsible()` becomes `false` and removes `<ptah-dashboard-collection-filter>` from the DOM. However, `page()` still filters using `viewState().filter` and `showCount()` displays `"0 results"` (or a filtered subset), trapping the user with no way to see or clear the active filter.
   - **Fix:** Either keep the filter input visible whenever `(viewState().filter ?? '') !== ''` (`showFilter = computed(() => this.collapsible() || (this.viewState().filter ?? '') !== '')`), or ignore `viewState().filter` in `page()` and `showCount()` when `!this.collapsible()`.

### Minor

4. **[minor] Duplicated leaderboard/meter limits between `libs/shared` and `libs/frontend/declarative-dashboard`**
   - **Evidence:** `libs/shared/src/mcp-apps-contracts/surface-catalog.ts:101-103`; `libs/shared/src/mcp-apps-contracts/surface.index.ts:15-43`; `libs/frontend/declarative-dashboard/src/lib/view-model/surface-card-fields.ts:8-11`.
   - **Detail:** `SURFACE_LEADERBOARD_MAX_ENTRIES`, `SURFACE_LEADERBOARD_MAX_GROUPS`, and `SURFACE_METER_MAX_SEGMENTS` are not exported from `surface.index.ts`, so `surface-card-fields.ts` duplicates them as hardcoded constants (`50`, `8`, `12`) that can drift from the shared catalog.
   - **Fix:** Re-export all three constants from `libs/shared/src/mcp-apps-contracts/surface.index.ts` (matching `SURFACE_SPARK_MIN_POINTS`) and import them in `surface-card-fields.ts`.

5. **[minor] Numeric column heuristic false positives and whitespace-cell edge case**
   - **Evidence:** `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:23,35-46`.
   - **Detail:**
     - `NUMERIC_TEXT` (`/^\s*[-+]?[$€£¥]?\s?[-+]?\d[\d,]*(\.\d+)?\s?(%|[kKmMbBtT]|ms|s|x)?$/`) accepts comma-separated IDs like `"1,2,3"` or `"101,102"`, trailing commas like `"100,"`, and double signs like `"+-5"` / `"--5"`.
     - `if (cell === null || cell === '') continue;` runs before `.trim()`, so a whitespace-only cell (`"   "`) fails the regex and disqualifies an otherwise numeric column.
   - **Fix:** Check `typeof cell === 'string' && cell.trim() === ''` before testing, and tighten `NUMERIC_TEXT` to enforce proper thousands grouping and at most one sign, e.g. `/^(?:[-+]?\s?[$€£¥]|[$€£¥]\s?[-+]?|[-+])?\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:%|[kKmMbBtT]|ms|s|x)?$/` (optionally excluding leading-zero multi-digit IDs like `"0042"`).

6. **[minor] Empty-string titles produce empty `aria-label=""`**
   - **Evidence:** `libs/frontend/declarative-dashboard/src/lib/components/dashboard-leaderboard.component.ts:12,27`; `libs/frontend/declarative-dashboard/src/lib/components/dashboard-meter.component.ts:13`; `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:133-135`; `libs/frontend/declarative-dashboard/src/lib/components/dashboard-list.component.ts:101-103`.
   - **Detail:** Schema validation permits empty strings (`boundedString().optional()`), and `plainText()` returns `""` for `{ text: "" }`. `@if (title(); as title)` correctly omits the visible heading, but `??` preserves `""`, yielding `aria-label=""` on `<section>`, `<table>`, and `<ol>` (and `"Filter "` / `"Expand "` on controls).
   - **Fix:** Normalize blank titles with `.trim() || undefined` before computing headings and `aria-label` fallbacks.

7. **[minor] Direct-input edge cases in `DashboardLeaderboardComponent` and `DashboardMeterComponent`**
   - **Evidence:** `libs/frontend/declarative-dashboard/src/lib/components/dashboard-leaderboard.component.ts:55-58`; `libs/frontend/declarative-dashboard/src/lib/components/dashboard-meter.component.ts:56-58`.
   - **Detail:** In `DashboardLeaderboardComponent`, `share` is clamped to `0..100` but `value: entry.value ?? `${entry.share}%`` still formats the unclamped value (so `share: 101` draws a 100% bar labelled `101%`). In `DashboardMeterComponent`, direct callers passing `NaN` or negative `amount` values produce `NaN` or negative bar widths.
   - **Fix:** Clamp `share` first (`Number.isFinite(entry.share) ? Math.min(100, Math.max(0, entry.share)) : 0`) and format `value` from the clamped number; in `DashboardMeterComponent`, sanitize each segment amount with `Number.isFinite(segment.amount) && segment.amount > 0 ? segment.amount : 0`.

8. **[minor] Test coverage, markup, and hygiene cleanups**
   - **Evidence:**
     - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:82-83`: `<caption class="sr-only">` duplicates `<ptah-table [label]="accessibleName()">` (which already sets `aria-label` on `<table>`; `trust-boundary.spec.ts:158` no longer queries `caption`).
     - `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:226-249,449-454`: add runtime XSS/markup rendering tests for `leaderboard` and `meter` fields and assert no URL/HTML attribute bindings on them (matching line 444 for other `/4` atoms).
     - `libs/shared/src/mcp-apps-contracts/surface-text-fallback.spec.ts`: add unit tests covering `leaderboard` (including rank reset per group and details) and `meter` plain-text fallback output.
     - `tools/ui-class-audit/baseline.json:474-476`: prune the now-stale `"<dynamic>": 2` entry for `dashboard-table.component.ts` with `--update-baseline`.
     - `dashboard-list.component.ts`, `dashboard-list.component.spec.ts`, and `dashboard-table.component.spec.ts` have CRLF line endings in the working copy; normalize to LF.

## Checklist Summary

- **Parser & converter:** Escapes (`\|`, `\\`, `\$`, invalid escapes), limits (8192 bytes, 200 lines, 200 components, 50 children, 50 entries / 8 groups including implicit group, 12 segments), and `/4` gating are correctly implemented in `ptah-ui-parser.ts`, `ptah-ui-converter.ts`, `surface.schemas.ts`, `surface.validator.ts`, and `surface-view-model.ts` (fix test gap in Finding 2).
- **Meter math & leaderboard ranks:** All-zero and `Number.MAX_VALUE` scaling keep widths finite; ranks restart at 1 per group in both DOM and plain-text fallback (minor direct-input hardening in Finding 7).
- **Trust boundary:** Zero HTML sinks, icons strictly restricted to the 16-token allowlist with `Object.hasOwn`, style bindings restricted to `[style.width.%]`, no dynamic class expressions (`dashboard-table` removed its previous 2 `<dynamic>` entries).
- **Architecture:** Root `@ptah-extension/shared` remains Zod-free (`index.zod-free.spec.ts` passes), no deep cross-lib imports, shared types and `SURFACE_ICON_TOKENS` exported via public entry points (export card limits in Finding 4).
- **Angular & accessibility:** Standalone `OnPush` components with signals/computed, DaisyUI theme tokens (`text-base-content-muted` rather than alpha `text-base-content/NN`), ARIA summaries for bars, `aria-hidden` icons, labelled search input; `ptah-ui-block` axe checks pass in light and dark themes (minor edge cases in Findings 6 & 8).
- **Other `ptah-ui` / surface producers:** Untitled `ptah-ui` tables and lists benefit from removing the synthetic `"Table"`/`"List"` heading; MCP App surfaces with `<= 10`-row tables lose the always-on filter (which broke Finding 1 and exposes the shrink-with-filter bug in Finding 3).
