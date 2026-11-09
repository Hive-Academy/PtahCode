# PR #1028 review fixes

## Finding 1

Added a standalone route guard to the post-auth redirect. The existing `isStandaloneView()` derives from route `data.standalone`, so `/ui-gallery` remains outside surface IDs. Changed `libs/frontend/chat/src/lib/components/templates/app-shell.component.ts`; added a route regression case in `app-shell.auth-redirect.spec.ts` that leaves the gallery active when auth resolves without credentials.

## Finding 2

Observed the list-detail host width, transferred focus from the list to its existing Back button when a selected view crosses below 768px, and disconnected the observer on destroy. The observer is guarded for environments without `ResizeObserver`. Changed `libs/frontend/ui/src/lib/foundation/list-detail.component.ts`; added a mocked observer regression case in `list-detail.component.spec.ts`.

## Finding 3

Changed the gallery page-header Back action to `Router.navigateByUrl('/chat')`, matching the route table and Electron memory location. Changed `apps/ptah-extension-webview/src/app/ui-gallery.component.ts`; added a click regression case in `ui-gallery.component.spec.ts`.

## Verification

- `npm run verify -- -p @ptah-extension/ui,ptah-extension-webview,@ptah-extension/chat,ui-class-audit`: exit code 0. Lint/typecheck: `NX 8 tasks: 8 succeeded`. Test: `NX 4 tasks: 4 succeeded, 1 cached`. `ui-class-audit` passed within the requested project set; its baseline was not changed.
- Scoped `ptah_get_diagnostics`: unavailable after 45 seconds while TypeScript checking continued. The verify lint/typecheck phase passed.
- Visual screenshot was not taken because the requested scope forbids serve/dev targets and this change alters no styling.

## Decisions

- Reused the route's existing `standalone` data through `isStandaloneView()`; no surface ID was added. Reversible: yes.
- Observed the list-detail host because its width controls the existing container breakpoint; focus uses the existing Back target. Reversible: yes.
- Navigated directly to `/chat` because `app.routes.ts` declares that path and the renderer uses memory location. Reversible: yes.

