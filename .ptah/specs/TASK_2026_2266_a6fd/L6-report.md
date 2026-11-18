# L6 report ? Round 7 remaining visual defects

Implemented the three requested corrections. Fresh Electron screenshot acceptance remains outstanding.

## Causes and fixes

1. **Install guide overlaps Status.** Traced the real template through the conditional five-column colgroup, `[collapseBelow]="950"`, `table.collapsed()`, the projected row-title primary/secondary spans, and the status component. The collapsed identity path is active; the guide remained absolutely positioned, and the narrow container rule also targeted it with a 5rem margin. Status contains no recovery link. The identity now uses a normal flex column for an uninstalled collapsed lane: title first, static in-flow guide second, replacing the kind/empty secondary line. Removed the guide from both secondary-line margin selectors. Its sizing override accounts for the shared button family's specificity. Wide Actions rendering is unchanged.
   - File: `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts`.

2. **Names truncate in the embedded collapsed table.** Fixed column allocation consumed too much of the table's container width. Order is now 2.25rem, Enabled 3rem, collapsed expander 2rem; Status retains 7rem. Collapsed cells have 0.25rem inline padding, with tighter Order header padding and an 11px Enabled heading so these labels fit. Identity receives the remaining space; version/provider secondary text may ellipsize. Wide column proportions are unchanged.
   - File: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`.

3. **Detail values differ in size and Model is indented.** The reused model template and unavailable fallback carry small-text classes; system fallbacks also nest them inside another small-text wrapper. The compact button rule supplies an 11px font and 4px inline padding, overriding the earlier model rule. Fact values and nested small-text wrappers now inherit the detail grid's 14px size. Fact buttons inherit that size with enough specificity to override compact button styling; model buttons have zero inline padding. Muted unavailable color remains. These rules are confined to detail facts, so table values retain their small size.
   - File: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`.

The regression in `lanes-table.visual.component.spec.ts` now drives the real table width signal at 358px rather than replacing `collapsed()`. It checks the collapsed colgroup, the guide's identity-cell ancestry and second-line sibling position, its recovery event, and absence from Status.

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts` ? PASS, 3 suites / 52 tests. Log: `L6-jest.log`.
- A second focused visual-spec run captured actual Angular-projected DOM using temporary instrumentation: PASS, 14 tests including capture. Instrumentation was removed afterward; the 13 permanent visual tests remain. Log: `L6-dom-capture.log`.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` ? PASS, exit 0. Log: `L6-tsc.log`.
- `npx eslint` on the two changed TypeScript files ? PASS, exit 0, no warnings. Log: `L6-eslint.log`.
- `npx prettier --write` on all three changed source/spec files ? PASS. Logs: `L6-prettier.log`, `L6-prettier-css.log`.

No UI-library files, identifiers, test IDs, aria labels, RPC behavior or Test logic were changed. No build, serve, e2e, Nx or Git mutation commands were run.

## Visual evidence and limitation

Inspected all four requested iter4 Electron JPGs and all three prototype reference JPGs. Opened the supplied prototype through Ptah browser navigation and inspected its screenshot. Compared install-guide placement beneath identity, column allocation and fact typography/alignment against those references.

Captured actual Angular test DOM (including projected colgroup, row-title spans, status and details) to `L6-rendered-dom.html`. Rendered it with the relevant source component CSS, real button CSS and tokens in `L6-layout-evidence.html`; navigated to its in-workspace file URL and inspected the Ptah browser screenshot. The fixture supplies basic utility/theme styles rather than the complete Electron stylesheet. Its captured test statuses and incomplete manifests are not the full production dataset.

Browser measurements at 358/424/742px table widths show:

- Guide computed position is `static`; its right edge stays left of Status (at 358px, guide right 143px versus Status left 207px).
- `Synthetic Lane` is fully visible: client width equals scroll width (100px).
- Tested unavailable, CLI-default model button and provider values use 14px text and the same value-column x coordinate (161px in the 358px case); model button inline padding is 0px.

This is actual Angular DOM with source-CSS layout evidence, not a live Electron renderer. Recapture the changed live Electron system/instance detail at 1168/784/600 and confirm the accepted wide 1824 layout remains good. Starting the app/build/e2e was prohibited. A progress notification asking the parent to perform this recapture was rejected with `parent-inbox-full`; it was not retried.

## Tooling

Applied repository UI/UX Designer and Angular Frontend Patterns instructions. Skill search was available, but this CLI exposes no skill loader; read their SKILL.md files directly. Ptah AST inspection worked. Dependents remained in graph-building state, so targeted native `rg`/source reads supplied impact analysis. Scoped Ptah diagnostics did not finish its TypeScript check within 45 seconds and does not recognize CSS; the explicitly permitted focused tsc/ESLint checks supplied validation instead.
