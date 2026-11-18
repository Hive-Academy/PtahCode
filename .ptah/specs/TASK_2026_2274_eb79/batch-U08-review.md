# Batch U08 review: Bots title-bar tab

Score: 9/10
Verdict: APPROVED

## Evidence

- `bots-tab.spec.ts`: 12 tests pass (focused jest run).
- The `bots` view id exists in `ViewType` (`libs/shared/src/lib/types/webview-surface.types.ts:66`, `:88`).
- The `bots` route exists (`apps/ptah-extension-webview/src/app/app.routes.ts:191`, Electron only, `SURFACE_ACTIVE`).
- The shell renders the surface through `<router-outlet />` (`electron-shell.component.ts:511`, no folder) and the app shell (`:543`, with folder).

## Acceptance criteria

1. PASS. Bots tab is directly after Tasks (`electron-shell.component.ts:307-318`). It has the `Bot` icon (`:43`, `:748`), `aria-label`, `aria-selected`, `tab`/`tab-active` classes, and `setCurrentView('bots')`. Same shape as sibling tabs. No other raw DaisyUI classes.
2. PASS. `'bots'` is in both no-folder conditions (`:420-421`, `:461-462`). The welcome screen is skipped and the back action shows. The tests at `bots-tab.spec.ts:152-175` and `:190-203` cover this. The workspace loading gate stays first (`:452`, tested).
3. PASS. The diffs of the four sibling specs change only expected tab count, tab order, and the no-folder list. No setup change and no removed test.
4. PASS. `bots-route.spec.ts:60-65` calls the real `loadComponent` and expects `BotsPageComponent`.

## Conditional-gating question

The Tasks tab is inside `@if (layout.hasWorkspaceFolders())` (`:255`). That is a folder gate, not a feature flag. User bots work without a folder, so Bots is correctly outside this gate (`:307`). It is the same as Machines. No feature flag exists for Tasks or Machines. The route already uses `electronOnlySurface`, and the shell is Electron only. No change is necessary.

## Defects

1. Low, `electron-shell.machines-tab.spec.ts:203`. The test title still says "shrinks the tab strip to Machines alone" but it now expects `['Bots', 'Machines']`. Also stale: the comment "The strip shrinks to Machines alone (D12)" at `electron-shell.apps-tab.spec.ts:175` and the same wording in `electron-shell.component.ts` comments near `:418` and `:507`. Cosmetic only. Update the wording.
2. Low, `electron-shell.machines-tab.spec.ts:143`. The expectation `Tasks + 2` is correct but couples the test to the Bots tab. Assert "after Tasks" by relative order instead. Optional.
3. Info, `bots-route.spec.ts:62`. The test imports `@ptah-extension/bots-ui` dynamically, which loads the full page graph in a Jest run. It passes in design, but check the runtime of the webview project spec when the full gate runs.

No blocking defect.
