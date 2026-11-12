# Lane A review fixes

## Changes

- `libs/frontend/core/src/lib/services/wall-clock.service.ts` now uses `linkedSignal` for the coarse cadence. A coarse acquire refreshes immediately, a backward wall-clock move resets it, and its JSDoc states that a return from hidden may leave coarse time up to 30 seconds stale. The wall-clock spec covers acquire at t0+29 seconds and a backward move.
- `libs/frontend/core/src/lib/services/clock.service.ts` has a cross-reference to `injectPtahClock`. Its spec now covers repeated visible events, release after injector destroy, both `injectClock` forms, and no reacquire on unrelated ticks.
- `libs/frontend/machines-ui/src/lib/services/countdown-clock.ts` delegates `acquire()` directly to `ClockService`; its spec covers hidden pause and immediate refresh on return.
- `apps/ptah-extension-webview/src/app/display-window/display-window.config.ts` and `git-window/git-window.config.ts` provide `PTAH_CLOCK` through `ClockService`, as the main window already does. These are all three `bootstrapApplication` roots in `src/main.ts`.
- The gallery spec uses an inline `PtahClock` fake within its `describe`. The compact timer section title matches its registry label.

## Verification

- `npm run verify -- -p core,machines-ui`: four lint/typecheck tasks passed; core tests passed. Machines-ui had 19 passing suites and 387 passing tests. Five suites could not start because the worktree lacks Jest's mapped `node_modules/marked/lib/marked.umd.js`; these are the same known environment failures from the prior run. The updated `CountdownClock` spec passed.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: passed.
- `npm run verify -- -t test -p ptah-extension-webview -- --testPathPatterns=ui-gallery`: passed.

No Electron screenshot was captured because the task forbids build, serve, and dev. The existing gallery section layout and Lane B timer components were checked against the design reference in source; visual quality was not inferred from the passing checks.
