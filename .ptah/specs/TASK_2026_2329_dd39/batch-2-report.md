# Batch 2 report — CLI lanes layout and controls

## Implementation

The wide lanes table keeps Model and Network in separate tracks. Permission, Network and Model cells clip to their columns, and the selects inside them can shrink below the shared 8rem control-cell minimum that was painting "CLI default" over the Network select. At 950px and wider the tracks are order 4.25rem, identity 22%, status 18%, permission 14%, network 12%, model 14%, enabled 4.25rem and expander 2.5rem. Fixed tracks are 11rem. Fluid tracks sum to 80%, so the row stays inside a 950px table. Order mode still replaces the first track.

The existing width tiers are unchanged. Below 950px the table collapses. From 640px to 949px the model stays in its own column (10rem) and the status cell (13rem) clips so it cannot paint into Model. Below 640px the model stays under the row identity. The identity header is only `min-width: 0`, so compact model ids can still wrap.

The Ptah group header no longer mounts the compact Permission and Network editors beside Add. One outline Defaults button opens a popover with labeled Permission, Network and Reset. The push group does not wrap, so Defaults and Add stay on one row. Expanding an instance row leaves that header in place and keeps inherited permission and network as read-only detail text.

Full-access confirmation uses `ptah-native-modal` (size sm). Confirm is primary with warning tone. Cancel is ghost. The caller still owns the pending choice, and the same selected and reset outputs fire.

The Claude account menu and the Cursor credential key are portaled by the Batch 1 popover. Keyboard movement reads menu items from the overlay panel identified by this cell's title, and opening Credentials focuses the key in the document. Specs that still looked inside the host, or for a native `dialog[open]`, now query `.cdk-overlay-pane` and `.cdk-dialog-container`.

`lanes-table.component.ts` and `lane-model-effort-cell.component.ts` were left as they are. The ResizeObserver model column and the model cell's flex layout were already correct. Setting `display: block` on the model cell would override `.lane-model-value { display: flex }`.

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`

Not edited from this batch's file list: `lanes-table.component.ts`, `lane-model-effort-cell.component.ts`. Batch 1 overlay files and Batch 3 and Batch 4 files were not edited.

## Checks

| Check | Final result |
| --- | --- |
| Focused chat Jest command with all 7 Batch 2 spec paths, `--runInBand --coverage=false` | 7 suites passed, 0 failed. 210 tests passed, 0 failed. 47.9s. |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Passed, exit 0. |
| `npx eslint` on the 12 changed files | Exit 0. 0 errors, 39 warnings. The Nx module-boundary rule was skipped because its project graph was unavailable. `lanes-table.component.css` is ignored (no matching ESLint config). |
| Scoped `ptah_get_diagnostics` | No errors in the changed implementation files (`cli-lane-default-cell.component.ts`, `claude-lane-account-cell.component.ts`, `lanes-table-detail.component.ts`). The HTML template is not a recognized diagnostics language. Spec fixtures report pre-existing type drift (`transportTimeout`, `cliLaneDefaults`, `auto-edit`, `CliPermissionNote.label`) that `tsconfig.lib.json` does not include and that Jest still runs. One spec error from `querySelectorAll` returning `Element` was fixed afterward by typing the node as `HTMLButtonElement`. The service also reported sibling chat errors outside this batch (383 errors in the full scoped project result). |
| Electron layout smoke at 400px, ~640px, ~950px and wide | Not run. This lane does not start a renderer. |

The visual spec asserts the wide column widths, model-cell clipping, and that the model cell and the permission and network cells are distinct DOM nodes. jsdom does not compute used widths, so it does not prove painted bounds.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Add `layout="defaults"` on the existing lane-default cell. | The plan keeps group defaults on the current cell. A new component would duplicate permission, network, reset and the full-access confirm. The header previously used `layout="compact"`, which stacked both selects beside Add. | Yes. The other layouts are unchanged. |
| Put the Defaults button in the popover trigger slot. | Batch 1 says to pass `anchor` only when the button is outside the trigger slot. The button is the trigger, so no external anchor is set. The menu width is `min(16rem, calc(100vw - 1rem))`. | Yes. An external anchor can be passed later without changing the outputs. |
| Size the wide row with semantic column classes and a fixed-plus-percent budget. | The shared control cell sets `min-width: 8rem` on `ptah-select`. A ~12% Network track is narrower than that, so the select painted over Model. Percent tracks that also added a fixed expander overflowed 950px. Order mode's later first-column rule still wins. | Yes. The class names and widths live in the lanes stylesheet. |
| Move full-access confirmation onto `ptah-native-modal`. | The plan retires the native `<dialog>` in this cell. Size sm, warning Confirm and ghost Cancel match the existing button tones. `cancel()` returns immediately when nothing is pending, so the modal's destroy `closed` event does not emit twice. | Yes. The pending, selected and reset outputs are unchanged. |
| Resolve portaled menu items and the credential key outside the host. | Batch 1 projects `[content]` into the CDK overlay. Host `querySelector` no longer sees the account menu or the Cursor key. The account cell finds its own menu by title id. Credential focus uses the document. | Yes. A view query can replace the document lookup if the overlay starts exposing the projected nodes on the host. |

Skill discovery: the host catalogue has no loadable `angular-frontend-patterns` or `ui-ux-designer` skill. Those names exist only as agent definitions. This batch followed `implementation-plan.md` and the lanes table's existing column and overlay patterns.

## Open risks

- Electron was not smoked. Painted overlap at 400px, ~640px, ~950px and wide, and the open Defaults menu beside an expanded row, still need a renderer. Jest covers the CSS contract and the DOM structure.
- `cli-lane-default-cell.component.ts` is 814 lines. ESLint warns above 700 (`max-lines`). The warning is non-failing. Splitting the confirm shell out was not part of this batch.
- Specs still carry non-null assertions and fixture types that disagree with current shared models. ESLint reports those as warnings. The library typecheck does not include the specs.
- The worktree `node_modules` is a junction to `D:\projects\PtahCode\node_modules` so Jest can resolve `marked`. It is not a source change and should not be committed.
