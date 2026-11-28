# PR 1517 CI e2e repair

Branch `fix/settings-overlays`. Logs: `.ptah/tmp/ci-140101768395.log` (electron-e2e shard 4/4) and `.ptah/tmp/ci-140101768911.log` (webview-e2e). The webview job was canceled (`The operation was canceled`) before Playwright printed assertion text, so those causes come from the failing titles, durations, and the CDK overlay DOM this branch introduced. Playwright's expect timeout is 5s; the harness action timeout is 10s. Durations include boot.

Skill discovery: this CLI's skill catalogue does not include `angular-frontend-patterns` or `ui-ux-designer`. No skill file was loaded. The work follows the existing overlay components.

No `*.component.spec.ts` file was edited by this lane. `rich-select.component.ts` also contains the unit lane's `maxWidth` token change (`16px` to `var(--ptah-space-4)`), recorded in `ci-fix-unit-report.md`. This lane added only the `data-value` host binding there. Playwright e2e was not re-run.

## Electron shard

### Thoth skills — saved provider and model

- Spec: `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts` (CI line 132). One failure.
- Evidence: `toHaveValue('kimi-code')` on `[data-testid="provider-model-picker-provider"]` threw `Not an input element`. The next line would have checked the model `k3`.
- Cause: product. Background model pickers use `ptah-select` (`button[role="combobox"]`), not a native `<select>` or input. The selected wire id lives on the component value, which the host did not expose.
- Fix: `PtahRichSelectComponent` sets `[attr.data-value]` from a computed that stringifies `string` and `number` only. `null` drops the attribute; `''` stays; object values are not serialized. The spec asserts `data-value` `kimi-code` and `k3`. The assertion still checks the saved wire ids.

## Webview failures

Both hosts (`vscode` and `electron`) failed the same scenes. Retries are one failure each.

### Marketplace server-detail geometry

- Spec: `marketplace-servers.e2e.spec.ts:424`. About 8–10s.
- Cause: selector. `data-testid="provider-detail-drawer"` sat on `ptah-native-drawer`, whose host is `display: contents` and whose panel is portaled. `toBeVisible()` on that host fails.
- Fix: the test id moved onto the existing `ptahMotionRouteStage` div inside the drawer body. The motion stage stays a direct child of `native-drawer-body`. The geometry assertion is unchanged.

### Marketplace visual — server detail drawer

- Spec: `marketplace-visual.e2e.spec.ts:259`. About 9–13s.
- Cause: selector. The slide animation lives on the portaled `[data-testid="native-drawer-panel"]`. Waiting on `shell` (or a removed `native-drawer-root`) never saw that animation, and `locator.evaluate` burns the 10s action timeout.
- Fix: the server-detail wait and in-viewport check use `native-drawer-panel`. Flush-right and the screenshot stay. The skill-picker scene still uses the daisyUI `dialog.modal.modal-open` and was left alone.

### Onboarding — Claude drawer and B1b credentials

- Specs: `onboarding-ready-visual.e2e.spec.ts:349` (stage 2 Claude drawer, about 13s) and `:466` (B1b credentials, about 14–15s). Both themes.
- Cause: mixed. `waitForDrawerOpened` evaluated animations on a node that is no longer in the drawer (`native-drawer-root`), which is a 10s action timeout. Credentials controls sit in the drawer body. That body collapsed (see the drawer height fix below), so the same click was not actionable.
- Fix: the animation wait targets `[data-testid="native-drawer-panel"]`. The same helper in the advanced-search voice fixme path was updated. Body clicks depend on the drawer pane height fix. Assertions were not loosened.

### Settings orchestration modals

