# Frontend Fix Report — PR #1532 (`feat/command-output-cards`)

Status: Complete — all 6 findings from `code-review-frontend-antigravity.md` fixed and verified.

## Findings Addressed

### 1. [Blocking] Update `trust-boundary.spec.ts` and `budget-render.spec.ts`
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:29-32`: updated `series` fixture to 2 series (`[{ name: markup, points: [{ x: markup, y: 1 }, { x: 'b', y: 2 }] }, { name: markup, points: [{ x: 'b', y: 3 }] }]`) so both line and bar charts render their `ul[aria-label="Series"]` legends and keep the legend trust boundary covered.
  - `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:165-175`: updated chart description selector to `ptah-dashboard-chart h3 + p`, asserted all 4 legend `li` items equal literal `markup`, asserted both axis labels (`xLabel`, `yLabel`) render literally as SVG `<text>`, and explicitly asserted `[data-testid="chart-category"]` renders a truncated literal prefix of `markup` ending with `…` plus full literal `markup` inside `<svg:title>`.
  - `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts:196`: updated table-view `tbody th` assertion from 2 to 3 rows to match the 2-series fixture (keeping `tbody td` literal `markup` count at 1 and full `expectInert(element)` coverage).
  - `libs/frontend/declarative-dashboard/src/lib/budget-render.spec.ts:218-223,379,398`: replaced `[data-apps-focus-key$=":expand"]` counts with `ptah-dashboard-stat [data-testid="stat-value"]` for `maxComponents = 200`, `maxChildrenPerNode = 50`, and `maxGridColumns = 4` so the budget checks verify every rendered stat tile regardless of whether it carries expandable details.
- **Covering specs**:
  - `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts` (`v1: every display text field`, `v1: chart series names in the table view`)
  - `libs/frontend/declarative-dashboard/src/lib/budget-render.spec.ts` (`maxComponents = 200`, `maxChildrenPerNode = 50`, `maxGridColumns = 4`)

### 2. [High] Keep `display: grid` on `.dp-stat-group` when also `.dp-row-item`
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:106`: added higher-specificity rule `.dp-stat-group.dp-row-item { display: grid; }` to `SURFACE_FLOW_STYLES` after `.dp-row-item` so a stat group inside a horizontal stack retains `display: grid` while inheriting `.dp-row-item`'s `flex: 1 1 14rem; min-width: min(100%, 14rem)` row-sharing and wrapping behavior.
- **Covering spec**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.spec.ts:181-193` (`keeps display:grid on a stat group when it is also a horizontal row item`)

### 3. [High] Non-growing, full-height vertical `divider` in horizontal stacks
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:105,203,382-385`: added `.dp-row-item-divider { flex: 0 0 auto; align-self: stretch; display: flex; flex-direction: column; }` to `SURFACE_FLOW_STYLES` and added `rowItemClass(child)` so vertical dividers (`child.kind === 'divider' && child.direction === 'vertical'`) receive `dp-row-item-divider` instead of `dp-row-item` (while horizontal dividers remain `dp-row-item` and inline kinds remain `dp-row-item-inline`).
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.ts:115,232`: propagated `flex-1` on `ptah-surface-node` (when `!inlineKind()`) and bound `[class.flex-1]="divider.direction === 'vertical'"` on `<ptah-dashboard-divider>` so the vertical divider stretches vertically through the column-flex `ptah-surface-node` host across the full row height.
- **Covering specs**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.spec.ts:195-210` (`gives a vertical divider in a horizontal stack a non-growing full-height wrapper`)
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.spec.ts:186-212` (`propagates equal-height flex-1 on non-inline hosts and vertical dividers, keeping inline kinds intrinsic`)

### 4. [Medium] Equal-height propagation through intermediate Angular hosts
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.ts:115`: added `'[class.flex-1]': '!inlineKind()'` to `SurfaceNodeComponent` host so non-inline children fill stretched row/grid wrappers while inline kinds (`badge`, `avatar`, `radial-progress`, `checkbox`) stay intrinsic-sized with `items-start`.
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:184`: added `flex-1` to `SurfaceLayoutComponent` host (`flex min-w-0 flex-1 flex-col`).
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:52,56`: updated `DashboardStatComponent` host to `flex min-w-0 flex-1 flex-col` and added `flex-1` on its inner `<section>`.
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:24,26`: added `host: { class: 'flex min-w-0 flex-1 flex-col' }` to `DashboardChartComponent` and added `flex-1` on its inner `<section>`.
- **Covering specs**:
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.spec.ts:212-219` (`does not regroup grid children, and stretches a card to its row height`)
  - `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.spec.ts:186-212` (`propagates equal-height flex-1 on non-inline hosts and vertical dividers, keeping inline kinds intrinsic`)

