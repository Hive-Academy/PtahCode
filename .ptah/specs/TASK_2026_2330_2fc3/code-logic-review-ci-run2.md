# Code Logic Review — `TASK_2026_2330_2fc3` (CI run 2 fixes `d322af4f3b`)

Scope: read-only logic review of commit `d322af4f3b` on branch `feat/setup-background-runs` (implementer family: codex; per `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run2.md`), covering all 9 changed TypeScript/spec files read in full along with interacting stores, pages, layout/RPC services, and every `effect()` / `afterRenderEffect()` across `libs/frontend/setup-wizard/src` and `libs/frontend/onboarding/src`.

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Verdict             | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 2        |
| Minor issues        | 3        |
| Failure modes found | 3        |

**Score calibration:** 8/10 ("sound"). Zero Blocking or Serious defects were found. Item A genuinely breaks the reactive feedback loop in `GuidanceGenerationStore.adopt` across all lifecycle paths (running, completed, failed/cancelled/timed-out, workspace switch) without missing any production adoption; Item B hardens `team-builder-start.page.spec.ts` without weakening its behavioral assertions; Item C closes the `EmptyError` and unbounded-wait defects in `initial-navigation.ts` with correct `'cancelled'` vs default-surface handling; Item D preserves historical `lastActivityAt` on D6 legacy guidance migration while rejecting invalid/future values; all functional regression specs fail against `d322af4f3b~1`; and all 372 scoped Jest tests (including `chat-state`), 4 `tsc --noEmit` builds, and ESLint pass. Kept below 9–10 by two Moderate issues — `WORKSPACE_RESTORE_TIMEOUT_MS` (30 s) is half of `ElectronLayoutService.syncFromBackend()`'s two-RPC budget (60 s) and races ahead of its `fallBackToPersistedFolders` recovery path, and two other onboarding effects call `SetupRunStore` writers without `untracked(...)` (currently self-bounding) — plus minor defensive/test-coverage gaps and pending CI verification for Playwright `webview-e2e` and the non-reproducible CI-only trigger in Item B.

---

## Five logic questions

### 1. How does this fail silently?

1. **Slow-but-working Electron workspace sync (or `workspace:getInfo` timeout followed by `fallBackToPersistedFolders`) silently drops and overwrites a valid saved Setup route** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:31, 113, 145-163`, `libs/frontend/core/src/lib/services/electron-layout.service.ts:866-989`, `libs/frontend/core/src/lib/services/claude-rpc.service.ts:24, 151-187`): `syncFromBackend()` awaits two sequential 30 s RPCs (`workspace:getInfo` then `workspace:switch`, or `workspace:getInfo` timeout at 30 s then `fallBackToPersistedFolders` → `workspace:switch`). Because `WORKSPACE_RESTORE_TIMEOUT_MS` is 30 s, a valid workspace resolution finishing at 30.1–60 s loses the race, navigates to `/chat`, logs only a `console.warn`, and lets already-started `SurfaceRoutePersistence` overwrite `ptahRoute` with `/chat`.
2. **No silent infinite loop or missed adoption on current production paths in Item A** (`libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:108-131`, `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:576-580, 665, 747, 927-928`, `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts:81-88`): every production path binds `GuidanceGenerationStore` synchronously alongside `GenerationWorkflowStore` and `ProjectGuidancePage.binding`, so `adopt(run)` inside `untracked` does not miss adoptions today — though any future async gap between `page.binding`/`workflow.run` and `guidance.bind` would silently skip adoption (Finding 3).
3. **Legacy guidance tab whose `lastActivityAt` advanced after output commit (or failed to flush within the 30 s persistence throttle)** (`libs/frontend/chat-state/src/lib/tab-persistence.ts:109, 225, 448-451`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:315-326`): post-commit tab activity makes `lastActivityAt > generatedAt` and conservatively reconciles as `'interrupted'` (no silent false completion); conversely, if a legacy tab was retried without flushing `lastActivityAt` within `LAST_ACTIVITY_PERSIST_GRANULARITY_MS` (30 s) after an earlier output commit, `generatedAt > lastActivityAt` could treat that earlier output as completion. Confined to one-time D6 legacy migration.

### 2. What user action produces unexpected behaviour?

