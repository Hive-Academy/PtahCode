# G-Settings-UI

## Files changed

All paths below are under `libs/frontend/chat/src/lib/settings/`.

- `providers/provider-consumer-rows.ts` and `.spec.ts` place Setup first and derive the summary, eligibility and recovery copy from the core read-back.
- `providers/provider-consumer-assignments.component.ts` and `.spec.ts` render the picker, commit feedback, recovery actions and Undo.
- `settings.component.ts` and `.spec.ts` route the Setup section to the Providers Background models block.
- `providers/agents-routing-settings.component.ts` and `.spec.ts` update the accessible summary and verify the four-role count and Setup forwarding, with coordinator authorization D37.

## Plan items

- Lines 169–171. Setup is the first row and uses the existing outline cell, picker and curator exclusion list. Its helper names project analysis, skill review, agent generation and guidance. The workspace fallback has its own label and badge.
- Lines 172 and 369–376. Provider-only and model selection are local until Save. Save, Clear and Use workspace model each call `commitSetupPair` once. Undo calls `undoSetupPair` once. The row and feedback read the core signals, which apply the sequence-aware receipt and retain the exact Undo target. The UI tests cover null clears, Undo to Unset, saving, errors and retained drafts.
- Line 173 and design A1. The Setup deep link waits for the row to load, opens the picker and focuses the cell. The read-back's `source` controls whether recovery copy identifies Setup or the workspace and whether reverting to the workspace is offered. The sign-in button forwards the provider to the existing setup action.

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <the four specs above> --silent` passed all 128 tests across four suites.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` passed.
- `ptah_get_diagnostics` timed out twice with all eight files marked unchecked. The focused native TypeScript check above supplied the chat library typecheck.
- `npx eslint <the eight files above>` passed with zero errors and one `max-lines` warning in `provider-consumer-assignments.component.ts`. The inline component was already over the 700-line limit before this change.
- The CLI checks ran sequentially through `node scripts/verify.mjs --exec --task <name> --`.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Keep Setup drafts in the existing picker and save explicitly | The brief names Save and the core atomic pair API. The existing automatic assignment write still applies to Memory curator and Enhancement. | Yes, in the row editor |
| Close the picker after an accepted receipt | Keeping it open would put the Undo action behind the popover backdrop. Closing exposes the saved status and restores focus to the cell. Invalid or failed saves keep the draft and feedback in the open picker. | Yes, in the commit handler |
| Use existing Providers routing precedence | A section-only link opens the Setup editor. A request carrying a provider ID opens the existing sign-in flow without a second popover competing for focus. | Yes, in Settings routing |

## Open items

- The coordinator owns the Electron visual review. The implementation was checked against the written A1 reference for row order, shared picker and focus, workspace fallback, and cause-specific actions.

## Extra reads

- Root `CLAUDE.md` and `package.json` for focused check execution and the verify lock.
- `libs/frontend/chat/src/lib/settings/settings.component.html` for the existing Agents Routing bindings.
- `libs/frontend/core/src/index.ts` and `libs/frontend/core/src/lib/services/{app-state,providers-commit}.service.ts` for the public exports, pending navigation and exact commit feedback.
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts` for the existing picker inputs and selection sentinels.
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts` and `.spec.ts`, and `libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts`, for the timing of focus and the popover opened event.
- `libs/shared/src/lib/providers/provider-registry.ts` for provider display-name resolution.
- `agents-routing-settings.component.ts` and `.spec.ts` were first inspected for consumer impact and then became authorized write files under D37. `ptah_get_dependents` reported its index was still building, so scoped `rg` located the binding and count assertions.
