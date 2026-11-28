# Frontend Code Review — PR #1532 (`feat/command-output-cards`)

Verdict: NEEDS_REVISION
Review family: antigravity (implementer: claude)

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 5/10 |
| Assessment | NEEDS_REVISION |
| Blocking issues | 1 |
| High issues | 2 |
| Medium issues | 2 |
| Low issues | 1 |

Score rationale: the prose-scoping migration (`execution-node`, `ptah-ui-message-text`, `ptah-ui-block`), progress meter ARIA/layout, chart icon controls (`PtahIconButtonDirective` with `selected` -> `aria-pressed` and `aria-expanded`), and `chart-geometry` math/ticks are clean, type-safe, and theme-token compliant. However, the PR breaks two existing `declarative-dashboard` test suites (`trust-boundary.spec.ts` and `budget-render.spec.ts`, 4 failing tests), introduces a CSS cascade bug where `.dp-row-item` overrides `.dp-stat-group`'s `display: grid` inside horizontal stacks, regresses vertical `divider` rendering in horizontal stacks, and leaves equal-height card/chart/stat stretching incomplete because intermediate custom-element hosts lack `flex-1`. These real defects place the review at 5/10 (below 7–8 sound; above 3–4 because the underlying architecture and prose isolation are sound).

## Scope & Verification

- Diff examined: `git diff main...HEAD -- libs/frontend` (18 files: 9 source, 9 specs). Full source files read for all 9 changed components/utilities plus `surface-renderer.component.ts`, `apps-surface-panel.component.ts`, `display-panel.component.ts`, `dashboard-divider.component.ts`, `dashboard-badge.component.ts`, `dashboard-avatar.component.ts`, `dashboard-radial-progress.component.ts`, `surface-checkbox-input.component.ts`, `dashboard-text-block.component.ts`, `dashboard-alert.component.ts`, and `icon-button.directive.ts`.
- Checks run:
  - `node_modules/.bin/jest --config libs/frontend/declarative-dashboard/jest.config.ts --runInBand --coverage=false` → **FAIL** (2 failed suites, 23 passed; 4 failed tests, 319 passed: `trust-boundary.spec.ts` and `budget-render.spec.ts`).
  - `node_modules/.bin/jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath ...` (4 specs: `ptah-ui-block`, `ptah-ui-message-text`, `ptah-ui-inline-display`, `display-panel`) → **PASS** (4/4 suites, 86/86 tests).
  - `node_modules/.bin/jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/execution/execution-node.ptah-ui.spec.ts` → **PASS** (1/1 suite, 31/31 tests).
  - `node_modules/.bin/tsc --noEmit --project` on `libs/frontend/declarative-dashboard/tsconfig.lib.json`, `libs/frontend/chat-ui/tsconfig.lib.json`, `libs/frontend/chat/tsconfig.lib.json` → **PASS** (0 errors). Note: Angular template typechecking (`ngc` / `typecheck-templates`) was not run under the allowed-commands scope; `ptah_get_diagnostics` timed out at 45s.
  - `node_modules/.bin/eslint` on all 9 changed frontend source files → **PASS** (0 errors; `@nx/enforce-module-boundaries` warned no cached ProjectGraph, so imports were verified manually — no cross-lib deep imports, no Node/Electron imports).
- Tool fallbacks: `ptah_code_search_symbols` returned 0 symbols (empty index) → fell back to `ptah_search_files`; `ptah_get_diagnostics` timed out at 45s → fell back to `tsc --noEmit`; `git grep` used for free-text selector/class searches.

## Findings