1. **No user action re-triggers the guidance adoption loop**: running, completing, failing, cancelling, retrying/regenerating, or switching workspaces on `ProjectGuidancePage` (`project-guidance.page.ts:563-580, 914-937`) all settle without re-entering `GuidanceGenerationStore.adopt`.
2. **Host `SWITCH_VIEW` while Electron workspace resolution is still pending** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:135-157`, `apps/ptah-extension-webview/src/app/app.ts:86-94`): now behaves as expected — `NavigationStart` ends the workspace wait immediately, `injectInitialNavigation()` returns `'cancelled'` without competing with the newer navigation, and `App.ngOnInit()` transitions `initializationStatus` to `'ready'` so the target surface renders immediately.
3. **Switching workspaces while a Team Builder execution is active or receiving a handoff start on `ProjectGuidancePage`**: both effects (`team-builder-start.page.ts:203-212`, `project-guidance.page.ts:581-604`) terminate cleanly today, so the user sees no hang, though they subscribe unnecessarily to `SetupRunStore._index` due to missing `untracked(...)` around store writers (Finding 2).

### 3. What input data produces a wrong answer?

1. **Malformed `lastActivityAt` in persisted legacy tab JSON (`undefined`, `null`, string, `NaN`, `0`, negative, or future timestamp)** (`libs/frontend/chat-state/src/lib/tab-persistence.ts:225`, `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts:189-192`): `createBoundRunRecord` checks `Number.isFinite(lastActivityAt) && lastActivityAt > 0 && lastActivityAt <= now` and falls back to `now` for all of these, so `reconcileGuidanceOutput` (`generatedAt > record.createdAt`) never falsely marks an older output `'completed'`. However, `dropLegacySetupTabs` forwards the unchecked value onto `LegacySetupTab.lastActivityAt` (Finding 4).
2. **Two slow sequential workspace RPCs totaling > 30 s on Electron boot** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:31, 145-163`): produces a timeout fallback to `/chat` instead of restoring the valid Setup route (Finding 1).
3. **Host `initialView` set to a non-chat surface (e.g., `'settings'`) when workspace resolution times out** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:158-163` vs `:173`; `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:618-638`): timeout always opens `DEFAULT_SURFACE_ID` (`'chat'`) rather than `navigateToHostSurface(hostInitialView)`. This matches the commit's explicit contract (`30 s timeout → default surface`) and avoids landing back on `'onboarding'` when `hostInitialView === 'onboarding'`.

### 4. What happens when a dependency fails?

1. **`workspace:getInfo` hangs or times out on Electron (`ElectronLayoutService` never resolves or falls back to persisted folders)**:
   - If `ElectronLayoutService` never sets `workspaceResolved` (e.g., broken host stub or continually superseded syncs), `initial-navigation.ts:145-163` now bounds boot at 30 s and falls back cleanly to `/chat` without invoking the route validator.
   - If `workspace:getInfo` times out at 30 s and `ElectronLayoutService` enters `fallBackToPersistedFolders` (`electron-layout.service.ts:926-928, 951-989`), `initial-navigation.ts`'s 30 s timer fires right before fallback `workspace:switch` finishes (Finding 1).
2. **Angular injector / `App` destroyed while awaiting `layout.workspaceResolved`** (`apps/ptah-extension-webview/src/app/initial-navigation.ts:129-157`): `takeUntilDestroyed(destroyRef)` completes the merged observable and `{ defaultValue: 'cancelled' }` prevents RxJS `EmptyError`, returning `'cancelled'` without calling `router.navigateByUrl` (verified by `webview-routing.spec.ts:641-662`).
3. **`enhancedPrompts:getRunState` or `enhancedPrompts:status` fails during guidance adoption or legacy reconciliation**:
   - During adoption, `refreshCommitted` (`guidance-generation.store.ts:220-223`) catches and sets `actionFailed(true)` without re-triggering the page effect.
   - During legacy reconciliation, `readBoundState` returns `undefined` (not `null`, `setup-run-attempt.ts:282-285`) so `reconcile()` leaves the record `'running'`; if `readBoundState` returns `null` and `getEnhancedPromptsStatus` returns `{ error }`, `reconcileGuidanceOutput` returns `null` (`setup-run-attempt.ts:320-323`) and preserves the record's status.

### 5. What is missing that the requirements never mentioned?

1. **Same-class `untracked(...)` hygiene on two other onboarding effects** (`project-guidance.page.ts:581-604`, `team-builder-start.page.ts:203-212`): both invoke store writers that touch `SetupRunStore._index` without `untracked(...)` (Finding 2).
2. **Unit-test coverage for invalid/future/missing `lastActivityAt` in `setup-run.store.spec.ts`**: the new table test (`setup-run.store.spec.ts:793-826`) covers `+1_000` and `-1_000` around a valid `lastActivityAt`, but does not exercise `undefined`, `0`, `-1`, `NaN`, or future `lastActivityAt` falling back to `now` (Finding 4).
3. **CI execution of Playwright `webview-e2e` and coverage-mode Jest for `team-builder-start.page.spec.ts`**: out of scope for this review's focused check rules; Playwright must confirm Electron boot finishes for `guidance-running` and `guidance-completed`, and CI must confirm Item B's non-reproducible failure no longer occurs (Finding 5).

---

## Numbered findings

### 1. [Moderate] `WORKSPACE_RESTORE_TIMEOUT_MS` (30 s) is shorter than `ElectronLayoutService.syncFromBackend()`'s two-RPC worst case (60 s) and races ahead of `fallBackToPersistedFolders`

- **File:** `apps/ptah-extension-webview/src/app/initial-navigation.ts:31, 113, 145-163` (interacting with `libs/frontend/core/src/lib/services/electron-layout.service.ts:866-989` and `libs/frontend/core/src/lib/services/claude-rpc.service.ts:24, 151-187`)
- **Scenario:** `ElectronLayoutService.syncFromBackend()` awaits **two sequential** RPCs, each using `DEFAULT_RPC_TIMEOUT_MS = 30_000`:
  1. `workspace:getInfo` (`electron-layout.service.ts:874`), followed by
  2. `workspace:switch` (`electron-layout.service.ts:897`), OR — if `workspace:getInfo` fails/times out at 30 s with cached folders — `fallBackToPersistedFolders()` → `workspace:switch` (`electron-layout.service.ts:926-928, 971`).
  `_workspaceResolved` turns `true` only in `finally` (`electron-layout.service.ts:939`) after both settle.
  Because `WORKSPACE_RESTORE_TIMEOUT_MS` is `30_000` (equal to *one* RPC timeout):
  - On a slow but working Electron boot where `workspace:getInfo` + `workspace:switch` together exceed 30 s (e.g., 16 s + 16 s = 32 s), or whenever `workspace:getInfo` times out at 30 s and `fallBackToPersistedFolders`'s `workspace:switch` succeeds immediately after at ~30.1 s, `timer(30_000)` fires **before** `workspaceResolved` turns `true`.
  - `initial-navigation.ts:162` then calls `navigateToBootSurface(DEFAULT_SURFACE_ID)` (`/chat`), and because `routePersistence.start(plan.seed)` already ran at line 113, the `/chat` `NavigationEnd` overwrites the user's persisted Setup route in `ptahRoute`.
- **Impact:** Unlikely on healthy fast desktops (typically milliseconds), so Moderate; on a heavily loaded CI host or a degraded `workspace:getInfo` that relies on `fallBackToPersistedFolders`, a valid Setup route restore is dropped and overwritten with `/chat`.
- **Fix:** Raise `WORKSPACE_RESTORE_TIMEOUT_MS` above the two-RPC budget (e.g., `2 * DEFAULT_RPC_TIMEOUT_MS + 5_000` = `65_000`, matching the `+5 s` headroom pattern used in `onboarding-workspace.store.ts:137` for a single switch), or explicitly document 30 s as an intentional ceiling that sacrifices `fallBackToPersistedFolders` route restoration to bound startup delay.

### 2. [Moderate] Two other effects in `onboarding` call `SetupRunStore` writers without `untracked(...)` while reading `SetupRunStore._index`

- **File:**
  - `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:581-604` (calling `bindRunSequence` at `:597` and `openRecord` at `:603`)
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:203-212` (calling `this.coordinator.abortWorkspace(this.workspace)` at `:206`)
- **Scenario:** Full audit of all 39 `effect()` and 1 `afterRenderEffect()` calls across `libs/frontend/setup-wizard/src` and `libs/frontend/onboarding/src` found two remaining effects in the same reactive class as Item A:
  1. **`ProjectGuidancePage` handoff effect (`project-guidance.page.ts:581-604`)**: reads `this.runs.get(started.tabId)` / `this.agentRecord(null)` (tracking `SetupRunStore._index`) and calls `void this.bindRunSequence(binding, null)` (`:597`) or `void this.openRecord(record)` (`:603`) synchronously without `untracked(...)`. Before their first `await`, `openRecord` calls `setBinding` → `runs.attach` → `runs.markSeen` → `runs.patch` (writing `_index` when `unseen`), and `bindRunSequence` reads `runs.get` (`_index`) and writes `lookupPending`, `boundRunId`, `workflow`, and `guidance` signals. It avoids an infinite loop today only because `handoff.started()` carries a non-empty `runId` (`generation-handoff.store.ts:277`), so `bindRunSequence` sets `boundRunId` (or `recovery`) synchronously and short-circuits lines 585–587 on the re-run.
  2. **`TeamBuilderStartPage` workspace-switch effect (`team-builder-start.page.ts:203-212`)**: on workspace change, calls `this.coordinator.abortWorkspace(this.workspace)` (`:206`) without `untracked(...)`. `abortWorkspace` → `invalidateForWorkspace` (`team-builder-run.coordinator.ts:704-718`) reads `this.setupRuns.get(recordId)` (tracking `_index`) and calls `this.setupRuns.report(recordId, { status: 'interrupted', ... })` (writing `_index`). It avoids an infinite loop today only because `:211` assigns `this.workspace = root`, so the immediate re-run skips the `if` branch — yet the effect remains subscribed to `_index` until the next workspace switch.
  - Every other effect across both libraries (`setup-run.store.ts:196,205,212`, `generation-handoff.store.ts:66`, `team-builder-run.coordinator.ts:249,262,272`, `team-builder-start.page.ts:213,224,237`, `analyze-done.page.ts:197,202`, `agent-generation-run.page.ts:342,350,362`, `analyze-workspace.page.ts:767,792,803,821`, `analyze-skills.page.ts:531,568`, `onboarding-workspace.store.ts:71`, `project-guidance.page.ts:563`, plus UI-only effects) either wraps store writes in `untracked(...)` or does not write `SetupRunStore._index`.
