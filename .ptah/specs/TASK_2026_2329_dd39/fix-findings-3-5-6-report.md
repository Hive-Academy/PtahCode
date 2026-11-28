# Fix findings 3, 5, and 6 — TASK_2026_2329_dd39

Portaled composer menus stay expanded until the last owned overlay closes, connected panels follow unregistered scroll containers, and the native modal spec now walks Tab, Shift+Tab, and nested Escape.

Skill discovery in this session listed no Angular or UI skill (`angular-frontend-patterns`, `ui-ux-designer`). The lane's Angular, CDK, and Electron guidance was applied directly. No Electron renderer was available for a live Tab pass; the focus tests drive the CDK trap and the select's key handler in jsdom.

`cdkScrollable` was not added to `settings.component.html` or `providers-settings.component.ts`. Header tests override `SettingsComponent` imports, and `errorOnUnknownProperties` would reject a new directive there. The scroll fix is generic in `libs/frontend/ui`.

## Finding 3 — composer stays active for a portaled menu

`libs/frontend/ui/src/lib/overlays/shared/connected-overlay-watch.ts` tracks an overlay by the trigger that still lives in the composer. `registerOwnedOverlay` / `ownedOverlayAnchoredIn` / `focusInOwnedOverlay` / `watchOwnedOverlays` are exported from `@ptah-extension/ui`.

`ptah-native-popover` registers its trigger on attach (not the external positioning anchor), attaches the panel before focusing it, and restores the previous focus while the panel is still owned. `ptah-select` registers the same way and releases the registration on detach and destroy.

`ComposerActivityDirective` treats a portaled panel whose trigger is inside the host as inside the composer. It keeps `popoverOpen` true until the last such overlay closes or is destroyed. Focus moves from the portaled panel do not bubble `focusout` to the host, so the directive also listens for `focusin` on the document in the capture phase. A window blur does not fire `focusin`, and `activeElement` stays put, so switching apps does not fold the composer.

## Finding 5 — reposition on unregistered scroll containers

`watchAncestorScroll` listens for `scroll` in the capture phase on the document and directly on the ancestors present at registration. Scroll does not bubble. A burst in one turn shares one `queueMicrotask` reposition. The returned function removes both listeners and drops a queued call.

The listener repositions only when the event target is the document, the window, the scrolling element, the document element, or an element that contains the origin and is not the origin. Scrolling the portaled panel does not reposition through this watcher. The panel's own `cdkScrollable` still does, which is why the specs scroll a child inside the panel or an unrelated pane.

- `ptah-native-popover` calls `overlayRef.updatePosition()` for ancestors of the positioned anchor.
- `ptah-select` does the same for ancestors of its origin.
- `MainAgentReassignPopoverComponent` calls `fitToViewport()` when an ancestor of the popover host scrolls, so a settings or providers pane scroll refits the height from the trigger's position. The nested provider list repositions through the select's own watcher when the editor body scrolls.

## Finding 6 — modal Tab and nested Escape

No production change. `native-modal.component.spec.ts` now:

- Wraps Tab and Shift+Tab inside the dialog while the child select is closed. jsdom does not move focus on Tab, so the test focuses the next tab stop and the CDK anchors wrap. `getClientRects` is stubbed so the interactivity checker treats the controls as visible.
- With the child open, Tab and Shift+Tab from the footer still wrap to the trigger and leave the dialog and the child open.
- Tab and Shift+Tab on the portaled search close only the child, do not prevent the default, and leave focus on the select trigger so the next Tab continues in the dialog. The dialog's `closed` count stays 0.
- The first Escape on the search closes the child and restores the trigger. The next Escape on the trigger requests dialog close. Setting `isOpen` false returns focus to the opener.

Tab on the select trigger while the list is open still closes the list. That is the select's existing panel key handling. The open-child wrap is asserted from the footer, which is not the select's key target.

## Files

| File | Change |
| --- | --- |
| `libs/frontend/ui/src/lib/overlays/shared/connected-overlay-watch.ts` | New ownership registry and ancestor-scroll watcher |
| `libs/frontend/ui/src/lib/overlays/shared/index.ts` | Re-exports the watcher |
| `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts` | Registers the trigger, watches ancestor scroll, restores focus before unregister |
| `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts` | Settings-pane scroll repositions; unrelated and in-panel scrolls do not |
| `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts` | Registers the origin and watches ancestor scroll |
| `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts` | Providers-page scroll repositions; list and unrelated pane do not |
| `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts` | Tab, Shift+Tab, and nested Escape behavior |
| `libs/frontend/chat/src/lib/directives/composer-activity.directive.ts` | Owned-overlay and document `focusin` tracking |
| `libs/frontend/chat/src/lib/directives/composer-activity.directive.spec.ts` | New. Portaled focus, outside focus, last close, destroy |
| `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.streaming-fold.spec.ts` | Streaming attach-menu portal hold; menu queries follow the portal |
| `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.spec.ts` | Lane streaming attach-menu portal hold and refold |
| `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts` | Ancestor scroll refits the popover |
| `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts` | Editor-body scroll repositions the nested list; document scroll refits height to 390px |

Not edited: `settings.component.html`, `providers-settings.component.ts`, `provider-model-picker`, `provider-consumer-*`, canvas, `field.component.spec.ts`, `decision-model-row*`.

## Checks

Commands used `--runInBand --coverage=false --runTestsByPath`. No `nx`, `npm run verify`, commit, or push.

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/ui/jest.config.ts` `native-modal.component.spec.ts` | Pass, 17 tests |
| same config, `native-popover.component.spec.ts` and `rich-select.component.spec.ts` | Pass, 2 suites, 21 tests |
| `npx jest --config libs/frontend/chat/jest.config.ts` directive, `chat-input.streaming-fold`, and `lane-composer` specs | Pass, 3 suites, 98 tests |
| same config, `main-agent-reassign-popover.component.spec.ts` | Pass |
| `npx eslint` on the files in the table above | 0 errors. 5 existing warnings: four `@typescript-eslint/no-non-null-assertion` in `chat-input.streaming-fold.spec.ts`, and `max-lines` on `main-agent-reassign-popover.component.ts` (844 lines, limit 700; the file was already over the limit) |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` | Pass |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Pass |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.spec.json` | Fail on pre-existing errors in other specs (`badge.a11y`, `icon-button`, `list-detail`, `aurora-effect`, `surface-tile`) and BigInt literals under `libs/shared`. None are in the files above |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | Fail on many pre-existing specs. The only hit in a file from this fix is `main-agent-reassign-popover.component.spec.ts:1329`: `AMBIENT_CONNECTED` is missing `transportTimeout` on `ClaudeAmbientStatusView`. That fixture predates the scroll test and was left unchanged |

Jest already compiled and ran the specs this fix added. Real browser Tab order and settings-pane scrolling in Electron were not exercised.
