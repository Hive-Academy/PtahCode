# Code Logic Review — Batch 17b (`TASK_2026_2330_2fc3`)

Review family: antigravity (implementer: codex)

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 8/10                                 |
| Verdict             | APPROVED                             |
| Critical findings   | 0                                    |
| Major findings      | 0                                    |
| Minor findings      | 4                                    |
| Failure modes found | 0 blocking / 4 residual edge cases   |

**Band rationale:** Sound implementation (8/10) rather than 9–10 because workspace invalidation in `TeamBuilderRunCoordinator` (and workspace change/destroy in `AnalyzeSkillsPage`) does not invoke `wizard:cancel-skill-install`, `AnalyzeSkillsPage` stores confirmed `installed` names in `StackSkillStore` without surfacing them in its failure message or testing the new selection-save failure shape in either frontend spec, removing the `Array.isArray(result.data?.installed)` guard leaves the late `.then()` handler vulnerable to an unhandled rejection on malformed payloads, and frontend `normalizeSetupWorkspacePath` is stricter than backend `sameWorkspaceRoot` for Windows casing/separator differences. Above 5–6 because Finding 11 is closed end to end (both callers send `workspacePath` + unique `installRunId`, Cancel sends `wizard:cancel-skill-install` with the matching ID, late replies including Cancel-then-switch are attributed strictly by normalized reply `workspacePath` against `record.workspacePath`, `cancelled: true` never launches chat, partial `installed` updates only the originating record), Batch 12 F14–F17 behaviors are untouched and verified, all four Batch 17a backend Minors are resolved with sensitive regression tests, the `setup-wizard` barrel export preserves module boundaries with no cycle, and all focused checks pass.

## Required checks (1–6)

1. **Finding 11 closed — PASS.**
   - **Both callers send `workspacePath` and a unique `installRunId`:**
     - `TeamBuilderRunCoordinator.executeInstallAndLaunch` generates `const installRunId = crypto.randomUUID()`, stores it on `execution.installRunId`, and sends `{ skills, consentRecords, workspacePath: execution.workspacePath, installRunId }` without passing a transport abort signal (`libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:702-713`).
     - `AnalyzeSkillsPage.install` captures `workspacePath = this.workspace.config().workspaceRoot`, normalizes it, guards non-empty workspace, and sends `{ workspacePath, installRunId: crypto.randomUUID(), skills, consentRecords }` (`libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1211-1216, 1234-1248`).
   - **Cancel calls `wizard:cancel-skill-install` with the matching ID:**
     - `TeamBuilderRunCoordinator.cancel` deletes `recordId` from `this.executions` and, when `execution.installRunId` is set, calls `void this.cancelSkillInstall(execution.installRunId)` -> `this.rpc.call('wizard:cancel-skill-install', { installRunId })` (`team-builder-run.coordinator.ts:497-502, 516-537`). `execution.installRunId` is cleared once the install await settles (`:736`), preventing spurious cancel RPCs during chat launch, and deleting from `this.executions` prevents duplicate cancel RPCs on double-click.
   - **Late reply attribution uses normalized `result.workspacePath` against `record.workspacePath`, never the current renderer workspace or `this.executions`:**
     - `installRecord` (`team-builder-run.coordinator.ts:858-868`) reads `this.setupRuns.get(recordId)` and compares `normalizeSetupWorkspacePath(replyWorkspacePath) === normalizeSetupWorkspacePath(record?.workspacePath)`. Neither `this.launcher.workspaceRoot()` nor `this.executions` is consulted.
     - `recordStoppedInstall` (`:834-856`) merges `result.installed` into `record.teamBuilder.installed` only when `installRecord` returns a record in `cancelled` or `interrupted` status, never marks `installCompleted`, and never touches any other workspace's record.
     - Covers the **Cancel-then-switch** race: even after `cancel` deletes `recordId` from `this.executions` and the renderer switches from `/ws` to `/ws-b`, a late reply carrying `workspacePath: '/ws/'` attributes partial `installed` to workspace A's cancelled record only, while a reply carrying `workspacePath: '/ws-b'` is ignored without crediting A or mutating B (`team-builder-run.coordinator.spec.ts:842-945`).
     - Also covers the microtask race where `installRpc` resolves while `await this.setupRuns.cancel(recordId)` is suspended before `execution.controller.abort()`: `isStillActive` returns `false`, line `:738-741` routes through `recordStoppedInstall`, and `inactiveOutcome` returns `{ kind: 'cancelled' }` without launching chat.
   - **`cancelled: true` never launches chat:**
     - On an active execution, `if (result.data.cancelled)` (`team-builder-run.coordinator.ts:760-769`) clears recovery, reports `{ status: 'cancelled', step: 'intent', error: null, teamBuilder: { intent, installed } }`, and returns `{ kind: 'cancelled' }` before `markCompletedInstall` or `executeLaunch`.
     - On `AnalyzeSkillsPage`, `if (!response.data.success || response.data.cancelled)` (`analyze-skills.page.ts:1258-1273`) sets a cancellation error, closes consent, and returns before `skillsInstalledState.set(true)` or `continueToGuidance()`.

