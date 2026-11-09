# Phase A Electron visual fixes

## Issues and regression coverage

1. **Gallery visibility** — `apps/ptah-extension-webview/src/app/app.routes.ts:207` marks `/ui-gallery` as standalone while preserving `electronOnlySurface` and lazy `loadComponent`. `libs/frontend/chat/src/lib/components/templates/app-shell.component.ts:166-211` reads settled route data and shows the outlet for that route while leaving `SurfaceRouterService.currentSurface()` and `ViewType` unchanged. `ui-gallery.component.ts:11` documents opening it with Angular router navigation to `/ui-gallery`; no nav entry was added. `app.routes.spec.ts:50-59` pins guard, data, and lazy loading; `app-shell.outlet-wrapper.spec.ts:56-60` pins shell visibility for opted-in routes.
2. **Toolbar** — `libs/frontend/ui/src/lib/foundation/toolbar.component.ts:8-15` adds a configurable `Search` placeholder, compact input and projected select text, and a polite live count such as `4 results`. No lucide dependency exists in `@ptah-extension/ui`, so search uses the placeholder. `toolbar.component.spec.ts:4-31` checks input events, placeholder, sizing, projected sort styling, and the live count.
3. **Header back action** — `libs/frontend/ui/src/lib/foundation/page-header.component.ts:8` renders the existing back output with a ghost xs `ptahButton`, decorative left-arrow SVG, and visible label. `page-header.component.spec.ts:4-19` checks styling, icon, label, and output.
4. **Loading panel** — `libs/frontend/ui/src/lib/foundation/state-panel.component.ts:16-17` gives loading and the other non-partial states the same minimum height and an sr-only heading that uses the supplied title or `Loading`. Skeletons are hidden from assistive technology. `state-panel.component.spec.ts:5-17` checks title, minimum height, busy state, and hidden skeletons.

## Verification

- `npm run verify -- -p @ptah-extension/ui,ptah-extension-webview,ui-class-audit,@ptah-extension/chat`: exit 0. `NX 8 tasks: 8 succeeded` (lint/typecheck); `NX 4 tasks: 4 succeeded, 1 cached` (test); `lock released after 503.9s, exit code 0`.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; `0 token count(s) over baseline` (5572 existing blocked tokens across 451 files). Baseline untouched.
- Scoped `ptah_get_diagnostics` timed out twice after 45 seconds with 5 files unchecked. The required project typecheck and tests above passed.
- Electron was not launched, per task instructions. The coordinator owns the visual re-check.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Route data controls shell visibility for the dev gallery. | Route flag; add a surface ID. | Plan keeps gallery outside surface IDs; `currentSurface()` maps unknown routes to chat, so surface ID expansion would change host contracts. | Yes |
| Use placeholder for search and inline SVG for back. | Add lucide dependency; local SVG. | No `lucide-angular` imports in `@ptah-extension/ui`; existing button directive supports ghost xs. | Yes |
| Keep compact sort styling local to toolbar. | Change all field controls; style projected select. | Global field sizing is shared; the defect is in the 320px toolbar. | Yes |
