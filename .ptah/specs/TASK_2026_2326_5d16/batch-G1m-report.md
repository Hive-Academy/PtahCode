# Batch B04 (Settings Persistence) Report — TASK_2026_2326_5d16

Status: complete

## Files Changed

- `libs/backend/platform-core/src/file-settings-keys.ts`
  - Added `agentOrchestration.decisionModelPrefillTokensPerSecond` and `agentOrchestration.routingRules` to `FILE_BASED_SETTINGS_KEYS`.
  - Added `agentOrchestration.routingRules` to `FILE_BASED_OBJECT_SETTINGS_KEYS` so `flattenObject` keeps whole raw values (both arrays and malformed top-level plain objects) intact for router validation.
  - Added `'agentOrchestration.routingRules': []` to `FILE_BASED_SETTINGS_DEFAULTS`; left `agentOrchestration.decisionModelPrefillTokensPerSecond` absent from `FILE_BASED_SETTINGS_DEFAULTS` (no default; `undefined` means measure).
- `libs/backend/platform-core/src/file-settings-manager.ts`
  - Added `agentOrchestration.decisionModelPrefillTokensPerSecond` and `agentOrchestration.routingRules` to `ROUTING_KEYS` (which lives in `file-settings-manager.ts:50-56` and drives `getRoutingConfigurationGeneration()` across in-process writes, failed-persist rollbacks, and cross-process watch reloads).
- `libs/backend/platform-core/src/file-settings-manager.spec.ts`
  - Added 3 unit tests covering defaults, whole-value round-trip (arrays with invalid object-shaped entries and invalid top-level plain objects), absent prefill default + numeric round-trip, and routing generation increments on both in-process `set()` and cross-process `fs.watch` reload.
- `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts`
  - Added `agentOrchestration.decisionModelPrefillTokensPerSecond` and `agentOrchestration.routingRules` to `KNOWN_CONFIG_KEYS`.
- `libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts`
  - Added 1 unit test asserting `KNOWN_CONFIG_KEYS` contains both `agentOrchestration.routingRules` and `agentOrchestration.decisionModelPrefillTokensPerSecond`.

Note: `ROUTING_KEYS` lives exclusively in `libs/backend/platform-core/src/file-settings-manager.ts`. Both `ElectronWorkspaceProvider` (`libs/backend/platform-electron/src/implementations/electron-workspace-provider.ts:90-92`) and `CliWorkspaceProvider` (`libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts:95-97`) delegate `getRoutingConfigurationGeneration()` directly to `PtahFileSettingsManager`, so no other files required changes.

## Tests Added

- `libs/backend/platform-core/src/file-settings-manager.spec.ts` (3 new `it` blocks):
  1. `defaults routingRules to [], keeps prefill rate absent, and bumps routing generation on write` — verifies `isFileBasedSettingKey`, `FILE_BASED_SETTINGS_KEYS`, `FILE_BASED_OBJECT_SETTINGS_KEYS`, default `[]` for `agentOrchestration.routingRules`, absent default (`undefined`, `has() === false`, not in `FILE_BASED_SETTINGS_DEFAULTS`) for `agentOrchestration.decisionModelPrefillTokensPerSecond`, synchronous routing generation increments on writing each key, and numeric persistence across reload.
  2. `round-trips routingRules arrays with invalid object entries and invalid top-level objects unchanged` — verifies an ordered array containing a valid rule and an invalid nested object entry round-trips verbatim with no flattened `.0` / `.0.id` keys, and verifies a malformed top-level plain object in `settings.json` reloads whole without flattening or falling back to `[]`.
  3. `increments routing generation on cross-process watch updates to routingRules and prefill rate` — verifies cross-process `fs.watch` reload fires listeners and bumps `getRoutingConfigurationGeneration()` for both keys.
- `libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts` (1 new `it` block):
  1. `exports routingRules and decisionModelPrefillTokensPerSecond` — verifies `KNOWN_CONFIG_KEYS` accepts both keys (and existing list-hygiene test verifies no duplicates).

## Check Results