### 1. [Blocking] Existing `declarative-dashboard` test suites fail (`trust-boundary.spec.ts` and `budget-render.spec.ts`)
- **Locations**:
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:26-30` (breaks `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:162`)
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:116-120,151` (breaks `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:163,166`)
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:63` (breaks `libs/frontend/declarative-dashboard/src/lib/budget-render.spec.ts:221,379,398`)
- **Evidence**:
  Running the full `declarative-dashboard` Jest suite fails 4 tests across 2 suites:
  1. `trust-boundary.spec.ts` (`v1: every display text field`):
     - Line 162 asserts `texts(element, 'ptah-dashboard-chart section > p')` equals `[markup, markup]`, but receives `[]` because `dashboard-chart.component.ts:26-30` moved the description `<p>` inside `<div class="flex min-w-0 items-start gap-2"><div class="flex min-w-0 flex-1 flex-col gap-0.5">`.
     - Line 163 asserts `texts(element, 'ptah-dashboard-chart ul li')` equals `[markup, markup]`, which also fails because `trust-boundary.spec.ts:29` defines a 1-series fixture and `dashboard-chart.component.ts:151` now hides the legend for `series.length <= 1`.
     - Line 166 asserts `texts(chart, 'svg text').filter(v => v === markup)` has length 3, which is also affected because categorical charts now render `<text data-testid="chart-category">{{ category.shortLabel }}<svg:title>{{ category.label }}</svg:title></text>` (`dashboard-chart.component.ts:118-119`), whose `textContent` concatenates truncated `shortLabel` + `label` rather than equaling `markup`.
  2. `budget-render.spec.ts` (`maxComponents = 200`, `maxChildrenPerNode = 50`, `maxGridColumns = 4`):
     - Lines 221, 379, and 398 count rendered stats via `[data-apps-focus-key$=":expand"]` and receive `100`, `0`, and `0` instead of `200`, `50`, and `4` because `dashboard-stat.component.ts:63` omits the expand button when `hasDetails()` is false.
- **Suggested fix**:
  Update `trust-boundary.spec.ts` to query `ptah-dashboard-chart h3 + p`, pass a 2-series fixture so the legend trust boundary remains covered, and assert category label text / `<svg:title>` explicitly. Update `budget-render.spec.ts` to count `ptah-dashboard-stat` (or `[data-testid="stat-value"]`) instead of `[data-apps-focus-key$=":expand"]`. Re-run the full `declarative-dashboard` suite.

### 2. [High] CSS cascade bug: `.dp-row-item` overrides `.dp-stat-group`'s `display: grid` in horizontal stacks
- **Location**: `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:102-103,195`
- **Evidence**:
  In `SURFACE_FLOW_STYLES`:
  ```css
  .dp-stat-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr)); gap: 0.5rem; min-width: 0; }
  .dp-row-item { flex: 1 1 14rem; min-width: min(100%, 14rem); display: flex; flex-direction: column; }
  ```
  Line 195 applies both classes to the same element when `horizontal()` is true:
  ```html
  <div class="dp-stat-group" [class.dp-row-item]="horizontal()" data-testid="stat-group">
  ```
  Both rules have identical specificity `(0, 1, 0)` and `.dp-row-item` is declared *after* `.dp-stat-group`. In a real browser, `.dp-row-item`'s `display: flex; flex-direction: column` overrides `.dp-stat-group`'s `display: grid`, causing consecutive stats inside any horizontal stack to stack vertically in a single column instead of forming an auto-fit tile grid. `surface-layout.component.spec.ts:404` did not catch this because jsdom does not evaluate CSS layout.
- **Suggested fix**:
  Move `.dp-stat-group` below `.dp-row-item` (or add `.dp-stat-group.dp-row-item { display: grid; }`), or split the flex-item sizing (`.dp-row-slot { flex: 1 1 14rem; min-width: min(100%, 14rem); }`) from `display: flex; flex-direction: column` so `.dp-stat-group` retains `display: grid`.

### 3. [High] Vertical `divider` regresses in horizontal stacks (`INLINE_SURFACE_KINDS` omission)
- **Location**: `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:108,200-203` (and `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.ts:115`)
- **Evidence**:
  `INLINE_SURFACE_KINDS` (`surface-layout.component.ts:108`) lists `['badge', 'avatar', 'radial-progress', 'checkbox']` and omits `'divider'`.
  `DashboardDividerComponent` (`libs/frontend/declarative-dashboard/src/lib/components/dashboard-divider.component.ts:29-34`) relies on `host: { '[class.self-stretch]': 'isVertical()', '[class.flex]': 'isVertical()' }` to draw a vertical separator between siblings in a horizontal stack.
  Because `'divider'` is not treated as an intrinsic-width item in a horizontal stack:
  1. `surface-layout.component.ts:201` wraps the vertical divider in `.dp-row-item` (`flex: 1 1 14rem; min-width: min(100%, 14rem)`), forcing a thin separator to occupy at least `14rem` (224 px) and grow like a card.
  2. Inside `.dp-row-item` (`flex-direction: column`) → `<ptah-surface-node class="flex min-w-0 flex-col">` (no `flex-1`), `<ptah-dashboard-divider>`'s `self-stretch` stretches horizontally rather than vertically across the row height.
  This affects any consumer (`AppsSurfacePanelComponent`, `DisplayPanelComponent`, `PtahUiBlockComponent`) rendering a horizontal stack with a vertical divider.
- **Suggested fix**:
  Treat vertical dividers (`child.kind === 'divider' && child.direction === 'vertical'`) as non-growing, full-height row items (e.g., `flex: 0 0 auto; align-self: stretch; display: flex;`) rather than `.dp-row-item`, and propagate `flex-1` on `ptah-surface-node` so the vertical rule stretches across the row height.

### 4. [Medium] Equal-height card/chart/stat stretching is broken by missing `flex-1` on intermediate host elements
- **Locations**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.ts:115,127,142,183`
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:182,201,280`
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:52,56`
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:25`
- **Evidence**:
  The PR aims for equal-height cards, and `surface-node.component.ts:113` comments `A column flex host lets a card stretch to its grid row's height`, while `surface-layout.component.ts:280` sets `h-full ... flex-1` on `<div data-kind="card">`.
  In CSS Flexbox, a child of a `flex-direction: column` container does not expand along the vertical main axis unless it has `flex: 1` (or `height: 100%`):
  - In a `grid`, `<ptah-surface-node class="flex min-w-0 flex-col">` stretches to the grid row height, but its direct child `<ptah-surface-layout class="flex min-w-0 flex-col">` (`surface-layout.component.ts:182`) has `flex-grow: 0` and no `h-full`. `<div data-kind="card">` therefore stays at its intrinsic height.
  - In a horizontal `stack`, `.dp-row-item` (`display: flex; flex-direction: column`) stretches to the row height, but `<ptah-surface-node class="flex min-w-0 flex-col">` inside it also has `flex-grow: 0` and no `h-full`.
  - The same applies to `<ptah-dashboard-stat>` (`host: { class: 'block min-w-0' }`) and `<ptah-dashboard-chart>` (no host flex/height class) inside `<ptah-surface-node>`: their inner `<section class="... h-full ...">` cannot grow to fill the stretched grid/row cell.