2. **No regression of Batch 12 F14–F17 behavior — PASS.**
   - Diff inspection confirms zero changes to `recoveryFor`, `saveDraft`, `clearRecovery`, `loadPersistedRecovery` (F12/F14), `executeLaunch`, `handoffDirect`, `handleSendFailure`, `cleanupUncommittedTab`, `closeUncommittedTabForWorkspace`, `flushPendingTabCleanups` (F10/F15), `canClaimWorkspace`, `beginExecution`, `endExecution`, `invalidateForWorkspace`, `isStillActive` (record isolation & dispatch boundary), or `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` (F13/F14).
   - All F14–F17 regression tests in `team-builder-run.coordinator.spec.ts` (including real `TabManagerService` / `TabWorkspacePartitionService` cross-partition close guards at `:1195-1552`) and `team-builder-start.page.spec.ts` (repeated-reload + same-renderer attachment warning at `:1510-1794` and mounted-page record switching at `:1796-1905`) pass.

3. **`AnalyzeSkillsPage` foreign-workspace guard and zero new UI — PASS.**
   - Template (`analyze-skills.page.ts:182-441`) is completely untouched (no new UI).
   - `isCurrent()` (`:1227-1230`) checks both `version === this.version` (incremented on workspace/runId change at `:536` and destroy at `:570`) and `installWorkspace === normalizeSetupWorkspacePath(this.workspace.config().workspaceRoot)` directly, protecting against replies that beat Angular's effect flush.
   - Line `:1250-1256` rejects any reply whose normalized `response.data.workspacePath` differs from `installWorkspace` before calling `this.state.setInstalled(...)`, setting `skillsInstalledState`, or navigating to guidance.

4. **Backend Minors 1–4 resolved and selection-save failure handled by both callers — PASS (with Minor 2 caveat).**
   - **Minor 1 (tests for duplicate ID, throw cleanup, cancel schema, traversal / no-workspace):** Resolved. Duplicate active `installRunId` check moved before the empty-skills shortcut (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1444-1449`) and tested for both non-empty and empty calls (`setup-rpc-skill-install.spec.ts:242-290`); `../` traversal and `WORKSPACE_NOT_OPEN` tested (`:292-320`); `finally` cleanup on installer throw and `propagate` rejection tested (`:322-359`); `WizardCancelSkillInstallParamsSchema` strict validation tested (`setup-rpc.schema.spec.ts:98-115`).
   - **Minor 2 (`keepSelected` failure returns `success: false` + confirmed `installed`):** Resolved on backend (`setup-rpc.handlers.ts:1582-1605`, catching both `false` return and thrown exception, logging the throw, skipping `propagate`, and returning `{ success: false, workspacePath: workspaceRoot, installed, cancelled: signal.aborted, failedSkill: failure?.failedSkill, reason }`; tested at `setup-rpc-skill-install.spec.ts:361-384`).
     - `TeamBuilderRunCoordinator` (`:758-792`) preserves confirmed `installed` names on `record.teamBuilder.installed`, in `outcome.installed`, and in the error text (`Installed: ...`), keeps `hasCompletedInstall` `false`, and does not launch chat.
     - `AnalyzeSkillsPage` (`:1257-1273`) preserves confirmed `installed` names in `StackSkillStore.installed()`, keeps `skillsInstalled()` `false`, closes consent, displays `reason`, and does not navigate to guidance (see Minor 2 for user-visible error text and frontend test coverage).
   - **Minor 3 (`findOpenWorkspaceRoot` nullish guard):** Resolved (`libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:30-32`, tested for `null` and `undefined` at `workspace-authorization.spec.ts:68-71`).
   - **Minor 4 (explicit wizard surface assertions):** Resolved (`apps/ptah-electron/src/di/rpc-surface.spec.ts:63`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:188`).

