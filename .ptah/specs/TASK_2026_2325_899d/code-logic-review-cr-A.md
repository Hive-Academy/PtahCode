# Code Logic Review — Batch CR-A (`TASK_2026_2325_899d`)

## Verdict: REVISE  Score: 6/10

- **Assessment**: `REVISE` — CR1, CR3, and CR4 (batch backend) close their findings cleanly, and CR2 closes the Undo-after-reload RPC defect, **but** CR2 introduces a **Serious** frontend/RPC regression when a user reloads Settings with a stored `apiKey` or `claudeCli` Setup selector and opens the Setup editor popover.
- **Score band rationale**:
  - **Below 7–8 (sound)**: Finding 1 (`Serious`) causes a visible error alert, broken provider `<select>`, empty model list, and Sentry exception (`SdkError: Unknown provider`) on the exact CR2 reload-then-edit user path.
  - **Above 3–4 (needs another pass)**: The underlying fixes in CR1, CR3 (`committedSettings` isolation across `set`, `setMany`, rollback, migration, and cross-process echo filtering), CR4 (batch slice refresh), and CR2's backend resolution/RPC payload are sound; only the frontend reuse of `setupModel().data.committed` for both Undo baseline and picker seeding needs decoupling.
- **Finding counts**: `0 Blocking`, `1 Serious`, `2 Moderate`, `1 Minor`.

---

## Findings

### 1. [Serious] Overloading `setupModel().data.committed` with raw `apiKey` / `claudeCli` selectors breaks the Setup reassignment picker and throws `Unknown provider` on reload

- **File**:
  - `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:269-284`
  - Downstream consumers: `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:255,280`, `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:255-270,845`, `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:481-512,678-685,774-785`, `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:748-790,886-933`, `libs/backend/auth-providers/src/lib/provider-models.service.ts:501-510`
- **Scenario**:
  1. `settings.json` has `setup.provider = 'apiKey'` (or `'claudeCli'`) and `setup.model = 'claude-sonnet-4-5'`.
  2. The user reloads Settings. `ProvidersSettingsStateService.refreshSetupModel()` (`providers-settings-state.service.ts:269-276`) receives `{ state: { kind: 'set', pair: { provider: 'anthropic', model: 'claude-sonnet-4-5' } }, committed: { provider: 'apiKey', model: 'claude-sonnet-4-5' } }` and stores `committed = storedPair ?? state.pair` (`provider: 'apiKey'`).
  3. `buildConsumerRows()` (`provider-consumer-rows.ts:255,280`) populates `setupRow.provider = committed?.provider ?? ''` (`'apiKey'` or `'claudeCli'`).
  4. The user clicks the Setup row to open the reassignment popover. `toggleEdit('setup')` (`provider-consumer-assignments.component.ts:845`) sets `currentDraft` to `{ provider: 'apiKey', model: 'claude-sonnet-4-5' }` and passes `[provider]="currentDraft().provider"` to `<ptah-provider-model-picker>`.
  5. Neither `'apiKey'` nor `'claudeCli'` exists in `getAllAnthropicProviders()` (which uses `'claude-cli'`, not `'claudeCli'`, and has no `'apiKey'`) or in `auth:getEffectiveRoute` `providers[]` (`llm-rpc-app.handlers.ts:154-182` emits `'anthropic'` and `'claude-cli'`).
  6. `ProviderModelPickerComponent`'s `effect()` (`provider-model-picker.component.ts:678-685`) calls `loadModels('apiKey')` → `provider:listModels({ providerId: 'apiKey' })` (`providers-models-loader.service.ts:12`).
  7. Backend `ProviderModelsService.fetchModels('apiKey', ...)` (`provider-models.service.ts:506-510`) checks `getPtahCliLaneProvider('apiKey')` and `dynamicFetchers.get('apiKey')` (which registers only `'anthropic'` and `'claude-cli'` at `provider-rpc.handlers.ts:748-790`) and throws `SdkError('Unknown provider: apiKey')`.
