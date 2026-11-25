# G-Settings-Core-Commit-State

## Files changed

- `libs/frontend/core/src/lib/services/providers-commit.service.ts` and its spec
- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts` and its spec

## Plan items

- Plan lines 169–172 and 369–376. Save, Clear, and Undo each issue one `wizard:set-setup-model` call. Clear and Undo to Unset send explicit empty provider and model values. The row applies the returned effective state and exact committed receipt.
- Plan lines 371–376, 382, and C1 line 679. Older receipts leave the current row, saved notice, and Undo target intact. Undo captures the prior pair at dispatch and verifies the committed pair or null in its response.
- Settings loads the row via `wizard:get-setup-model` on open and refresh. A successful write supersedes already-running reads. The typed `SETUP_MODEL_INVALID` write error produces fixed, actionable feedback.

## Public API

These APIs are on `ProvidersSettingsStateService` via `@ptah-extension/core`.

| API | Type and behavior |
| --- | --- |
| `setupModel` | `Signal<ProvidersSettingsSection<ProvidersSetupRowState>>`. The data contains `state: SetupPairState`, `committed: ModelPair \| null`, and `commitSeq: number`. |
| `setupCommit` | `Signal<ProvidersSetupCommitState>`. Status is `idle\|saving\|saved\|invalid\|failed` with `message: string \| null`. |
| `setupUndoEntry` | `Signal<ProvidersSetupUndoEntry \| null>`. The entry contains `targetPair`, `committedReceipt`, and `commitSeq`. |
| `refreshSetupModel()` | `Promise<void>`. Also runs from `open()` and `refresh()`. |
| `commitSetupPair(pair: ModelPair \| null)` | `Promise<boolean>`. Use null to clear. True means a receipt was accepted for display. |
| `undoSetupPair()` | `Promise<boolean>`. True means Undo applied and verified its receipt. |

## Checks

- `ptah_get_diagnostics` scoped to the four files reported zero diagnostics in those files. It reported 115 errors in sibling files, including mock typing errors in unrelated specs.
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-commit.service.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` passed both suites and all 190 tests. Node emitted an ES-module loader warning for the Jest config.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` passed.
- `npx eslint libs/frontend/core/src/lib/services/providers-commit.service.ts libs/frontend/core/src/lib/services/providers-commit.service.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` passed with zero errors and one `max-lines` warning. The settings facade already exceeded the 700-line limit.
- The three focused CLI commands ran sequentially under `node scripts/verify.mjs --exec --task <name> --`.

## Decisions

- Seed the prior committed pair from typed GET state until the first local receipt. The GET contract carries only effective state, and Unset carries a workspace fallback. The receipt becomes the committed baseline once available. Reversible within the services.
- Keep Setup write feedback separate from generic Providers commit feedback. The existing pipeline permits one save at a time, and Setup must handle overlapping writes through the receipt sequence. Reversible within the services and their UI binding.
- Apply a newer Undo receipt as the committed state even when its pair fails verification. Show failed feedback in that case. The host receipt describes a completed transaction, and it supplies the sequence floor for late responses. Reversible within the commit service.

## Open items

- G-Settings-UI owns the row rendering and call sites and can use the public API above.
- Undo to a prior pair that is now invalid remains subject to host validation and reports the typed invalid feedback.

## Extra reads

- Root `CLAUDE.md` for workspace and check rules.
- `providers-settings-sections.ts` for the existing workspace-scoped read store and safe error behavior.
- `claude-rpc.service.ts` for the typed result and error code.
- `libs/frontend/core/src/index.ts` for the public barrel. Ptah's dependent index was still building, so a scoped `rg` for import literals confirmed current direct callers.