### 5. [Medium] Prevent negative bar value labels from overlapping category labels
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:95,119,123-124,126,202-206`: added computed signals `hasNegativeValueLabels`, `svgViewBox`, `categoryLabelY`, and `xLabelY`. When a bar chart shows value labels and `geometry().minY < 0`, `svgViewBox` expands from `0 0 600 280` to `0 0 600 300`, `categoryLabelY` shifts from `242` to `262`, and `xLabelY` shifts from `270` to `290`, leaving 10+ SVG units of whitespace between the lowest negative value label (`y = 237`, font-size 15) and the category label (`y = 262`, font-size 15).
- **Covering spec**:
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.spec.ts:142-162` (`writes compact value labels above positive and below negative bars without overlapping category labels`)

### 6. [Low] Guard `DashboardStatComponent.collapse()` with `hasDetails()`
- **Changes**:
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:132`: changed guard from `if (!this.viewState().expanded) return;` to `if (!this.hasDetails() || !this.viewState().expanded) return;` so Escape is never intercepted when a detail-less stat carries stale `expanded: true` state.
- **Covering spec**:
  - `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.spec.ts:63-82` (`does not intercept Escape when hasDetails is false even with stale expanded viewState`)

## Decisions

- **`.dp-stat-group.dp-row-item` specificity rule over reordering**: keeping `.dp-stat-group` before `.dp-row-item` preserves `.dp-row-item`'s `min-width: min(100%, 14rem)` wrapping floor on horizontal stat groups, while the `(0, 2, 0)` selector `.dp-stat-group.dp-row-item { display: grid; }` overrides only `display` back to `grid` without breaking existing style-string assertions.
- **`[class.flex-1]` on `<ptah-dashboard-divider>` inside `SurfaceNodeComponent` instead of `DashboardDividerComponent` host**: `SurfaceNodeComponent` is always `flex-col`, where `flex-1` stretches vertically; leaving `flex-1` off `DashboardDividerComponent`'s own host prevents a standalone vertical divider placed directly in a horizontal flex container from growing horizontally, and keeps `dashboard-divider.component.spec.ts` unchanged.
- **Shifting chart axis labels + expanding `viewBox` (`0 0 600 300`) instead of shrinking `chart-geometry.ts` plot height**: preserves the 180-unit integer plot geometry (`40..220`) and all `chart-geometry.spec.ts` tick coordinates, leaves positive-only bar charts and all line charts at `0 0 600 280`, and only adds the 20-unit bottom clearance when negative bar value labels are actually rendered.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Full `declarative-dashboard` Jest suite | `node_modules/.bin/jest --config libs/frontend/declarative-dashboard/jest.config.ts --runInBand --coverage=false` | **PASS** — 25/25 suites passed, 327/327 tests passed, 0 failed (87.35 s) |
| TypeScript library check | `node_modules/.bin/tsc --noEmit --project libs/frontend/declarative-dashboard/tsconfig.lib.json` | **PASS** — 0 errors (exit 0) |
| ESLint on all 10 changed files | `node_modules/.bin/eslint libs/frontend/declarative-dashboard/src/lib/components/{surface-layout,surface-node,dashboard-stat,dashboard-chart}.component.ts libs/frontend/declarative-dashboard/src/lib/{trust-boundary,budget-render}.spec.ts libs/frontend/declarative-dashboard/src/lib/components/{surface-layout,surface-node,dashboard-stat,dashboard-chart}.component.spec.ts` | **PASS** — 0 errors (exit 0); 0 warnings on all 4 production source files and `budget-render.spec.ts`; 67 `@typescript-eslint/no-non-null-assertion` warnings in the 5 spec files; `@nx/enforce-module-boundaries` skipped without a cached ProjectGraph outside `nx` |

## Not Done / Notes

- **Angular template typechecking (`typecheck-templates` / `ngc`) and live Electron visual screenshot verification**: not run because `nx`, `build`, `serve`, and `e2e` were excluded from this lane's verification scope; jsdom specs verify class names, CSS rules, SVG attributes, and DOM structure rather than live browser layout.
- **Skills availability**: `ui-ux-designer` and `angular-frontend-patterns` are not present in this CLI's available skills list; existing codebase Angular standalone/signal/OnPush patterns and DaisyUI tokens were followed directly.
- **Write scope**: edits were confined strictly to 10 files under `libs/frontend/declarative-dashboard/src/lib/**` plus this deliverable. No git state-changing commands were executed.
