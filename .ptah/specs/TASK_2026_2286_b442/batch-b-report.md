# Batch B report — usage dashboard layout and tables (TASK_2026_2286_b442)

Base path: `libs/frontend/dashboard/src/lib/components/usage-dashboard/` in the worktree
`/home/amun/ptah-extension/.claude-worktrees/fix-antigravity-usage-analytics-layout-a463f5158f08`.

## Changed files

| File | State | By |
| --- | --- | --- |
| `usage-formatting.ts` | modified: `formatTableUsd`, `formatCostCell`, `formatShare`, `formatTokenCount`, `formatRelativeAge`, `barWidthPercent` | predecessor |
| `usage-table-rows.ts` | new: pure `buildModelTableRows`, `buildDayTableRows`, `buildSessionTableRows` | predecessor |
| `usage-breakdown-table.component.ts` | modified: `section ptahSurface`, compact `ptah-table`, `th scope`, share bar, stacked day cost bar, new optional `days` / `providerSeries` inputs | predecessor |
| `usage-top-sessions.component.ts` | modified: `section ptahSurface` + section header, rank / session / model / cost bar / tokens / last-active columns | predecessor |
| `usage-cost-quality.component.ts` | modified: surface section, 2 columns, 4 columns at `@container (min-width: 640px)` | predecessor |
| `usage-dashboard.component.html` | modified: quality moved to its own `usage-quality-row`, right chart column on `ptahSurface`, breakdown gets `days` / `providerSeries` | predecessor |
| `usage-dashboard.component.ts` | modified: table row splits `1fr 1fr` only at `@container (min-width: 1440px)` | predecessor |
| `usage-formatting.spec.ts` | new | predecessor |
| `usage-table-rows.spec.ts` | new | predecessor |
| `usage-dashboard.component.spec.ts` | modified | this batch |

## Work done in this batch

The predecessor ran no checks. This batch did the "Not done" items from its handoff:

1. `usage-dashboard.component.spec.ts`:
   - In "renders the folded summary": `usage-cost-quality` is inside `usage-quality-row` and not inside
     `usage-chart-row`. It follows the donut and comes before the breakdown. `usage-breakdown` and
     `usage-top-sessions` both carry `data-ptah-surface`. The handoff named the testid `usage-quality`.
     The component's real testid is `usage-cost-quality`, so the spec uses that.
   - In "renders session counts ... top sessions table": the header texts are
     `['#Rank','Session','Model','Cost','Tokens','Last active']` and every header has `scope="col"`.
     There are 2 `usage-session-row` rows, and the first cell of the first row is `1`. The
     last-active cell (`title` = ISO) matches `/ago$|^Just now$/`. Both cost bars are
     `aria-hidden="true"`, and their inner widths are `100%` (top session) and `0%` (unknown cost).
   - No existing assertion broke: `clickButton('Model')` and `th[title]` in the breakdown still resolve
     as before, and every test passed unchanged. No assertion was weakened.
   - The new code uses an explicit guard (`if (!quality) throw`) instead of `!`, so the spec adds no
     new `no-non-null-assertion` warning.
2. The focused checks found no defects in the predecessor's source files, so no source file changed.

## Check results

Logs are in the worktree under `.ptah/tmp/`.

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath` usage-formatting, usage-table-rows, usage-dashboard.component, usage-summary.view-model specs (`batch-b-jest.log`) | 4 suites passed, 76 tests passed |
| `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json` (`batch-b-tsc-lib.log`) | exit 0 |
| `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.spec.json` (`batch-b-tsc-spec.log`) | exit 2: 8 errors, none in a changed file. They are in `skill-selection-card.spec.ts:378` and the BigInt literals in `libs/shared` (`capability-id-codec.ts`, `attention-identity.ts`). None of those files is modified in this worktree, so the errors already exist and are not caused by this batch. |
| `npx eslint` on the 9 changed or new source/spec files (`batch-b-eslint.log`) | 0 errors. 4 `no-non-null-assertion` warnings in `usage-formatting.ts` (lines 193, 194, 196, 232), all in code this task did not change. |
| `npx eslint usage-dashboard.component.spec.ts` (`batch-b-eslint-spec.log`) | 0 errors. 13 warnings, all in existing code. |
| `@nx/enforce-module-boundaries` | skipped by eslint ("No cached ProjectGraph"). The coordinator's `npm run verify -t lint` covers it. |
| `typecheck-templates` (ngc) | not run (lanes may not run nx). The coordinator must run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. |

## Open risks

- Angular templates are not compiled by `tsc`. Jest renders them under JIT, but the strict template
  typecheck (`typecheck-templates`) is still pending for the coordinator.
- The `ptahSurface` wrap on the right chart column was not requested. It fixes the same bare-background
  problem as the tables. The upcoming design spec may undo it.
- The day cost bars use summed `costValues`, so unpriced facts add 0. This matches the daily chart, but
  a day that is mostly unpriced shows a short bar.
- `formatRelativeAge` depends on `generatedAt`. The spec asserts a pattern, not an exact string.
- No screenshot or visual check was taken (the Electron visual review belongs to a later step). The
  1440px table split and the 640px quality split are not visually verified.
- Module-boundary lint was not checked locally (see above).
