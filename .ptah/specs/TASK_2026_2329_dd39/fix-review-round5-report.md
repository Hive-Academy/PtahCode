# PR #1517 round 5 review fixes

| Thread | Verdict | Files changed | PR reply |
| --- | --- | --- | --- |
| `PRRT_kwDOPngTds68kf-g` | Fixed | `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`, `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.spec.ts` | The rich model select is disabled during catalogue loads, and the selection handler blocks cached choices from being saved during a retry. |
| `PRRT_kwDOPngTds68kf-o` | Fixed | `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`, `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.spec.ts` | Outside dismissal now marks the Angular Forms control touched and preserves focus on the clicked control. |
| `PRRT_kwDOPngTds68kf-u` | Fixed | `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts`, `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts` | The popover now repositions when its panel resizes and disconnects the observer on close or destroy. |

## Checks

- Focused Jest run passed all 108 tests across the three changed specs.
- `npx.cmd tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` passed.
- ESLint passed on all six changed TypeScript files.
- Electron visual review was unavailable. No visible Electron window was available in this session, and the task prohibited build and serve commands.

PowerShell blocked the `npx.ps1` shim, so the checks used `npx.cmd`. Shell reads supplemented Ptah's symbol reads while the dependency index was building.