- **Suggested fix**:
  Give `<ptah-surface-node>` `flex-1` (or `class="flex flex-1 min-w-0 flex-col"` when not `inlineKind()`), and give `<ptah-surface-layout>`, `<ptah-dashboard-stat>`, and `<ptah-dashboard-chart>` `flex-1` (e.g., on their host or on the element tags in `surface-node.component.ts:127,142,183`) so height propagates continuously from the grid/row cell to the card/chart/stat surface.

### 5. [Medium] Negative bar value labels overlap x-axis category labels at `minY`
- **Location**: `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:118,144` (with `libs/frontend/declarative-dashboard/src/lib/charts/chart-geometry.ts:62`)
- **Evidence**:
  In `chart-geometry.ts:62`, `y(minY)` maps to `220`, so any bar at `minY < 0` has `barY + barHeight = 220`.
  In `dashboard-chart.component.ts:144`, negative bar value labels render at `y = point.barY + point.barHeight + 17 = 237` (`font-size="15"`, spanning `y = 222..237`).
  At line 118, category labels render at `y = 242` (`font-size="15"`, spanning `y = 227..242`) at the exact same horizontal center `x`. The two labels directly overlap by 10 SVG units.
- **Suggested fix**:
  Reserve bottom plot space when `minY < 0` (e.g., reduce plot height or push category labels down when negative values are present) so the negative value label clears the category label.