- `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/platform-core/src/file-settings-keys.spec.ts`: **PASS** — 2 test suites passed, **207/207 tests passed** (29.744 s).
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts`: **PASS** — 1 test suite passed, **12/12 tests passed** (10.408 s).
- `npx tsc --noEmit -p libs/backend/platform-core/tsconfig.lib.json`: **PASS** — 0 errors.
- `npx tsc --noEmit -p libs/backend/agent-sdk/tsconfig.lib.json`: **PASS** — 0 errors.
- `npx eslint libs/backend/platform-core/src/file-settings-keys.ts libs/backend/platform-core/src/file-settings-manager.ts libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/agent-sdk/src/lib/types/settings-export.types.ts libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts`: **PASS** — 0 errors, 4 pre-existing `@typescript-eslint/no-non-null-assertion` warnings in untouched lines (`file-settings-manager.ts:276`, `file-settings-manager.spec.ts:1167,1180,1181`), plus standard `@nx/enforce-module-boundaries` no-ProjectGraph notice when invoking `eslint` directly outside `nx`.

## Deviations

- **Skill availability**: `nx-workspace-architect` was not listed in the host's available skills catalogue; continued without it per task instructions.
- **Ptah MCP tool fallbacks**:
  - `ptah_code_search_symbols` returned an incomplete/updating index (`clean: false`, 60 indexed / 4758 unchecked); fell back to `grep -rnE` to confirm all references to `ROUTING_KEYS`, `getRoutingConfigurationGeneration`, `FILE_BASED_OBJECT_SETTINGS_KEYS`, and `KNOWN_CONFIG_KEYS`.
  - `ptah_get_diagnostics` timed out after 45s on both attempts (`TypeScript check still running after 45s`); verified TypeScript compilation via `npx tsc --noEmit` on both `libs/backend/platform-core/tsconfig.lib.json` and `libs/backend/agent-sdk/tsconfig.lib.json`.
- **Temporary log**: Verification output was captured to `.ptah/tmp/b04-checks.log` (git-ignored tmp directory, outside tracked source).

## Decisions

1. **Include `agentOrchestration.routingRules` in `FILE_BASED_OBJECT_SETTINGS_KEYS`**
   - *Options*: (a) Rely solely on `!Array.isArray(value)` in `isPlainObject()` so arrays stay whole while top-level object mistakes get flattened; (b) Add `agentOrchestration.routingRules` to `FILE_BASED_OBJECT_SETTINGS_KEYS` so both arrays and invalid top-level plain-object values stay whole.
   - *Evidence*: `implementation-plan.md` section 7 ("preserve whole raw values, including invalid object-shaped values, through the file flattener (`file-settings-manager.ts:802-824`) so the router can diagnose them") and B04 line reference `file-settings-keys.ts:318-344`. Without this entry, a malformed plain object under `agentOrchestration.routingRules` flattens into sub-keys and `get()` silently returns default `[]`.
   - *Reversible*: Yes (single Set entry in `file-settings-keys.ts`).

2. **Omit `agentOrchestration.decisionModelPrefillTokensPerSecond` from `FILE_BASED_SETTINGS_DEFAULTS`**
   - *Options*: (a) Register `'agentOrchestration.decisionModelPrefillTokensPerSecond': null` like `decisionModelTimeoutMs`; (b) Omit it from `FILE_BASED_SETTINGS_DEFAULTS` so unset reads return `undefined`.
   - *Evidence*: Task objective ("no default value (absent means 'measure')"), test requirement ("prefill key absent by default"), `file-settings-keys.ts:86` ("Optional numeric settings have no file default"), and `agent-sdk/src/lib/settings-export.service.ts:148` (which skips `undefined` values on clean-install exports, whereas a `null` default would be written into every clean export).
   - *Reversible*: Yes (one-line addition if a `null` default is ever needed).

3. **Keep `file-settings-keys.spec.ts` untouched and place new platform-core tests in `file-settings-manager.spec.ts`**
   - *Options*: (a) Edit both `file-settings-keys.spec.ts` and `file-settings-manager.spec.ts`; (b) Edit only `file-settings-manager.spec.ts` (inside the declared write set) and run both specs.
   - *Evidence*: Prompt Scope ("write set; do not modify anything else") lists `file-settings-manager.ts` and its existing spec, not `file-settings-keys.spec.ts`. Running `file-settings-keys.spec.ts` still verified all key/default/whole-object table invariants (207 tests passed across both files).
   - *Reversible*: Yes.

## Open questions

- None.
