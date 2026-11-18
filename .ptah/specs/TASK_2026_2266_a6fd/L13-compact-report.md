# L13 compact lanes report

Implemented all four compact-tier defects. No commits, pushes, stashes or reverts were performed.

## Causes and fixes

Paths below are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`.

| Defect | Cause | Fix |
| --- | --- | --- |
| Name/chip/model overlap | The collapsed identity absolutely positioned the kind chip at the bottom of a fixed-height title, while centering the name. The small-container rule also absolutely positioned the chip. | `lane-row-identity.component.ts:83`: keep the collapsed chip in normal grid flow on row 2, place icon/name/warning on row 1, and let the title grow. Restrict the legacy small-container absolute positioning to noncollapsed identities. The model remains the following sibling, with spacing at `lanes-table.component.css:323`. |
| Names broken inside words | The collapsed name used `overflow-wrap: anywhere`; Order and Status reserved 48 and 128 px respectively, leaving too little Lane width in a 358 px table. | `lane-row-identity.component.ts:118`: normal word wrapping, visible overflow, no ellipsis. `lanes-table.component.css:275`: compact Order is 40 px and Status is 116 px, reclaiming 20 px for Lane. Names such as Antigravity remain whole; Synthetic Lane can wrap at the space. Recovery actions flow below the status, while the kebab remains absolutely anchored to the same cell edge (`:301`). Status text wraps at spaces with no clipping (`:290`), preserving the full Needs API key label. The menu's 24 px width also sets its minimum width (`:210`), avoiding a conflicting shared square-button minimum. |
| Model text cut | Row model wrappers and buttons inherited nowrap, overflow hidden and ellipsis rules intended for wide cells. | `lanes-table.component.css:323`: compact identity-cell model values wrap, allow visible overflow and automatic height, and keep popovers within the available width. The full Provider default label is readable. Existing model/effort popover markup, labels and click behavior are preserved. |
| Detail stacked at 1168 | Container queries switched to one column below 785 px, so a 730 px detail incorrectly used the narrow layout. | `lanes-table-detail.component.css:84`: use facts left / actions right, then full-width chips, from 600 through 1400 px of actual detail width. Below 600 px remains stacked; above 1400 px retains facts/chips/actions columns. All five chips remain on one row at the wide tier. |

## Changed product and test files

- `lane-row-identity.component.ts`
- `lanes-table.component.css`
- `lanes-table-detail.component.css`
- `lanes-table.visual.component.spec.ts:386`: added compact structure assertions for complete Antigravity, OpenCode and Synthetic Lane names, kind in the identity, absent compact subtitle, and a separate following model line including Provider default.
- `lanes-table-detail.component.spec.ts:119`: added assertions that facts, chips and actions occupy independent direct grid slots.

Existing assertions remain intact. The new Provider default test explicitly uses the loaded empty model value; null means not loaded and correctly displays a dash. Jest does not prove browser geometry; that was checked separately below.

## Validation

All required focused checks passed:

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` with `lanes-table.component.spec.ts`, `lanes-table.visual.component.spec.ts`, and `lanes-table-detail.component.spec.ts`: **3 suites, 59 tests passed**. Identity coverage lives in the visual spec; there is no separate identity spec in this directory.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0.
- `npx eslint` for the three changed TypeScript files: exit 0.
- `npx prettier --write` for all five changed source/test files: passed; final CSS formatting also passed after the status adjustment.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0, **0 token counts over baseline**, including raw spacing. Baseline unchanged.
- `git diff --check`: passed.

No Playwright, npm run verify, nx, build, serve or e2e commands were run.

## Visual evidence and limits

Inspected all six requested iter10 Electron references, including both compact themes, system/instance detail, and the 1824 wide reference. Checked the requested line separation, whole names, complete model text, status/recovery/menu placement and detail row arrangement against those images.

Rendered the in-workspace `L13-layout-evidence.html` using `ptah_browser_navigate` on its file URL, and inspected `ptah_browser_screenshot` output. The fixture reuses the earlier captured component DOM and shared CSS, with current component styles and representative compact model/status markup. Removed a fixture-only question-mark pseudo glyph that was not product markup. Query parameter `?width=738` gives a 730 px detail; `?width=1418` gives a 1410 px detail; default table width is 358 px.

Measured:

- At table width 358 px, Antigravity name bottom / chip top = 80 / 84 px, chip bottom / model top = 100 / 104 px. Synthetic Lane wraps at its space: 240 / 244 px and 260 / 264 px respectively. All measured compact models have no horizontal overflow.
- Installed and Needs API key remain fully visible; the longest status wraps at a space. Its text right edge is 262 px and the kebab box starts at 266 px. Each row's kebab has the same x coordinate, including the row with Sign in below its status.
- Detail width 350 px: stacked facts/chips/actions. Width 730 px: `facts actions`, then `chips chips`. Width 1410 px: `facts chips actions`, with all five chip top coordinates equal (304 px).

Screenshots: `screens/L13-compact-358.png`, `screens/L13-detail-730.png`, `screens/L13-detail-wide.png`.

These are static layout fixtures, not fresh Electron application captures. No integrated Electron/e2e execution was performed, as required by the brief. L12 model reachability remains covered by the passing compact-row click assertion; its IDs, data-testid values and aria-labels are unchanged. Policy-bar and connection-card code, their 48/80 px bounds, and all e2e specs were untouched. Their integrated CI outcome was not re-run here.

## Tooling

Read the local ui-ux-designer and angular-frontend-patterns SKILL.md guidance. CLI skill loading was unavailable; skill discovery was checked and repository files were used directly. Ptah workspace and file search tools were used. Dependency graph results were incomplete for these files, so native rg usages supplied the fallback impact check. The explicit chat tsc command provided the compiler check.

No unmet implementation requirement remains. Fresh Electron screenshots and integrated CI confirmation remain outside the authorized checks for this lane.
