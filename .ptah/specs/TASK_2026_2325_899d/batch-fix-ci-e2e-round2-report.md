# CI Fix Round 2 Report — D46 E2E Fixtures (`TASK_2026_2325_899d`)

## Summary

Resolved both moderate findings from `code-logic-review-ci-e2e.md` (REVISE 6/10):

1. **Finding 1 (`apps/ptah-electron-e2e/src/support/ui-driver.ts`):** Added typed, stateful default handlers for `wizard:get-setup-model` and `wizard:set-setup-model` in `UiDriver.installFakeRpcListener()`, plus `success: false` RPC failure envelope dispatch for rejected mocked calls. All Electron Settings specs and design previews inheriting the default `ui` fixture now receive valid `SetupPairState` / `WizardSetSetupModelResult` responses; explicit `ui.mockRpc(...)` overrides still take precedence, and `real-rpc-fixtures.ts` remains untouched.
2. **Finding 2 (`libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`):** Hardened `wizard:set-setup-model` with strict input validation (`parseSetupModelParams`) mirroring `setup-rpc.handlers.ts:122-125,413-425` and `workspace-scope-resolver.ts:421-439`, rejecting non-objects, extra fields, missing/non-string fields, and partial trimmed pairs via `rpcError(...)` without mutating `state.setupPair` or `state.setupCommitSeq`.

Only the two authorized files were edited.

---

## Files Changed

