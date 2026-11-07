# Batch 26 report: C10d shell, route and surface ID (TASK_2026_858_f7b9)

Executor: frontend-developer subagent. Tasks 26.1 and 26.2 are implemented. Nothing is committed, and the working tree is left dirty for the coordinator.

## Files

Task 26.1: surface ID, route and wiring
- MODIFIED `libs/shared/src/lib/types/webview-surface.types.ts`: adds `'machines'` to `ViewType` and appends it at the end of `SURFACE_ROUTE_IDS`. The doc note says it is Electron-only.
- MODIFIED `libs/shared/src/lib/types/webview-surface.types.spec.ts`: the exact-list spec now includes `'machines'`.
- MODIFIED `apps/ptah-extension-webview/src/app/app.routes.ts`: adds a `machines` route after `review-runs` with:
  - `canMatch: [electronOnlySurface]`;
  - `providers: [{ provide: SURFACE_ACTIVE, useFactory: surfaceActiveFor('machines') }]`;
  - `loadComponent` → `MachinesViewComponent` from `@ptah-extension/machines-ui`.
  The header comment is updated as well.
- MODIFIED `apps/ptah-extension-webview/src/app/app.config.ts`: registers `{ provide: MESSAGE_HANDLERS, useExisting: MachinesFeed, multi: true }`, imported from `@ptah-extension/machines-ui/services`. Like the tasks feed, it is registered on every host.
- Markdown: `provideMarkdownRendering({ extensions: 'full' })` is already provided at app level in `app.config.ts`, so it is in scope for the routed `remote-session-view`. No change was needed.
- `libs/frontend/core/src/lib/routing/surface-routes.ts`: unchanged. It only re-exports from shared and does not list IDs itself.
- MODIFIED `apps/ptah-extension-webview/src/app/webview-routing.spec.ts`:
  - `ELECTRON_ONLY_SURFACES` gains `machines`.
  - The Electron route loop now ends on `machines`.
  - The guard, order (`machines` = `review-runs` + 1 = length − 3) and defer/resolve lists include `machines`.
  - New tests: `SURFACE_ACTIVE` is the route's provider; the route resolves to `MachinesViewComponent`; on VS Code, initialView `machines` lands on `/chat` without loading the chunk; on Electron it lands on `/machines` and loads the chunk.

Scope extension (approved by the coordinator, option A)
- CREATED `libs/frontend/machines-ui/src/services.ts`: a component-free entry that exports `MachinesApi`, `MachinesFeed`, `MachinesStore` and their types.
- MODIFIED `tsconfig.base.json`: adds the `@ptah-extension/machines-ui/services` path.
- MODIFIED `eslint.config.mjs`: adds `@ptah-extension/machines-ui/services` to `checkDynamicDependenciesExceptions`.

Task 26.2: shell tab, welcome branch, welcome button and badge
- MODIFIED `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`:
  - The tablist renders when `hasWorkspaceFolders() || workspaceResolved()`.
  - Chat, Voice, Apps and Tasks, and Reviews, Analytics and Setup, are each wrapped in `@if (layout.hasWorkspaceFolders())`. The Machines tab sits between them, outside the guard. The order is Chat, Voice, Apps, Tasks, **Machines**, Reviews, Analytics, Setup.
  - The tab has the `Server` icon and an approval badge (`badge badge-warning badge-xs`, `aria-hidden`), shown only when `MachinesStore.pendingApprovalCount() > 0`. The tab's `aria-label` then reads "Machines, N approval(s) waiting".
  - The welcome branch also requires `currentView() !== 'machines'`, so it falls through to the existing no-folder bare `<router-outlet>`.
  - "Back to welcome" also shows for Machines when there is no folder.
  - Adds `openMachines()`. `MachinesStore` comes from `/services`.
- MODIFIED `electron-welcome.component.ts`:
  - A secondary `btn-ghost` "Machines (N connected)" button now sits next to Open Folder (`data-testid="welcome-open-machines"`) and calls `setCurrentView('machines')`.
  - The screen loads the machine list once on construction. Until that succeeds, and after an error or a rejection, the button reads plain "Machines". A rejection is caught and logged through `LoggingService.warn`.
- CREATED `electron-shell.machines-tab.spec.ts`. It covers:
  - placement after Tasks and before Analytics;
  - the sibling tab pattern and the icon;
  - click and the selected state;
  - the badge (hidden at 0; count, `aria-hidden` and label at 1 and 3; also on the no-folder strip);
  - no-folder behaviour: the strip holds Machines only; no strip before the first sync; the welcome yields to an outlet; **`/machines` activates in the outlet with no folder**; back button; every tab returns when a folder opens.
- MODIFIED specs:
  - `electron-shell.apps-tab.spec.ts`, `electron-shell.config-gate.spec.ts` and `electron-shell.command-center-tab.spec.ts`: 8 tabs including Machines; without a folder the strip is `['Machines']`.
  - `electron-welcome.component.spec.ts`: `MachinesStore`/`AppStateManager` stubs, plus 7 Machines-button cases.

## Verification

