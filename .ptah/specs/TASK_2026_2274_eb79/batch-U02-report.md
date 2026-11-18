# Batch U02 report

Status: COMPLETE. Shared responsive split adaptation implemented; all five prescribed checks passed. Actual rendered CSS layout remains the scheduled R01 gate.

## Files
- `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9` — bind six split-dependent query classes; `:23` adds `splitAt = input<768 | 960>(768)` and statically discoverable Tailwind variants; `:63` and `:81` use the configured threshold for observer and selection focus handling. Component is 92 lines, standalone and OnPush.
- `libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts:5` — typed ResizeObserver fake; `:49` parameterizes query, Back/focus and observer cases at both breakpoints; `:140` verifies updating splitAt and a custom Bots Back label.
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts:6` — typed ResizeObserver fake; `:39` mounts the real GalleryComponentsComponent, checks its default 768 input, projected content, row-click selection, Back output, resize focus and disconnect.
- `.ptah/specs/TASK_2026_2274_eb79/batch-U02-report.md:1` — skeleton written before implementation, finalized with evidence.

## Tests
- Both 768 and 960: all six queries (grid, pane visibility, list border, Back visibility, ordinary columns, metadata-mode columns); no queries for the other breakpoint remain active.
- Both widths: optional metadata remains off by default and uses the original 1200px third-column queries when enabled.
- Both widths: selection below threshold focuses Back, Back restores the selected option, null/empty selection returns the list.
- Both widths: exact threshold keeps list focus; crossing below transfers focus; subsequent narrow resizes do not steal focus; focus already in detail remains there; empty observer callback is harmless; destruction disconnects once.
- Input update to 960 and custom Back label Bots.
- Real gallery selection through its ngOption click, projected list/detail/empty content, default 768 split, Back wiring and observer lifecycle.
- Existing gallery uniqueness and app route specs executed read-only.

## Check results
All exit 0:

1. `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` — PASS.
2. `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` — PASS.
3. `npx eslint libs/frontend/ui/src/lib/foundation/list-detail.component.ts libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts` — PASS after adding the application's required explicit public modifiers to the fake.
4. `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts` — PASS, 1 suite / 7 tests.
5. `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts apps/ptah-extension-webview/src/app/ui-gallery/gallery-unique-sections.spec.ts apps/ptah-extension-webview/src/app/app.routes.spec.ts` — PASS, 3 suites / 16 tests.

No nx, npm run verify, build, serve, screenshots or git writes. Only the three authorized source/spec paths and this required report were written. Parallel changes observed in nx.json, bots-ui and other reports were left untouched.

## Decisions
- Expose the supported breakpoint pair as a literal union, 768 | 960. Bots can bind `[splitAt]="960"`; existing consumers omit it and retain 768.
- Keep complete Tailwind arbitrary-query strings in the source rather than constructing query names dynamically, so the scanner can discover both variants.
- Apply the same splitAt value to CSS class selection, selection focus handling and ResizeObserver threshold comparisons. Keep the independent metadata breakpoint at 1200px.
- Compared class wiring and focus behavior with approved design-spec.md:38-40,66,80: container-based split, full-width narrow selected pane, and configurable Bots Back label. JSDOM does not establish actual CSS layout; R01 must check the rendered Electron layout at the design widths. No visual-quality claim is made here.
- Read and applied `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md`. CLI skill-loading/discovery mechanism was unavailable (no skill tool/catalog); native filesystem reads were used. This implements an approved design, so no new design discovery was required.
- Used Ptah workspace analysis and AST analysis. Ptah dependents index was still building; scoped rg searches provided the consumer fallback. Used the explicitly prescribed native tsc checks for diagnostics and native tools for writes/tests.

## Preserve list
| Existing behavior | How preserved / evidence |
| --- | --- |
| Default split at 768 container pixels | Default input is 768; the six original 768 query strings are retained, asserted in UI and real gallery specs. |
| List column remains 320px; detail fills remainder | Both breakpoint variants retain grid-cols-[320px_minmax(0,1fr)]. |
| Metadata optional, no blank third column by default | withMeta still defaults false; aside only instantiated when true. |
| Metadata becomes a 280px third column at 1200 | Original 1200px grid and aside classes untouched and asserted. |
| Null and empty selected id mean no selection | hasSelection expression unchanged; empty/null behavior exercised. |
| Narrow selected view hides list; split exposes both panes | hidden bindings unchanged; original !block semantics retained at chosen split. |
| Detail/empty/list/meta projection contracts | ng-content selectors and conditional rendering unchanged; real gallery projection assertions cover list/detail/empty. |
| Back button label and void output | backLabel/back/goBack unchanged; default and Bots label covered; actual consumer back handler clears selection. |
| Narrow selection focuses Back | Original afterRenderEffect retained with threshold substituted; both thresholds tested. |
| Back restores connected selected option or fallback option | Original previousOption, connectivity and ngOption fallback logic retained; selected option restoration tested at both widths and in gallery. |
| Wide selection does not move focus | Original guard retained with splitAt; exact-boundary cases tested. |
| Crossing wide-to-narrow while list has focus moves to Back | Original observer condition retained with splitAt; both crossings tested. |
| Observer ignores empty entries and does not steal detail focus | Original guards unchanged; empty callback and detail-focus cases exercised. |
| ResizeObserver unavailable is supported | typeof guard unchanged. |
| Observer disconnects on destroy | DestroyRef callback unchanged; both widths and gallery assert exactly one disconnect. |
| Explicit ngListbox selection requirement | Existing documentation and gallery selectionMode="explicit" unchanged. |
| Electron renderer and shared-host compatibility | Host-neutral Angular implementation; no Electron/CLI adapter imports or host wiring changes. |

## Unmet requirements
No U02 implementation or prescribed check remains. Actual rendered CSS layout/screenshots are intentionally deferred to R01 as requested.