- **Impact:** Neither effect loops infinitely today, but both rely on fragile guard ordering and retain unnecessary `_index` subscriptions after executing.
- **Fix:** Wrap `project-guidance.page.ts:596-603` (`bindRunSequence` / `openRecord`) and `team-builder-start.page.ts:205-211` (`abortWorkspace` / `resetRecordViewState`) in `untracked(() => { ... })`.

### 3. [Minor] `GuidanceGenerationStore.adopt()` wraps `this.bindingValue()` inside `untracked`, relying on callers binding `guidance` synchronously with `page.binding`

- **File:** `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:114-116`; `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:576-580`
- **Scenario:** Previously, if `adopt(run)` ran while `guidance.bindingValue()` was still `null` or stale, the effect at `project-guidance.page.ts:576` tracked `this.bindingValue()` and re-ran when `guidance.bind(binding)` arrived. Now the entire body of `adopt` is `untracked`, so an early return at `guidance-generation.store.ts:116` will not re-run when `guidance.bind` is called later.
- **Impact:** Minor — verified all current production call sites (`generation-step.store.ts:85-86`, `project-guidance.page.ts:622-624, 665, 747, 927-928`) call `guidance.bind` synchronously with `workflow.bind` and `page.binding`, so no current path misses adoption. Reading `this.guidance.binding()` in `ProjectGuidancePage`'s effect (or guarding `bindingValue` before `untracked`) would prevent a future refactor from silently dropping adoption.

### 4. [Minor] Legacy `lastActivityAt` is forwarded unchecked by `dropLegacySetupTabs` and lacks invalid/future spec coverage

