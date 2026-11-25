# Batch G-Storage-Core Report — TASK_2026_2325_899d

## Files Changed
- `libs/backend/platform-core/src/file-settings-keys.ts` — registered global keys `'setup.provider'` and `'setup.model'` in `FILE_BASED_SETTINGS_KEYS` and `FILE_BASED_SETTINGS_DEFAULTS` (default `''`).
- `libs/backend/platform-core/src/file-settings-manager.ts` — left `set()` unchanged per Coordinator Amendment C1; extracted `persistImage(image)` (shared with `persist()`); added `getMany(keys)` and `setMany(entries)` returning a frozen `committedSlice`.
- `libs/backend/platform-core/src/file-settings-manager.spec.ts` — added unit tests for `setup.*` keys, `getMany`, `setMany`, overlapping FIFO `committedSlice`, failure preservation, interleaved `set()`/`setMany()`, routing generation on `setMany()`, and unchanged `set()` optimistic/rollback behavior.
- `libs/backend/settings-core/src/ports/settings-store.interface.ts` — kept `ISettingsStore` unchanged; added narrow `IGlobalBatchSettingsStore` (`readGlobalMany`, `writeGlobalBatch` returning `Promise<Readonly<Record<string, unknown>>>`) and `isGlobalBatchSettingsStore` type guard.
- `libs/backend/settings-core/src/reactive/reactive-settings-store.ts` — implemented `IGlobalBatchSettingsStore` on `ReactiveSettingsStore` with `readGlobalMany` and FIFO-published `writeGlobalBatch` (updates all committed keys in `globalCache` synchronously before emitting on `globalEmitter`, returns `committed`).
- `libs/backend/settings-core/src/settings-core.spec.ts` — added unit and file-backed tests for `isGlobalBatchSettingsStore`, `ReactiveSettingsStore.writeGlobalBatch` (committed slice, publish-before-emit, FIFO out-of-order backend guard, failure rollback/isolation, non-batch rejection), `readGlobalMany`, and `PtahFileSettingsManager` Undo/restart round-trip.

## Plan Items Done
- **Component 2 — Setup global keys** (`implementation-plan.md:66`): registered `'setup.provider'` and `'setup.model'` with `''` default in `FILE_BASED_SETTINGS_KEYS` and `FILE_BASED_SETTINGS_DEFAULTS`.
- **Component 2 + Amendment 3.2 — Narrow batch port** (`implementation-plan.md:67,364`): added `IGlobalBatchSettingsStore extends ISettingsStore` (`readGlobalMany`, `writeGlobalBatch` returning `Promise<Readonly<Record<string, unknown>>>`) and `isGlobalBatchSettingsStore` in `settings-store.interface.ts` without modifying `ISettingsStore`.
- **Component 2 + Amendment 3.2 + Coordinator Amendment C1 — `PtahFileSettingsManager.setMany` / `getMany` and unchanged `set()`** (`implementation-plan.md:68-70,358-362,671-679`):
  - `set(key, value)` is unchanged (optimistic update, queued `persist()`, generation/epoch rollback on failure).
  - `setMany(entries)` captures `Object.entries(entries)` at call time, chains onto `this.writePromise`, constructs immutable `nextImage = { ...this.settings, ...entries }` inside the queued step, persists only `nextImage` via `persistImage()` (unique temp file + `renameWithRetry`), and only after rename succeeds assigns each entry into `this.settings`, advances `writeGenerations` (and `routingConfigurationGeneration` when a routing key is in `entries`), fires watchers synchronously in one turn, and returns the frozen `committedSlice`. On failure removes the temp file, leaves memory and disk unchanged for those keys, fires no watchers, and throws `SettingsPersistError`.
  - `getMany(keys)` reads keys synchronously in one turn using `get(key)` lookup semantics.
- **Component 2 + Amendment 3.2 — `ReactiveSettingsStore.writeGlobalBatch` & `readGlobalMany`** (`implementation-plan.md:67,71,366`):
  - Implemented `IGlobalBatchSettingsStore` on `ReactiveSettingsStore`.
  - `writeGlobalBatch(entries)` rejects explicitly when the underlying backend does not satisfy `isGlobalBatchSettingsStore`, starts `backend.writeGlobalBatch` and chains cache/event publication onto `batchPublicationQueue` in FIFO commit order, updates all keys from `committed` in `globalCache` synchronously before emitting on `globalEmitter`, and returns `committed`.
  - `readGlobalMany(keys)` returns cached entries and fetches uncached keys via `backend.readGlobalMany` (falling back to `backend.readGlobal` on plain `ISettingsStore` backends).
- **Verification specs** (`implementation-plan.md:97,378-379,678`):
  - `file-settings-manager.spec.ts`: includes `set() behavior is unchanged (optimistic read-after-set, rollback on failure)`, `overlapping setMany() returns each call's own committedSlice in FIFO order`, `failed setMany() leaves disk and memory unchanged`, `setup.*` registration/Undo/restart, interleaved `set()` + `setMany()`, and routing generation behavior. Excluded the C1-removed test `set() failure does not leak through an earlier queued set()`.
  - `settings-core.spec.ts`: includes `ReactiveSettingsStore.writeGlobalBatch returns committedSlice and publishes all keys before emitting`, `isGlobalBatchSettingsStore` guard, FIFO out-of-order backend publication, failure preservation, non-batch backend rejection, `readGlobalMany`, and file-backed Undo/restart round-trip.

