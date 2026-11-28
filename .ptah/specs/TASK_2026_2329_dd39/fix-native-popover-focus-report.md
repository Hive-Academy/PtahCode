# Native popover focus restoration

The native popover unconditionally focused the saved opening element during cleanup when focus restoration was enabled. Closing a backdrop-free popover programmatically therefore moved focus from an external input back to the trigger.

Both popovers now share the restoration rule from the legacy fix for thread 4712771087. A connected opening element receives focus when the closing panel contains the active element or when the document's active element is its body or null. The native popover keeps its restoration option and restores focus before unregistering panel ownership.

## Files

- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts` applies the shared rule during cleanup.
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts` covers external input focus on programmatic close, trigger focus on programmatic close from a panel input, and trigger focus on Escape from the panel.
- `libs/frontend/ui/src/lib/overlays/popover/popover.component.ts` uses the shared implementation for the legacy rule.
- `libs/frontend/ui/src/lib/overlays/shared/restore-popover-focus.ts` implements the rule within the UI library.

## Checks

| Check | Result |
| --- | --- |
| Native popover Jest suite before the fix | The external focus regression reproduced. The trigger received focus and the other 16 tests passed. |
| `npx.cmd tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` | Passed. |
| Focused Jest run with `libs/frontend/ui/jest.config.ts`, `--runInBand --coverage=false --runTestsByPath`, and the native popover, legacy popover, and field specs | All 51 tests passed across 3 suites. |
| `npx.cmd tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` | Passed. |
| `npx.cmd eslint` on all four changed TypeScript files | Passed. |
| `git diff --check` | Passed. |

The Ptah dependency index omitted the native component, so local ripgrep identified the field consumer. The Angular frontend patterns skill was read from the workspace. Verification used the requested focused commands. Electron rendering and screenshots were outside those commands, so focus behavior was verified in Jest.