- `apps/ptah-electron-e2e/src/support/ui-driver.ts`
  - `:3-8` — Imported `ModelPair`, `SetupPairState`, `WizardGetSetupModelResult`, `WizardSetSetupModelResult` from `@ptah-extension/shared`.
  - `:75-93` — Added `SetupModelMockState`, `DEFAULT_SETUP_EFFECTIVE_PAIR` (`{ provider: 'anthropic', model: 'claude-sonnet-4-5' }`), and `UI_RPC_ERROR_KEY`.
  - `:107-231` — Reset per-listener `g.__uiSetupModelState = { pair: null, commitSeq: 0 }` in `installFakeRpcListener()` and added typed `readNonEmptyString`, `resolveEffectiveSetupPair`, `buildSetupPairState`, `handleDefaultGetSetupModel`, and `handleDefaultSetSetupModel` helpers.
  - `:262, :286-290` — Removed pre-existing useless initializer on `data` and wired default `wizard:get-setup-model` / `wizard:set-setup-model` fallback branches after `__uiMockFns` and `__uiMockStatics` checks so spec overrides always win.
  - `:301-319` — Added `UI_RPC_ERROR_KEY` check before sending `to-renderer` so rejected writes emit `{ type: 'rpc:response', correlationId, success: false, error }`.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`
  - `:31-43` — Imported `rpcError` from `../marketplace/marketplace.fixtures` and removed now-unused `WizardSetSetupModelParams` import.
  - `:639-671` — Added `parseSetupModelParams(params)` enforcing a plain object with only `provider` and `model` string fields, trimming both, allowing both empty (`null` clear) or both non-empty (`{ provider, model }`), and rejecting partial or malformed inputs.
  - `:882-895` — Updated `'wizard:set-setup-model'` resolver to validate via `parseSetupModelParams(params)` and return `rpcError(parsed.error)` before mutating `state.setupPair` or incrementing `state.setupCommitSeq`.

---

## Findings and Fixes

### Finding 1 — Electron fake IPC listener returned generic success payload for Setup RPCs

- **Issue:** `UiDriver.installFakeRpcListener()` (`apps/ptah-electron-e2e/src/support/ui-driver.ts`) fell back to `NAMESPACE_EMPTY_DEFAULTS` (`{ jobs: [], bindings: [], ... }`) for unmocked `wizard:get-setup-model` and `wizard:set-setup-model` calls. In Settings, `ProvidersSettingsStateService.refreshSetupModel()` accessed `state.kind` on `undefined`, marking Setup as errored, and Setup writes received no receipt fields.
- **Fix:**
  - Seeded `g.__uiSetupModelState = { pair: null, commitSeq: 0 }` in `installFakeRpcListener()` and dispatched `wizard:get-setup-model` / `wizard:set-setup-model` after checking `__uiMockFns` and `__uiMockStatics` overrides.
  - Default `wizard:get-setup-model` returns `{ state: { kind: 'unset', effective } }` where `effective` derives `provider` from mocked `auth:getAuthStatus.anthropicProviderId` or `auth:getEffectiveRoute.driverProviderId` (falling back to `'anthropic'`, matching `fixtures.ts`'s `authMethod: 'apiKey'`) and `model` from mocked `config:model-get.model` (falling back to `'claude-sonnet-4-5'`). Once set, it returns `{ state: { kind: 'set', pair } }`.
  - Default `wizard:set-setup-model` enforces the same strict validation as `settings.fixtures.ts` and production, updating `g.__uiSetupModelState`, incrementing `commitSeq`, and returning `{ committed, state, commitSeq }` on valid set/clear or a `success: false` RPC response envelope on invalid/partial input without mutating state or `commitSeq`.
  - `apps/ptah-electron-e2e/src/support/real-rpc-fixtures.ts` does not call `installFakeRpcListener()`, so real-RPC specs and `settings-providers-gate.shot.ts` remain unchanged on the real IPC handlers.

### Finding 2 — Webview Settings `wizard:set-setup-model` accepted partial or malformed inputs

- **Issue:** `settings.fixtures.ts:848-859` coerced missing or non-string fields to `''` and stored `{ provider, model }` whenever `provider || model` was truthy, allowing partial pairs (e.g., `{ provider: 'claude-cli', model: ' ' }`) to commit and empty/malformed payloads (`{}`) to clear state while incrementing `setupCommitSeq`.
- **Fix:**
  - Added `parseSetupModelParams(params)` requiring a non-null, non-array object with only `provider` and `model` keys, both of type `string`.
  - After `.trim()`, both empty clears (`pair: null`), both non-empty sets (`{ provider, model }`), and any partial pair (`Boolean(provider) !== Boolean(model)`), missing field, non-string, or extra field returns `rpcError(...)` (the harness's existing `{ success: false, error }` mechanism in `marketplace.fixtures.ts:107-113,217-231`) immediately before mutating `state.setupPair` or `state.setupCommitSeq`.
  - Call recording (`record(state, 'wizard:set-setup-model', params)`) still runs first so specs can assert rejected write attempts.

---

## Verification Checks

1. `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json` — **PASSED** (exit code `0`, 0 errors).
2. `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.spec.json` — **PASSED** (exit code `0`, 0 errors).
3. `npx eslint apps/ptah-electron-e2e/src/support/ui-driver.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts` — **PASSED** (exit code `0`, 0 errors; 0 warnings on `ui-driver.ts`; 1 pre-existing `max-lines` warning on `settings.fixtures.ts:897`).
4. `git diff --check -- apps/ptah-electron-e2e/src/support/ui-driver.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts` — **PASSED** (exit code `0`).
5. Playwright / e2e / builds / `npm run verify` / Nx targets — Not run (excluded by lane rules).

---

## Decisions

- **Decision:** Keep Electron's default Setup get/set handlers directly inside `UiDriver.installFakeRpcListener()` (evaluated in Electron's main process) rather than serializing stringified functions into `g.__uiMockFns`.
  - **Options:** (a) Register stringified resolver functions in `g.__uiMockFns` inside `installFakeRpcListener()`; (b) Implement typed default handlers directly inside `installFakeRpcListener()`'s `app.evaluate` callback, dispatched after `__uiMockFns` and `__uiMockStatics`.
  - **Evidence:** Option (b) is fully type-checked against `@ptah-extension/shared` (`ModelPair`, `SetupPairState`, `WizardGetSetupModelResult`, `WizardSetSetupModelResult`) under `apps/ptah-electron-e2e/tsconfig.spec.json` (`strict: true`, `noPropertyAccessFromIndexSignature: true`), avoids `new Function` overhead, guarantees any spec's `ui.mockRpc({ 'wizard:...': ... })` overrides the defaults cleanly, and still automatically covers every consumer of `installFakeRpcListener()` (`fixtures.ts`, Settings specs, design previews, and `v2-surfaces.shot.ts`) while leaving `real-rpc-fixtures.ts` untouched.
  - **Reversible:** Yes, self-contained in `apps/ptah-electron-e2e/src/support/ui-driver.ts`.

- **Decision:** Derive Electron's unset `effective` workspace pair dynamically from `g.__uiMockStatics` (`auth:getAuthStatus.anthropicProviderId` -> `auth:getEffectiveRoute.driverProviderId` -> `'anthropic'`, and `config:model-get.model` -> `'claude-sonnet-4-5'`).
  - **Options:** (a) Hardcode a single static effective pair `{ provider: 'anthropic', model: 'claude-sonnet-4-5' }`; (b) Read mocked `auth:getAuthStatus` / `auth:getEffectiveRoute` / `config:model-get` with `{ provider: 'anthropic', model: 'claude-sonnet-4-5' }` fallback.
  - **Evidence:** The default `fixtures.ts` `ui` fixture configures `authMethod: 'apiKey'` with `anthropicProviderId: null` (matching `'anthropic'`), while design previews (`settings-lanes.fixtures.ts`, `settings-advanced.fixtures.ts`) override `auth:getAuthStatus.anthropicProviderId` to `'claude-cli'` and `config:model-get.model` to `'claude-sonnet-4-6'`. Dynamic lookup keeps `effective` consistent across both the default `ui` fixture and every preview override without requiring per-preview Setup boilerplate.
  - **Reversible:** Yes, confined to `resolveEffectiveSetupPair` in `apps/ptah-electron-e2e/src/support/ui-driver.ts:148-164`.

- **Decision:** Reject extra unknown fields on `wizard:set-setup-model` params (in addition to non-objects, missing/non-string `provider`/`model`, and partial trimmed pairs) in both `settings.fixtures.ts` and `ui-driver.ts`.
  - **Options:** (a) Validate only `provider` and `model` string presence and trimmed pairing; (b) Also reject unexpected extra keys to match `SetupModelParamsSchema = z.strictObject({ provider: z.string().trim(), model: z.string().trim() })` (`setup-rpc.handlers.ts:122-125`).
  - **Evidence:** Every production and test caller of `wizard:set-setup-model` passes strictly `{ provider, model }`, and matching `z.strictObject` ensures fixture behavior cannot diverge from production schema parsing.
  - **Reversible:** Yes, single check in `parseSetupModelParams` / `handleDefaultSetSetupModel`.
