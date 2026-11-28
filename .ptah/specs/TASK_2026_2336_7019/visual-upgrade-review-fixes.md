# Visual upgrade review fixes

1. **Focus regression**. `libs/frontend/mcp-apps-page/src/lib/components/apps-surface-panel.component.spec.ts` focuses the table’s always-present sort button and verifies that the same button retains focus after another surface updates.
2. **Catalog validation**. `libs/shared/src/mcp-apps-contracts/surface-validator.spec.ts` uses `documentOf` for every invalid catalog/4 case, matching the existing positive assertions for valid leaderboard and meter documents.
3. **Live filters**. `dashboard-table.component.ts` and `dashboard-list.component.ts` keep an active filter visible when the collection shrinks to 10 entries or fewer. Their specs verify that the input survives the update and can still clear the filter.
4. **Shared bounds**. `libs/shared/src/mcp-apps-contracts/surface.index.ts` exports the three leaderboard and meter bounds. `libs/frontend/declarative-dashboard/src/lib/view-model/surface-card-fields.ts` imports them from the public surface entry point.
5. **Numeric columns**. `dashboard-table.component.ts` skips whitespace-only cells and requires valid thousands grouping, at most one sign, and no leading zeros on multi-digit numbers. Its spec covers currency, units, grouping, whitespace and malformed values. Correctly grouped values such as `101,102` remain numeric.
6. **Blank titles**. The table, list, leaderboard and meter component files trim titles before deriving accessible names and headings. Leaderboard groups also omit their list label when the title is blank. Their specs cover fallback labels and missing headings.
7. **Card values**. `dashboard-leaderboard.component.ts` uses the clamped share for both bar width and default value. `dashboard-meter.component.ts` sanitizes non-finite and negative amounts before calculating widths and choosing default values. Both component specs cover direct invalid inputs.
8. **Markup and hygiene**. `dashboard-table.component.ts` drops the duplicate caption. `libs/frontend/declarative-dashboard/src/lib/trust-boundary.spec.ts` verifies literal rendering of untrusted card fields, no URL or HTML bindings, and only numeric percentage widths. `libs/shared/src/mcp-apps-contracts/surface-text-fallback.spec.ts` covers group rank resets, details, and meter values. The list component and the list and table specs use LF. The UI class audit’s `--update-baseline` removed the stale table entry in `tools/ui-class-audit/baseline.json`. I restored the updater’s unrelated baseline changes to keep the diff scoped.

## Focused verification

- Shared Jest passed 511 tests across 8 specs.
- Declarative dashboard Jest passed 185 tests across 10 specs.
- MCP Apps Jest passed all 17 tests in `apps-surface-panel.component.spec.ts`.
- Chat UI Jest passed all 38 tests in `ptah-ui-block.component.spec.ts`.
- ESLint on changed TypeScript files passed with 0 errors and 47 existing warnings about non-null assertions and schema file length.
- `npx tsc --noEmit --project libs/frontend/declarative-dashboard/tsconfig.lib.json` passed.
- The UI class audit passed in update mode and again with the final baseline. Both rule sets reported zero counts over baseline.
- `git diff --check` passed.

The Electron visual review and Angular template typecheck were outside the allowed checks for this task.
