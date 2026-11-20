# Batch U07 review

Review family: claude (implementer: codex)

Score: 8/10

Verdict: APPROVED

## Defects

1. Low. libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:407 and :447 (U08 scope, not U07).
   The shell treats `currentView() === 'machines'` as a surface that needs no workspace folder. Bots does not appear there.
   With no workspace, the welcome screen shows instead of the Bots page. There is also no back button.
   Fix: in U08, decide if Bots must work without a folder. If yes, add `'bots'` to both conditions. Add a test for it.

2. Low. apps/ptah-extension-webview/src/app/bots-route.spec.ts:60-66.
   The spec replaces the loader with a fake component. A real loading failure of `@ptah-extension/bots-ui` is hidden here.
   The first test checks only the source text of the dynamic import.
   `app.routes.spec.ts` imports `review-runs-ui` for its route. No such real-import test exists for bots.
   Fix: add one test that calls the real `loadComponent` and expects `BotsPageComponent`.
   Safe now, because U06a is present in the working tree.

3. Info. apps/ptah-extension-webview/src/app/app.routes.ts:217-218.
   Prettier changed the `ui-gallery` line. This is an unrelated reflow. It is harmless.

## Checked, no defect

- `bots` is immediately before `machines` in `ViewType` and in `SURFACE_ROUTE_IDS`. The route table has the same order.
- The route uses `canMatch: [electronOnlySurface]`. This is the same guard as machines.
- The route provides `SURFACE_ACTIVE` with `surfaceActiveFor('bots')`, as the machines route does.
- The import is dynamic. No eager import of `@ptah-extension/bots-ui` exists. The spec asserts this on the source text.
- The non-Electron host lands on `/chat`. The loader is not called.
- The final-surface expectations are unchanged. The `ui-gallery` index is still `length - 3`.
- The coordinator edit in webview-routing.spec.ts is correct: review-runs, then bots, then machines.
- Consumers: `libs/frontend/core` (`surface-routes.ts`, `app-state.service.ts`) has no `machines` or `review-runs` literal. They derive from `SURFACE_ROUTE_IDS`. They do not ignore bots.
- Other literal uses of `review-runs` are in the shell and e2e files only. No exhaustive map of `ViewType` breaks.
- The webview-routing.spec.ts change is limited to the array and the order test.

## Command results

- `npx jest` (webview): bots-route.spec.ts, webview-routing.spec.ts, app.routes.spec.ts. 3 suites passed. 121 tests passed.
- `npx jest` (shared): webview-surface.types.spec.ts. 1 suite passed. 47 tests passed.
- I did not run tsc or eslint. The coordinator reported that they pass.

## Safe to carry forward to U08

Yes. Resolve defect 1 in U08. Defect 2 is optional but recommended.