Run 1 (the command from the brief, 8 projects):
- lint/typecheck: `NX   16 tasks: 15 succeeded, 1 failed`, with `✖ nx run ptah-extension-webview:lint`. All 26 errors were "Static imports of lazy-loaded libraries are forbidden. Library @ptah-extension/core". This is a defect already on main, which the coordinator has now fixed (see Decisions). `npx eslint` on an untouched webview file in the main checkout reproduced it.
- test: `NX   15 tasks: 13 succeeded, 2 failed`.
  - `@ptah-extension/chat:test`: 2 of my own spec assertions failed. The apps-tab aria-selected array was missing the eighth entry, and the machines-tab spec expected the welcome tag while the `@defer` placeholder was showing. Both are fixed.
  - `mcp-bench:test`: `snapshot-audits.suite.spec.ts` timed out at 5000 ms. The suite took 101 s on a loaded machine and covers memory-skills SQLite, which this batch does not touch.

Run 2 (adds `@ptah-extension/onboarding`):
- Lint/typecheck: `NX   18 tasks: 17 succeeded, 12 cached, 1 failed`, with `✖ nx run @ptah-extension/onboarding:lint`. This was one error already on main, `proposal-workspace.render.spec.ts:4:10 'ComposerAttachmentsService' is defined but never used`, and the coordinator has fixed it. The webview lint passed in this run.
- The test phase was stopped by a tool time limit and is not counted.

Run 3 (final, same 9 projects: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/machines-ui,@ptah-extension/chat,@ptah-extension/core,ptah-extension-webview,ptah-electron,mcp-bench,ptah-landing-page,@ptah-extension/onboarding`):
- Lint/typecheck: `NX   18 tasks: 18 succeeded, 17 cached`
- Test: `NX   16 tasks: 15 succeeded, 14 cached, 1 failed`, with `✖ nx run mcp-bench:test`. The failure was `host-launcher.spec.ts › launchBenchHost › guard mode › catches a real-path handle the bench host released before the stop`, a timing test, 1 of 1066. It is a different test from run 1's failure, and mcp-bench was not edited.

Run 4 (`npm run verify -- -t test -p mcp-bench`): `NX   1 task: 1 succeeded` (Nx noted "detected a flaky task"), exit code 0.

All verify targets pass: 18/18 lint/typecheck targets in run 3, and every test target across runs 3 and 4. The mcp-bench failures in runs 1 and 3 were two different timing tests under machine load.

No exhaustive `Record<ViewType, …>` exists outside `Partial<>` (grep across apps and libs), so the additive `ViewType` member cannot break the VS Code or TUI typecheck. Those projects were not run.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Scope extension: a `@ptah-extension/machines-ui/services` entry (services.ts, tsconfig path, eslint exception). Approved by the coordinator. | A) narrow entry; B) eager `component:` route | Static barrel import plus `loadComponent` in the same app is a lint error. tasks-ui, onboarding and marketplace use `/services` entries (eslint.config.mjs:238-275). | Yes |
| The coordinator fixed a defect already on main: `onboarding/.../connection-choice.store.spec.ts` dynamically imported `@ptah-extension/core`. This made onboarding→core a dynamic edge, and every static core import in the webview failed lint. The cached lint on main hid it; my eslint.config.mjs line invalidated that cache. I did not edit that file. | A) static import in that spec (chosen); B) a core exception; C) report only | Nx `hasDynamicImport` follows dynamic edges transitively (runtime-lint-utils.js:146-161). The graph showed `onboarding→core` as dynamic. | Yes |
| The coordinator fixed a second defect already on main: an unused `ComposerAttachmentsService` import in `onboarding/.../proposal-workspace.render.spec.ts:4`, which the lint cache invalidation surfaced. I did not edit that file. | A) drop the import (chosen); B) report only | Last change to the file is 9893e95c1; this batch did not touch it | Yes |
| Machines tab placed right after Tasks (before Reviews) | after Tasks; after Reviews | The design ("between Tasks and Analytics") predates the Reviews tab; both positions satisfy it. Placing it after Tasks keeps it next to the tab the spec names. | Yes |
| Machines route appended after `review-runs` (route table and `SURFACE_ROUTE_IDS`) | after tasks; at the end | The existing order specs pin apps = tasks+1 and so on. The last surface stays Electron-only for the VS Code loop. | Yes |
| The Machines route uses `electronOnlySurface` | no guard; guard | The brief says "Electron-only like the other Electron surfaces"; remote machines are an Electron-main service | Yes |
| `MachinesFeed` registered on every host | Electron-only factory | The brief says to follow the tasks feed, which is unconditional. Only Electron main sends `machines:*`. | Yes |
| No-folder tablist renders only after `workspaceResolved()` | always; after resolve | Avoids a Machines-only strip flashing before the first sync puts back the full strip | Yes |
| Back to welcome also shows on Machines without a folder | none; show | With the strip reduced to one tab, the user otherwise has no way back to Open Folder | Yes |
| Badge: DaisyUI `badge-warning badge-xs`, `aria-hidden`, count spoken in the tab `aria-label` | literal `--state-ink-need` style | Use theme classes rather than literal colours (design-spec section 7). A hint, not a button (D11). | Yes |
| Welcome loads the machine list itself; label is count-free until the list is known | always show N; load in shell | `connectedCount` is derived from `loadMachines()` (state pushes for unknown machines are ignored, machines-store.ts:457) | Yes |

## Not done / out of scope

- `apps/ptah-electron-e2e/src/support/ui-driver.ts` has its own `ElectronView` union and `SURFACE_HOSTS` map without `machines`. This is e2e support only, and its typecheck was not in scope. Add `machines` there when an e2e flow needs it.
- VS Code and TUI: the change to the shared type is additive (a new union member and list entry). These typecheck targets were not in the verify list.
- No screenshots. The visual review in Electron follows.
- Electron OS notification for pending approvals: out of scope (design D7).
