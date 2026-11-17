# TASK_2026_2258_efbe — ptah-table column priority and a wide detail row

PR C of the settings fix program (epic TASK_2026_1177_9109). PR D adopts this API in the
Lanes table. Scope: `libs/frontend/ui/src/lib/patterns/table/**` only. No edit of
`libs/frontend/chat`, `ptah-tokens.css` or settings-layout.

## Design

- `table-columns.ts`: `PtahTableColumn { id; priority?; minWidth? }`,
  `PTAH_TABLE_COLUMN_MIN_WIDTH = 96`, pure `resolveHiddenColumns(columns, width,
  { collapseBelow, guardExtra })`, `columnHideOrder`, directive `th|td[ptahColumn]`.
  A column without a priority never hides. The highest priority number hides first; a tie
  hides the later column first. Columns hide until the sum of visible `minWidth` fits.
- `PtahTableComponent`: new inputs `columns` (default `[]` = legacy mode, unchanged) and
  `wideDetail` (boolean attribute). New signals `columnsMode`, `hiddenColumns`,
  `visibleColumnCount`, `detailEnabled`, `narrow`, `overflowFallback`; method
  `isColumnHidden(id)`. `collapsed` keeps its legacy meaning.
- Reflow + guard (columns mode only): the wrapper drops `overflow-x-auto`, cells wrap
  (`overflow-wrap: break-word`). After each render that follows a size change, the guard
  compares `grid.offsetWidth` with `wrapper.clientWidth`. On overflow it hides one more
  optional column. With no optional column left it sets `overflowFallback` and adds
  `overflow-x-auto` (`data-overflow="scroll"`). The extra hidden columns reset only when the
  host grows by more than 32 px (hysteresis against a scrollbar loop).
- Expander and `tr[ptahDetailRow]` show when `detailEnabled()` = collapsed, or a column
  hidden, or `wideDetail`. Legacy: identical to `collapsed()`.
- `table-detail-layout.ts`: `ptah-table-detail-layout` with slots `[ptahDetailFacts]`,
  `[ptahDetailChips]`, default, `[ptahDetailActions]`. `mode` auto|list|wide. Auto = list
  when `narrow()`. List: `7rem 1fr` facts grid. Wide: facts 2 columns (3 at 48rem container
  width), chips below, actions on the right.

## Deferred

- Default density of about 52 px (design spec 6.1). It changes present consumers, so it is
  not in this PR.
- No design-preview or docs page for ptah-table exists. Evidence is spec based.
