# Batch G-Storage-Adapters report

## Files changed

- Modified `libs/backend/platform-electron/src/settings/file-settings-store.ts`.
  - `FileSettingsStore` now implements `IGlobalBatchSettingsStore`.
  - `readGlobalMany(keys)` delegates to `fileSettings.getMany(keys)`.
  - `writeGlobalBatch(entries)` returns `fileSettings.setMany(entries)` directly.
- Modified `libs/backend/platform-electron/src/settings/file-settings-store.spec.ts`.
  - Added manager mocks and tests for batch reads, committed-slice identity, and rejection propagation.
- Modified `libs/backend/platform-cli/src/settings/file-settings-store.ts`.
  - Added the same `IGlobalBatchSettingsStore` implementation without changing existing methods.
- Created `libs/backend/platform-cli/src/settings/file-settings-store.spec.ts`.
  - Mirrored the Electron adapter test style and coverage, including the three batch cases.

## Plan items done

- Implemented the storage-adapter part of component 2 from lines 62-75, as amended by Revision 3.2.
- Completed wave W3 dependency item `G-Storage-Adapters` at line 241 after `G-Storage-Core`.
- Satisfied the downstream Setup integration prerequisite described at lines 245 and 275 and repeated at line 349.
- Completed the four write files assigned by the batch row at line 262.
- Applied amendment 3.2 at lines 363-365: both batch writes return the manager's committed slice directly.

## Checks

- `npx jest --config libs/backend/platform-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-electron/src/settings/file-settings-store.spec.ts`
  - PASS: 1 suite, 12 tests.
- `npx jest --config libs/backend/platform-cli/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-cli/src/settings/file-settings-store.spec.ts`
  - PASS: 1 suite, 12 tests.
- `npx tsc --noEmit --project libs/backend/platform-electron/tsconfig.lib.json`
  - PASS: exit 0, no output.
- `npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json`
  - PASS: exit 0, no output.
- `npx eslint libs/backend/platform-electron/src/settings/file-settings-store.ts libs/backend/platform-electron/src/settings/file-settings-store.spec.ts libs/backend/platform-cli/src/settings/file-settings-store.ts libs/backend/platform-cli/src/settings/file-settings-store.spec.ts`
  - PASS: exit 0, no errors. Two unchanged `no-empty-function` warnings remain in the existing `watchSecret` no-op disposers.
- `ptah_get_diagnostics` scoped to the four changed files
  - No diagnostics in the requested files. The tool reported four unrelated errors in sibling files outside this batch: `libs/backend/harness-sync/src/lib/targets/mcp/json-mcp-facet.ts:226`, `libs/backend/vscode-core/src/services/workspace-aware-state-storage.ts:82`, `libs/shared/src/lib/types/provider-account.schemas.ts:118`, and `libs/shared/src/lib/types/session-runtime.schemas.ts:38`.

## Decisions

1. Decision: implement `IGlobalBatchSettingsStore` directly in each existing `FileSettingsStore`.
   - Options: direct implementation or a separate wrapper adapter.
   - Evidence: plan lines 363-365 require direct manager delegation, and both classes already adapt all other manager operations.
   - Reversible: yes; the change is local to each existing adapter.
2. Decision: mirror the Electron spec for the new CLI spec.
   - Options: mirror the full adapter suite or add only batch tests.
   - Evidence: the batch brief requires the same style as the Electron spec, and the adapters expose the same port.
   - Reversible: yes; this is a test-only choice.

## Open items and needed changes in other groups

- No open items for this batch.
- No changes in other groups are needed for the adapter implementation.
- The four sibling diagnostics listed above are outside this batch's write scope and remain for their owning groups.

## Extra reads

- None beyond the brief, named plan ranges, assigned source/spec files, and the completed `settings-store.interface.ts` and `file-settings-manager.ts` inputs.
