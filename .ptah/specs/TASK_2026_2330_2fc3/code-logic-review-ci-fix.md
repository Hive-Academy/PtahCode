# Code Logic Review — `TASK_2026_2330_2fc3` (CI fix `fbb73a52ba`)

Scope: read-only logic review of commit `fbb73a52ba` on `feat/setup-background-runs` (implementer: codex; Batch 14 validator switch + PR #1533 `webview-e2e` fix).

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 5/10       |
| Verdict             | REVISE     |
| Blocking issues     | 1          |
| Serious issues      | 2          |
| Moderate issues     | 2          |
| Minor issues        | 2          |
| Failure modes found | 5          |

**Score calibration:** 5/10 ("real gaps"). The core validator switch in `app.config.ts` and `SetupRunStore.canRestoreGenerationRoute` correctly decouples generation-route validation from `TabManagerService`, compares workspaces Windows-aware, drains the legacy adoption queue before rejecting, and fixes the `guidance-completed` stream event type — keeping it above the 3–4 band. However, a Blocking defect in the `guidance-owner-conflict` visual e2e test will still fail CI `webview-e2e`, a Serious flaw lets foreign-workspace Setup records pass validation whenever `workspacePath()` is `null`, and a Serious test gap means reverting `app.config.ts` back to `TabManagerService` would still pass every Jest spec — keeping it well below 7–8.

---

## Five logic questions

### 1. How does this fail silently?

1. **Silent auto-attach clears the blocked rejection in `guidance-owner-conflict`** (`libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts:218-234`, `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:341-358`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:411-419`): returning `rejection: { reason: 'blocked', ownerTabId: 'other-guidance-tab' }` causes `GenerationWorkflowStore.reject()` to adopt `'other-guidance-tab'`, call `bindRecord(owner)` (which sets `rejectionValue.set(null)` at `generation-workflow.store.ts:125`), and return early before setting `rejectionValue`. The UI silently rebinds instead of showing `[data-testid="guidance-owner-conflict"]`, so the visual spec hangs until timeout.
2. **Silent acceptance of foreign-workspace Setup records when no workspace is open** (`libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:258-262`): `workspace === null` short-circuits to `true`, so both `SurfaceRouterService.navigateToUrl` and `SurfaceRoutePersistence.persist` accept and re-persist a saved generation/guidance route belonging to another (closed) workspace.
3. **Silent bypass of restore validation on `/onboarding/analyze/skills?tab=`** (`libs/frontend/core/src/lib/routing/onboarding-routes.ts:172-174` vs `libs/frontend/core/src/lib/routing/surface-router.service.ts:205-222`): `SurfaceRoutePersistence.persist` persists `/onboarding/analyze/skills?tab=<agentGenId>` because `onboardingGenerationBinding` matches `skills`, while `SurfaceRouterService.navigateToUrl` omits `'skills'` from `['agents', 'generate', 'guidance']` and restores stale/foreign `tab=` values without calling the validator.
4. **Silent test blind spot on `app.config.ts` wiring** (`apps/ptah-extension-webview/src/app/webview-routing.spec.ts:505-530, 1300-1341`, `apps/ptah-extension-webview/src/app/surface-message-routing.spec.ts:232-237`): no spec exercises or source-pins that `app.config.ts:246-253` delegates to `SetupRunStore.canRestoreGenerationRoute`; reverting `app.config.ts` to `TabManagerService` leaves every Jest suite green.

### 2. What user action produces unexpected behaviour?

1. **Closing all workspace folders (or restarting Electron when `workspace:switch` fails) after closing on a guidance or agent-generation route** (`libs/frontend/core/src/lib/services/electron-layout.service.ts:909-940`, `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:258-262`): `workspacePath()` is `null`, `canRestoreGenerationRoute` returns `true`, and boot lands on `ProjectGuidancePage` (`project-guidance.page.ts:630-634`, `workspace-mismatch` recovery screen) or `AgentGenerationRunPage` (`agent-generation-run.page.ts:220-225`, `"This agent generation run is unavailable in the current workspace."`) instead of falling back to the host view (`chat`).
2. **Restarting after a legacy chat-tab guidance run that already finished on disk** (`libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:254, 347, 572-574`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:270-276`): `adoptLegacyTabs()` marks the migrated record `liveThisSession.add(record.id)` with `status: 'running'`, so `reconcile()` skips `reconcileGuidanceOutput` (which requires `!live`) and marks it `interrupted` after `ORPHAN_GRACE_MS` instead of `completed`.

### 3. What input data produces a wrong answer?

1. **`workspacePath() === null` paired with any stored Setup record** (`libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:258-262`): `canRestoreGenerationRoute(id, workflow)` returns `true` even though no workspace is active and `SetupRunRecord.workspacePath` is always non-null (`setup-run-persistence.ts:183`).
2. **Saved route `/onboarding/analyze/skills?tab=<dismissedOrForeignAgentGenId>`** (`libs/frontend/core/src/lib/routing/surface-router.service.ts:205-210`): `navigateToUrl` returns `'navigated'` instead of `'failed'` because `'skills'` is omitted from the restore validation guard despite being accepted by `onboardingGenerationBinding` during persistence (`onboarding-routes.ts:172`).
3. **Mocked `blocked` rejection carrying an adoptable `ownerTabId` in `guidance-owner-conflict`** (`libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts:218-224`): produces an adopted rebind with `rejection() === null` instead of the owner-conflict banner.

### 4. What happens when a dependency fails?

1. **`localStorage` throws or holds corrupt JSON (`ptah.setup-runs.v1`)**: `browserStorage()` (`setup-run.store.ts:90-97`) returns `null`, `readSetupRunIndex()` (`setup-run-persistence.ts:294-319`) returns `{ index: {}, corrupt: true }`, so `canRestoreGenerationRoute` returns `false` (after draining any legacy tabs) and `initial-navigation.ts:129-135` falls back cleanly to the host view.
2. **`workspace:getInfo` / `workspace:switch` RPC fails during Electron boot** (`electron-layout.service.ts:906-942`): `_workspaceResolved` still flips `true` in `finally` with `workspacePath() === null` (if nothing was cached), triggering Finding 2 (`canRestoreGenerationRoute` returns `true` for a record belonging to an unactivated workspace).
3. **`enhancedPrompts:getRunState` fails with RPC error**: in `guidance-lookup-error`, `SetupRunBoundCoordinator.reconcile()` (`setup-run-bound.coordinator.ts:257, 269`) gets `undefined` from `readBoundState()` (not `null`), leaves `record.status` as `'running'`, and `ProjectGuidancePage.bindRunSequence()` (`project-guidance.page.ts:727-737`) sets `lookupError(true)` and shows `[data-testid="guidance-lookup-error"]` with Retry. Handled cleanly.
4. **Legacy global `ptah.tabs` key (no workspacePath)**: `TabManagerService.loadTabState` (`tab-manager.service.ts:3369`) calls `sanitizeRestoredTabs(tabs)` without `workspacePath`, so `dropLegacySetupTabs` drops legacy tabs without queuing them (`tab-persistence.ts:219`); `canRestoreGenerationRoute` returns `false` and boot falls back to `chat`, while `reconcile()` adopts live backend runs via `wizard:get-resumable-run`.

### 5. What is missing that the requirements never mentioned?

1. **Reactive-context safety of `canRestoreGenerationRoute`**: draining `adoptLegacyTabs()` mutates `this._index` (and potentially `this._cancelling` via cap eviction) from inside a boolean predicate without `untracked(...)`. Safe for current callers (`navigateToUrl` and RxJS `NavigationEnd`), but any future caller inside a `computed()`/`effect()` will throw Angular `NG0600`.
2. **Route-check coverage across all setup routes and D3 configure chat**: verified that `/onboarding/analyze`, `/onboarding/analyze/done`, `/onboarding/team-builder`, and D3 configure chat (`/chat/<handoffTabId>`, `team-builder-start.page.ts:894-908`) are not rejected by `canRestoreGenerationRoute`, and legacy `/harness-builder/configure-harness/<old>` normalizes to `/onboarding` first (`surface-router.service.ts:236-248`). However, `setup-run.store.spec.ts` only tests guidance acceptance and never tests `agent-generation` acceptance (`/onboarding/analyze/generate?tab=...`) or `SurfaceRoutePersistence` end-to-end with `canRestoreGenerationRoute`.
3. **Recordless `/onboarding/guidance` boot timing**: removing `?tab=` from `GUIDANCE_IDLE_ROUTE` bypasses `initial-navigation.ts:116-125`'s `workspaceResolved` wait, so `ProjectGuidancePage` briefly renders `workspace-mismatch` until Electron workspace sync finishes and the `workspacePath()` effect re-runs `openRoute(null)` (`project-guidance.page.ts:563-570, 630-634`).

---

## Numbered findings

### 1. [Blocking] `guidance-owner-conflict` visual e2e test will still fail CI because `GenerationWorkflowStore.reject()` auto-adopts `ownerTabId` and clears `rejection`

- **File:** `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts:207-239` (interacting with `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:125, 132-137, 341-369`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:411-419`, `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:255-274, 877-912`)
- **Scenario:** `guidance-owner-conflict` boots `/onboarding/guidance`, clicks `[data-testid="guidance-start"]`, and mocks `'enhancedPrompts:runWizard'` to return `{ success: false, rejection: { reason: 'blocked', ownerTabId: 'other-guidance-tab' } }`.
  1. `ProjectGuidancePage.start()` creates a `project-guidance` record and calls `workflow.startGuidance()`.
  2. `GenerationWorkflowStore.reject()` (`generation-workflow.store.ts:341-358`) enters `if (rejection.reason === 'blocked' && rejection.ownerTabId)` and calls `runs.resolveBlockedStart(binding, 'other-guidance-tab')`.
  3. `SetupRunBoundCoordinator.resolveBlockedStart()` (`setup-run-bound.coordinator.ts:418-419`) calls `this.host.adopt({ ...binding, tabId: 'other-guidance-tab' })`, which creates and returns a valid `SetupRunRecord` (`'other-guidance-tab'` passes `isOnboardingIdentityValue`).
  4. `reject()` hits `if (owner && this.bindRecord(owner)) return;` (`generation-workflow.store.ts:357`). `bindRecord(owner)` calls `bind(ownerBinding)`, which sets `this.rejectionValue.set(null)` (`generation-workflow.store.ts:125`) and returns `true`, exiting before `this.rejectionValue.set(rejection)` at line 367. (Pinned as intended behavior by `generation-workflow.store.spec.ts:687-706`.)
  5. `ProjectGuidancePage` renders `[data-testid="guidance-owner-conflict"]` strictly `@if (workflow.rejection()?.reason === 'blocked')` (`project-guidance.page.ts:255`). Because `workflow.rejection()` is `null`, the locator at `onboarding-generate-visual.e2e.spec.ts:232-234` never becomes visible and times out.
- **Impact:** All 8 `guidance-owner-conflict` captures (4 themes × 2 viewports) in `webview-e2e` will fail on CI, defeating the purpose of this CI fix commit.
- **Fix:** In `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts:218-224`, omit `ownerTabId` (`rejection: { reason: 'blocked' }`, matching `project-guidance.page.spec.ts:672, 687`) so `GenerationWorkflowStore.reject()` falls through to line 367 and renders `[data-testid="guidance-owner-conflict"]` (and verify the visual spec under Playwright when the coordinator runs the e2e gate).

### 2. [Serious] `canRestoreGenerationRoute` accepts foreign-workspace records whenever `this.workspacePath()` is `null`

- **File:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:258-262`
- **Scenario:** When Electron opens with zero workspace folders or `workspace:switch` fails during `syncFromBackend()` (`libs/frontend/core/src/lib/services/electron-layout.service.ts:909-940`), `tabs.activeWorkspacePath` is `null` and `vscode.config().workspaceRoot` is `''`, so `this.workspacePath()` returns `null` after `_workspaceResolved` becomes `true`. `canRestoreGenerationRoute` returns `workspace === null || sameSetupWorkspacePath(record.workspacePath, workspace)` → `true` for any stored Setup record from any previously opened workspace.
- **Impact:**
  - Violates the requirement that no foreign-workspace record is accepted.
  - Boot restores `/onboarding/analyze/guidance?tab=...` or `/onboarding/analyze/generate?tab=...` into a broken `workspace-mismatch` recovery screen (`project-guidance.page.ts:630-634`) or `"unavailable in the current workspace"` state (`agent-generation-run.page.ts:220-225`) instead of falling back to `chat`.
  - `SurfaceRoutePersistence.persist` (`surface-route-persistence.ts:75-82`) uses the same validator and re-persists that unowned route while `workspace === null`.
- **Fix:** Change `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:259-262` to require a non-null workspace:
  ```ts
  const workspace = this.workspacePath();
  return (
    workspace !== null &&
    sameSetupWorkspacePath(record.workspacePath, workspace)
  );
  ```
  (Note: `initial-navigation.ts:116-125` already awaits `layout.workspaceResolved` before calling `navigateToUrl` for any `/onboarding?...&tab=...` route, and every `SetupRunRecord` has a non-null `workspacePath` enforced by `parseSetupRunRecord` at `setup-run-persistence.ts:183`.)

### 3. [Serious] Unit specs do not verify `app.config.ts`'s validator wiring and would still pass on the old `TabManagerService` validator

- **File:** `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:505-530, 1300-1341`; `apps/ptah-extension-webview/src/app/surface-message-routing.spec.ts:232-237`; `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:208-257`
- **Scenario:**
  - `webview-routing.spec.ts` deleted the `generationRouteTabValidator` unit test (formerly lines 232–249) and replaced the validator in the Electron boot-ordering test (`webview-routing.spec.ts:507-513`) with `const validateRun = jest.fn(() => workspaceResolved())`.
  - `setup-run.store.spec.ts:227-232` wires its own local factory `(runs: SetupRunStore) => runs.canRestoreGenerationRoute.bind(runs)` rather than anything from `app.config.ts`.
  - `surface-message-routing.spec.ts:234-236` only checks that `app.config.ts` contains the token name `'SurfaceRouterService.generationRouteTabValidatorToken'`.
  - `webview-routing.spec.ts:1300-1341` (`app.config routing wiring`) has no assertion on what `generationRouteTabValidatorToken` is bound to.
- **Impact:** Reverting `app.config.ts:246-253` back to `TabManagerService.findTabByIdAcrossWorkspaces` (the exact PR #1533 bug) causes zero Jest failures across all three projects. Additionally, `setup-run.store.spec.ts:208-257` does not test `agent-generation` acceptance (`/onboarding/analyze/generate?tab=...`), wrong-workflow rejection of an `agent-generation` record on `/onboarding/guidance?tab=...`, `workspace === null` rejection, or `SurfaceRoutePersistence` with `canRestoreGenerationRoute`.
- **Fix:**
  1. Add a source/composition gate in `apps/ptah-extension-webview/src/app/webview-routing.spec.ts` (`app.config routing wiring`) verifying `app.config.ts` binds `SurfaceRouterService.generationRouteTabValidatorToken` to `SetupRunStore` / `canRestoreGenerationRoute` and does not reference `TabManagerService` / `findTabByIdAcrossWorkspaces` in the validator.
  2. Extend `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:208-257` to cover `agent-generation` route acceptance, reverse wrong-workflow rejection, `workspace === null` rejection, and `SurfaceRoutePersistence` preserving vs persisting routes through `canRestoreGenerationRoute`.

### 4. [Moderate] Persistence vs restore validation asymmetry on `/onboarding/analyze/skills?tab=`

- **File:** `libs/frontend/core/src/lib/routing/onboarding-routes.ts:172-174`; `libs/frontend/core/src/lib/routing/surface-route-persistence.ts:75-82`; `libs/frontend/core/src/lib/routing/surface-router.service.ts:205-222`
- **Scenario:** `onboardingGenerationBinding` (`onboarding-routes.ts:172`) binds `['onboarding', 'analyze', 'skills']` to `'setup-agent-generation'`. A cancelled `agent-generation` run navigates to `/onboarding/analyze/skills?tab=<agentGenId>` (`setup-run-steps.ts:77`), which passes `canRestoreGenerationRoute` and is persisted by `SurfaceRoutePersistence`. On boot restore, however, `SurfaceRouterService.navigateToUrl` (`surface-router.service.ts:209`) only checks `['agents', 'generate', 'guidance']` — not `'skills'` — so a dismissed or foreign-workspace `agent-generation` record on `analyze/skills?tab=...` is restored without validation.
- **Impact:** Unvalidated stale/foreign `analyze/skills?tab=...` URLs restore instead of falling back to `chat` (mitigated because `AnalyzeSkillsPage` scopes records via `runsFor(workspaceRoot)`, so no cross-workspace data leaks).
- **Fix:** Align `onboarding-routes.ts:172` and `surface-router.service.ts:209` in Batch 14 cleanup (removing `'skills'` from `generationWorkflowForPath` if `analyze/skills` is no longer a generation-bound tab route, or scoping restore validation carefully so `analysis`/`skill-review` `tab=` links are not broken).

### 5. [Moderate] `canRestoreGenerationRoute` mutates store signals via `adoptLegacyTabs()` without `untracked()` and marks migrated tabs `liveThisSession`

- **File:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:247-256, 339-350, 572-574`
- **Scenario:** On a cache miss (`!record`), `canRestoreGenerationRoute` calls `this.adoptLegacyTabs()` → `this.adopt(tab)` → `this.insert(record)` (`this._index.update(...)`, potential `this._cancelling.set(...)` on eviction, and `scheduleWrite()`).
- **Analysis:** Hydration is safe (`constructor` reads `localStorage` synchronously at lines 190–193), double adoption is prevented (`consumeLegacySetupTabs()` clears its map at `tab-persistence.ts:197` and `adopt()` checks `this.get(id)` at line 340), and current callers do not run in reactive contexts or cause re-entrancy. However:
  1. Calling the validator from any future `computed()`/`effect()` will throw `NG0600` on the signal write.
  2. `adopt()` adds the migrated record to `liveThisSession` (`setup-run.store.ts:347`), which suppresses `reconcileGuidanceOutput` (`setup-run-bound.coordinator.ts:274`) for an already-completed legacy guidance tab until `ORPHAN_GRACE_MS` marks it `interrupted`.
- **Fix:** Wrap `this.adoptLegacyTabs()` inside `untracked(() => this.adoptLegacyTabs())` in `canRestoreGenerationRoute`, and avoid marking legacy-migrated records as `liveThisSession` if they were restored from disk rather than started/pushed in this session.

### 6. [Minor] `guidance-idle` bypasses `workspaceResolved` wait and briefly flashes `workspace-mismatch`

- **File:** `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts:44, 88-102`; `apps/ptah-extension-webview/src/app/initial-navigation.ts:116-125`; `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:561-570, 630-634`
- **Scenario:** Dropping `?tab=` from `GUIDANCE_IDLE_ROUTE` skips `initial-navigation.ts:116-125`'s `workspaceResolved` gate. `ProjectGuidancePage` mounts with `workspacePath() === null`, sets `recovery('workspace-mismatch')`, and then switches to `idle` once `workspace:getInfo`/`workspace:switch` settle and the `workspacePath()` effect re-runs `openRoute(null)`. Playwright's retrying assertions absorb this, but it adds timing sensitivity on slow CI machines.

### 7. [Minor] Pre-existing TypeScript diagnostics in `setup-run.store.spec.ts`

- **File:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:1556, 1582`
- **Note:** Scoped `ptah_get_diagnostics` reports two pre-existing TS2353 errors (`guidanceHandoff` not on `Partial<SetupRunRecord> & { id: string }`, documented in Batch 18A baseline). Not introduced by `fbb73a52ba`, and `tsconfig.lib.json` excludes specs, so `tsc` passed.

---

## Failure modes

### 1. `guidance-owner-conflict` e2e timeout on CI

- **Trigger:** Clicking `[data-testid="guidance-start"]` when `'enhancedPrompts:runWizard'` returns `{ success: false, rejection: { reason: 'blocked', ownerTabId: 'other-guidance-tab' } }`.
- **Symptom:** `GenerationWorkflowStore` adopts `'other-guidance-tab'`, rebinds to it, clears `rejectionValue`, and `[data-testid="guidance-owner-conflict"]` never renders; visual test times out.
- **Evidence:** `onboarding-generate-visual.e2e.spec.ts:218-234`, `generation-workflow.store.ts:125, 341-358`, `setup-run-bound.coordinator.ts:418-419`, `project-guidance.page.ts:255`.
- **Current handling:** No Playwright run was executed for this commit (`fix-report-ci-webview-e2e.md:60`); fixture still sends `ownerTabId: 'other-guidance-tab'`.
- **Recommendation:** Omit `ownerTabId` in the `guidance-owner-conflict` mock rejection (`{ reason: 'blocked' }`) so `reject()` populates `rejectionValue` and renders `[data-testid="guidance-owner-conflict"]`.

### 2. Foreign-workspace Setup route restored and re-persisted with no open workspace

- **Trigger:** Electron boots with no open folder (or `workspace:switch` fails) while `ptahRoute` holds `/onboarding/analyze/guidance?tab=<id>` or `/onboarding/analyze/generate?tab=<id>` from a previously opened workspace.
- **Symptom:** Boot lands on `workspace-mismatch` recovery screen (`ProjectGuidancePage`) or unavailable screen (`AgentGenerationRunPage`) instead of falling back to `chat`, and `SurfaceRoutePersistence` re-persists the unowned route.
- **Evidence:** `setup-run.store.ts:258-262`, `electron-layout.service.ts:909-940`, `project-guidance.page.ts:630-634`, `agent-generation-run.page.ts:220-225`, `surface-route-persistence.ts:75-82`.
- **Current handling:** `workspace === null` returns `true`.
- **Recommendation:** Return `workspace !== null && sameSetupWorkspacePath(record.workspacePath, workspace)`.

### 3. Uncaught regression if `app.config.ts` validator wiring drifts

- **Trigger:** Any future edit that miswires `SurfaceRouterService.generationRouteTabValidatorToken` in `app.config.ts:246-253`.
- **Symptom:** All unit tests pass; only full Electron Playwright e2e catches restored Setup routes falling back to `chat`.
- **Evidence:** `webview-routing.spec.ts:505-530, 1300-1341`, `surface-message-routing.spec.ts:232-237`, `setup-run.store.spec.ts:208-257`.
- **Current handling:** `webview-routing.spec.ts` injects a mock `jest.fn`; `setup-run.store.spec.ts` defines its own provider factory.
- **Recommendation:** Pin `app.config.ts`'s `SetupRunStore` / `canRestoreGenerationRoute` wiring in `webview-routing.spec.ts`'s `app.config routing wiring` suite.

### 4. Stale or foreign `/onboarding/analyze/skills?tab=<agentGenId>` bypasses restore validation

- **Trigger:** Cancelled `agent-generation` run persists `/onboarding/analyze/skills?tab=<id>` via `SurfaceRoutePersistence`; later the record is dismissed or another workspace activates before reload.
- **Symptom:** `SurfaceRouterService.navigateToUrl` navigates to `analyze/skills?tab=<stale>` instead of returning `'failed'` and falling back to `chat`.
- **Evidence:** `onboarding-routes.ts:172`, `surface-route-persistence.ts:75-82`, `surface-router.service.ts:205-222`, `setup-run-steps.ts:77`.
- **Current handling:** `navigateToUrl` checks only `['agents', 'generate', 'guidance']`.
- **Recommendation:** Reconcile `onboarding-routes.ts:172` and `surface-router.service.ts:209` in Batch 14 cleanup.

### 5. Reactive-context write hazard on validator miss

- **Trigger:** A caller invokes `canRestoreGenerationRoute` inside an Angular `computed()` or `effect()` for a missing id while legacy tabs are queued.
- **Symptom:** Angular throws `NG0600` when `adoptLegacyTabs()` updates `_index`.
- **Evidence:** `setup-run.store.ts:251-256, 572-574, 674-685`.
- **Current handling:** No `untracked()` wrapper (safe only because current callers are non-reactive).
- **Recommendation:** Wrap the drain in `untracked(() => this.adoptLegacyTabs())`.

---

## Data flow

1. **Boot & workspace sync (Electron):** `ElectronLayoutService.syncFromBackend()` (`electron-layout.service.ts:897-940`) runs `workspace:switch` → `coordinateWorkspaceSwitch(activePath)` → `WorkspaceCoordinatorService.switchWorkspace(newPath)` (`workspace-coordinator.service.ts:190`) → synchronously invokes `TabManagerService.switchWorkspace(newPath)` → `TabWorkspacePartitionService._loadWorkspaceTabsFromStorage()` (`tab-workspace-partition.service.ts:648`) → `sanitizeRestoredTabs(tabs, workspacePath)` (`tab-persistence.ts:420-425`) drops legacy setup tabs into `pendingLegacySetupTabs` → `ElectronLayoutService` sets `_workspaceResolved.set(true)`. **OK** when a workspace activates; **GAP (Finding 2)** when no workspace is open or `workspace:switch` fails (`workspacePath()` stays `null`).
2. **Initial navigation gate:** `injectInitialNavigation()` (`initial-navigation.ts:116-128`) awaits `layout.workspaceResolved` for any `/onboarding?...&tab=...` URL, then calls `surfaceRouter.navigateToUrl(plan.route)`. **OK** for `tab=` routes; **Minor (Finding 6)** recordless `/onboarding/guidance` skips the wait and briefly flashes `workspace-mismatch`.
3. **Restore validation:** `SurfaceRouterService.navigateToUrl()` (`surface-router.service.ts:198-222`) normalizes legacy surface aliases (`/setup-wizard/...`, `/harness-builder/...` → `/onboarding`), then for `onboarding/guidance` and `onboarding/analyze/{agents,generate,guidance}` with `tab=` invokes `onboardingGenerationBinding` → `GENERATION_ROUTE_TAB_VALIDATOR` (`app.config.ts:247-252`) → `injector.get(SetupRunStore).canRestoreGenerationRoute(id, workflow)`. **GAP (Finding 4)** `analyze/skills` is omitted here though persisted in step 5.
4. **Setup record lookup & legacy drain:** `SetupRunStore` constructor synchronously hydrates `_index` from `ptah.setup-runs.v1` (`setup-run.store.ts:190-193`). `canRestoreGenerationRoute` (`setup-run.store.ts:247-263`) checks `this.get(id)`; on miss, calls `this.adoptLegacyTabs()` (one-shot drain of `pendingLegacySetupTabs` + idempotent `adopt()`), verifies `bindingOf(record)?.workflow === workflow`, and compares `record.workspacePath` with `this.workspacePath()` via Windows-aware `sameSetupWorkspacePath`. **GAP (Finding 2)** `workspace === null` returns `true`; **GAP (Finding 5)** `adoptLegacyTabs()` is not `untracked()` and sets `liveThisSession`.
5. **Route persistence:** On `NavigationEnd`, `SurfaceRoutePersistence.persist()` (`surface-route-persistence.ts:66-116`) checks `onboardingGenerationBinding` and `generationRouteTabValidator` for any `/onboarding/...` URL; on failure it returns without calling `setState`, preserving the prior saved route. **OK** for valid/invalid routes when workspace is active; **GAP (Finding 2)** re-persists foreign routes when `workspace === null`.
6. **Non-generation setup routes & D3 configure chat:**
   - `/onboarding/analyze?tab=<id>`, `/onboarding/analyze/done?tab=<id>`, `/onboarding/team-builder?tab=<id>`: not intercepted by `navigateToUrl`; skipped by `SurfaceRoutePersistence` (preserves last saved route). **OK**.
   - D3 configure chat (`handoffTabId`): routes to `/chat/<handoffTabId>` (`team-builder-start.page.ts:894-908`), outside `/onboarding`, never touches `canRestoreGenerationRoute`. **OK**.

---

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| (1) Every setup route carrying `tab=` validates properly (incl. D3 configure chat / `handoffTabId`); no foreign-workspace or wrong-workflow record accepted | PARTIAL | Valid routes (incl. D3 `/chat/<handoffTabId>`, `analyze`, `done`, `team-builder`, `generate`, `guidance`) are not falsely rejected, and wrong-workflow records are rejected; **however**, `workspace === null` accepts foreign-workspace records (Finding 2) and `analyze/skills?tab=` bypasses restore validation (Finding 4). |
| (2) Draining legacy adoption queue in validator has no harmful side effects | PARTIAL | Safe against pre-hydration, double adoption, and re-entrancy on current callers; **however**, signal mutation is not wrapped in `untracked()` and `adopt()` marks migrated tabs `liveThisSession` (Finding 5). |
| (3) Persistence path cannot drop a valid saved route | COMPLETE | Rejected onboarding URLs return early before `setState`, preserving the previous saved route; valid bound generation/guidance records pass `canRestoreGenerationRoute` (Windows-aware) and persist. (Only caveat is Finding 2 overwriting the saved route when `workspace === null`.) |
| (4) Fixture still exercises all visual test scenarios (idle, running, completed, lookup-error, owner-conflict) | PARTIAL | `guidance-idle`, `guidance-running`, `guidance-completed`, `guidance-lookup-error`, and `done-facts` align with current Setup-record architecture; **`guidance-owner-conflict` is broken** because `ownerTabId: 'other-guidance-tab'` triggers auto-attach and clears `rejection` (Finding 1). |
| (5) Specs would fail on the old validator | PARTIAL | `setup-run.store.spec.ts:208-257, 715-726` fail on the old validator logic, **but** no test exercises or pins `app.config.ts:246-253`, so reverting `app.config.ts` to the old `TabManagerService` validator leaves all Jest suites passing (Finding 3). |

Implicit requirements not addressed:
- E2E visual verification of `guidance-owner-conflict` (Playwright was not run locally, allowing Finding 1 to slip into the commit).

---

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Windows drive-letter case + backslash/trailing slash (`C:\ws` vs `c:/ws/`) | YES | `sameSetupWorkspacePath` via `normalizeSetupWorkspacePath` (`setup-run-persistence.ts:122-150`) | None |
| Active workspace is `null` (0 folders or failed `workspace:switch`) | NO | `workspace === null` returns `true` (`setup-run.store.ts:260`) | Accepts and re-persists foreign-workspace records (Finding 2) |
| Legacy chat tab checked before activation effect | YES | `canRestoreGenerationRoute` calls `adoptLegacyTabs()` on miss (`setup-run.store.ts:252-256`) | Not wrapped in `untracked()`; sets `liveThisSession` (Finding 5) |
| Legacy queue drained twice (validator then `activate()`) | YES | `consumeLegacySetupTabs()` clears map; `adopt()` deduplicates by id | None |
| Wrong workflow (`project-guidance` on `analyze/generate`, or `analysis`/`skill-review`/`team-builder` on `guidance`) | YES | `bindingOf(record)?.workflow !== workflow` returns `false` (`setup-run.store.ts:257`) | Missing spec coverage for `agent-generation` on `guidance` |
| D3 configure chat (`handoffTabId`) | YES | Opens `/chat/<handoffTabId>`, outside `/onboarding` | None |
| `blocked` rejection with adoptable `ownerTabId` in e2e | NO | `GenerationWorkflowStore.reject()` adopts & rebinds, clearing `rejection` | Breaks `guidance-owner-conflict` visual test (Finding 1) |
| Corrupt or unavailable `localStorage` | YES | `readSetupRunIndex` returns empty index; validator returns `false` and boot falls back to `chat` | None |

---

## Checks run

All checks were run strictly scoped inside `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written to `.ptah/tmp/`:

1. **Jest (`libs/frontend/setup-wizard`)** — PASS (2 suites, 156 tests, exit 0):
   - Command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.spec.ts`
   - Log: `.ptah/tmp/review-ci-fix-jest-setup-wizard.log`
2. **Jest (`apps/ptah-extension-webview`)** — PASS (3 suites, 120 tests, exit 0):
   - Command: `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/setup-wizard-entry.spec.ts apps/ptah-extension-webview/src/app/surface-message-routing.spec.ts`
   - Log: `.ptah/tmp/review-ci-fix-jest-webview.log`
3. **Jest (`libs/frontend/core`)** — PASS (3 suites, 155 tests, exit 0):
   - Command: `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/routing/surface-route-persistence.spec.ts libs/frontend/core/src/lib/routing/surface-router.service.spec.ts libs/frontend/core/src/lib/routing/onboarding-routes.spec.ts`
   - Log: `.ptah/tmp/review-ci-fix-jest-core.log`
4. **TypeScript (`tsc --noEmit`)** — PASS (exit 0 on all 4 projects):
   - `libs/frontend/setup-wizard/tsconfig.lib.json`
   - `apps/ptah-extension-webview/tsconfig.app.json`
   - `libs/frontend/core/tsconfig.lib.json`
   - `libs/frontend/webview-e2e-harness/tsconfig.lib.json`
   - Log: `.ptah/tmp/review-ci-fix-tsc.log`
5. **ESLint** — PASS (0 errors, 14 pre-existing `no-non-null-assertion` warnings in `setup-run.store.spec.ts`, exit 0):
   - Checked all 8 changed TS files in commit `fbb73a52ba`.
   - Log: `.ptah/tmp/review-ci-fix-eslint.log`
6. **Scoped `ptah_get_diagnostics`** — completed on retry: 0 new errors on edited lines; 2 pre-existing TS2353 errors in `setup-run.store.spec.ts:1556, 1582` (Batch 18A baseline) plus pre-existing sibling diagnostics.

*Note on tool fallback:* `ptah_code_search_symbols` returned 0 symbols (empty workspace code index, `index 0 symbols`); fell back to read-only `grep -rn` for cross-file symbol usage searches.

---

## Verdict

- **Recommendation:** REVISE
- **Confidence:** HIGH
- **Top risk:** `guidance-owner-conflict` in `onboarding-generate-visual.e2e.spec.ts:207-239` will still fail all 8 CI captures because `GenerationWorkflowStore.reject()` auto-attaches `'other-guidance-tab'` and clears `rejectionValue`, preventing `[data-testid="guidance-owner-conflict"]` from rendering.
- **What a robust implementation would add:**
  1. Fix `guidance-owner-conflict` mock rejection (`onboarding-generate-visual.e2e.spec.ts:218-224`) to omit `ownerTabId` so `[data-testid="guidance-owner-conflict"]` renders as asserted.
  2. Reject `workspace === null` in `SetupRunStore.canRestoreGenerationRoute` (`setup-run.store.ts:258-262`) so closed/unopened workspace records are never accepted or re-persisted.
  3. Add an `app.config.ts` wiring gate in `webview-routing.spec.ts` and expand `setup-run.store.spec.ts` to cover `agent-generation` route acceptance, `workspace === null` rejection, and `SurfaceRoutePersistence` integration.
  4. Wrap `this.adoptLegacyTabs()` in `untracked(...)` inside `canRestoreGenerationRoute` and reconcile the `analyze/skills` validation asymmetry in Batch 14 cleanup.


---

## Re-review round 1

Scope: read-only logic re-review of the uncommitted working-tree diff on top of `fbb73a52ba` (`feat/setup-background-runs`, implementer: codex; per `fix-report-ci-fix-r1.md`) across all 8 modified files, read in full along with their interacting stores, pages, fixtures, and layout services.

### Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Verdict             | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 1        |
| Minor issues        | 1        |
| New failure modes   | 1        |

**Score calibration:** 8/10 ("sound"). All 7 findings from the initial review (1 Blocking, 2 Serious, 2 Moderate, 2 Minor) are resolved cleanly, with targeted regression specs verified to fail against `fbb73a52ba` (or against reverting `app.config.ts` to `TabManagerService`), zero Blocking or Serious defects remain, and all 500 scoped unit tests, 4 production `tsc` builds, and ESLint pass. Kept below 9–10 by one Moderate defensive gap (the `firstValueFrom` wait on `workspaceResolved` in `initial-navigation.ts:126-129` lacks a destroy/`EmptyError` or superseding-navigation guard, now shared by recordless `/onboarding/guidance`), one Minor limitation on legacy D6 guidance tab `createdAt` timestamps, and the remaining runtime uncertainty until Playwright `webview-e2e` executes the updated visual captures.

---

### Status per prior finding

| # | Prior severity | Status | Verification & spec check against `fbb73a52ba` |
| - | -------------- | ------ | ---------------------------------------------- |
| 1 | Blocking | **FIXED** *(pending Playwright e2e)* | `onboarding-generate-visual.e2e.spec.ts:218-221` now mocks `{ success: false, rejection: { reason: 'blocked' } }` without `ownerTabId`. Traced end-to-end: `ProjectGuidancePage.start()` (`project-guidance.page.ts:850-913`) → `GenerationWorkflowStore.startGuidance()` (`generation-workflow.store.ts:203-225`) → `reject()` (`generation-workflow.store.ts:341, 367-368`, skips auto-adoption because `ownerTabId` is absent, sets `rejectionValue = { reason: 'blocked' }`, `stateValue = 'idle'`) → `followWorkflowBinding()` (`project-guidance.page.ts:920-937`) → `workflow.refresh()` (`generation-workflow.store.ts:433-487`, `{ run: null }` leaves `stateValue` `'idle'` and does not clear `rejectionValue`) → `replaceIdentity()` (`project-guidance.page.ts:616`, same `tabId` skips `openRoute`) → `[data-testid="guidance-owner-conflict"]` renders (`project-guidance.page.ts:255-274`). Keeping auto-adoption in production is consistent with `generation-workflow.store.spec.ts:687-706` and `project-guidance.page.spec.ts:671-717`. |
| 2 | Serious | **FIXED** | `setup-run.store.ts:251-263` checks `const workspace = this.workspacePath(); if (workspace === null) return false;` before record lookup or legacy adoption. `setup-run.store.spec.ts:289-295` sets `workspace.set(null)` and asserts both `surface.navigateToUrl(route)` returning `'failed'` and `SurfaceRoutePersistence` not calling `setState` — both assertions fail on `fbb73a52ba` where `workspace === null` returned `true`. |
| 3 | Serious | **FIXED** | `webview-routing.spec.ts:1337-1346` pins `app.config.ts:246-253`'s `generationRouteTabValidatorToken` provider block to `injector.get(SetupRunStore).canRestoreGenerationRoute(id, workflow)` and forbids `TabManagerService` / `findTabByIdAcrossWorkspaces` (fails if `app.config.ts` reverts to the old validator). `setup-run.store.spec.ts:214-296` covers both `project-guidance` and `agent-generation` records, swapped-workflow rejection in both directions, foreign-workspace and `null`-workspace rejection, and `SurfaceRoutePersistence` integration (fails on `fbb73a52ba` at `workspace.set(null)`). |
| 4 | Moderate | **FIXED** | `onboarding-routes.ts:164-177` exports `generationWorkflowForPath`, and `surface-router.service.ts:209-223` shares it with `SurfaceRoutePersistence`. `surface-router.service.spec.ts:675-711` tests stale, valid, duplicate, and absent `tab=` on `/onboarding/analyze/skills`; fails on `fbb73a52ba` where `'skills'` was omitted from `surface-router.service.ts:193` and stale `tab=` navigated without invoking the validator. |
| 5 | Moderate | **FIXED** | `setup-run.store.ts:256` wraps `this.adoptLegacyTabs()` in `untracked(...)`; `setup-run.store.ts:340-358, 580-582` splits `adopt(binding)` (`live = true`) from `adoptBinding(tab, false)` for legacy migration. `setup-run.store.spec.ts:754-779` calls `canRestoreGenerationRoute` inside `computed(...)` (throws `NG0600` on `fbb73a52ba`) and asserts saved-output reconciliation completes (stayed `'running'` on `fbb73a52ba` because `liveThisSession` suppressed `reconcileGuidanceOutput`). |
| 6 | Minor | **FIXED** | `initial-navigation.ts:116-130` waits for `layout.workspaceResolved` for recordless `/onboarding/guidance` (`savedSegments[0]?.path === 'onboarding'` and `savedSegments.length === 2 && savedSegments[1].path === 'guidance'`). `webview-routing.spec.ts:547-574` verifies `navigateToUrl` is not called until `workspaceResolved` turns `true` and `validateRun` is not called — fails on `fbb73a52ba` where `navigateToUrl` ran immediately. |
| 7 | Minor | **FIXED** | `setup-run.store.spec.ts:39-43` widens `record()` to `Partial<StoredSetupRunRecord> & { id: string }`, eliminating both pre-existing TS2353 `guidanceHandoff` errors in `setup-run.store.spec.ts:1605-1638` (verified via `tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.spec.json`). |

---

### Specific verification checks

1. **Null-workspace rejection vs `workspaceResolved` boot ordering:** Safe. On VS Code (`isElectron === false`), `ElectronLayoutService._workspaceResolved` starts `true` (`electron-layout.service.ts:94`) and `vscode.config().workspaceRoot` is populated synchronously from `window.ptahConfig`. On Electron (`isElectron === true`), `initial-navigation.ts:120-128` awaits `layout.workspaceResolved` before invoking `navigateToUrl`. Inside `ElectronLayoutService.syncFromBackend()` (`electron-layout.service.ts:866-943`), `coordinateWorkspaceSwitch(activePath, activeIndex)` runs at line 907 (or line 976 in `fallBackToPersistedFolders`) **before** `finally` flips `_workspaceResolved.set(true)` at line 939, and `coordinateWorkspaceSwitch` (`electron-layout.service.ts:603-625`) updates `this.coordinator.switchWorkspace(newPath)` (`TabManagerService.activeWorkspacePath`) and `this.vscodeService.updateWorkspaceRoot(newPath)` synchronously before returning. Thus `SetupRunStore.workspacePath()` is already non-null on every legitimate Electron boot restore before `canRestoreGenerationRoute` runs, and checking `workspace === null` first also avoids prematurely draining `pendingLegacySetupTabs` when no workspace is open.
2. **Shared skills-route classifier vs live Setup links:** Safe. Every live Setup link to `/onboarding/analyze/skills` uses `SurfaceRouterService.navigateToSurface` or Angular `Router.navigate` / `createUrlTree` (`setup-run-entry.service.ts:51-56`, `onboarding-focus-router.service.ts:33-38`, `analyze-workspace.page.ts:1288-1303`, `analyze-done.page.ts:261-271`, `onboarding.routes.ts:28-31`) — none calls `SurfaceRouterService.navigateToUrl`, whose only production caller is boot restore (`initial-navigation.ts:133`). On live navigation, `SurfaceRoutePersistence.persist()` (`surface-route-persistence.ts:75-82`) declines to persist non-`agent-generation` `tab=` identities on `/onboarding/analyze/skills` without blocking navigation, while valid `agent-generation` records persist and later pass restore validation; recordless `/onboarding/analyze/skills` skips validation (`surface-router.service.ts:210`).
3. **Legacy adoption via `untracked()` without `liveThisSession` cannot make a live run look finished:** Confirmed. In `SetupRunBoundCoordinator.reconcile()` (`setup-run-bound.coordinator.ts:244-279`):
   - If the migrated run is still live on the backend, `readBoundState()` (line 257) returns the live `SetupGenerationRunState`, line 263 immediately calls `observeRun()` (which marks `liveThisSession` at line 293 and keeps `status: 'running'`), and `reconcileGuidanceOutput` is never reached.
   - If `readBoundState()` fails with an RPC error, it returns `undefined` (not `null`, `setup-run-attempt.ts:282-285`) and line 269 returns early, leaving `status: 'running'`.
   - Even if `readBoundState()` returns `null` while an older guidance file exists on disk, `createBoundRunRecord()` (`setup-run-binding.ts:177-188`) sets `createdAt: Date.now()` at adoption time, so `reconcileGuidanceOutput` (`setup-run-attempt.ts:324-325`, `generatedAt > record.createdAt`) returns `'interrupted'`, never `'completed'`, for any prior output.
   - Live session adoption via public `adopt(binding)` (`setup-run.store.ts:340-342`) still passes `live = true`.
4. **Recordless guidance boot gate if `workspaceResolved` never turns true:** Bounded in production, but unguarded locally at `initial-navigation.ts:126-129` (see New Finding 1 below). In production VS Code `_workspaceResolved` starts `true` (`electron-layout.service.ts:94`); in production Electron `syncFromBackend()` sets `_workspaceResolved.set(true)` in `finally` (`electron-layout.service.ts:938-941`) and every RPC (`workspace:getInfo`, `workspace:switch`) is bounded by `ClaudeRpcService`'s 30 s `DEFAULT_RPC_TIMEOUT_MS` (`claude-rpc.service.ts:24, 174-187`); in Playwright `webview-e2e`, `statefulSettingsFixtures()` (`settings.fixtures.ts:775-783`) answers both RPCs immediately. However, `firstValueFrom` itself has no local timeout, destroy `defaultValue`, or `SWITCH_VIEW` race.

---

### Five logic questions (re-review round 1)

#### 1. How does this fail silently?

1. **Pre-reload completed legacy guidance tab reconciles as `'interrupted'` instead of `'completed'`** (`libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts:172-191`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:315-326`, `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:580-582`): because `LegacySetupTab` (`libs/frontend/chat-state/src/lib/tab-persistence.ts:169-172`) carries no original timestamp, `createBoundRunRecord()` sets `createdAt: Date.now()` at reload time. Any legacy guidance run whose file was committed *before* reload has `Date.parse(status.generatedAt) < record.createdAt`, so `reconcileGuidanceOutput` silently classifies it `'interrupted'` (the spec at `setup-run.store.spec.ts:762-764` only hits `'completed'` by mocking a future `Date.now() + 1_000`). Safe against false completions, limited to one-time D6 migration.
2. **No silent failure in `guidance-owner-conflict` or `workspace === null` validation**: both earlier silent-failure paths are closed (`onboarding-generate-visual.e2e.spec.ts:218-221`, `setup-run.store.ts:251-263`).

#### 2. What user action produces unexpected behaviour?

1. **Host `SWITCH_VIEW` while Electron workspace resolution is delayed or stuck on `/onboarding/guidance` (or any `/onboarding?...&tab=...`)** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:126-129`, `apps/ptah-extension-webview/src/app/app.ts:92-94`): because `App.ngOnInit()` awaits `runInitialNavigation()` before setting `initializationStatus('ready')`, and `initial-navigation.ts:126-128` only checks `router.navigated || supersededByNewerNavigation()` *after* `workspaceResolved` emits `true`, a host view switch cannot reveal the shell until `syncFromBackend()` finishes (up to 30–60 s if backend RPCs time out).

#### 3. What input data produces a wrong answer?

1. **Restored `/onboarding/analyze/guidance` without `tab=`** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:118-123`): `isGuidanceEntry` checks `savedSegments.length === 2 && savedSegments[1].path === 'guidance'`, so a manually seeded `/onboarding/analyze/guidance` without `tab=` would skip the wait and briefly flash `workspace-mismatch` before workspace sync finishes. Not reachable via `SurfaceRoutePersistence`, which only persists `/onboarding/...` URLs with a valid `tab=` (`surface-route-persistence.ts:75-82`).
2. **All previously broken inputs (`workspace === null`, `/onboarding/analyze/skills?tab=<stale|duplicate>`, swapped workflow `tab=` ids, Windows path variants) now return the expected result** (`setup-run.store.ts:251-263`, `surface-router.service.ts:209-223`).

#### 4. What happens when a dependency fails?

1. **`workspace:getInfo` or `workspace:switch` times out or fails in Electron**: `ClaudeRpcService.call` resolves a failed `RpcResult` after `DEFAULT_RPC_TIMEOUT_MS` (30 s, `claude-rpc.service.ts:24, 174-187`); `ElectronLayoutService.syncFromBackend` still flips `_workspaceResolved.set(true)` in `finally` (`electron-layout.service.ts:938-941`) with `workspacePath() === null` (if no fallback succeeded), `canRestoreGenerationRoute` now returns `false`, and boot falls back cleanly to the host view (`chat`). Worst-case boot delay when both `workspace:getInfo` and `fallBackToPersistedFolders`'s `workspace:switch` time out is 60 s.
2. **Injector destroyed while awaiting `layout.workspaceResolved` in `initial-navigation.ts:126-128`**: `toObservable` completes without emitting `true`, so `firstValueFrom` throws RxJS `EmptyError` (caught by `App.ngOnInit()` at `app.ts:95-101`, transitioning the destroying component to `'error'`).
3. **`enhancedPrompts:getRunState` fails during legacy-adopted reconciliation**: `readBoundState()` returns `undefined` (`setup-run-attempt.ts:282-285`), so `reconcile()` leaves the record `'running'` without falsely marking it completed or interrupted (`setup-run-bound.coordinator.ts:269`).

#### 5. What is missing that the requirements never mentioned?

1. **Playwright runtime verification of `onboarding-generate-visual.e2e.spec.ts`**: unit tests, `tsc`, and ESLint all pass and static trace confirms `guidance-owner-conflict` and `guidance-idle` logic, but Playwright visual execution was out of scope for both r1 and this review and still needs the coordinator's e2e run.
2. **Defensive `defaultValue` / timeout / superseding-navigation race on `firstValueFrom` in `initial-navigation.ts:126-128`**: pre-existing from the `tab=` boot gate and now shared with recordless `/onboarding/guidance`.

---

### New findings

#### 1. [Moderate] `firstValueFrom` in `initial-navigation.ts` has no local timeout, destroy fallback, or superseding-navigation race

- **File:** `apps/ptah-extension-webview/src/app/initial-navigation.ts:116-130` (caller: `apps/ptah-extension-webview/src/app/app.ts:86-102`; dependency: `libs/frontend/core/src/lib/services/electron-layout.service.ts:94, 866-943`)
- **Scenario:** `injectInitialNavigation` now uses `await firstValueFrom(toObservable(layout.workspaceResolved, { injector }).pipe(filter(Boolean)))` for both `/onboarding?...&tab=...` and recordless `/onboarding/guidance`. In production VS Code `_workspaceResolved` starts `true`, and in production Electron `syncFromBackend()` sets `_workspaceResolved.set(true)` in `finally` with every RPC bounded by `DEFAULT_RPC_TIMEOUT_MS` (30 s). However:
  1. If the injector is destroyed before `workspaceResolved` turns `true`, `toObservable` completes empty and `firstValueFrom` rejects with `EmptyError` (contrary to `initial-navigation.ts:35-36` "never rejects").
  2. If `workspaceResolved` never turns `true` (e.g., an unmocked Electron host stub, or repeated `WORKSPACE_CHANGED` pushes continually replacing `_latestSyncId` before prior syncs finish), `App.ngOnInit()` stays in `'initializing'` forever even if a host `SWITCH_VIEW` already navigated.
- **Impact:** Unlikely in normal Electron/VS Code runs (bounded by `syncFromBackend`'s `finally` + 30 s RPC timeout), so Moderate rather than Serious/Blocking; worst case is a stuck loading screen in a degraded host or an unhandled `EmptyError` during fast teardown.
- **Fix:** Pass `{ defaultValue: false }` to `firstValueFrom` (returning `'cancelled'` on `false`) and consider racing `toObservable(layout.workspaceResolved)` against `router.events` (first `NavigationStart`/`NavigationEnd`) or a bounded fallback timeout in a follow-up cleanup.

#### 2. [Minor] Legacy guidance tab migration assigns `createdAt: Date.now()`, preventing `reconcileGuidanceOutput` from recognizing outputs written before reload

- **File:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:580-582`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts:172-191`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:315-326`; `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:754-779`
- **Scenario:** `adoptLegacyTabs()` calls `adoptBinding(tab, false)` → `createBoundRunRecord(tab)`, which stamps `createdAt: Date.now()` at reload time because `LegacySetupTab` (`tab-persistence.ts:169-172`) stores no creation timestamp. While this safely prevents an older guidance file from ever marking a live/lost run `'completed'`, a legacy guidance tab that completed *before* reload will have `generatedAt < record.createdAt` and still become `'interrupted'` (the spec at `setup-run.store.spec.ts:763` mocks `generatedAt: Date.now() + 1_000` in the future to hit `'completed'`).
- **Impact:** Minor, confined to one-time D6 migration of legacy chat tabs; new Setup-owned records persist their real `createdAt` in `ptah.setup-runs.v1`.

---

### Checks run (re-review round 1)

All checks ran strictly scoped inside `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written to `.ptah/tmp/`:

1. **Jest (`libs/frontend/setup-wizard`)** — PASS (2 suites, 165 tests, exit 0):
   - Command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts`
   - Log: `.ptah/tmp/rereview-r1-jest-setup-wizard.log`
2. **Jest (`libs/frontend/core`)** — PASS (3 suites, 156 tests, exit 0):
   - Command: `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/routing/surface-router.service.spec.ts libs/frontend/core/src/lib/routing/surface-route-persistence.spec.ts libs/frontend/core/src/lib/routing/onboarding-routes.spec.ts`
   - Log: `.ptah/tmp/rereview-r1-jest-core.log`
3. **Jest (`apps/ptah-extension-webview`)** — PASS (4 suites, 143 tests, exit 0):
   - Command: `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/app.spec.ts apps/ptah-extension-webview/src/app/surface-message-routing.spec.ts apps/ptah-extension-webview/src/app/setup-wizard-entry.spec.ts`
   - Log: `.ptah/tmp/rereview-r1-jest-webview.log`
4. **Jest (`libs/frontend/onboarding`)** — PASS (1 suite, 36 tests, exit 0):
   - Command: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts`
   - Log: `.ptah/tmp/rereview-r1-jest-onboarding.log`
5. **TypeScript (`tsc --noEmit`)** — PASS (exit 0 on all 4 production configs; 0 errors in `setup-run.store.spec.ts`):
   - `libs/frontend/setup-wizard/tsconfig.lib.json` → OK
   - `libs/frontend/core/tsconfig.lib.json` → OK
   - `apps/ptah-extension-webview/tsconfig.app.json` → OK
   - `libs/frontend/webview-e2e-harness/tsconfig.lib.json` → OK
   - `libs/frontend/setup-wizard/tsconfig.spec.json` filtered to `setup-run.store.spec.ts` → `NONE` (both TS2353 `guidanceHandoff` errors resolved)
   - Log: `.ptah/tmp/rereview-r1-tsc.log`
6. **ESLint** — PASS (0 errors, 14 pre-existing `no-non-null-assertion` warnings on unchanged lines of `setup-run.store.spec.ts`, exit 0):
   - Checked all 8 modified TS files.
   - Log: `.ptah/tmp/rereview-r1-eslint.log`

*Residual uncertainty:* Playwright/Electron `webview-e2e` (`onboarding-generate-visual.e2e.spec.ts`) was not executed under this review's check scope and should be confirmed by the coordinator's e2e gate.

---

### Verdict (re-review round 1)

- **Recommendation:** APPROVED
- **Confidence:** HIGH (MEDIUM on visual e2e runtime until Playwright runs `onboarding-generate-visual.e2e.spec.ts`)
- **Top risk:** `guidance-owner-conflict` and `guidance-idle` Playwright captures have been traced end-to-end in code and unit specs but have not yet been executed in a live Playwright run on this revision.
- **What a follow-up cleanup could add:** Pass `{ defaultValue: false }` (and optionally a superseding-navigation race) to `firstValueFrom` in `initial-navigation.ts:126-128` so teardown during workspace sync can never throw `EmptyError`.
