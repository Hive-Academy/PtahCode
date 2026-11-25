# CI Fix Report — `webview-e2e` (TASK_2026_2325_899d, PR #1514, D46)

## Summary

Fixed all 28 failing `webview-e2e` Playwright tests caused by the new Background models **Setup** row (`TASK_2026_2325_899d`):

1. Added stateful `wizard:get-setup-model` and `wizard:set-setup-model` resolvers to `statefulSettingsFixtures()` in `settings.fixtures.ts` (shared by `bootSettings`, `baseSettingsFixtures`, variant boots, and `onboardingReadyFixtures`), so `ProvidersSettingsStateService.refreshSetupModel()` settles cleanly and `ProvidersCommitService.run()` completes its post-write `hooks.refresh()` and `hooks.sectionsReady()` check.
2. Updated the two background-role count assertions in `settings-visual.e2e.spec.ts` (`captureRolesOpen`) from `3` to `4` to reflect the intended four rows (`setup`, `memory-curator`, `enhancement`, `decision`).

No production files under `libs/frontend/core`, `libs/frontend/chat`, or `libs/frontend/onboarding` were modified.

---

## Files Changed

- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`
  - `:31-37` — Imported `ModelPair`, `SetupPairState`, `WizardGetSetupModelResult`, `WizardSetSetupModelParams`, `WizardSetSetupModelResult` from `@ptah-extension/shared`.
  - `:574-577`, `:595-596` — Added `setupPair: ModelPair | null` (initial `null`) and `setupCommitSeq: number` (initial `0`) to `FixtureState` and `createFixtureState()`.
  - `:623-637` — Added `effectiveSetupWorkspacePair(state)` and `setupPairStateFor(state)` returning `{ kind: 'unset', effective }` when `setupPair` is `null` and `{ kind: 'set', pair }` when set.
  - `:845-860` — Added stateful `'wizard:get-setup-model'` and `'wizard:set-setup-model'` resolvers to `statefulSettingsFixtures()`. `'wizard:set-setup-model'` records calls in `state.calls`, trims and updates `state.setupPair` (clearing to `null` when both fields are empty), increments `state.setupCommitSeq`, and returns `{ committed, state, commitSeq }` matching `WizardSetSetupModelResult` and `ProvidersCommitService.writeSetupPair()`.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts`
  - `:717-722` — Updated `expect(consumerRows).toHaveCount(3)` to `toHaveCount(4)` in `captureRolesOpen()`.
  - `:735` — Updated `expect(cellHeights).toHaveLength(3)` to `toHaveLength(4)` in `captureRolesOpen()` (once `wizard:get-setup-model` replies, `consumer-row-setup` transitions from `consumer-notloaded-setup` to loaded and renders `consumer-summary-setup`, which uses `truncate` and remains a single line `<= 24px`).

---

## Failing Test Groups and Root-Cause Mapping (28 / 28)

### 1. `settings-orchestration.e2e.spec.ts` — 16 failures (8 tests × `vscode`, `electron`)

**Root cause:** Every commit routed through `ProvidersCommitService.run()` (`libs/frontend/core/src/lib/services/providers-commit.service.ts:533-538`) awaits `hooks.refresh()` after writing (even on rejected writes) and then checks `hooks.sectionsReady()`. `ProvidersSettingsStateService.refresh()` (`providers-settings-state.service.ts:246-262`) runs `this.refreshSetupModel()`, which calls `wizard:get-setup-model`. Because `statefulSettingsFixtures()` had no resolver for `wizard:get-setup-model`, the RPC went unanswered until timeout, stalling `hooks.refresh()` and keeping `commit().status === 'saving'` (`sectionsReady()` also requires `this.setupModel().status === 'ready'`).

- **Failures #1 & #9 (`:169`, `add-instance modal: a create closes it and focus returns to Add`):** `ptahCli:create` write succeeded, but `hooks.refresh()` hung on `wizard:get-setup-model`, so the modal never closed (`open` attribute remained at `:92`).
- **Failures #2 & #10 (`:209`, `edit modal (#50): a rename sends ptahCli:update with the new name only`):** Same hang after `ptahCli:update`; edit modal stayed open (`:235`).
- **Failures #3 & #11 (`:241`, `cell pick: the Codex model cell...`):** Same hang after `agent:setConfig`; `cli-matrix-popover` stayed mounted (`:264`).
- **Failures #4 & #12 (`:281`, `on/off: a system CLI writes disabledClis...`):** Same hang after `agent:setConfig`; save toast with Undo never appeared (`:306`).
- **Failures #5 & #13 (`:432`, `Reorder mode: a move writes the whole order...`):** Same hang after `agent:setConfig`; `saving` remained true so `lanes-order-edit` stayed `disabled` (confirmed in log line 832: `<button disabled ... data-testid="lanes-order-edit">`), preventing focus return (`:462`).
- **Failures #6 & #14 (`:478`, `adding a Copilot-backed instance requires a GitHub sign-in...`):** Same hang after `ptahCli:create`; modal stayed open (`:92`).
- **Failures #7 & #15 (`:523`, `Cursor key (Batch 36d.b): save, then remove...`):** Same hang after `agent:setConfig` (`cursorKeyStoreOverrides` merges on top of `statefulSettingsFixtures`); `"Key stored, not verified."` toast never appeared (`:545`).
- **Failures #8 & #16 (`:605`, `Cursor key (Batch 36d.a, N3): a failed save keeps focus...`):** `ProvidersCommitService.run()` still executes `await hooks.refresh()` after `{ success: false }` (`providers-commit.service.ts:533`); the unanswered `wizard:get-setup-model` prevented `"The key was not saved."` from appearing (`:643`).