5. **`setup-wizard` index export dependency direction / circular import check — PASS.**
   - `libs/frontend/setup-wizard/src/index.ts:12` re-exports `normalizeSetupWorkspacePath` from `./lib/services/setup-run-persistence`, a pure module importing only `@ptah-extension/core` and `./setup-run.types`.
   - `libs/frontend/onboarding` already depends on `@ptah-extension/setup-wizard`; `grep` across `libs/frontend/setup-wizard/src/` confirms zero imports of `@ptah-extension/onboarding`.
   - Both projects carry tags `["scope:webview", "type:feature"]` (`libs/frontend/setup-wizard/project.json:7`, `libs/frontend/onboarding/project.json:7`), allowed by `@nx/enforce-module-boundaries` (`eslint.config.mjs:289-291, 372-380`), and ESLint passes with 0 errors on all 13 changed files.

6. **Test regression sensitivity — PASS.**
   - Traced every new and updated spec against removing each production change:
     - `team-builder-run.coordinator.spec.ts:549-645` fails if late workspace-switched attribution stops normalizing or stops attributing by `result.workspacePath`.
     - `team-builder-run.coordinator.spec.ts:842-945` fails if `workspacePath`/`installRunId` are omitted, if Cancel skips `wizard:cancel-skill-install` or mismatches the ID, or if attribution uses `execution.workspacePath` or `launcher.workspaceRoot()` instead of `result.workspacePath`.
     - `team-builder-run.coordinator.spec.ts:947-982` fails if the `result.data.cancelled` branch is removed (status would become `failed` instead of `cancelled`).
     - `analyze-skills.page.spec.ts:758-770, 792-825` fails if request params omit `workspacePath`/`installRunId` or if foreign `response.data.workspacePath` is not rejected before mutating `state.installed` / `skillsInstalled` / navigation.
     - `setup-rpc-skill-install.spec.ts:242-384`, `setup-rpc.schema.spec.ts:98-115`, and `workspace-authorization.spec.ts:68-71` directly fail if any of the Backend Minor 1–3 fixes are reverted.

## Findings