### 6. [Low] `DashboardStatComponent.collapse()` still intercepts Escape when `hasDetails()` is false
- **Location**: `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:131-136`
- **Evidence**:
  `collapse(event)` checks only `if (!this.viewState().expanded) return;`. If stale `viewState` carries `expanded: true` for a stat whose `description`/`children` were removed, `[hidden]="!hasDetails() || !viewState().expanded"` keeps the details hidden and no expand button exists, yet pressing Escape inside the stat still calls `event.stopPropagation()` (preventing an enclosing accordion/section from collapsing).
- **Suggested fix**:
  Guard with `if (!this.hasDetails() || !this.viewState().expanded) return;`.

## Checklist & Consumer Impact

- **Other `declarative-dashboard` consumers**:
  - `AppsSurfacePanelComponent` (`libs/frontend/mcp-apps-page/src/lib/components/apps-surface-panel.component.ts:231`, `layoutWidth="viewport"`): affected by Findings 2, 3, 4, 5. `apps-page.component.spec.ts:669` (`ptah-dashboard-chart button[aria-expanded]`) remains compatible.
  - `DisplayPanelComponent` (`libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:285`, `layoutWidth="container"`): affected by Findings 2, 3, 4, 5; its 4 specs pass.
  - `PtahUiBlockComponent` (`libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-block.component.ts:212`, `layoutWidth="container"`): affected by Findings 2, 3, 4, 5.
- **Earlier `code-logic-review.md` layout finding (`INLINE_SURFACE_KINDS`)**:
  - Confirmed partially fixed: `badge`, `avatar`, `radial-progress`, and `checkbox` now get `.dp-row-item-inline` (`surface-layout.component.ts:201`) and `items-start` on `ptah-surface-node` (`surface-node.component.ts:115`). However, vertical `divider` was missed (Finding 3) and `.dp-row-item` clobbers `.dp-stat-group` (Finding 2).
- **Ordinary markdown prose scoping**:
  - Verified clean: `execution-node.component.ts:194` removes `prose` from the `ptah-ui` wrapper and applies `prose prose-sm prose-invert max-w-none block` to its `@placeholder` and `@error` `<markdown>` branches (`lines 208, 214`); `ptah-ui-message-text.component.ts:68` applies it to `markdown` parts only; `ptah-ui-block.component.ts:207,229` sets `not-prose` on rendered blocks and `prose ...` on fallback `<markdown>`. Non-`ptah-ui` branches (`execution-node.component.ts:222,244`) are unchanged.
- **Angular templates, accessibility, themes, Nx boundaries**:
  - Standalone components, OnPush, signal inputs/computed, modern `@if`/`@for`/`@switch`, zero inline `[style]` or `style="..."` attributes added.
  - Progress bar exposes `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`, `aria-label`; chart icon buttons expose `aria-pressed` (via `PtahIconButtonDirective` `[selected]`) and `aria-expanded` / `aria-controls`; SVG category and value labels have `aria-hidden="true"`.
  - Theme tokens (`text-base-content`, `text-base-content-muted`, `fill-primary`, `stroke-primary`, `progress-*`, `bg-base-200`, `border-base-300`) are DaisyUI semantic tokens compatible with both `anubis` and `anubis-light`.
  - Nx boundaries are preserved across `declarative-dashboard`, `chat-ui`, and `chat`.

## Five Logic Questions

1. **Silent failure**: `.dp-row-item` overrides `.dp-stat-group`'s `display: grid` silently in CSS without any test failure (Finding 2); intermediate host elements silently prevent equal-height stretching (Finding 4).
2. **Unexpected user action**: Pressing Escape inside a detail-less stat with stale `expanded: true` viewState swallows Escape (Finding 6).
3. **Wrong answer from input**: A bar chart with negative values draws the value label on top of the x-axis category label at `minY` (Finding 5); a horizontal stack with a vertical divider stretches the divider to `>= 14rem` (Finding 3).
4. **Dependency failure**: `ptah-ui-block` fallback and `execution-node` `@placeholder`/`@error` branches preserve `prose` on fallback markdown and fail safely.
5. **Missing**: Full `declarative-dashboard` Jest suite was not updated/run (`trust-boundary.spec.ts` and `budget-render.spec.ts` fail, Finding 1); no visual/browser verification of `.dp-stat-group.dp-row-item` or equal-height cards was done.