**Fix:** Adding stateful `wizard:get-setup-model` (and `wizard:set-setup-model`) to `statefulSettingsFixtures()` makes `refreshSetupModel()` resolve immediately with `status: 'ready'`, unblocking `hooks.refresh()` and `hooks.sectionsReady()` for all 16 tests.

### 2. `settings-providers.e2e.spec.ts` — 8 failures (4 tests × `vscode`, `electron`)

**Root cause:** Identical post-write `hooks.refresh()` hang on unanswered `wizard:get-setup-model`.

- **Failures #17 & #21 (`:96`, `drawer Credentials: Delete key sends auth:deleteStoredKey...`):** `auth:deleteStoredKey` write hung in `hooks.refresh()`; `"Stored key deleted."` toast never appeared (`settings-drawer.reach.ts:289`).
- **Failures #18 & #22 (`:111`, `drawer Credentials: GitHub Copilot Sign out...`):** `auth:copilotLogout` write hung in `hooks.refresh()`; `"Signed out."` toast never appeared (`settings-drawer.reach.ts:289`).
- **Failures #19 & #23 (`:173`, `popover model: nothing is written before Save...`):** `config:model-switch` commit hung in `hooks.refresh()`; `main-agent-popover` stayed mounted (`:188`).
- **Failures #20 & #24 (`:268`, `popover model search filters the models...`):** `config:model-switch` commit hung in `hooks.refresh()`; `main-agent-popover` stayed mounted (`:340`).

**Fix:** Resolved by the same `statefulSettingsFixtures()` addition.

### 3. `settings-visual.e2e.spec.ts` — 4 failures (1 test × `vscode`, `electron` × `anubis`, `anubis-light`)

- **Failures #25–#28 (`:881`, `baseline smoke — Orchestration order strip, fold, roles and order popover`):** `captureRolesOpen()` asserted `expect(consumerRows).toHaveCount(3)` (`:721`, received `4`) and `expect(cellHeights).toHaveLength(3)` (`:734`). The Background models grid now renders 4 intended rows: `setup`, `memory-curator`, `enhancement`, and `decision`.

**Fix:** Updated both counts in `captureRolesOpen()` from `3` to `4`. No other consumer row count or order assertions exist in `libs/frontend/webview-e2e-harness/src`.

---

## Harness-Wide Fixture Map Audit

Audited every RPC fixture map and `installRpcAutoResponder` call under `libs/frontend/webview-e2e-harness/src` (and verified all frontend call sites of `wizard:get-setup-model` / `wizard:set-setup-model`: `ProvidersSettingsStateService`, `AnalyzeWorkspacePage`, `AnalyzeSkillsPage`):

| File | Fixture / Builder | Status |
| --- | --- | --- |
| `scenarios/settings/settings.fixtures.ts` | `statefulSettingsFixtures` / `baseSettingsFixtures` / `bootSettings` | **Fixed** — added stateful `wizard:get-setup-model` and `wizard:set-setup-model`. |
| `scenarios/settings/settings-live-shape.fixtures.ts` | `liveShapeOverrides` | Partial override merged into `bootSettings`; inherits fix automatically. |
| `scenarios/settings/settings-cursor-key.fixtures.ts` | `cursorKeyStoreOverrides` | Partial override (`agent:setConfig`) merged into `bootSettings`; inherits fix automatically. |
| `scenarios/settings/settings-advanced-search-voice.fixtures.ts` | `withAdvancedSearchVoice` | Spreads `statefulSettingsFixtures` / `baseSettingsFixtures`; inherits fix automatically. |
| `scenarios/settings/settings-drawer.reach.ts` | `bootVariant` / `throughVariantBoot` | Spreads `baseSettingsFixtures()`; inherits fix automatically. |
| `scenarios/settings/settings-advanced-search-voice.reach.ts` | `throughAsvVariant` | Wraps `baseSettingsFixtures()` via `withAdvancedSearchVoice`; inherits fix automatically. |
| `scenarios/onboarding/onboarding-ready.fixtures.ts` | `onboardingReadyFixtures` | Spreads `baseSettingsFixtures()`; inherits fix automatically. |
| `scenarios/onboarding/onboarding-analyze.fixtures.ts` | `onboardingAnalyzeFixtures` | Already defines explicit `wizard:get-setup-model` and `wizard:set-setup-model` (`:346-353`). |
| `scenarios/onboarding/onboarding-proposal.fixtures.ts` | `proposalRpcFixtures` | Spreads `onboardingAnalyzeFixtures()`; already covered. |
| `scenarios/onboarding/onboarding-generate.fixtures.ts` | `bootOnboardingGenerate` | Spreads `onboardingAnalyzeFixtures()`; already covered. |
| `scenarios/marketplace/marketplace.fixtures.ts` | `baseMarketplaceFixtures`, `geometryStressFixtures` | Does not mount Settings or Onboarding Analyze; intentionally minimal per harness convention. |
| `scenarios/plan-limits/plan-limits.fixtures.ts` | `planLimitsFixtures` | Spreads `baseMarketplaceFixtures`; does not mount Settings or Onboarding Analyze. |
| `scenarios/boot/boot-progress.e2e.spec.ts` | `RPC_FIXTURES` | Minimal Electron shell boot fixture (`workspace:getInfo`, `workspace:switch`); does not mount Settings or Onboarding Analyze. |
| `scenarios/thoth/activity-ticker.e2e.spec.ts` | `RPC_FIXTURES` | Minimal Electron shell boot fixture; does not mount Settings or Onboarding Analyze. |
| `scenarios/marketplace/lock-popover-stacking.e2e.spec.ts` | `RPC_FIXTURES` | Marketplace-only fixture; does not mount Settings or Onboarding Analyze. |
| `scenarios/vscode-shell/switch-view-navigation.e2e.spec.ts` | `installVSCodeHost` (no RPC responder) | Only checks `ptah-settings` visibility and absence of config menu, never awaits settle or commits. |

