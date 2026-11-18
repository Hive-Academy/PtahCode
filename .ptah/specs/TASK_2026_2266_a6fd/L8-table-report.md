# L8 table report

Implemented permission/network display labels and consolidated table actions into Status. Stored mode IDs, RPC payloads, existing test IDs and accessible names are preserved.

## Files changed

All source paths below are under `libs/frontend/chat/src/lib/settings/ptah-ai/`:

- `lane-option-labels.ts` (new): settings label adapter importing the shared permission label map.
- `cli-lane-default-cell.component.ts`: applies Plan only / Ask before edits / Auto edit / Yolo and Allowed / Blocked to all compact, wide and card selects, including Ptah CLI defaults; placeholder Select mode; human select titles.
- `cli-lane-default-cell.component.spec.ts`: checks display options across layouts, unchanged stored values, updated placeholder.
- `cli-shared-defaults.component.spec.ts`: verifies shared defaults display labels and unchanged selection output.
- `lanes-table.component.html`: moves recovery links and the existing row action menu into Status; removes Actions header/column; updates message/detail colspans from 9 to 8.
- `lanes-table.component.css`: expands Lane from 17% to 26%, budgets Status for inline actions, retains collapsed layout, sets 49px rows, and hides the redundant identity Install guide because recovery now appears in Status at all widths.
- `lanes-table.component.spec.ts`: updates eight-column width expectations.
- `lanes-table.visual.component.spec.ts`: checks actions belong to Status, Actions header is absent, and row/detail column counts are eight. Removes the detail badge expectation superseded by the concurrent detail lane.

No e2e files changed: the provider/lanes e2e search found no Actions-column selector requiring migration. No UI-library, detail component, capability helper, provider source, or RPC files edited by this lane.

## Label source

Searched `cli-capability-view.ts`, shared types and `autopilot-state.service.ts`. The capability helper has private abbreviated labels; the autopilot service imports `PERMISSION_LEVEL_NAMES` from `@ptah-extension/shared` (`libs/shared/src/lib/types/model-autopilot.types.ts`). The new label adapter imports/spreads that existing map and adapts its legacy wording to the supplied prototype wording. Network display labels are local typed labels over unchanged allow/deny IDs.

## Checks

- Requested focused Jest command on the four changed specs: PASS, 4 suites / 58 permanent tests (`L8-jest-final.log`). An earlier passing run also included one temporary DOM-capture test (59 tests); capture instrumentation was removed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: PASS, exit 0 (`L8-tsc.log`, empty on success).
- `npx eslint` over changed files: PASS, exit 0, no errors; three existing non-null assertion warnings and one CSS ignored-file warning (`L8-eslint.log`).
- `npx prettier --write` over all eight changed files: PASS; final CSS formatting also PASS (`L8-prettier.log`, `L8-prettier-css.log`).
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: PASS, exit 0; 898 blocked class tokens, 627 raw-spacing tokens; both report 0 token counts over baseline (`L8-ui-class-audit.log`). No baseline update.
- Targeted `git diff --check`: PASS.

## Visual evidence and limits

Inspected both supplied prototype JPGs and the current 1824 JPG. Compared human mode wording, compact rows, expanded lane allocation and recovery action placement. Captured real Angular-projected DOM to `L8-wide-dom.html` and `L8-narrow-dom.html`, then rendered with source table/identity/button styles, design tokens and the utility subset from the prior gate fixture in `L8-layout-evidence.html`.

Navigated the in-workspace file URL with Ptah browser tools and requested screenshots. Another concurrent lane navigated the shared browser to its L7 fixture between calls, so reliable final capture and measurements used an isolated native headless Playwright browser. Screenshots: `screens/L8-layout.png`, `screens/L8-layout-600.png`.

Fixture measurements at 600, 784, 950, 1168, 1440 and 1824 viewport widths: every tested row is 49px; container scroll width equals client width at every size (`L8-layout-measurements.json`). Recovery text and menu sit beside status; redundant identity recovery is hidden. The fixture uses representative statuses and incomplete manifests (Unavailable controls); label behavior is verified by the Angular specs.

Live Electron acceptance remains outstanding: this evidence uses Angular test DOM and a stylesheet subset, not a newly launched Electron renderer. Build/serve/e2e targets were prohibited and were not run. Parent should recapture the live renderer at the requested widths with populated manifests.

## Tooling

Read and applied repository Angular Frontend Patterns and UI/UX Designer SKILL.md instructions. CLI-native skill loading is unavailable; filesystem skill discovery/read was used. Ptah workspace/AST inspection worked; dependents graph was building, so targeted native source/import searches supplied impact analysis. Scoped Ptah diagnostics remained unavailable after its 45-second compiler timeout; the required native tsc passed. No commits, pushes, Nx targets or npm verify commands run.