## Check Commands & Results
1. `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-manager.spec.ts`
   - **PASS**: 1 suite passed, 57/57 tests passed.
2. `npx jest --config libs/backend/settings-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/settings-core/src/settings-core.spec.ts`
   - **PASS**: 1 suite passed, 51/51 tests passed.
3. `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json`
   - **PASS**: exit code 0, 0 errors.
4. `npx tsc --noEmit --project libs/backend/settings-core/tsconfig.lib.json`
   - **PASS**: exit code 0, 0 errors.
5. `npx eslint libs/backend/platform-core/src/file-settings-keys.ts libs/backend/platform-core/src/file-settings-manager.ts libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/settings-core/src/ports/settings-store.interface.ts libs/backend/settings-core/src/reactive/reactive-settings-store.ts libs/backend/settings-core/src/settings-core.spec.ts`
   - **PASS**: exit code 0, 0 errors (14 pre-existing warnings on untouched lines; 0 warnings on changed lines).
6. `ptah_get_diagnostics` (scoped to all 6 changed files)
   - **PASS**: 0 errors, 0 warnings in all 6 requested files (2 pre-existing sibling spec errors in untouched `migration-edge-cases.spec.ts` and `v4-migration.spec.ts`).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Assigning each `setMany` entry into `this.settings[key]` post-rename rather than replacing `this.settings = nextImage` | Replace `this.settings = nextImage` (clobbers unrelated keys written optimistically by an interleaved `set()` during `setMany`'s I/O); assign each `entries` key into `this.settings` post-rename | Coordinator Amendment C1 (`implementation-plan.md:675-676`) keeps `set()` optimistic and explicitly specifies "assigns each entry into `this.settings`" | Yes |
| Rejecting explicitly in `ReactiveSettingsStore.writeGlobalBatch` when wrapping a non-batch backend | Silently degrade to sequential `writeGlobal` calls (breaks atomicity guarantee); throw an actionable error when `!isGlobalBatchSettingsStore(this.backend)` | Plan line 74 (`commitSetupPair` requires atomic batch store) and coding standards (propagate actionable failures at boundaries) | Yes |
| Decoupling `backend.writeGlobalBatch` invocation from FIFO `batchPublicationQueue` in `ReactiveSettingsStore` | Queue backend calls inside `ReactiveSettingsStore` vs start `backend.writeGlobalBatch` immediately in call order and serialize cache/emit publication in FIFO order | Plan 3.2 line 366 ("chains cache publication in FIFO commit order; awaits `const committed = await this.backend.writeGlobalBatch(entries)`"); guarantees FIFO publication even under out-of-order backend mocks while preserving backend-level queuing on `PtahFileSettingsManager` | Yes |
| Mocking `fs/promises` `rename` via module factory override in `file-settings-manager.spec.ts` | `jest.spyOn(fsPromises, 'rename')` (fails with `TypeError: Cannot redefine property: rename` on ESM namespace object); module-level `jest.mock('fs/promises', ...)` delegating to `actual.rename` unless overridden per test | Verified against Jest runtime in `file-settings-manager.spec.ts` (matches existing `jest.mock('os', ...)` pattern at lines 49-55) | Yes |

## Open Items & Needed Changes in Other Groups
- **Needed barrel export in `libs/backend/settings-core/src/index.ts` (outside `G-Storage-Core` write-file list):**
  `libs/backend/settings-core/src/index.ts` currently exports only `export type { ISettingsStore } from './ports/settings-store.interface';` (line 5). Because `G-Storage-Core` is restricted to its 6 write files and no other batch row lists `libs/backend/settings-core/src/index.ts`, that file was not modified here. Before `G-Storage-Adapters` (`libs/backend/platform-electron/src/settings/file-settings-store.ts`, `libs/backend/platform-cli/src/settings/file-settings-store.ts`) imports `IGlobalBatchSettingsStore` via `@ptah-extension/settings-core`, the coordinator (or `G-Storage-Adapters` / `G-Setup-Scope-Resolver`) needs to export:
  ```ts
  export type {
    ISettingsStore,
    IGlobalBatchSettingsStore,
  } from './ports/settings-store.interface';
  export { isGlobalBatchSettingsStore } from './ports/settings-store.interface';
  ```

## Extra Reads
- `libs/backend/settings-core/src/index.ts` — checked public exports of `settings-store.interface.ts` (discovered missing barrel export noted above).
- `libs/backend/platform-core/src/index.ts` — confirmed `PtahFileSettingsManager`, `FILE_BASED_SETTINGS_KEYS`, `FILE_BASED_SETTINGS_DEFAULTS`, and `SettingsPersistError` are already publicly exported.
- `libs/backend/platform-core/src/file-settings-errors.ts` — verified `SettingsPersistError` constructor and error contract.
- `libs/backend/platform-electron/src/settings/file-settings-store.ts` — verified how Electron adapter imports `ISettingsStore` from `@ptah-extension/settings-core`.
- `libs/backend/platform-cli/src/settings/file-settings-store.ts` — verified how CLI adapter imports `ISettingsStore` from `@ptah-extension/settings-core`.