- **File:** `libs/frontend/chat-state/src/lib/tab-persistence.ts:221-226`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts:189-192`; `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:793-826`
- **Scenario:** `dropLegacySetupTabs` reads `tab.lastActivityAt` directly from `JSON.parse`'d `localStorage` without runtime type validation (`tab-persistence.ts:225`), relying on `createBoundRunRecord`'s `Number.isFinite(lastActivityAt) && lastActivityAt > 0 && lastActivityAt <= now` guard (`setup-run-binding.ts:190`). That guard safely handles `undefined`, `null`, strings, `NaN`, `0`, negatives, and future values by falling back to `now`, so no wrong answer occurs downstream, but `setup-run.store.spec.ts:793-826` only exercises a valid historical `lastActivityAt` (`Date.now() - 2_000`) and omits test cases for missing/zero/negative/NaN/future values.
- **Fix:** Normalize `lastActivityAt` to `typeof tab.lastActivityAt === 'number' && Number.isFinite(tab.lastActivityAt) ? tab.lastActivityAt : 0` in `dropLegacySetupTabs`, and add `0`, `-1`, `NaN`, `undefined`, and `Date.now() + 60_000` cases to `setup-run.store.spec.ts`.

### 5. [Minor] Unconfirmed CI-only trigger for Item B and pending Playwright verification for Item A

- **File:** `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:281-284, 341-420`; `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run2.md:11, 44`
- **Scenario:** The changes in `team-builder-start.page.spec.ts` preserve every original assertion (open/close state, `inert`, Back/Cancel reachability, focus on Cancel, Enter/click cancellation, `'cancelled'` record status, return to `'intent'`) and strengthen isolation (`TestBed.resetTestingModule()` before `localStorage.clear()`, `await fixture.whenStable()`, initial `viewStage() === 'intent'` check, scoped `'ptah-stack-skill-consent dialog'` query exercising the shared jsdom polyfill in `libs/frontend/onboarding/src/test-setup.ts:10-15`). However, because the CI-only trigger never reproduced locally and Playwright `webview-e2e` was outside this review's check scope, final confirmation awaits the coordinator's CI / Playwright run.

---

## Failure modes

### 1. Slow Electron workspace sync or `fallBackToPersistedFolders` recovery dropped at 30 s

- **Trigger:** `workspace:getInfo` + `workspace:switch` take > 30 s combined on a loaded host, or `workspace:getInfo` hits `DEFAULT_RPC_TIMEOUT_MS` (30 s) and `ElectronLayoutService.fallBackToPersistedFolders()` recovers with `workspace:switch` at > 30 s.
- **Symptom:** Boot warns `[App] Workspace resolution timed out during route restore.`, lands on `/chat`, and `SurfaceRoutePersistence` overwrites `ptahRoute` with `/chat`.
- **Evidence:** `apps/ptah-extension-webview/src/app/initial-navigation.ts:31, 113, 145-163`; `libs/frontend/core/src/lib/services/electron-layout.service.ts:874, 897, 926-928, 939, 971`; `libs/frontend/core/src/lib/services/claude-rpc.service.ts:24`.
- **Current handling:** Single-RPC 30 s timeout in `initial-navigation.ts`.
- **Recommendation:** Align the wait ceiling with `syncFromBackend()`'s two-RPC worst case (e.g., 65 s) or explicitly accept dropping `fallBackToPersistedFolders` route restores in favor of a 30 s boot cap.

### 2. Unnecessary `SetupRunStore._index` subscriptions in two self-bounding onboarding effects

- **Trigger:** Handoff start arriving on `ProjectGuidancePage` (`project-guidance.page.ts:581-604`) or switching workspaces on `TeamBuilderStartPage` (`team-builder-start.page.ts:203-212`).
- **Symptom:** Both effects execute store readers + writers synchronously without `untracked(...)`; currently bounded by `boundRunId`/`recovery` and `this.workspace = root`, so no loop occurs today, but `TeamBuilderStartPage`'s workspace effect stays subscribed to `_index` until the next workspace switch.
- **Evidence:** `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:581-604, 650-676, 709-760`; `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:203-212`; `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:704-718`.
- **Current handling:** Implicit short-circuit guards only.
- **Recommendation:** Wrap both action bodies in `untracked(() => { ... })`.

### 3. Missed guidance adoption if `guidance.bind` ever executes asynchronously after `workflow.run` + `page.binding`

- **Trigger:** Hypothetical future caller setting `page.binding` and `workflow.run` before calling `guidance.bind` in a later turn.
- **Symptom:** `adopt(run)` returns early at `guidance-generation.store.ts:116` without tracking `bindingValue`, so the later `guidance.bind` does not re-trigger adoption.
- **Evidence:** `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:114-116`; `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:576-580`.
- **Current handling:** All production callers bind `guidance` synchronously alongside `workflow` and `page.binding`.
- **Recommendation:** Track `this.guidance.binding()` in `ProjectGuidancePage`'s effect or evaluate `this.bindingValue()` before entering `untracked`.

---

## Data flow

1. **Item A — Saved running guidance boot & adoption (`ProjectGuidancePage` ↔ `GenerationWorkflowStore` ↔ `GuidanceGenerationStore` ↔ `SetupRunStore`):**
   - `ProjectGuidancePage.openRecord()` (`project-guidance.page.ts:665-666`) sets `page.binding` synchronously, then `bindRunSequence()` (`:747`) calls `GenerationStepStore.bindGuidance()` (`generation-step.store.ts:81-88`), which synchronously binds both `GenerationWorkflowStore` and `GuidanceGenerationStore` (`guidance.bindingValue` is set before any async `workflow.refresh()` settles). **OK**.
   - `workflow.refresh()` resolves with verified `SetupGenerationRunState` and sets `workflow.runValue`. **OK**.
   - `ProjectGuidancePage`'s effect (`project-guidance.page.ts:576-580`) tracks only `workflow.run()` and `page.binding()`, then calls `this.guidance.adopt(run)`. **OK**.
   - `GuidanceGenerationStore.adopt()` (`guidance-generation.store.ts:114-130`) runs entirely inside `untracked(...)`: checks `bindingValue()`, updates `runValue`/`snapshotValue`/`statusValue`, calls `this.report(run)` → `this.runs.get(binding.tabId)` + `this.runs.reportRun(record.id, run)` → `SetupRunStore.patch()` (`setup-run.store.ts:663-682`). Because `_index` is read inside `untracked`, writing `_index` does **not** re-queue the page effect. **OK** (minor fragility on `bindingValue` inside `untracked`: Finding 3).
   - Transition to `completed` / `failed` / `cancelled` / `timed-out` updates `workflow.run()` → effect runs once → `adopt(run)` updates `guidance` and `SetupRunStore` inside `untracked`, and triggers `refreshCommitted` + `GenerationStepStore` section capture (which writes only `captured`). **OK**.
   - Workspace switch triggers `project-guidance.page.ts:563-570` → `untracked(() => void this.openRoute(...))` → unbinds `page.binding`, `workflow`, `guidance` cleanly. **OK**.
2. **Item B — Team builder consent dialog test (`team-builder-start.page.spec.ts` ↔ `TeamBuilderStartPage` ↔ `StackSkillConsentComponent` ↔ `NativeModalComponent`):**
   - `afterEach` destroys `TestBed` before clearing `localStorage` (`team-builder-start.page.spec.ts:281-284`). **OK**.
   - Test mounts component, awaits `whenStable()`, verifies `viewStage() === 'intent'`, transitions to `'consent'`, awaits `whenStable()`, queries `'ptah-stack-skill-consent dialog'`, verifies `dialog.open === true` via shared jsdom `HTMLDialogElement.prototype.showModal/close` (`test-setup.ts:10-15`), clicks Install, verifies `dialog.open === false`, `dialog.inert === true`, Back/Cancel reachability, Cancel focus, keyboard+click cancel, `'cancelled'` record, and return to `'intent'`. **OK**.
3. **Item C — Bounded workspace restore gate (`initial-navigation.ts` ↔ `ElectronLayoutService` ↔ `Router` ↔ `App`):**
   - For `/onboarding?...&tab=...` and recordless `/onboarding/guidance`, `initial-navigation.ts:129-134` checks `destroyRef.destroyed || router.navigated || router.currentNavigation()` up front, then merges `NavigationStart` (`'cancelled'`), `toObservable(layout.workspaceResolved)` (`'resolved'`), and `timer(30_000)` (`'timeout'`) piped through `takeUntilDestroyed(destroyRef)` with `{ defaultValue: 'cancelled' }`. **OK** for destroy & superseding navigation; **GAP (Finding 1)** 30 s timer is half of `syncFromBackend()`'s 2×30 s worst case and beats `fallBackToPersistedFolders`.
   - `'cancelled'` returns `'cancelled'` without navigating; `'timeout'` warns and calls `navigateToBootSurface(DEFAULT_SURFACE_ID)` without invoking the validator; `'resolved'` proceeds to `surfaceRouter.navigateToUrl(plan.route)`. **OK**.
4. **Item D — Legacy guidance timestamp migration (`TabWorkspacePartitionService` → `tab-persistence.ts` → `SetupRunStore` → `setup-run-binding.ts` → `setup-run-attempt.ts`):**
   - `sanitizeRestoredTabs(tabs, workspacePath)` → `dropLegacySetupTabs` (`tab-persistence.ts:221-226`) queues `{ tabId, workflow, workspacePath, lastActivityAt: tab.lastActivityAt }`. **Minor (Finding 4)** raw `JSON.parse` field not type-checked here.
   - `SetupRunStore.adoptLegacyTabs()` (`setup-run.store.ts:581-584`) calls `adoptBinding(tab, false, tab.lastActivityAt)` → `createBoundRunRecord(binding, lastActivityAt)` (`setup-run-binding.ts:172-195`). Valid historical `lastActivityAt` (`Number.isFinite && > 0 && <= now`) becomes `record.createdAt`; invalid/missing/zero/negative/future falls back to `now`. **OK**.
   - On reload with no live backend run, `reconcileGuidanceOutput` (`setup-run-attempt.ts:315-326`) marks `'completed'` iff `Date.parse(status.generatedAt) > record.createdAt`, else `'interrupted'`. **OK**.

---

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| (1) A — Adoption loop broken for every path (running, completed, failed, workspace switch); no missed adoption; audit other effects in `setup-wizard`/`onboarding` | COMPLETE | Loop is broken on all paths and no production path misses adoption; two other self-bounding onboarding effects lacking `untracked(...)` around store writers are reported (Finding 2) and `bindingValue` untracked coupling noted (Finding 3). |
| (2) B — `team-builder-start.page.spec.ts` still tests the same behavior and is not weakened | COMPLETE | All assertions preserved and selector/teardown strengthened; CI-only trigger remains unconfirmed locally (Finding 5). |
| (3) C — Timeout cannot drop a valid restore on a slow-but-working host; `'cancelled'` vs default surface is correct | PARTIAL | `'cancelled'` vs default surface is correct and destroy/`EmptyError`/newer-navigation paths are clean; however, 30 s timeout is shorter than `syncFromBackend()`'s two sequential 30 s RPCs and races ahead of `fallBackToPersistedFolders` (Finding 1). |
| (4) D — Legacy guidance tabs use `lastActivityAt` as `createdAt` (invalid/future → now) with no false completion from older output | COMPLETE | `createBoundRunRecord` rejects missing/invalid/zero/negative/future values safely; minor test-coverage gap for invalid/future inputs and raw field forwarding in `dropLegacySetupTabs` (Finding 4). |
| (5) Specs would fail on the previous code | COMPLETE | Verified by static trace against `d322af4f3b~1`: A (`setup-run.store.spec.ts:276-300`) throws `'Guidance adoption did not settle'`; C (`webview-routing.spec.ts:576-662`) hangs on unresolved `workspaceResolved` (2 tests) and rejects with `EmptyError` on teardown (1 test); D (`setup-run.store.spec.ts:793-826`, `tab-persistence.legacy-setup.spec.ts:71-88`) fails on `createdAt`/`'completed'` and missing `lastActivityAt`. (B is spec-only hardening.) |

Implicit requirements not addressed:
- Playwright `webview-e2e` runtime verification of Electron boot with saved running/completed guidance runs (outside this review's check scope).

---

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Saved running guidance record on Electron boot | YES | `GuidanceGenerationStore.adopt` runs inside `untracked` (`guidance-generation.store.ts:114`) | Needs Playwright `webview-e2e` confirmation on CI |
| Guidance transitions: `running` → `completed`, `failed`, `cancelled`, `timed-out`, workspace switch | YES | `workflow.run()` / `page.binding()` trigger effect once per change; `adopt` writes `_index` untracked | None |
| Guidance retry / regenerate switching to new record (`R1` → `R2`) | YES | `followWorkflowBinding` (`project-guidance.page.ts:927-928`) sets `page.binding` and `guidance.bind` synchronously | Fragile if future code separates `guidance.bind` asynchronously (Finding 3) |
| Newer host `SWITCH_VIEW` during `workspaceResolved` wait | YES | `NavigationStart` ends `merge(...)` immediately with `'cancelled'`, skipping fallback | None |
| Injector destroyed during `workspaceResolved` wait | YES | `takeUntilDestroyed(destroyRef)` + `{ defaultValue: 'cancelled' }` avoids `EmptyError` | None |
| Slow Electron boot (`workspace:getInfo` + `workspace:switch` > 30 s) or `fallBackToPersistedFolders` after 30 s `getInfo` timeout | NO | `timer(30_000)` fires first, opens `/chat`, overwrites saved route | Finding 1 |
| Legacy guidance tab with output newer than `lastActivityAt` (pre-reload) | YES | `record.createdAt = lastActivityAt` → `generatedAt > createdAt` → `'completed'` | None |
| Legacy guidance tab with output older than `lastActivityAt` | YES | `generatedAt <= createdAt` → `'interrupted'` | None |
| Legacy guidance tab with missing / `0` / negative / `NaN` / string / future `lastActivityAt` | YES | `Number.isFinite(v) && v > 0 && v <= now` falls back to `now` (`setup-run-binding.ts:190`) | Untested in `setup-run.store.spec.ts` (Finding 4) |

---

## Checks run

All checks were run strictly scoped inside `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written to `.ptah/tmp/`:

1. **Jest (`libs/frontend/setup-wizard`)** — PASS (3 suites, 176 tests, exit 0):
   - Command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts`
   - Log: `.ptah/tmp/review-ci-run2-jest-setup-wizard.log`
2. **Jest (`libs/frontend/chat-state`)** — PASS (1 suite, 7 tests, exit 0):
   - Command: `npx jest --config libs/frontend/chat-state/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts`
   - Log: `.ptah/tmp/review-ci-run2-jest-chat-state.log`
3. **Jest (`libs/frontend/onboarding`)** — PASS (2 suites, 81 tests, exit 0):
   - Command: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts`
   - Log: `.ptah/tmp/review-ci-run2-jest-onboarding.log`
4. **Jest (`apps/ptah-extension-webview`)** — PASS (1 suite, 108 tests, exit 0):
   - Command: `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
   - Log: `.ptah/tmp/review-ci-run2-jest-webview.log`
5. **TypeScript (`tsc --noEmit`)** — PASS (exit 0 on all 4 projects):
   - `apps/ptah-extension-webview/tsconfig.app.json`
   - `libs/frontend/setup-wizard/tsconfig.lib.json`
   - `libs/frontend/chat-state/tsconfig.lib.json`
   - `libs/frontend/onboarding/tsconfig.lib.json`
   - Log: `.ptah/tmp/review-ci-run2-tsc.log`
6. **ESLint** — PASS (0 errors, 14 pre-existing `no-non-null-assertion` warnings on unchanged lines of `setup-run.store.spec.ts`, exit 0):
   - Checked all 9 modified TS/spec files in commit `d322af4f3b`.
   - Log: `.ptah/tmp/review-ci-run2-eslint.log`

*Tool note:* Free-text `grep -rn` was used for `effect(` / `afterRenderEffect` / `DEFAULT_RPC_TIMEOUT_MS` / `lastActivityAt` call-site searches (no `ptah_grep` tool is listed in this host's tool set).

---

## Verdict

- **Recommendation:** APPROVED
- **Confidence:** HIGH (MEDIUM on live Playwright `webview-e2e` and CI-only Item B flake until CI executes)
- **Top risk:** On a slow Electron boot where `workspace:getInfo` + `workspace:switch` exceed 30 s — or where `workspace:getInfo` times out at 30 s and `fallBackToPersistedFolders` recovers right after — `WORKSPACE_RESTORE_TIMEOUT_MS` (30 s) aborts the restore to `/chat` and overwrites the saved route.
- **What a robust follow-up would add:**
  1. Raise `WORKSPACE_RESTORE_TIMEOUT_MS` in `apps/ptah-extension-webview/src/app/initial-navigation.ts:31` above the two-RPC `syncFromBackend()` budget (e.g., `65_000` ms) if `fallBackToPersistedFolders` route restore should survive a `workspace:getInfo` timeout.
  2. Wrap the action bodies in `project-guidance.page.ts:596-603` and `team-builder-start.page.ts:205-211` in `untracked(...)` to remove unnecessary `SetupRunStore._index` subscriptions.
  3. Sanitize `tab.lastActivityAt` in `dropLegacySetupTabs` (`tab-persistence.ts:225`) and add invalid/zero/negative/future `lastActivityAt` cases to `setup-run.store.spec.ts:793-826`.


---

## Re-review (follow-up)

Scope: read-only re-review of the uncommitted working-tree follow-up on top of `d322af4f3b` (branch `feat/setup-background-runs`, per `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run2-followup.md`), covering all 10 modified files in full plus `ElectronLayoutService`, `VSCodeService`, `ClaudeRpcService`, `App`, `GenerationStepStore`, `GenerationWorkflowStore`, `SetupRunStore`, `setup-run-binding.ts`, and `TeamBuilderRunCoordinator`.

### Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 9/10     |
| Verdict             | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 0        |
| Minor issues (new)  | 2        |
| Failure modes found | 0 (1 theoretical residual risk noted) |

**Score calibration:** 9/10 ("exemplary"). Zero Blocking, Serious, or Moderate issues remain in the reviewed diff. All four actionable code findings (Findings 1–4) from `d322af4f3b` are completely and cleanly resolved with targeted regression specs, `ElectronLayoutService.workspaceResolved` settles on every real path (success, single/double RPC failure or timeout, persisted-folder fallback, no folders, user switch, `WORKSPACE_CHANGED`, and non-Electron VS Code host), neither onboarding effect writes in a tracked context or loses reactivity/Batch 12/18B invariants, `GuidanceGenerationStore.adopt()` safely tracks `bindingValue()` without stale adoption or re-entry loops, and all 513 scoped Jest tests (8 suites across 5 projects), 4 `tsc --noEmit` builds, and ESLint pass. Held at 9/10 rather than 10/10 by two Minor test/hygiene items (no real-`ElectronLayoutService` VS Code webview spec for saved Setup routes; registration-time `Date.now() + 60_000` in two `it.each` tables) and pending external CI confirmation for Playwright `webview-e2e` and the CI-only Item B flake (Finding 5).

### Status per finding

| # | Original severity | Status | Verification evidence |
| - | ----------------- | ------ | --------------------- |
| 1 | Moderate | **RESOLVED** | `apps/ptah-extension-webview/src/app/initial-navigation.ts:121-155` removes `WORKSPACE_RESTORE_TIMEOUT_MS` and waits on `ElectronLayoutService.workspaceResolved` (bounded by `ClaudeRpcService.DEFAULT_RPC_TIMEOUT_MS = 30_000` per RPC, `claude-rpc.service.ts:24, 155, 174-187`). Full path audit of `electron-layout.service.ts:94, 185-194, 807-989` confirms `_workspaceResolved` settles to `true` on every path: non-Electron VS Code webview (`signal(!this.vscodeService.isElectron)` = `true` at `:94`); Electron success (`:881-916`); `workspace:getInfo` failure/timeout/throw with or without `cachedState` (`:926-936`); `workspace:switch` failure/timeout/throw (`:906-914, 929-936`); `fallBackToPersistedFolders` success/failure/timeout/throw or empty cache (`:951-989`, where `:969` bumps `_switchId` without touching `_latestSyncId`, so `syncFromBackend`'s `finally` at `:937-942` always sets `_workspaceResolved.set(true)`); empty backend folders with or without cache (`:917-925`); user `switchWorkspace` superseding (`:538, 876, 904, 935`); and `WORKSPACE_CHANGED` superseding (`:181, 870, 938`). `NavigationStart` and injector teardown still cancel cleanly (`initial-navigation.ts:129-154`). Verified by `webview-routing.spec.ts:606-640` (45 s pending wait preserves saved route, then restores on settlement) and `electron-layout.service.spec.ts:650-790` (128/128 passing). |
| 2 | Moderate | **RESOLVED** | `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:581-604` keeps all guard/record/parent reads tracked (preserving reactivity for late handoff records) and wraps both `void this.bindRunSequence(binding, null)` (`:597`) and `void this.openRecord(record)` (`:603`) in `untracked(...)`, keeping synchronous store/signal writes (`runs.attach`/`markSeen`/`patch`, `lookupPending`, `boundRunId`, `workflow`/`guidance`) out of the reactive context. `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:203-214` tracks `this.launcher.workspaceRoot()` (`:204`), updates `this.workspace = root` (`:213`), and wraps `abortWorkspace`, `currentRecordId.set(null)`, `hydratedRecordId = null`, and `resetRecordViewState()` (`:206-211`) in `untracked(...)`. Verified no lost abort and no regression to Batch 12/18B invariants in untouched `team-builder-run.coordinator.ts` (guarded tab close `:1428-1554`, reply-workspace attribution `:854, 964-1013`, `cancelled: true` never launches `:865-874`). Verified by `project-guidance.page.spec.ts:569-601` and `team-builder-start.page.spec.ts:1466-1498` (`assertNotInReactiveContext` assertions). |
| 3 | Minor | **RESOLVED** | `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:108-133` reads `const binding = this.bindingValue()` and guards `!binding || !matchesBinding(binding, run.binding)` (`:113-114`) synchronously before `untracked(() => { ... })` (`:118-132`). Cannot adopt with a stale binding: no `await` or mutation occurs between `:113` and `:131`, `SetupRunStore` does not mutate `GuidanceGenerationStore.bindingValue`, and async `refreshCommitted(binding)` re-checks `this.sameBinding(binding)` after `await` (`:205, 224`). Cannot re-enter the loop: `adopt()` writes only `runValue`/`snapshotValue`/`statusValue`/`restoring` and (inside `untracked`) `SetupRunStore._index`, none of which are tracked by `ProjectGuidancePage`'s effect (`project-guidance.page.ts:576-580`). Verified by `setup-run.store.spec.ts:276-297` (workflow run arrives before `guidance.bind`, with `guidance.refresh` mocked out, and adoption settles in `<= 3` effect runs). |
| 4 | Minor | **RESOLVED** | `libs/frontend/chat-state/src/lib/tab-persistence.ts:215-233` validates `Number.isFinite(lastActivityAt) && lastActivityAt > 0 && lastActivityAt <= now ? lastActivityAt : 0` at the persistence boundary (`Number.isFinite` rejects `undefined`, `null`, strings, booleans, objects, `NaN`, `±Infinity` without type coercion). Downstream `createBoundRunRecord` (`setup-run-binding.ts:189-192`) maps `0` (and any invalid/future value) to migration `now`. Verified by `tab-persistence.legacy-setup.spec.ts:175-200` and `setup-run.store.spec.ts:834-850`. |
| 5 | Minor | **OPEN (EXTERNAL)** | CI Playwright `webview-e2e` and CI-only Item B flake remain outside local focused-check scope; awaiting coordinator CI run. |

### Five logic questions

#### 1. How does this fail silently?
- **No silent failure introduced in the follow-up diff.**
- On Electron, if both `workspace:getInfo` and fallback `workspace:switch` fail or time out (within 60 s), `ElectronLayoutService.syncFromBackend()` still sets `_workspaceResolved.set(true)` in `finally` (`electron-layout.service.ts:937-942`), after which `initial-navigation.ts:158-165` validates the saved Setup route against the empty/unmatched workspace, fails validation cleanly, warns, and falls back to the host view (or `/chat`).
- In `GuidanceGenerationStore.adopt()` (`guidance-generation.store.ts:113-132`), tracking `bindingValue()` before `untracked` eliminates the silent missed-adoption risk identified in Finding 3 while keeping `SetupRunStore._index` reads/writes untracked.
- In `dropLegacySetupTabs` (`tab-persistence.ts:227-232`), malformed/future `lastActivityAt` values normalize deterministically to `0` → migration `now` → conservative `'interrupted'` reconciliation on older guidance output (`setup-run-binding.ts:189-192`).

#### 2. What user action produces unexpected behaviour?
- **None found.**
- Late handoff on `ProjectGuidancePage` (`project-guidance.page.ts:581-604`) still attaches, clears `unseen`, and binds guidance cleanly without writing inside a tracked reactive context.
- Switching workspaces during an active Team Builder install/launch (`team-builder-start.page.ts:203-214`) still aborts the old workspace's execution, marks its record `'interrupted'`, resets page view state, and respects the `sendInFlight` commit boundary (`team-builder-run.coordinator.ts:686-691`).
- Host `SWITCH_VIEW` while Electron workspace resolution is pending (`initial-navigation.ts:137-140, 148-154`) cancels boot immediately without competing with the host navigation.

#### 3. What input data produces a wrong answer?
- **None found in the follow-up changes.**
- Malformed persisted legacy tab `lastActivityAt` (`undefined`, `null`, `'1000'`, `0`, `-1`, `NaN`, `Infinity`, objects, or future timestamps) all normalize to `0` in `dropLegacySetupTabs` (`tab-persistence.ts:227-232`) and to migration `now` in `createBoundRunRecord` (`setup-run-binding.ts:189-192`).
- Mismatched `binding` vs `run.binding` (different `tabId`, `workflow`, or normalized `workspacePath`) returns early at `guidance-generation.store.ts:114` via `matchesBinding`.

#### 4. What happens when a dependency fails?
- **`workspace:getInfo` fails/times out/throws on Electron (`electron-layout.service.ts:874, 926-942, 951-989`):** falls back to persisted folders if cached (awaiting a bounded 30 s `workspace:switch` inside `try/catch`) and settles `_workspaceResolved` in `finally` regardless of whether fallback `workspace:switch` succeeds, fails, times out, or throws.
- **Both `workspace:getInfo` and `workspace:switch` fail/time out:** `_workspaceResolved` settles at `<= 60 s`; `initial-navigation.ts:158-165` runs route validation, sees no matching workspace, warns, and falls back to host view / `/chat`.
- **Non-Electron (VS Code webview) host (`vscode.service.ts:186-188`, `electron-layout.service.ts:94, 185`):** `isElectron` is `false`, `_workspaceResolved` initializes to `true`, `restoreLayout()` is skipped, and `toObservable(layout.workspaceResolved, { injector })` emits `'resolved'` on the next effect flush so boot proceeds normally.
- **Theoretical residual risk:** if a broken Electron host emitted an unbounded stream of distinct `WORKSPACE_CHANGED` messages faster than `syncFromBackend` settles, `_latestSyncId` (`electron-layout.service.ts:870`) would keep advancing and defer `_workspaceResolved` until the host stopped or a `NavigationStart`/destroy occurred. Acceptable given the deliberate choice of the layout settlement signal (`fix-report-ci-run2-followup.md:26`).

#### 5. What is missing that the requirements never mentioned?
- **Spec-level verification of VS Code (non-Electron) boot with the real `ElectronLayoutService` for a saved Setup route** (`webview-routing.spec.ts:505-663` stubs `ElectronLayoutService` and uses `hostIsElectron(true)` in all six workspace-wait tests; see New Finding 1).
- **Spec-level `assertNotInReactiveContext` check for the `binding !== null` branch of `ProjectGuidancePage`'s handoff effect** (`project-guidance.page.ts:597`, `bindRunSequence`): wrapped identically in `untracked(...)` and verified by inspection, though `project-guidance.page.spec.ts:569-601` exercises only the `!binding` → `openRecord` branch (`:603`).

### Spec failure against `d322af4f3b` (Check 5)

| Spec | Fails on `d322af4f3b`? | Why |
| ---- | ---------------------- | --- |
| `webview-routing.spec.ts:606-640` (45 s slow Electron restore) | **YES** | On `d322af4f3b`, `WORKSPACE_RESTORE_TIMEOUT_MS = 30_000` fires during `advanceTimersByTimeAsync(45_000)`, setting `Router.navigated = true` and overwriting `persisted()` with `/chat`. |
| `project-guidance.page.spec.ts:569-601` (late handoff outside reactive context) | **YES** | Confirmed in `.ptah/tmp/ci-run2-followup-onboarding-red.log:46-60`: `assertNotInReactiveContext(runs.attach)` throws Angular `NG0602` on `d322af4f3b`. |
| `team-builder-start.page.spec.ts:1466-1498` (workspace abort outside reactive context) | **YES** | Confirmed in `.ptah/tmp/ci-run2-followup-onboarding-red.log:1-16`: `assertNotInReactiveContext(coordinator.abortWorkspace)` throws Angular `NG0602` at `team-builder-start.page.ts:206` on `d322af4f3b`. |
| `setup-run.store.spec.ts:276-297` (guidance adoption when `guidance.bind` follows `workflow.run`) | **YES** | On `d322af4f3b`, `bindingValue()` is read inside `untracked`, so calling `guidance.bind(guidanceBinding)` with `guidance.refresh` mocked to a no-op never re-runs the effect, leaving `guidance.status()` at `'idle'` instead of `'running'`. |
| `tab-persistence.legacy-setup.spec.ts:175-200` (invalid `lastActivityAt` normalization) | **YES** | On `d322af4f3b`, `dropLegacySetupTabs` forwards raw `tab.lastActivityAt` (`undefined`, `null`, `'1000'`, `-1`, future timestamp) instead of `0`. |
| `setup-run.store.spec.ts:834-850` (invalid `lastActivityAt` migration fallback) | Pins existing `d322af4f3b` guard | `createBoundRunRecord` (`setup-run-binding.ts:190`) already guarded these inputs in `d322af4f3b`; this spec closes the Finding 4 test-coverage gap (while `tab-persistence.legacy-setup.spec.ts:175-200` fails directly on `d322af4f3b`). |

### New findings

1. **[Minor] No non-Electron (VS Code webview) test in `webview-routing.spec.ts` exercises a saved Setup route against the real `ElectronLayoutService`**
   - **File:** `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:505-663`; `apps/ptah-extension-webview/src/app/initial-navigation.ts:121-155`
   - **Scenario:** All six workspace-wait tests in `webview-routing.spec.ts` override `ElectronLayoutService` with a mock signal and call `hostIsElectron(true)`. While code inspection confirms VS Code webview boots cleanly (`ElectronLayoutService._workspaceResolved` starts `true` when `!this.vscodeService.isElectron`, `electron-layout.service.ts:94`), an explicit test with `hostIsElectron(false)` and the real `ElectronLayoutService` would pin that invariant directly (and guarding `if (!layout.workspaceResolved())` in `initial-navigation.ts:121` would also skip the unnecessary `toObservable` effect cycle on VS Code).
2. **[Minor] `Date.now() + 60_000` is evaluated at `describe`-block definition time in two `it.each` tables**
   - **File:** `libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts:175`; `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:834`
   - **Scenario:** `it.each([..., Date.now() + 60_000])` captures the future timestamp when Jest parses the file rather than when the test executes. Harmless at current runtimes (< 10 s), but computing the offset inside the test body avoids any clock drift if a slow CI worker exceeds 60 s before reaching that case.

### Checks run

All checks were run strictly scoped inside `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written to `.ptah/tmp/`:

1. **Jest (`apps/ptah-extension-webview`)** — PASS (1 suite, 108 tests, exit 0):
   - `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
   - Log: `.ptah/tmp/rereview-webview-jest.log`
2. **Jest (`libs/frontend/onboarding`)** — PASS (2 suites, 83 tests, exit 0):
   - `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
   - Log: `.ptah/tmp/rereview-onboarding-jest.log`
3. **Jest (`libs/frontend/setup-wizard`)** — PASS (3 suites, 181 tests, exit 0):
   - `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts`
   - Log: `.ptah/tmp/rereview-setup-wizard-jest.log`
4. **Jest (`libs/frontend/chat-state`)** — PASS (1 suite, 13 tests, exit 0):
   - `npx jest --config libs/frontend/chat-state/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts`
   - Log: `.ptah/tmp/rereview-chat-state-jest.log`
5. **Jest (`libs/frontend/core`)** — PASS (1 suite, 128 tests, exit 0):
   - `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/electron-layout.service.spec.ts`
   - Log: `.ptah/tmp/rereview-core-jest.log`
6. **TypeScript (`tsc --noEmit`)** — PASS (exit 0 on all 4 projects):
   - `apps/ptah-extension-webview/tsconfig.app.json`
   - `libs/frontend/onboarding/tsconfig.lib.json`
   - `libs/frontend/setup-wizard/tsconfig.lib.json`
   - `libs/frontend/chat-state/tsconfig.lib.json`
   - Log: `.ptah/tmp/rereview-tsc.log`
7. **ESLint** — PASS (0 errors, 18 pre-existing warnings on unchanged lines, exit 0):
   - Checked all 10 modified files in the working-tree diff.
   - Log: `.ptah/tmp/rereview-eslint.log`

*Tool note:* `ptah_code_search_symbols` returned 0 symbols (empty/unbuilt index), so file reads targeted the known paths directly from the diff and fix report.

### Verdict

- **Recommendation:** APPROVED
- **Score:** 9/10
- **Confidence:** HIGH (MEDIUM on external CI Playwright `webview-e2e` and CI-only Item B flake until CI runs)
- **Top risk:** External CI verification of Playwright `webview-e2e` and the CI-only Item B trigger remains pending; within the reviewed code itself, only the theoretical case of an unbounded `WORKSPACE_CHANGED` storm delaying `_workspaceResolved` remains.