- **Impact**:
  - **Regression vs pre-CR2**: Before CR2, `refreshSetupModel()` populated `committed` with `state.pair` (`provider: 'anthropic'`), which matched `extraProviders()` and the registered `'anthropic'` dynamic fetcher. After CR2, opening the Setup popover after reload with a stored `apiKey` or `claudeCli` pair:
    1. Silently drops the Provider `<select>` value to `"Active provider (default)"` (`""`) because no `<option>` matches `'apiKey'` / `'claudeCli'`.
    2. Logs an error and sends an unhandled `SdkError` exception to Sentry (`provider-rpc.handlers.ts:923-931`).
    3. Displays `"Could not load provider models. Retry."` with an empty catalogue (only `<model> · not in current catalog`), preventing the user from picking another Claude model without first re-selecting a provider.
- **Fix**: Decouple the raw Undo baseline from the picker-seeding provider ID. Either:
  - Keep `committed` in `ProvidersSetupRowState` as the raw stored pair (so `syncSetupBaseline` and `commitSetupPair` continue using exact stored selectors) and normalize raw direct selectors (`apiKey` → `'anthropic'`, `claudeCli` → `'claude-cli'` or `'anthropic'`) when building the picker draft in `provider-consumer-rows.ts` (note this also fixes the same picker issue after an in-session `wizard:set-setup-model` receipt returning `'apiKey'` / `'claudeCli'`); **or**
  - Within `libs/frontend/core` only, carry the raw Undo baseline on a dedicated field (e.g., `undoBaseline` / `storedCommitted` on `ProvidersSetupRowState`) used by `commitSetupPair` and `syncSetupBaseline`, while keeping `committed` picker-compatible (`state.pair`) for `buildConsumerRows`.

### 2. [Moderate] `ReactiveSettingsStore.readGlobalMany()` still mixes stale and fresh keys on non-batch backends after partial cache invalidation

