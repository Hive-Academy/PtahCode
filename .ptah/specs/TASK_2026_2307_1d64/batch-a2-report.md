# Batch A2 report (items 2 and 9)

## Changes
- Item 2
  - `libs/frontend/ui/src/lib/patterns/table/table-cells.ts`: the secondary text now sits in `.ptah-table-row-title-secondary-line`, an inline-flex, centred row with a small gap. It holds the secondary span and a new `<ng-content select="[ptahRowSecondary]">` slot. `ptahRowInfo` is unchanged.
  - `lane-row-identity.component.ts`: the kind badge is projected with `ptahRowSecondary`. The `@container (max-width: 13rem)` hack is removed, along with the collapsed `position: static; flex-basis: 100%; order: 1` badge rule. Added a `.ptah-table-row-title-secondary-line` rule (max-width, min-height).
  - `lanes-table.component.css`: removed the two rules that ordered or gridded the badge inside the primary line (the model-column `flex-basis/order` rule and the `grid-row: 2` kind rule). The below-640px hide rule (P-18) is kept; it matches `.ptah-table-row-title-kind` wherever it sits.
- Item 9
  - `cli-capability-detail.component.ts`: `:host dl { grid-template-columns: minmax(0, 1fr); }`. With emulated encapsulation this is `[_nghost] dl[_ngcontent]`, specificity (0,2,1). The shared `.ptah-table-detail-cell dl` is (0,1,1), so the component rule wins. `PtahDetailCellDirective` adds `ptah-table-detail-cell` (table-detail.ts:104). `table.component.ts` was not edited.
- Tests
  - `table-cells.spec.ts`: new slot assertions.
  - `lane-row-identity.component.spec.ts`: badge-on-line-2 test, a no-version test and a no-hack test.
  - `lanes-table.visual.component.spec.ts`: badge is now asserted in the secondary line.
  - `lanes-table-detail.component.spec.ts`: capability `dl` rule test (reads source, because Jest strips component styles).

## Decisions
- The "Ptah CLI" badge moves to line 2 too, because it uses the same element and slot. The request only named the CLI agent badge.
- The slot is inside `@if (secondary())`, so it renders only when there is a secondary line. The lane identity always has one (`--` fallback).
- The status-icon (narrowest) variant still shows its icon on line 1 (`ptahRowInfo`) and has no badge.
- Not visually verified in a browser (browser and Electron runs were not permitted in this batch).

## Checks
Run one at a time (the machine was under heavy load, so runs were slow):
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` on lane-row-identity, lanes-table-detail and lanes-table.visual specs: the last full run had 1 failed and 68 passed. The failure was the visual spec asserting a `kind { width: max-content; flex: none }` rule. I re-added that rule to `lanes-table.component.css` and reran the visual spec alone: 28 of 28 passed. The identity and detail specs passed in the earlier full run, and that run had the final test code, so I did not rerun them.
- `npx jest --config libs/frontend/ui/jest.config.ts ...` on table-cells.spec and table-detail.spec: 4 of 4 passed.
- `npx eslint <changed ts files>`: 0 errors, 8 warnings (non-null assertions in lanes-table-detail.component.spec.ts). Some of those are in pre-existing code; this batch's new test adds one at line 273.

## Extra reads
- `table-detail.ts:100-110` (confirm the detail-cell class) and `table.component.ts:80-100` (shared rule), both for verification only.

## Not done
- `lanes-table.component.css` keeps a small `kind { width: max-content; flex: none }` rule in the compact block because an existing visual spec contracts it.
- No render or screenshot check.