1. **Minor — Workspace switch does not send `wizard:cancel-skill-install`, leaving remaining backend install iterations running after the frontend interrupts the run.**
   - File: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:616-649` (compare `cancel()` at `:497-502`); `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1234-1248`.
   - Impact: When the user switches workspaces `A -> B` during a multi-skill install in A, `invalidateForWorkspace` immediately marks record A `interrupted` and removes it from `this.executions` and `this.inFlight`, but never calls `this.cancelSkillInstall(execution.installRunId)`. Backend pinning prevents any write to B (so workspace isolation holds), yet the backend keeps executing skills `2..N` in workspace A (even if workspace A was closed). If the user switches back `B -> A` and clicks **Continue** before skills `2..N` finish, `canClaimWorkspace` succeeds and launches a second concurrent `wizard:install-skills-with-consent` for workspace A that races on `.ptah/plugins/ptah-skillssh-<owner>-<repo>` and `state.json`; additionally, once `setupRuns.retry(recordId)` moves record A to `needs-input`, `recordStoppedInstall` (`:841`) will ignore the first install's late settlement. Similarly, `AnalyzeSkillsPage` discards `installRunId` inline (`:1238`) and cannot cancel on workspace switch or destroy.
   - Fix: In `TeamBuilderRunCoordinator.invalidateForWorkspace`, invoke `if (execution.installRunId) { void this.cancelSkillInstall(execution.installRunId); }` before aborting `execution.controller` (consistent with `cancel()`), and optionally retain the active `installRunId` in `AnalyzeSkillsPage` to request cancellation on workspace change or destroy while `stage() === 'installing'`.

2. **Minor — `AnalyzeSkillsPage` hides confirmed `installed` skill names from the user on selection-save / partial failure, and neither frontend spec covers the new selection-save failure response.**
   - File: `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1257-1273`, `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:1197-1200`, `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:720-764`.
   - Impact: On `{ success: false, workspacePath: '/ws', installed: ['owner/repo/angular'], cancelled: false, reason: 'Could not save the skill selection.' }`, `AnalyzeSkillsPage` stores confirmed names in `this.state.setInstalled(...)` and avoids treating the reply as success, but nothing in `AnalyzeSkillsPage` or `StackSkillReviewComponent` renders `state.installed()`, and the error string (`:1260-1270`) omits `Installed: ...` (unlike `TeamBuilderRunCoordinator:775-784`). As a result, the user sees `"Some skills could not be installed. Could not save the skill selection."` with no indication that `owner/repo/angular` was already written to disk. Furthermore, neither `team-builder-run.coordinator.spec.ts` nor `analyze-skills.page.spec.ts` has a unit test for the new `success: false` + non-empty `installed` + `reason: 'Could not save the skill selection.'` (no `failedSkill`) response, nor does `analyze-skills.page.spec.ts` test `cancelled: true` or a workspace switch beating the Angular effect (`isCurrent()`).
   - Fix: Include `installed.length ? \`Installed: ${installed.join(', ')}.\` : ''` in `AnalyzeSkillsPage`'s failure/cancel error text (no new UI required), and add focused unit tests in both `team-builder-run.coordinator.spec.ts` and `analyze-skills.page.spec.ts` for selection-save failure (`success: false` + `installed` + `reason`, no `failedSkill`), plus `AnalyzeSkillsPage` `cancelled: true` and in-flight workspace switch.