- **File**: `libs/backend/settings-core/src/reactive/reactive-settings-store.ts:57-69`
- **Scenario**: On any non-batch `ISettingsStore` implementation (e.g., VS Code's store adapter or test doubles without `readGlobalMany`/`writeGlobalBatch`), if `setup.provider` is cached as `P0`, both keys are updated out of band to `P1/M1`, and only `setup.model` is invalidated, the `else` branch at line 64 loops `for (const key of missingKeys)` and reads only `setup.model`. `readGlobalMany(['setup.provider', 'setup.model'])` then returns and caches the torn pair `{ 'setup.provider': P0, 'setup.model': M1 }`.
- **Impact**: Partial invalidation still yields a guaranteed-stale sibling on non-batch backends, even though refreshing all `keys` on a miss avoids the stale-cache component of the bug.
- **Fix**: Iterate `for (const key of keys)` in the `else` branch at `reactive-settings-store.ts:64` and add a partial-invalidation non-batch test in `settings-core.spec.ts`.

### 3. [Moderate] CR3 regression coverage omits same-key `setMany()` + `set()` concurrency and `committedSettings` echo filtering; overlapping `set()`s behind `setMany()` briefly expose a stale value

- **File**:
  - `libs/backend/platform-core/src/file-settings-manager.ts:256-266,296-316,673-684`
  - `libs/backend/platform-core/src/file-settings-manager.spec.ts:1545-1578`
- **Scenario**:
  1. **Untested new branches**: The CR3 regression test at `file-settings-manager.spec.ts:1545-1578` exercises `setMany(setupPair)` + rejected `set('authMethod', ...)` on an **unrelated** key. It does not exercise:
     - Same-key concurrency (`setMany({ k: 'B' })` followed by `set(k, 'A')`, both succeeding and failing), which is the only path exercising the newly added post-commit restore block at `file-settings-manager.ts:259-266` and the removal of `writeGenerations` updates from `setMany` (`:300-301`);
     - Cross-process echo suppression against `committedSettings` (`:673-684`) while an optimistic `set()` is in flight.
  2. **Transient stale value on same-key `setMany` → `set` → `set`**: If `setMany({ k: 'B' })` is followed by `set(k, 'A')` (gen 1) and `set(k, 'C')` (gen 2), `setMany` overwrites `this.settings[k] = 'B'` at `:309`. When `set(k, 'A')` commits, `:261` (`writeGenerations.get(k) === generation`) is `false` (it is `2`), so `this.settings[k]` stays `'B'` (neither committed `'A'` nor latest optimistic `'C'`) until `set(k, 'C')` settles. Self-heals when `set(k, 'C')` succeeds (`'C'`) or fails (rolls back to committed `'A'`).
- **Impact**: Uncovered new code paths in a critical shared persistence layer (`platform-core`, shared across Electron/CLI/VS Code); minor transient inconsistency under rare same-key `setMany`+double-`set` overlap.
- **Fix**: Add focused tests in `file-settings-manager.spec.ts` covering same-key `setMany` + `set` (success and failure) and `processCrossProcessChange()` self-write echo while an optimistic `set()` is queued.

### 4. [Minor] `SetupRpcHandlers` widens DI resolution to concrete `WorkspaceLlmResolver` instead of extending `SetupResolution` on `IWorkspaceLlmResolver`

- **File**:
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:370-386,403-406`
  - `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts:63-65`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:1013-1033`
- **Scenario**: `IWorkspaceLlmResolver.resolveSetup()` (`workspace-llm-resolver.port.ts:63-65,94`) still returns `SetupResolution` without `storedPair`. `WorkspaceLlmResolver` narrows its return type locally via private `WorkspaceSetupResolution` (`workspace-llm-resolver.ts:60-66`), and `SetupRpcHandlers.resolveSetup()` (`setup-rpc.handlers.ts:380-382`) casts `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` directly to `Pick<WorkspaceLlmResolver, 'resolveSetup' | 'validateSetupPair'>`.
- **Impact**: Any alternate `IWorkspaceLlmResolver` implementation or typed stub satisfies the DI port without supplying `storedPair`, causing `wizard:get-setup-model` to silently return `{ state, committed: undefined }` (reverting CR2) with no compiler error. Note also that `workspace-llm-resolver.ts:263` keeps `[tiers[lowerAlias], tiers.sonnet, tiers.opus, tiers.haiku]` for explicit aliases (matching CR1's instruction), whereas `workspace-provider-profile-resolver.ts:1251-1255` falls back `opus → sonnet → haiku` when an explicit alias is unmapped.
- **Fix**: Add `storedPair?: ModelPair` (or `storedPair: ModelPair` on `kind: 'set'`) to `SetupResolution` in `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` when `agent-sdk` is in scope, and consider a lightweight integration test wiring real `WorkspaceLlmResolver` into `SetupRpcHandlers`.

---

## Per-Item Verification (CR1–CR4 + Deferred Minor)

| Item | Closed | Evidence |
| --- | --- | --- |
| **CR1** — unset workspace default tier order | **Yes** | `workspace-llm-resolver.ts:264` changed fallback from `[tiers.sonnet, tiers.opus, tiers.haiku]` to `[tiers.opus, tiers.sonnet, tiers.haiku]`, matching `workspace-provider-profile-resolver.ts:1251-1255` and `model-resolver.ts:53-56` (D7). Explicit aliases `'opus'`, `'sonnet'`, `'haiku'` still prioritize `tiers[lowerAlias]` (`:260-263`). Regression test `workspace-llm-resolver.spec.ts:649-667` uses real `WorkspaceLlmResolver` + `ProviderModelsService` + `z-ai` (`opus: 'glm-5.3'`, `sonnet: 'glm-5.2'`), fails without the fix on `'default'` and `''`, and passes with it. |
| **CR2** — Undo after reload preserves raw direct selector | **Partial (No — regression)** | Backend & RPC path closes the Undo-after-reload data bug: `workspace-llm-resolver.ts:475` returns `storedPair: { provider, model }`, `setup-rpc.handlers.ts:404-406` exposes optional `committed`, `rpc-skill-judge.types.ts:124` adds `committed?: ModelPair` (backwards-compatible with old hosts/clients), and `providers-settings-state.service.ts:276` consumes `storedPair ?? state.pair` so `commitSetupPair` → `undoSetupPair` restores `'apiKey'`/`'claudeCli'` after reload (and `syncSetupBaseline` at `providers-commit.service.ts:125` no longer falsely clears in-session Undo on refresh). **However**, overloading `setupModel().data.committed` causes **Finding 1 (Serious)** in `<ptah-provider-model-picker>` / `provider:listModels` on reload. |
| **CR3** — queued batch excludes uncommitted single-key writes | **Yes** | `file-settings-manager.ts:139,236-237,247-255,259-266,297,438,673-684,727,741-743,831` separates `committedSettings` from optimistic `settings`. Both `set()` and `setMany()` build persisted images strictly from `committedSettings`; `committedSettings` updates only after atomic `renameWithRetry` succeeds (`:831`), on `flushSync()` (`:438`), on `loadSync()` (`:727`), or on external `processCrossProcessChange()` (`:684`). Optimistic reads for `set()` stay intact (D22), failed `set()` rolls back to `committedSettings` (even across double-failed overlapping `set()`s), successful single-key writes persist normally, and batch watchers still observe both Setup fields after commit. Regression test `file-settings-manager.spec.ts:1545-1578` tests real `PtahFileSettingsManager` + real fs (with `renameOverride` fault injection) and fails without the fix. See **Finding 3 (Moderate)** for additional concurrency test gaps. |
| **CR4** — full slice refresh on cache miss | **Yes (batch backends)** | `reactive-settings-store.ts:59-62` now calls `this.backend.readGlobalMany(keys)` and caches all `keys` when any requested key is missing, closing torn reads on Electron/CLI `FileSettingsStore`. Regression test `settings-core.spec.ts:1446-1467` mutates the backend out of band, invalidates only `'setup.model'`, verifies both returned slice and cached `'setup.provider'` refresh in one `readGlobalMany` call, and fails without the fix. See **Finding 2 (Moderate)** for the non-batch fallback (`:64`). |
| **Minor (DEFERRED)** — external cross-process update during batch rename | **Fair deferral** | Verified at `file-settings-manager.ts:297,684,830`: the lost-update window during async `writeFile` + `renameWithRetry` is pre-existing in `PtahFileSettingsManager.set()` as well, and true cross-process protection requires a cross-process file lock / CAS write protocol across all hosts (`Electron`, `VS Code`, `CLI`) rather than a local `setMany` tweak. Out of scope for PR #1514 and fairly deferred. |

---

## Persisted Write → Runtime Reader Trace & Regression Audit

1. **Setup pair write → reader path (CR2, CR3, CR4)**:
   - Write: `ProvidersCommitService.writeSetupPair` (`providers-commit.service.ts:185`) → `wizard:set-setup-model` (`setup-rpc.handlers.ts:424`) → `WorkspaceScopeResolver.commitSetupPair` (`workspace-scope-resolver.ts:446`) → `ReactiveSettingsStore.writeGlobalBatch` (`reactive-settings-store.ts:100`) → `FileSettingsStore.writeGlobalBatch` (`platform-electron` & `platform-cli`) → `PtahFileSettingsManager.setMany` (`file-settings-manager.ts:289-335`) → atomic temp write + `renameWithRetry` → updates `committedSettings` (`:831`) → updates `settings` (`:309`) → emits watchers synchronously (`:318-328`). **OK**.
   - Runtime read: `WorkspaceLlmResolver.resolveSetup` (`workspace-llm-resolver.ts:166`) → `WorkspaceScopeResolver.readSetupPair` (`workspace-scope-resolver.ts:394`) → `ReactiveSettingsStore.readGlobalMany(['setup.provider', 'setup.model'])` (`reactive-settings-store.ts:50-75`) → on miss, refreshes full slice from `FileSettingsStore.readGlobalMany` → `PtahFileSettingsManager.getMany`. **OK on batch backends; Finding 2 on non-batch backends**.
   - Reload → UI read: `ProvidersSettingsStateService.refreshSetupModel` (`providers-settings-state.service.ts:269`) → `wizard:get-setup-model` (`setup-rpc.handlers.ts:398-407`) → `WorkspaceLlmResolver.resolveSetup` (`workspace-llm-resolver.ts:473-477`) → `{ state, committed: storedPair }` → `setupModelStore` → (a) `commitSetupPair` / `undoSetupPair` (**OK**), (b) `buildConsumerRows` → `<ptah-provider-model-picker>` → `provider:listModels` (**BROKEN for `apiKey` / `claudeCli` — Finding 1**).
2. **RPC compatibility**:
   - `WizardGetSetupModelResult.committed?: ModelPair` (`rpc-skill-judge.types.ts:124`) is optional. Old hosts omitting `committed` fall back cleanly to `state.pair` (`providers-settings-state.service.ts:276`). Old clients ignoring `committed` continue reading `state`. Existing fixtures (`settings.fixtures.ts`, `onboarding-analyze.fixtures.ts`, `ui-driver.ts`) remain valid. **OK**.
3. **Undo in the same session**:
   - `commitSetupPair` uses `previousReceipt ? previousReceipt.committed : loadedPair` (`providers-commit.service.ts:146-147`). In-session `receipt.committed` already carries the raw selector from `wizard:set-setup-model`, and `refreshSetupModel()` now returns the same raw selector so `syncSetupBaseline` (`:125`) no longer falsely wipes `setupUndoEntry` on a no-op refresh. **OK**.
4. **Regression test quality**:
   - CR1 (`workspace-llm-resolver.spec.ts:649-667`): Exercises real `WorkspaceLlmResolver` + `WorkspaceProviderProfileResolver` + `ProviderModelsService` + `WorkspaceScopeResolver`. Fails without CR1. **Strong**.
   - CR2 (`workspace-llm-resolver.spec.ts:459`, `setup-rpc.handlers.spec.ts:1013-1033`, `providers-settings-state.service.spec.ts:280-309`): Each unit layer fails without its CR2 change; however, `setup-rpc.handlers.spec.ts` mocks `resolveSetup` and `providers-settings-state.service.spec.ts` mocks RPC handlers, and no test exercises `buildConsumerRows` / `ProviderConsumerAssignmentsComponent` / `ProviderModelPickerComponent` with a loaded `committed.provider = 'apiKey' | 'claudeCli'` — which is why **Finding 1** escaped detection.
   - CR3 (`file-settings-manager.spec.ts:1545-1578`): Exercises real `PtahFileSettingsManager` and real filesystem I/O (only injecting `ENOSPC` on the second `rename`). Fails without CR3. Missing same-key and echo-suppression cases (**Finding 3**).
   - CR4 (`settings-core.spec.ts:1446-1467`): Exercises real `ReactiveSettingsStore` against `makeBatchMockStore`. Fails without CR4. Does not test non-batch partial invalidation (**Finding 2**).

---

## Five Logic Questions

### 1. How does this fail silently?
- In `ProviderModelPickerComponent` (`provider-model-picker.component.ts:206-227,481-512`), when `committed.provider` is `'apiKey'` or `'claudeCli'` after reload (`providers-settings-state.service.ts:276` → `provider-consumer-rows.ts:280`), the `<select>` has no matching `<option>` and silently displays `"Active provider (default)"` while internal `_provider` still holds `'apiKey'`/`'claudeCli'` (**Finding 1**).
- In `SetupRpcHandlers.resolveSetup()` (`setup-rpc.handlers.ts:380-386,404-406`), casting `SDK_WORKSPACE_LLM_RESOLVER` to concrete `WorkspaceLlmResolver` allows an `IWorkspaceLlmResolver` implementation lacking `storedPair` to compile and silently emit `committed: undefined` (**Finding 4**).
- In `PtahFileSettingsManager.loadSync()` (`file-settings-manager.ts:740-749`), if the async migration `persistImage(image)` fails, the migrated keys remain in `this.settings` in memory but absent from `this.committedSettings` so later writes omit them from disk (pre-existing best-effort migration warning).

### 2. What user action produces unexpected behaviour?
- A user whose `settings.json` stores `setup.provider = 'apiKey'` or `'claudeCli'` reloads Settings and clicks the **Setup** row to edit the model: the provider selector shows `"Active provider (default)"`, the model dropdown fails to load with `"Could not load provider models. Retry."`, and Sentry receives `SdkError: Unknown provider: apiKey` / `claudeCli` (**Finding 1**).

### 3. What input data produces a wrong answer?
- `ReactiveSettingsStore.readGlobalMany(['setup.provider', 'setup.model'])` on a non-batch backend after out-of-band pair update + single-key `invalidateCache('setup.model')` returns a torn `{ 'setup.provider': old, 'setup.model': new }` pair instead of refreshing both keys (**Finding 2**).
- An unset workspace with an explicit tier alias (e.g., `'haiku'`) whose tier is unmapped falls back to `sonnet` before `opus` (`workspace-llm-resolver.ts:263`), differing from `workspace-provider-profile-resolver.ts:1251-1255` (`opus` before `sonnet`) (**Finding 4**).

### 4. What happens when a dependency fails?
- `PtahFileSettingsManager`: `writeFile` or `renameWithRetry` failure removes the temp file, throws `SettingsPersistError(fsErrorCode)`, leaves `committedSettings` and disk intact, rolls back optimistic `set()` to `committedSettings[key]` (or deletes it), suppresses watchers, and keeps `writePromise` accepting subsequent writes (`file-settings-manager.ts:238-257,331-333,832-842`). **Verified sound**.
- `SetupRpcHandlers`: `resolveSetup` timeout or throw converts to `RpcUserError(..., 'SETUP_MODEL_INVALID')` without leaking secrets (`setup-rpc.handlers.ts:375-391`); `commitSetupPair` failure throws `RpcUserError(..., 'PERSISTENCE_UNAVAILABLE')` (`:425-431`). **Verified sound**.
- `ProviderModelsService.fetchModels`: rejects unknown `'apiKey'` / `'claudeCli'` IDs with `SdkError`, which `ProviderRpcHandlers` captures in Sentry and rejects to the picker (**Finding 1**).

### 5. What is missing that the requirements never mentioned?
- Separating the **persistence/Undo selector** (`'apiKey'` / `'claudeCli'` / `'anthropic'`) from the **picker/catalogue provider ID** (`'anthropic'` / `'claude-cli'`) across the Setup settings surface (**Finding 1**).
- Cross-process cache invalidation wiring between `PtahFileSettingsManager.enableCrossProcessWatch()` and `ReactiveSettingsStore` in `electron-settings-registration.ts:80-81` (pre-existing, outside CR-A scope: `ReactiveSettingsStore` is not subscribed to `fileSettings` cross-process reloads, so CR4 only activates when a caller explicitly invokes `invalidateCache`).

---

## Verification Evidence

All checks were run independently in `/home/amun/ptah-extension/.claude-worktrees/skill-judge` (one heavy check at a time; no source edits, no state-changing git commands).

- **Ptah MCP tools**:
  - `ptah_code_search_symbols`: returned `symbolCount: 0, hits: []` (empty index in worktree); fell back to `git grep`.
  - `ptah_get_diagnostics` (scoped to the 11 CR-A files): timed out after 45s on both attempts (`TypeScript check still running after 45s`); fell back to per-project `npx tsc --noEmit`.

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Jest — auth-providers | `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts` | PASS (1 suite, 37/37 tests) | `.ptah/tmp/review-cr-a-auth.log` |
| Jest — platform-core | `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/platform-core/src/file-settings-manager.error-paths.spec.ts libs/backend/platform-core/src/file-settings-manager.cross-process.spec.ts` | PASS (3 suites, 97/97 tests) | `.ptah/tmp/review-cr-a-platform.log` |
| Jest — settings-core | `npx jest --config libs/backend/settings-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/settings-core/src/settings-core.spec.ts` | PASS (1 suite, 52/52 tests) | `.ptah/tmp/review-cr-a-settings.log` |
| Jest — rpc-handlers | `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts` | PASS (1 suite, 76/76 tests) | `.ptah/tmp/review-cr-a-rpc.log` |
| Jest — frontend core | `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` | PASS (1 suite, 131/131 tests) | `.ptah/tmp/review-cr-a-frontend.log` |
| Typecheck (6 libs) | `npx tsc --noEmit --project <tsconfig.lib.json>` for `shared`, `platform-core`, `settings-core`, `auth-providers`, `rpc-handlers`, `frontend/core` | PASS (all 6) | `.ptah/tmp/review-cr-a-tsc-*.log` |
| ESLint (11 CR-A files) | `npx eslint <11 CR-A files>` | PASS (0 errors, 17 pre-existing warnings) | `.ptah/tmp/review-cr-a-eslint.log` |
