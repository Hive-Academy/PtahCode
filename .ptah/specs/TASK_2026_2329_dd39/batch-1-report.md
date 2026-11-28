# Batch 1 report — Shared CDK overlay primitives

## Implementation

Rich select, native popover, and the existing CDK popover and dropdown use the shared connected placement policy. The policy sets an 8 px viewport margin and enables preferred and fallback placements, flexible sizing, and repositioning. The rich-select pane matches its field width within the viewport cap and scrolls its options independently of its search input. The modal and drawer use CDK Dialog with centered and side layouts. Projected body, header, footer and action content retain their Angular context. Registered dialog, drawer and popover scroll areas reposition connected children.

CDK dispatches Escape to the active overlay. A select consumes a pointer dismissal before its parent backdrop sees the same click. Closing a select returns focus to its trigger. Closing or destroying a parent detaches open connected children and restores the parent's previous focus. Select detach releases its resize observer and type-ahead timer. The renderer applies theme tokens to the portaled panels and uses the CDK drawer backdrop and popover wrapper selectors.

## Files changed

- `apps/ptah-extension-webview/src/styles.css`
- `libs/frontend/ui/src/lib/form-controls/form-controls-layout.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-compact.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-look.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts`
- `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.spec.ts`
- `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts`
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts`
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts`
- `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.spec.ts`
- `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.ts`
- `libs/frontend/ui/src/lib/overlays/popover/popover.component.spec.ts`
- `libs/frontend/ui/src/lib/overlays/popover/popover.component.ts`
- `libs/frontend/ui/src/lib/overlays/shared/overlay-positions.ts`
- `libs/frontend/ui/src/lib/patterns/editable-section/editable-section.component.spec.ts`

## Shared overlay API

| Selector | Inputs and content | Outputs and access |
| --- | --- | --- |
| `ptah-select` | `options`, `value`, `label`, `labelledBy`, `placeholder`, `searchable`, `searchPlaceholder`, `emptyText`, `clearable`, `disabled`, `invalid`, `size`, `compareWith`, `triggerId` and the existing option-icon template. | Supports `[(value)]` and the existing Angular forms CVA. The trigger's `aria-controls` resolves the open listbox. |
| `ptah-native-popover` | `isOpen`, `placement`, `anchor`, `offset`, `hasBackdrop`, `backdropClass`, `keepInViewport`, `capToViewport`. Projects `[trigger]` and `[content]`. | `opened` fires after the panel is attached and focused. `closed` requests the caller set `isOpen` false. `backdropClicked` reports a backdrop dismissal. `panel()` exposes the open panel as an `ElementRef<HTMLElement>`. `reposition()` and `reattach()` schedule a placement update after render. |
| `ptah-native-modal` | `isOpen`, `ariaLabel`, `ariaLabelledby`, `size` (`sm`, `md`, `lg`), `layout` (`plain`, `shell`). Projects `[modal-header]`, the default body and `[modal-footer]`. | `closed` requests the caller set `isOpen` false. `panel()` exposes the open modal box. |
| `ptah-native-drawer` | `isOpen`, `side` (`left`, `right`), `widthClass`, `ariaLabel`, `showCloseButton`, `closeOnEscape`, `closeOnBackdrop`. Projects `[drawer-header]`, the default body and `[drawer-footer]`. | `opened` fires after attachment. `closed` requests the caller set `isOpen` false. `panel()` exposes the open drawer panel. |
| `ptah-popover` | `isOpen`, `position`, optional CDK `positions`, `hasBackdrop`, `backdropClass`. Projects `[trigger]` and `[content]`. | `opened`, `closed`, `backdropClicked`, and the existing `popoverContent()` query. |
| `ptah-dropdown` | `isOpen`, CDK `positions`, `hasBackdrop`, `backdropClass`, `closeOnBackdropClick`. Projects `[trigger]` and `[content]`. | `opened`, `closed` and `backdropClicked`. |

### Consumer handoff

- Batch 2 can use the existing select and popover bindings inside the lanes table and its expanded row. Apply width constraints to projected popover content and pass the Defaults button as `anchor` if it is rendered outside the trigger slot.
- Batch 3 can project a `ptah-select` into the modal or drawer body and keep submit and navigation actions in the original slots. Use the modal's `panel()?.nativeElement` for the tier mapping editor's post-render focus query.
- Batch 4 can use the native popover's `panel()?.nativeElement` for Main agent and Setup picker focus and measurements. Keep anchor queries on the caller host. When projected content manages its own scrolling, set `[capToViewport]="false"` and call `reposition()` after a content or layout change. For tests, query the open `panel()` or the fixture's CDK `OverlayContainer` and use real keyboard and backdrop events.

## Checks

| Check | Final result |
| --- | --- |
| Focused UI Jest command with all 10 Batch 1 spec paths | 10 suites passed, 0 failed. 124 tests passed, 0 failed. |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` | Passed, 0 errors. |
| `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` | Passed, 0 errors. |
| `npx eslint` on the 18 changed TypeScript files | Exited 0 with no file diagnostics. The Nx module-boundary rule was skipped because its project graph was unavailable. |
| Scoped `ptah_get_diagnostics` | 0 diagnostics in requested implementation files. The service reported 13 errors in sibling UI specs and shared files, outside this batch. |
| Electron chat and nested settings smoke | Pending. No Electron renderer with the Batch 1 sources was running. |

The Jest fixtures exercise search focus in a modal, drawer and anchored popover, preferred and flipped positions at all four simulated viewport corners, width matching and the viewport cap setting, scroll-triggered reposition, dismissal order, focus return, close/reopen and destroy cleanup.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Expose the attached panel through a read-only signal on each native shell. | The Batch 3 and 4 focus and sizing code needs a stable query root after the CDK portal attaches. A component reference gives the caller the correct instance when more than one shell is open. Document queries and host-relative DOM queries were the other options. | Yes, callers can move to local template references once those references cover their focus and measurement needs. |
| Use CDK's default overlay insertion policy. | CDK uses the browser top layer where available and uses its overlay container on older hosts. Per-shell insertion would put existing consumers on different DOM contracts depending on feature support. | Yes, the insertion policy can change behind the same component API. |
| Enable CDK push for capped native popovers. | A capped panel near an edge must stay in the viewport after preferred and fallback placements are exhausted. Uncapped content can still opt into push with `keepInViewport`. | Yes, the push behavior is controlled in the connected position strategy. |

## Open risks

- Electron interaction, actual panel dimensions against each edge, and light, dark and glass rendering still need the chat UI and nested settings smoke check. Jest's simulated geometry does not provide rendered evidence.
- Main agent reassignment, Setup picker focus and tier mapping focus use host-local queries today. The relevant consumer batches own those files and need to use the attached panel when querying projected content.
