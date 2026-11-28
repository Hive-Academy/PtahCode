# Code logic review, round 2

**Verdict: CHANGES**

## Findings

### 1. Minor — Dismissing a rich-select list by clicking another control steals focus from the clicked control

`libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts:60` wires CDK's outside-click event to `onOutsideClick`. The handler at `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts:279` now calls `close(true)`, which focuses the select trigger at line 210. The previous outside-click path used `close(false)`. In Chromium, a pointer click can focus another field on mouse down before CDK processes the click. For example, open Provider connection in the Main agent editor and click Check connection (`libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html:75` and `:37`). Closing the provider list moves keyboard focus back to Provider connection, interrupting keyboard navigation from the clicked control. The same handler applies to selects inside a modal.

**Fix.** Keep `claimOverlayDismissal` so one click dismisses one layer. Preserve focus when it has already moved to another control. Restore the trigger when dismissal would otherwise strand focus in the detached panel or on the body. Add a regression that focuses another control before dispatching its click and verifies that only the list closes and the clicked control retains focus.

### 2. Minor — Main agent still lacks the Tab-boundary coverage requested in round one

The editor uses a backdrop-enabled native popover at `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html:1`, which enables the shared CDK focus trap at `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:61`. The Main agent specs add ancestor and nested-list scroll coverage at `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts:348` and exercise successive Escapes at `:941` and `:944`. They still have no forward or backward Tab assertions with the child closed or open.

**Fix.** Add an Electron interaction test that traverses both parent boundaries with Tab and Shift+Tab, repeats with the child open, and verifies where focus lands when leaving the child. Keep the existing child-first Escape assertions. This is a coverage defect. Actual Electron Tab traversal was unavailable for this review.

## Round-one verification

| Finding | Result |
| --- | --- |
| 1. Unusable saved OpenRouter override | Fixed for the reviewed auth-fallback case. The row derives a ready active provider for the unavailable saved override, and the editor passes the fallback separately from the selected provider. See `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:212` and `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:258`. |
| 2. Static model shown for an unresolved tier | Fixed. The row and picker render the tier alias for unpinned roles. The picker no longer resolves the label through the provider's factory tier map. |
| 3. Streaming composer compacts during a portaled menu | Fixed for the current chat and lane attachment menus. The native popover registers its trigger and panel, and the directive observes ownership and document focus. The directive removes the subscription and both event listeners on destroy. The helper is reachable through the shared, overlays, and public UI barrels. |
| 4. Canvas rail menu migration | Fixed. The card queries menu items from the projected menu reference and applies rename padding to the attached panel. The Canvas rail spec passed all 56 tests in this worktree. |
| 5. Settings and editor-body scroll | Fixed for the reported scroll paths. Native popover and rich-select watch the positioned origin, both stop their watches on close or teardown, and the Main agent editor refits on ancestor scroll. Its editor-body reposition and viewport refit assertions passed. |
| 6. Tab boundaries and nested focus | Partial. Main agent coverage still has the gap above. NativeModalComponent and its in-progress focus-trap changes were excluded as requested. |

I traced nested pointer dispatch through the installed CDK. Connected overlays have an outside-pointer subscription, and CDK stops scanning older overlays when the click is inside the child pane. The enclosing backdrop is a separate element. I found no parent-dismissal path for a click inside the reviewed connected child. The ownership registry supplies composer activity, while CDK handles pointer dispatch.

Reviewed the scoped `git diff main -- <paths>` and used Git's no-index diff to inspect the two new untracked files. Focused Jest passed for ComposerActivityDirective and Main agent (72 tests), and Canvas rail (56 tests). Electron browser status showed no connected renderer. The pointer-focus finding follows from the handler and event ordering and was not reproduced in Electron. Ptah handled source reads and searches. Native Git handled worktree diffs, and PowerShell's execution policy required using the Windows `npx.cmd` shim for Jest. No CLI skill discovery mechanism was exposed in this session.
