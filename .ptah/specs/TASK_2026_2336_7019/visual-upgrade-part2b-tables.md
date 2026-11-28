# Visual upgrade part 2b: tables and lists

Scope: `libs/frontend/declarative-dashboard` table, list and a shared filter input. I did not touch leaderboard, meter, icon map,
surface-node, surface-layout or renderer registration (that work belongs to the codex lane).

## Files

- CREATED `libs/frontend/declarative-dashboard/src/lib/components/dashboard-collection-filter.component.ts`: a compact search
  input. It has a lucide `Search` icon (aria-hidden) and a placeholder. Its accessible name is `aria-label="Filter {name}"`,
  with no visible label. It keeps the input id and focus key, and it emits `valueChange`.
- MODIFIED `.../components/dashboard-table.component.ts`
  - The section, the `ptah-table` and the expand button are named by `accessibleName` (title, or 'Table' when there is none).
    The visible `ptah-section-header` (h3) and the sr-only caption render only when a title exists.
  - The filter and expand controls render only above 10 rows. The `max-h-96` clamp applies only when the table is
    collapsible and not expanded.
  - The result count (`p[role=status]`) shows only while a filter is active or when there is more than one page. The
    pager shows only when there is more than one page.
  - The grid is wrapped in `<ptah-table size="xs" density="compact">`. The scroll div has `data-testid="table-viewport"`.
  - Numeric heuristic: a column is numeric when it has at least one non-empty cell and every non-empty cell is a finite
    number or matches `5.2k`, `45%`, `$1.20` or `-3 ms`. Such a column is right-aligned with `tabular-nums`, and its body
    cells are `font-semibold`. An explicit `align` (including `left`) wins.
  - `[class]="alignClass()"` became the per-class bindings `[class.text-right]`, `[class.text-center]`,
    `[class.tabular-nums]` and `[class.font-semibold]`. The Escape handler tolerates a missing expand button.
- MODIFIED `.../components/dashboard-list.component.ts`: the same rules (accessible name 'List', the header only with a title,
  filter and expand above 10 items, the count and pager rules). The toolbar now sits above the scroll area.
- MODIFIED `.../components/dashboard-table.component.spec.ts`: the viewport is found by its testid. The unique-id test uses
  30 rows and checks the aria-label and placeholder, with no label. New tests: a small untitled table has no h3, no
  filter, no expand, no count and no pager, and it has aria-label 'Table'. The numeric detection test covers `5.2k`,
  `%`, `$`, a mixed column and an explicit left align.
- MODIFIED `.../components/dashboard-list.component.spec.ts`: the filter, expand and unique-id tests use 12 items. After
  filtering, the test checks that the pager is absent (instead of 'Page 1 of 1'). The malformed-title test checks that
  there is no h3 and that the section aria-label is 'List'. New test: a short list has no controls, no count and no pager.

## Decisions

- `PtahNumericCellDirective` is not used. Its host class is static, so it cannot depend on the column. I applied the same
  classes (`text-right tabular-nums`) with per-class bindings, which is what the ui-class-audit asks for. This is
  reversible.
- `ptah-section-header` receives only the heading. The description stays a direct `section > p`, and the titled table keeps
  its sr-only `<caption>`, because `trust-boundary.spec.ts` (lines 156-162) selects `section > p` and `caption`.

## Checks (focused, from the worktree)

- `npx jest --config libs/frontend/declarative-dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  on the table spec, the list spec, `src/lib/budget-render.spec.ts` and `src/lib/trust-boundary.spec.ts`:
  **4 suites passed, 69 tests passed**.
- `npx eslint` on the 3 components and the 2 specs: **0 errors**. There are 13 warnings, all
  `no-non-null-assertion` in the specs, the same pattern as the existing specs.
- `npx tsc --noEmit --project libs/frontend/declarative-dashboard/tsconfig.lib.json`: **exit 0**.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: **exit 0**, with 0 tokens over the baseline.
  `dashboard-table.component.ts` now has 0 tokens. The tool says "baseline had entries; run --update-baseline to prune".
- Not run: `typecheck-templates` (`ngc`), nx targets and build. These are out of the lane rules and are left for the coordinator or CI.

## Out of scope / for the coordinator

- Prune `tools/ui-class-audit/baseline.json` (the `<dynamic>` entry for dashboard-table) with `--update-baseline`. That file is
  outside this batch.
