# Fix review 2 — TASK_2026_2329_dd39

Outside click on an open rich-select no longer pulls focus back to the trigger when the click already focused another control. The Main agent editor now has Tab and Shift+Tab coverage for the parent popover with the model list closed and open. No production change was required for that Tab path.

`angular-frontend-patterns` and `ui-ux-designer` were not in this session's skill list. The lane's Angular and CDK guidance was applied directly. Ptah search and read tools covered the workspace sources. The CDK focus-trap and outside-click sources were read with PowerShell `Select-String` because `ptah_grep` rejects `node_modules`. `ptah_get_diagnostics` was still running after 45s on retry; Jest compiled both specs.

`libs/frontend/ui/src/lib/native/modal/` was not edited.

## Finding 1 — rich-select outside click

`onOutsideClick` still calls `claimOverlayDismissal` before it closes, so one click dismisses one layer. It focuses the trigger only when `document.activeElement` is null, disconnected, `document.body`, `document.documentElement`, or inside the open overlay pane. A control that already holds focus is left alone.

Regression in `rich-select.component.spec.ts`:

- Focus Check connection, dispatch its click: the list closes and that button keeps focus.
- Focus the portaled search, click a non-focusable pad: the list closes and focus returns to the trigger.

## Finding 2 — Main agent Tab boundaries

Added to `main-agent-reassign-popover.component.spec.ts`, next to the existing model-list Escape test (that test is unchanged). jsdom does not move focus on Tab, so the spec focuses the next tab stop and stubs `getClientRects` so the CDK anchors wrap. That is the same approach as the modal spec.

- List closed: Tab from Cancel wraps to Check connection. Shift+Tab from Check connection wraps to Cancel. The list stays closed and the popover stays open.
- List open: the same two wraps leave the list open and the popover open.
- Tab from the open model field does not prevent the default, closes only the list, and lands on the first effort button (default). Shift+Tab lands on Save provider to This workspace…. The popover stays open.

No production bug showed up. The backdrop popover's CDK trap already wraps the parent ends, and the model field already closes on Tab without taking focus.

## Files

| File | Change |
| --- | --- |
| `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts` | Outside click restores the trigger only when focus would be stranded |
| `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts` | Outside-click focus regression (other control, and focus still in the panel) |
| `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts` | Parent Tab / Shift+Tab boundaries with the model list closed and open, and where focus lands when leaving the list |

## Checks

Commands used `--runInBand --coverage=false --runTestsByPath`. No `nx`, `npm run verify`, commit, or push. `npx.cmd` was used because of the Windows execution policy.

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/ui/jest.config.ts --runTestsByPath libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts` | Pass. 1 suite, 11 passed, 0 failed |
| `npx jest --config libs/frontend/chat/jest.config.ts --runTestsByPath libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts` | Pass. 1 suite, 72 passed, 0 failed |
| `npx eslint` on the three files above | Exit 0. No errors or warnings |

Real Electron Tab order was not exercised. The popover assertions drive the CDK trap and the model field's key handler in jsdom.
