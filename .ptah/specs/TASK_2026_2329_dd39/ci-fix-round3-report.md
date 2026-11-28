# PR 1517 round 3 credential drawer fix

## Cause

Both Electron-host credential scenarios reached the footer-close helper after checking their success toast and RPC. The VS Code-host scenarios failed at the same point. The CI log shows the drawer still present after the helper swallowed the footer click error.

The Settings toast uses a manual popover in the browser top layer. The CDK migration moved the drawer panel outside the `ptah-native-drawer` host and put the width class on the overlay pane. Every drawer-aware toast rule still matched the old DOM. The resulting bottom-right fallback overlaps the footer Close target after a successful credential write. The toast stays up for eight seconds and the helper gives the click five seconds. Other drawer tests can close before any toast appears.

## Fix and files

- `libs/frontend/chat/src/lib/settings/feedback/settings-toast.component.ts` keys the placement rules off the visible portaled drawer panel and reads the width class from its CDK pane. Narrow windows lift the toast above the footer and reserve body scroll space. Wider windows place it beside the drawer. The existing spacing tokens and breakpoints are retained.
- `libs/frontend/chat/src/lib/settings/feedback/settings-toast.component.spec.ts` exercises the selectors with a real `NativeDrawerComponent` and its CDK portal, including the compact width, the wider width, and dismissal.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-drawer.reach.ts` propagates the footer click error and still asserts drawer removal. The two scenarios retain their inline confirm, toast, RPC, and footer-close checks.

## Verification

- `git diff --check` passed.
- Focused Chat Jest passed all 174 tests across Settings toast, Providers settings, and the connection detail drawer. The first regression run exposed Angular TestBed removing the previous root when it creates the drawer fixture. The test now keeps both roots attached while exercising the portal selectors.
- `tsc --noEmit` passed for the Electron and renderer application configs.
- The direct Chat and webview E2E harness spec-config TypeScript checks exited with code 2 and reported zero diagnostics in the edited files. The Chat config reported 395 diagnostics elsewhere in its test graph, including mock typing and ES target errors. The harness config reported `import.meta` under CommonJS and a Playwright select-option type error in `preferences.e2e.spec.ts`.
- ESLint passed for all three edited TypeScript files.

The CI trace archives were unavailable locally. The cause is based on the CI failure sequence and inspection of the toast stacking, selector, and timeout behavior. Playwright was outside this lane's focused checks. Electron visual verification of the success toast remains pending. The separate [visual review](visual-review.md) recorded a renderer build blocker. The partial Ptah dependency index omitted the edited files, so native ripgrep and Git supplied the call-site and diff checks. A CLI skill loader was unavailable, so the repo's Angular frontend patterns skill was read directly.
