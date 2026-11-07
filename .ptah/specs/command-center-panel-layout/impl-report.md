# Command Center panel layout implementation

## Root causes

- Scene plate buttons began at `left-0 top-0` in `command-overlay.component.ts:64` and were visible before the renderer assigned their `translate3d` position. `measureOverlay` in `command-center-page.component.ts:515` attaches labels after render; the stage header occupies that origin. The positioner's `overlaps()` handles the selected-node detail card against neighboring plates, not this initial plate position.
- The rail column was fixed at 296px in `command-center-page.component.css:2`; it had no resize handle or width state. The chat monitor defaults are 360px, 440px from 1280px, and 540px from 1536px (`agent-monitor-panel.component.ts:190-202`).

## Changes

- `command-overlay.component.ts` and `.css`: put scene plates in a clipping field below the measured header height, while keeping the fixed detail card outside the field. Plates stay hidden until the renderer supplies a transform. The page passes `statsBandHeight()` to the overlay.
- `command-center-page.component.ts`, `.html`, and `.css`: scope `PanelResizeService` to the page, bind its width to the rail grid column, use the chat sidebar's responsive defaults, and place `ResizeHandleComponent` on the rail's left edge. Disable grid width transition during a drag.
- `resize-handle.component.ts`: add an optional container input. Drag width and service clamp use that container's right edge and width; existing consumers keep the viewport fallback.
- `command-overlay.component.spec.ts` and `command-center-page.component.spec.ts`: cover initial plate placement/clipping, page-scoped width service, reset binding, and handle container wiring.

## Decisions

- **Reuse chat exports.** Options: import the existing public alias or move generic pieces. Evidence: `chat/src/index.ts` re-exports both symbols through component and service barrels; Command Center already imports `@ptah-extension/chat`, and both projects have `scope:webview`/`type:feature` tags. Reversible.
- **Clip only scene plates.** Options: reserve a new layout row, hide the whole overlay, or clip plates at the measured header boundary. Evidence: the selected-node card is fixed and needs to remain visible; scene layout already reserves the header height. Reversible.
- **Keep resize state local.** Options: root singleton or page provider. Evidence: chat provides `PanelResizeService` in its view, and Command Center must not share its width. Reversible.

## Verification

- `ptah_get_diagnostics` scoped to changed TypeScript files: unavailable; compiler check exceeded 45 seconds, so no pass was inferred.
- `npm run verify -- -p @ptah-extension/command-center,@ptah-extension/chat`: **failed (exit 1)**. Lint and typecheck succeeded (4/4 tasks). Jest failed in both projects: Command Center had 16 failed suites and 32 passed; chat had 102 failed suites, 245 passed, and three failing tests. The failing suites could not resolve `marked` from the Jest mapper path `node_modules/marked/lib/marked.umd.js`; the three chat assertions were in unrelated workspace coordinator git regressions. The two changed Command Center spec files were among suites blocked before execution by that module resolution error.
- Browser screenshot: not run; starting the Electron renderer would require a serve/dev/package target, which the task forbids.

## Not done

- Jest verification remains red because the worktree's `marked` mapper target is missing; the task scope forbids changing Jest configuration or dependencies. The matching `angular-frontend-patterns` skill was requested by guidance, but this session exposes no skill-loading tool.