- Spec: `settings-orchestration.e2e.spec.ts`. CI lines 125, 159, 169, 200, 209, 324, 349, 478 (current file is a few lines lower after the helper edit). About 8s each: boot plus one 5s expect timeout.
- Scenes: modal focus and Tab trap, backdrop click, add-instance create, tier-mapping Done, edit rename, tier pick, Use inherited, Copilot sign-in before Create.
- Cause: selector. `ptah-native-modal` portals to `cdk-dialog-container`. There is no native `<dialog open>`. A closed panel is detached, so `toHaveAttribute('open')` cannot run. A portaled `ptah-select` list is not inside the dialog, so a focus-contains check that only used `node.contains` failed while the list was open.
- Fix: dialogs are `[data-testid="native-modal-dialog"]`. Open uses `toBeVisible()`. Closed uses `toHaveCount(0)`. `dialogHasFocus` still requires focus in the dialog, and also accepts the active element when it is the popup named by a control's `aria-controls`. Escape while `aria-expanded` is still required to close only the list. The Tab-stays-inside loop is unchanged.

### Settings orchestration — Cursor key

- Spec: same file, CI lines 523 (save then remove, about 8.8–9.2s) and 605 (failed save, about 3.5–3.8s).
- Save/remove cause: selector. The credential popover is portaled, so `detail.locator(...)` never saw it after a page-level popover was already open. Visibility, the row move, and Esc-back-to-trigger stay. The two assertions now use the existing page-level popover locator.
- Failed-save cause: product. Disabled settings buttons are styled under `:where(ptah-settings)`. A portaled popover is not a descendant of `ptah-settings`, so the Cursor Save button (a raw `.btn`, kept focusable via `aria-disabled`) did not get the muted background the test measures (`/\/ 0\.2\)$|, 0\.2\)$/`). About 3.5s is a computed-style mismatch, not a missing-element timeout.
- Fix: the three existing `:where(ptah-settings)` `aria-disabled` rules also list `:where(.ptah-settings-overlay)` siblings. The original `:where(ptah-settings) .btn[aria-disabled='true']` text is still in the file, so `settings-shared-styles.spec.ts` still finds it. The cursor popover root has `ptah-settings-overlay`. The class is not applied to the whole overlay container. `:where()` keeps specificity at 0, so `ptah-button.css` still wins for `[data-ptah-button]`.

### Settings providers — credentials and discard

- Spec: `settings-providers.e2e.spec.ts:96` (Delete key, about 14.7–15.0s), `:111` (Copilot sign-out, about 15.4–16.1s), `:144` (discard focus, about 9.1–9.6s). Card-to-drawer and the mouse Discard click passed.
- Delete key and sign-out cause: product. CDK's global position strategy sets the overlay pane to `position: static` and, with `height: 100%`, sets the wrapper to `align-items: flex-start`. The pane then has no definite height, `.ptah-drawer-panel`'s percentage height becomes auto, and `flex-1 min-h-0` collapses the body to 0. Header and footer stay clickable (those tests passed in about 3.6s). Tabs and credential buttons are in the body: `toHaveText` passes, `click()` waits out the 10s action timeout. 15s is boot plus that timeout.
- Drawer fix: `open()` adds panel classes `h-full` and `self-stretch` beside `widthClasses`. They are not stored on `widthClasses`, so the follow-up effect that swaps width classes does not remove them. `self-stretch` overrides the wrapper's `flex-start`. `.ptah-drawer-panel` also sets `min-height: 0`. Tailwind content includes this library via `createGlobPatternsForDependencies`, and `self-stretch` is already used in declarative-dashboard, so the utility is emitted. `drawerTabOf` clicks the tab inside `native-drawer-panel`. The confirm-button enabled assertion is unchanged.
- Discard cause: product. CDK Dialog autofocuses the first tabbable descendant. `NativeModalComponent` creates a `FocusTrap` whose `.cdk-focus-trap-anchor` siblings are the first tabbable nodes in the dialog container. The start anchor's focus listener moves to the last control (Discard) instead of Keep editing. The 9s duration is boot plus one 5s `toBeFocused` timeout. The mouse path never asked for initial focus, which is why it passed.
- Modal fix, modal only: `openPtahDialog` sets `autoFocus: false`. After `create(panel)`, sibling `.cdk-focus-trap-anchor` nodes get `tabindex="-1"`, then `focusInitialControl` focuses the first enabled tabbable descendant. That first focus does not require a client rect, because a just-opened overlay can report an empty box. Tab and Shift+Tab wrapping still require a box. The drawer still uses CDK autofocus. Turning it off there would drop the drawer's Escape target. The discard e2e (Keep editing, Shift+Tab to Discard, Tab back, Escape to the wizard cancel, second Escape reopens on Keep editing, click at 5,5 closes only the discard dialog) was not edited.