3. **Minor — Removing the `Array.isArray(result.data?.installed)` guard lets a malformed late install reply throw an unhandled rejection.**
   - File: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:716-732, 758, 838-848`.
   - Impact: `installRpc.then(onFulfilled, onRejected)` (`:716-732`) does not catch exceptions thrown inside `onFulfilled`. Because Batch 17b removed the prior `Array.isArray(result.data?.installed)` check in `recordStoppedInstall`, a malformed reply with missing `data` or non-array `installed` throws a `TypeError` at `result.installed.length` (`:840`) as an unhandled promise rejection. (On the active path at `:758`, the surrounding `try/catch` catches it.)
   - Fix: Guard `if (!result || !Array.isArray(result.installed)) return;` at the top of `recordStoppedInstall` (and guard `Array.isArray(result.data?.installed)` at `:758`), or chain `.catch(...)` after `.then(...)`.

4. **Minor — Windows path normalization asymmetry between backend `sameWorkspaceRoot` and frontend `normalizeSetupWorkspacePath`.**
   - File: `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:13-22` vs `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:122-129` (used by `team-builder-run.coordinator.ts:863-865` and `analyze-skills.page.ts:1252-1253`).
   - Impact: On `win32`, `findOpenWorkspaceRoot` accepts case or slash variants (e.g., `c:\work\app` or `C:/work/app`) via `sameWorkspaceRoot` and returns the host's registered folder spelling (`C:\work\app`). Frontend `normalizeSetupWorkspacePath` only trims whitespace and strips trailing separators; it does not unify `/` vs `\` or fold Windows path case. While Electron normally feeds the same registered spelling to both sides, any host/renderer spelling divergence on Windows causes the backend to succeed and write skills while both frontend callers reject the reply as a workspace mismatch and discard the confirmed `installed` list.
   - Fix: Either document that host and renderer must share canonical `getWorkspaceFolders()` spelling or align Windows separator/drive-letter normalization in `normalizeSetupWorkspacePath` (or a shared workspace-path comparator).

## Five logic questions

### 1. How does this fail silently?
- **No silent cross-workspace write or misattribution remains:** Both callers pass `workspacePath` + `installRunId` and validate the reply's normalized `workspacePath` against the originating record/workspace before applying `installed` or advancing (`team-builder-run.coordinator.ts:704-709, 755-757, 838-868`; `analyze-skills.page.ts:1234-1256`).
- **Silent UI omission on `AnalyzeSkillsPage` partial/selection-save failure (`analyze-skills.page.ts:1257-1273`):** Confirmed writes are saved into `StackSkillStore.installed()`, which nothing in the template renders, and are omitted from `state.error()`, so the user is not told which skills landed on disk before `keepSelected` failed (Finding 2).
- **Silent drop of late settlement after rapid `A -> B -> A -> Continue` (`team-builder-run.coordinator.ts:616-649, 841`):** Because `invalidateForWorkspace` does not cancel the backend install, a still-running install from attempt 1 that finishes after `setupRuns.retry()` returns record A to `needs-input` is silently dropped by `recordStoppedInstall` because `record.status` is no longer `cancelled` or `interrupted` (Finding 1).

### 2. What user action produces unexpected behaviour?
- **Switching workspaces `A -> B` mid-install, then switching back `B -> A` and clicking Continue (`team-builder-run.coordinator.ts:616-649`):** Because workspace invalidation does not call `wizard:cancel-skill-install`, skills `2..N` keep running in A on the backend and can run concurrently with the user's new Continue/Install attempt (Finding 1).
- **Explicit Cancel followed by immediate workspace switch `A -> B` (`team-builder-run.coordinator.ts:485-514, 715-734, 834-868`):** Works as intended — Cancel sends `wizard:cancel-skill-install` with the run's `installRunId`, marks A `cancelled` immediately, keeps the reply subscription alive, and attributes any late confirmed write strictly to A (or ignores foreign paths) without launching chat or mutating B.

### 3. What input data produces a wrong answer rather than an error?
- **Windows casing or separator mismatch between renderer workspace string and host registered folder (`workspace-authorization.ts:13-22`, `setup-run-persistence.ts:122-129`):** Backend accepts `c:\app` or `C:/app` on `win32` and returns `C:\app`, which `normalizeSetupWorkspacePath` treats as unequal to the renderer's string, turning a successful install into a workspace-mismatch failure and hiding confirmed disk writes (Finding 4).
- **Empty `skills: []` with a duplicate active `installRunId` (`setup-rpc.handlers.ts:1444-1457`):** Correctly rejected with `INVALID_PARAMS` before the empty-skills no-op return, keeping the original run cancellable.
- **Trailing slash differences (`/ws/` vs `/ws`):** Correctly matched on both active and late paths via `normalizeSetupWorkspacePath` (`team-builder-run.coordinator.ts:863-865`, `analyze-skills.page.ts:1252-1253`).

### 4. What happens when a dependency fails, times out, or returns a shape it should not?
- **`SkillSyncGate.keepSelected` returns `false` or throws (`setup-rpc.handlers.ts:1582-1605`):** Caught, logged on throw, `propagate` skipped, returns `{ success: false, workspacePath, installed, cancelled, failedSkill, reason }` preserving all confirmed disk writes. `TeamBuilderRunCoordinator` records `installed`, sets `status: 'failed'` at `review`, keeps `hasCompletedInstall` `false`, and does not launch chat. `AnalyzeSkillsPage` stores `installed`, keeps `skillsInstalled()` `false`, closes consent, shows `reason`, and does not navigate (Finding 2).
- **`HarnessPropagationService.propagate` rejects after confirmed writes (`setup-rpc.handlers.ts:1610-1613`):** Still rejects the RPC (clearing `skillInstallRuns` in `finally`, verified at `setup-rpc-skill-install.spec.ts:341-359`); callers fall into their RPC-error branches with `installed: []`. (Pre-existing; Batch 17a Minor 2 targeted `keepSelected`.)
- **`wizard:cancel-skill-install` fails or rejects (`team-builder-run.coordinator.ts:516-537`):** Caught and logged via `logger.debug`; local cancellation still completes immediately and the `installRpc` reply subscription remains active to capture final settlement.
- **Malformed `wizard:install-skills-with-consent` reply missing `installed` array (`team-builder-run.coordinator.ts:716-732, 840`):** Caught on the active path, but throws an unhandled rejection inside `installRpc.then(onFulfilled, onRejected)` on the late path (Finding 3).
- **`workspaceProvider.getWorkspaceFolders()` returns `null`/`undefined` (`workspace-authorization.ts:30-32`):** Safely returns `undefined` -> `UNAUTHORIZED_WORKSPACE`.

### 5. What is missing that the requirements never mentioned?
- **Backend cancellation on workspace switch / page destroy (Finding 1):** Batch 17a's handoff only required calling `wizard:cancel-skill-install` on explicit Cancel, leaving workspace switches and `AnalyzeSkillsPage` teardown to let remaining pinned skills keep installing in the background.
- **Frontend regression coverage for `keepSelected` failure (Finding 2):** Backend tests verify the new `success: false` + `installed` + `reason` payload, but neither frontend spec asserts how `TeamBuilderRunCoordinator` or `AnalyzeSkillsPage` handles that exact no-`failedSkill` shape.

## Data flow

1. `TeamBuilderStartPage.install` -> `TeamBuilderRunCoordinator.installAndLaunch` (`team-builder-run.coordinator.ts:679-713`): generates `installRunId = crypto.randomUUID()`, stores on `execution.installRunId`, sends `{ skills, consentRecords, workspacePath: execution.workspacePath, installRunId }` without transport `AbortSignal`, races with `awaitWithAbort` — **OK**.
2. Explicit Cancel (`team-builder-run.coordinator.ts:485-537`): removes `recordId` from `executions`, calls `wizard:cancel-skill-install` with `execution.installRunId`, cancels record in `SetupRunStore`, aborts local `controller` — **OK**.
3. Workspace switch (`team-builder-run.coordinator.ts:616-649`): marks record `interrupted`, removes from `executions`, aborts local `controller`, **does not call `cancelSkillInstall`** — **Gap (Finding 1)**.
4. Backend `wizard:install-skills-with-consent` (`setup-rpc.handlers.ts:1425-1622`): validates schema -> resolves/pins exact open folder via `findOpenWorkspaceRoot` (null-safe) -> checks duplicate active `installRunId` before empty shortcut -> runs per-skill loop checking `signal.aborted` -> on `keepSelected` returning `false` or throwing, returns `{ success: false, workspacePath, installed, cancelled, failedSkill, reason }` -> clears `skillInstallRuns` in `finally` — **OK**.
5. Late settlement (`team-builder-run.coordinator.ts:715-742, 834-868`): attributes solely by `normalizeSetupWorkspacePath(result.workspacePath) === normalizeSetupWorkspacePath(record?.workspacePath)` for `cancelled`/`interrupted` records; never marks `installCompleted`, never launches chat — **OK (Findings 3 & 4 edge cases)**.
6. Active settlement (`team-builder-run.coordinator.ts:744-811`): validates `installRecord(recordId, result.data.workspacePath)`, handles `cancelled: true` without launching chat, handles `success: false` preserving `installed` + `reason` + pending count without marking `installCompleted`, only marks `installCompleted` and launches on `success: true && !cancelled` — **OK (Finding 4 edge case)**.
7. `AnalyzeSkillsPage.install` (`analyze-skills.page.ts:1209-1282`): captures `workspacePath` + normalized `installWorkspace`, sends `workspacePath` + unique `installRunId`, checks `isCurrent()` (`version` + current normalized workspace), rejects foreign `response.data.workspacePath`, stores `state.setInstalled`, halts on `!success || cancelled` without navigating — **OK (Findings 1, 2, 4)**.

## Checks run

All commands were executed read-only against `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written under `.ptah/tmp/`:

- **Jest (`libs/backend/rpc-handlers`, 5 focused suites):**
  `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/resolve-handler-plan.spec.ts libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.spec.ts`
  - Result: **PASS** — 5/5 suites, **153/153 tests passed** (`.ptah/tmp/b17b-review-jest-rpc-handlers.log`).
- **Jest (`libs/frontend/onboarding`, 3 focused suites):**
  `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
  - Result: **PASS** — 3/3 suites, **110/110 tests passed** (`.ptah/tmp/b17b-review-jest-onboarding.log`).
- **TypeScript (`tsc --noEmit`):**
  - `libs/frontend/setup-wizard/tsconfig.lib.json` — **EXIT 0** (`.ptah/tmp/b17b-review-tsc-setup-wizard-lib.log`).
  - `libs/frontend/onboarding/tsconfig.lib.json` — **EXIT 0** (`.ptah/tmp/b17b-review-tsc-onboarding-lib.log`).
  - `libs/frontend/onboarding/tsconfig.spec.json` — **EXIT 2** (15 known pre-existing errors in untouched files; **0 errors** in changed files `team-builder-run.coordinator*`, `analyze-skills.page*`, `team-builder-start.page*`) (`.ptah/tmp/b17b-review-tsc-onboarding-spec.log`).
  - `libs/backend/rpc-handlers/tsconfig.lib.json` — **EXIT 0** (`.ptah/tmp/b17b-review-tsc-rpc-lib.log`).
  - `libs/backend/rpc-handlers/tsconfig.spec.json` — **EXIT 0** (`.ptah/tmp/b17b-review-tsc-rpc-spec.log`).
- **ESLint (all 13 changed files):**
  - Result: **EXIT 0** — **0 errors, 4 pre-existing warnings** (`preserve-caught-error` at `setup-rpc.handlers.ts:317`; `max-lines` in `setup-rpc.handlers.ts`, `analyze-skills.page.ts`, `team-builder-run.coordinator.ts`) (`.ptah/tmp/b17b-review-eslint.log`).
- **`git diff --check`:** **EXIT 0** (clean).

### Residual uncertainty
- `ptah_get_dependencies` returned an incomplete graph (`omittedByCap: 4105`), so the reverse-import check on `libs/frontend/setup-wizard/src/` used `grep` plus ESLint `@nx/enforce-module-boundaries` verification.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts` and `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` were verified by source inspection and ESLint; running Jest in those host projects was outside the permitted focused-check list.
- Live Electron execution and Windows host path-casing tests were not run in this Linux environment.

## Verdict

- **Recommendation:** APPROVED (8/10)
- **Confidence:** HIGH
- **Top risk:** Switching workspaces mid-install leaves remaining backend skill-install loop iterations running in workspace A after record A is marked `interrupted`, which can overlap with a rapid `B -> A -> Continue` retry.
- **Follow-ups (non-blocking):** Send `wizard:cancel-skill-install` from `TeamBuilderRunCoordinator.invalidateForWorkspace`; include confirmed `installed` names in `AnalyzeSkillsPage`'s failure/cancel error text and add frontend unit tests for the selection-save failure shape; restore the `Array.isArray(result.installed)` guard in `recordStoppedInstall`; consider Windows case/separator alignment for `normalizeSetupWorkspacePath`.