---

## Verification Checks

1. **`ptah_get_diagnostics` (scoped to the 2 changed files):** Unavailable — exceeded the tool's 1024 MB TypeScript memory limit (`{"clean":false,"reasons":["unchecked"],"unchecked":2}`). Fell back to direct `npx tsc --noEmit` below.
2. **`npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`:** **PASSED** (exit code `0`, 0 errors; covers `settings.fixtures.ts`).
3. **`npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json`:** Exited `2` with **0 errors in changed files** (`settings.fixtures.ts` and `settings-visual.e2e.spec.ts` are clean); all 6 reported errors are pre-existing in unrelated files (`fixture-server.ts:12`, `marketplace-visual.e2e.spec.ts:33`, `onboarding-ready-capture.ts:24`, `plan-limits-visual.e2e.spec.ts:51`, `settings-capture.ts:19` — TS1343 `import.meta` under `"module": "commonjs"` — and `preferences.e2e.spec.ts:46` — TS2345).
4. **`npx eslint libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts`:** **PASSED** (exit code `0`, 0 errors; 1 pre-existing `max-lines` warning on `settings.fixtures.ts`, which was already 1028 lines prior to this change).
5. **Playwright / `npm run verify` / Nx targets:** Not run (explicitly prohibited for this lane; CI verifies).

---

## Decisions

- **Decision:** Compute the unset `effective` workspace pair dynamically in `effectiveSetupWorkspacePair(state)` as `{ provider: state.authStatus.anthropicProviderId || EFFECTIVE_ROUTE_FIXTURE.driverProviderId, model: state.model || 'claude-sonnet-4-5' }`.
  - **Options:** (a) Static `{ provider: 'claude-cli', model: '' }`; (b) Static `{ provider: 'claude-cli', model: 'claude-sonnet-4-5' }`; (c) Dynamic pair reading `state.authStatus.anthropicProviderId` and `state.model` with `'claude-sonnet-4-5'` fallback when `state.model` is `''`.
  - **Evidence:** `settings.fixtures.ts` initializes `authStatus.anthropicProviderId = 'claude-cli'` and `model = ''` (provider default), while `provider-consumer-rows.ts:270` displays `pair.model || '(no model chosen)'`. A realistic fallback model ID avoids a misleading `'(no model chosen)'` label when unset and tracks subsequent `config:model-switch` / `auth:saveSettings` writes in stateful tests.
  - **Reversible:** Yes, single helper in `settings.fixtures.ts:624-631`.

- **Decision:** Also update `expect(cellHeights).toHaveLength(3)` to `4` in `settings-visual.e2e.spec.ts:735` alongside `expect(consumerRows).toHaveCount(4)` at `:722`.
  - **Options:** (a) Update only `toHaveCount(3)` at `:722`; (b) Update both `toHaveCount` and `cellHeights.toHaveLength` to `4`.
  - **Evidence:** `provider-consumer-assignments.component.ts:113-222` renders `[attr.data-testid]="'consumer-summary-' + row.id"` for every loaded row in `rows()` (`setup`, `memory-curator`, `enhancement`) plus `decision-model-row.component.html:73` renders `consumer-summary-decision`. Once `wizard:get-setup-model` replies, `setup` is loaded and produces a 4th `[data-testid^="consumer-summary-"]` cell; leaving `toHaveLength(3)` would immediately fail on CI.
  - **Reversible:** Yes, 1-line edit in `settings-visual.e2e.spec.ts:735`.

---

## Open Items

None. All 28 failing tests from `.ptah/tmp/ci/webview-e2e-failed.log` are directly accounted for by the two verified root causes.