### Settings visual baselines

- Spec: `settings-visual.e2e.spec.ts:895` (orchestration matrix popovers, about 10–11s), `:1008` (Main Agent save-to, about 2.8–5.4s, console `B27b save-to` empty), `:1198` and `:1223` (connection drawers, about 12–13s).
- Matrix popovers: same detached-dialog problem. The capture uses `native-modal-dialog`, `toBeVisible()`, and the panel's own box (the panel is the modal box; `.modal-box` is not a descendant). Close uses `toHaveCount(0)`.
- Save-to: options are portaled, so reading them inside the trigger host returned an empty list. `ptahSelectListbox` opens the combobox when needed and returns the page listbox from `aria-controls`. Labels stay `Global · all apps`, the host app label, and `This workspace`.
- Connection drawers: same collapsed body and missing drawer root as the credentials tests. `waitForDrawerOpened` now uses `native-drawer-panel`. The height fix is what makes the body paintable.

## Same DOM, not in the canceled summary

The webview job died during the visual baselines. These call sites use the old dialog, drawer-root, or in-host listbox queries and would fail the same way. Assertions were retargeted, not removed.

- `settings-cli-matrix.entries.ts`: matrix and tier modals, and Confirm full access, use `native-modal-dialog`, `toBeVisible()`, and `toHaveCount(0)`. Tier search already used a page-level `aria-controls` list.
- `settings-reachability.table.ts` `#16` and `RUX-5`: save-to options go through `ptahSelectListbox`. `#16` still requires 3 options.
- `marketplace-servers.e2e.spec.ts` docked guard: backdrop count is `.ptah-drawer-backdrop` (the class CDK actually applies). Count 0 stays. There is no `native-drawer-backdrop`.
- A repo search after the edits found no remaining `native-drawer-root`, `dialog:has(`, or `toHaveAttribute('open'`.

## Files changed by this lane

Product:

- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`
- `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts` (`data-value` only)
- `libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.html`
- `apps/ptah-extension-webview/src/styles.css`

E2e:

- `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/choose-ptah-select.ts` (`ptahSelectListbox`)
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/marketplace/marketplace-servers.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/marketplace/marketplace-visual.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-ready-visual.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-advanced-search-voice.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-cli-matrix.entries.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-drawer.reach.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-orchestration.e2e.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts`

## Checks

- `npx eslint` on the changed TypeScript files: exit 0, 0 errors, 18 pre-existing warnings (non-null assertions, `max-lines`, one unused assignment). No new warnings in the product files.
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath` modal, drawer, and rich-select specs: 3 suites, 45 passed.
- Earlier in this lane, also passed: `settings-shared-styles.spec.ts` (5), `provider-list-view.component.spec.ts` (21, including drawer focus on open), `cursor-credential-popover.component.spec.ts` (17), and the wizard test "asks before discarding, and Keep editing keeps the setup" (1 passed, 73 skipped).
- Playwright e2e, `nx`, `npm run verify`, build, and serve were not run.

## Limits

- CI is the remaining proof that the portaled drawer body is hittable and that modal initial focus lands on Keep editing.
- The styles comment above the disabled rules still describes only `ptah-settings`. The selectors include `.ptah-settings-overlay`.
