# Code Logic Review — Batch 17a (`TASK_2026_2330_2fc3`)

Review family: antigravity (implementer: codex)

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Verdict             | APPROVED |
| Critical findings   | 0        |
| Major findings      | 0        |
| Minor findings      | 4        |
| Failure modes found | 0 blocking / 2 residual edge cases |

**Band rationale:** Sound implementation (8/10) rather than 9–10 because several new backend branches (duplicate active `installRunId`, throw-path `finally` cleanup, cancel schema validation, path-traversal and no-workspace boundaries) lack dedicated unit tests, `wizard:cancel-skill-install` is not named in the explicit Electron/CLI surface-spec lists, and a post-write `keepSelected` failure still throws without returning already-confirmed `installed` names. Above 5–6 because every write, legacy adoption, selection, propagation, and kept-item call is pinned to a single resolved workspace root, explicit `workspacePath` validation is exact-root and cannot be bypassed, cancellation uses a clean between-skills boundary with guaranteed cleanup, and all focused checks pass.

## Required checks (1–7)

1. **Single workspace resolution and end-to-end pinning — PASS.**
   - `SetupRpcHandlers.registerInstallSkillsWithConsent` resolves `workspaceRoot` once at entry via `findOpenWorkspaceRoot(workspacePath, this.workspaceProvider)` when `workspacePath` is provided, or `this.workspaceProvider.getWorkspaceRoot()` once when omitted (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1435-1437`).
   - `installConsentSkills` passes that pinned `workspaceRoot` to every `installer.install(..., workspaceRoot)` call (`setup-rpc.handlers.ts:1523-1556`), `gate.keepSelected(workspaceRoot, ...)` (`:1582-1585`), `propagation.propagate(workspaceRoot, ...)` (`:1596-1599`), and the response `workspacePath` (`:1603`).
   - `SkillsShRpcHandlers.install` resolves `const workspaceRoot = pinnedWorkspaceRoot ?? this.getWorkspaceRoot()` once (`libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:433`) and threads that value through `location` (`:440-443`), `adoptLegacyInstalls(workspaceRoot)` (`:445, 761-765`), `sourceRoots.install(request, location, ...)` (`:451-453`), `getHarnessRoot(workspaceRoot)` (`:465, 1090-1094`), `propagate('skillsSh:install', harnessRoot)` (`:466, 692-703`), and `keptForInstall(harnessRoot, ...)` (`:467-472, 727-741`). Because `workspaceRoot` and `harnessRoot` are always strings (never `undefined`), the default initializers on `getHarnessRoot` and `propagate` do not fire during `install`.
   - Downstream collaborators (`SkillsShSourceRootService.install` / `adoptLegacyInstalls`, `SkillSyncGate.keepSelected`, `HarnessPropagationService.propagateWithReport`, `MarketplaceLocalItemsService.keptReport`, and Electron's `createUserLayerRefresher` -> `refreshUserLayer` -> `buildMirrorSources`) all operate on their passed root argument without re-querying `IWorkspaceProvider.getWorkspaceRoot()`.

2. **Explicit `workspacePath` validation — PASS.**
   - `setup-rpc.schema.ts:15, 51` bounds `workspacePath` to `z.string().min(1).max(4096).optional()`.
   - `setup-rpc.handlers.ts:1435-1443` runs `findOpenWorkspaceRoot(workspacePath, this.workspaceProvider)` before the empty-skills shortcut and throws `RpcUserError('Access denied: workspace path is not an open folder.', 'UNAUTHORIZED_WORKSPACE')` whenever an explicit path fails to match.
   - `sameWorkspaceRoot` (`libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:6-23`) normalizes with `path.resolve` / `path.normalize`, strips trailing separators (preserving filesystem roots), folds case only on `win32`, and requires exact root equality — rejecting child paths, sibling prefixes, and `..` traversals outside open folders. `findOpenWorkspaceRoot` (`:26-33`) returns the host's registered folder spelling rather than the caller's input. (See Minor 3 for a missing null guard if a non-conforming provider returns `null` from `getWorkspaceFolders()`.)

3. **Cancellation lifecycle — PASS.**
   - Safe boundary: `installConsentSkills` checks `if (signal.aborted) break;` at the top of each skill iteration (`setup-rpc.handlers.ts:1507`), letting an in-flight skill finish cleanly and skipping remaining skills.
   - Settlement cleanup: `skillInstallRuns.set(installRunId, controller)` is guarded by `try { return await this.installConsentSkills(...); } finally { if (installRunId) this.skillInstallRuns.delete(installRunId); }` (`setup-rpc.handlers.ts:1465-1475`), clearing registration on normal completion, cancellation, partial failure, and thrown errors alike.
   - Duplicate IDs: `if (installRunId && this.skillInstallRuns.has(installRunId))` throws `RpcUserError(..., 'INVALID_PARAMS')` (`:1458-1463`) before entering `try/finally`, so a duplicate call never overwrites or deletes the active run's entry.
   - Cancel after settle / unknown ID: `wizard:cancel-skill-install` parses with `z.strictObject({ installRunId })` (`setup-rpc.schema.ts:47, 64-66`), trims `installRunId` identically to the install schema, aborts if present, and returns `{ cancelled: controller !== undefined }` (`setup-rpc.handlers.ts:1483-1491`). Repeated cancels while in flight are idempotent (`controller.abort()`).

4. **Confirmed writes in `installed` — PASS (with Minor 2 caveat).**
   - `installed.push(skillName)` runs only after `installer.install` resolves with `result.success === true` and `verifiedHash` was populated inside `verifyStaged` (`setup-rpc.handlers.ts:1557-1559`), and before `recordConsent` / `invalidateInstallCaches`.
   - On invalid skill name, consent/hash rejection, installer failure, or thrown error on a later skill, `installed` retains only earlier confirmed writes in `workspaceRoot`, runs `keepSelected` + `propagate` for them, and returns `{ success: false, workspacePath: workspaceRoot, installed, cancelled: signal.aborted, failedSkill, reason }` (`:1562-1607`).
   - Caveat: if `gate.keepSelected` returns `false` after disk writes, the thrown `PERSISTENCE_UNAVAILABLE` error drops `installed` from the RPC error response (see Minor 2).

5. **Backward compatibility for existing callers — PASS.**
   - `WizardInstallSkillsWithConsentParams` and `WizardInstallSkillsWithConsentParamsSchema` make `workspacePath` and `installRunId` optional (`libs/shared/src/lib/types/rpc.types.ts:110-115`, `setup-rpc.schema.ts:49-62`).
   - `WizardInstallSkillsWithConsentResponse` makes `workspacePath` and `cancelled` optional (`rpc.types.ts:116-124`), so existing typed frontend mocks remain compatible.
   - Verified callers `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1222-1246` and `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:672-735` send only `{ skills, consentRecords }`, ignore additive response fields, and now automatically get single-resolution workspace pinning on the backend.

6. **Registration of `wizard:cancel-skill-install` — PASS.**
   - Type map & runtime allowlist: `RpcMethodRegistry['wizard:cancel-skill-install']` (`libs/shared/src/lib/types/rpc.types.ts:1652-1655`) and `RPC_METHOD_ENTRIES['wizard:cancel-skill-install']: true` (`:3924`, feeding `RPC_METHOD_NAMES`).
   - Runtime prefix allowlist: `'wizard:'` is present in `ALLOWED_METHOD_PREFIXES` (`libs/backend/vscode-core/src/messaging/rpc-handler.ts:67`), verified by `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`.
   - Handler & static manifest: `SetupRpcHandlers.METHODS` (`setup-rpc.handlers.ts:279`) and `SetupRpcHandlers.register()` (`:386`), consumed by `RPC_HANDLER_MANIFEST` (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:430-435`, `requires: []`).
   - Electron: `apps/ptah-electron/src/rpc-host-profile.ts` derives its surface from `RPC_HANDLER_MANIFEST` via `registerRpcSurface` with `assertOnDrift: true`, and `apps/ptah-electron/src/di/phase-4-handlers.ts:189` registers `SetupRpcHandlers` via `registerSharedRpcHandlers()`. (See Minor 4 for explicit list coverage in Electron/CLI surface specs.)

7. **Pin-removal regression sensitivity — PASS.**
   - `setup-rpc-skill-install.spec.ts:76-100, 191-240` pauses skill 1 during staging, switches `getWorkspaceRoot` to `otherWorkspace`, and asserts `installer.install` received `workspaceRoot` on both calls, `getWorkspaceRoot` call count is `0` (explicit) / `1` (implicit), `keepSelected` and `propagate` received `workspaceRoot`, both `SKILL.md` files exist under `workspacePluginsDir(workspaceRoot)`, and both fail `fs.access` with `ENOENT` under `workspacePluginsDir(otherWorkspace)`. Removing the pin in `setup-rpc.handlers.ts` causes the mock `pinnedRoot ?? getWorkspaceRoot()` (`:85-87`) to write into `otherWorkspace` and fails every assertion.
   - `skills-sh-rpc.handlers.spec.ts:489-517` constructs the real `SkillsShRpcHandlers` with active workspace `'/active'`, calls `install(..., '/pinned')`, and asserts `adoptLegacyInstalls`, `sourceRoots.install`, `propagateWithReport`, and `keptReport` all receive `'/pinned'` (or `resolveHarnessWorkspaceRoot('/pinned')`). Removing the pin at any of those four sites fails the test.

## Findings

1. **Minor — Missing regression tests for duplicate active `installRunId`, throw-path cleanup, cancel schema validation, and path-traversal / no-workspace cases.**
   - File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts:191-297`, `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts:27-109` (covering `setup-rpc.handlers.ts:1452-1475, 1484-1487`, `setup-rpc.schema.ts:47, 64-66`).
   - Impact: Four new boundary paths — rejecting a duplicate active `installRunId` with `INVALID_PARAMS` without clearing the active run's controller, deleting `installRunId` in `finally` when `installConsentSkills` throws (e.g., `keepSelected` returning `false`), strict schema rejection of invalid/extra keys in `WizardCancelSkillInstallParamsSchema`, and `UNAUTHORIZED_WORKSPACE` on `..` traversal / `WORKSPACE_NOT_OPEN` on non-empty skills with no open folder — are untested and could regress unnoticed.
   - Fix: Add focused tests in `setup-rpc-skill-install.spec.ts` and `setup-rpc.schema.spec.ts` covering duplicate active `installRunId`, throw-path cleanup followed by reuse/cancel, `../` traversal and empty-workspace errors, and `WizardCancelSkillInstallParamsSchema` rejections.

2. **Minor — `keepSelected` failure after confirmed writes throws `PERSISTENCE_UNAVAILABLE` and drops `installed` from the response.**
   - File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1577-1591` (consumer: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:704-713`).
   - Impact: If `SkillSyncGate.keepSelected` returns `false` (e.g., locked or unwritable `state.json`) after one or more skills have already been written to `{workspaceRoot}/.ptah/plugins/` and propagated inside `SkillsShRpcHandlers.install`, the thrown `RpcUserError` returns an error envelope with no `installed` or `workspacePath` payload. Callers treat the rejected RPC as zero confirmed installs, losing visibility into files already written on disk. (This throw preserves the pre-Batch-17a contract and is documented in `impl-report-batch17a.md:39`.)
   - Fix: Either keep this documented behavior if `PERSISTENCE_UNAVAILABLE` must stay an RPC error, or return a structured failure response `{ success: false, workspacePath: workspaceRoot, installed, cancelled: signal.aborted, reason: 'Could not save the skill selection.' }` (or include confirmed progress metadata) if Batch 17b needs confirmed write evidence on selection-save failure.

3. **Minor — `findOpenWorkspaceRoot` does not guard against a nullish `getWorkspaceFolders()` return.**
   - File: `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:26-33` (compare `:48-50` and `workspace-authorization.spec.ts:87-92`).
   - Impact: While production `IWorkspaceProvider` implementations return `string[]`, a host shim or partial test double returning `null`/`undefined` causes `findOpenWorkspaceRoot` to throw an unhandled `TypeError` instead of returning `undefined` and mapping to `UNAUTHORIZED_WORKSPACE`, unlike `isAuthorizedWorkspace` directly below it.
   - Fix: Guard `const folders = workspaceProvider.getWorkspaceFolders(); if (!Array.isArray(folders)) return undefined;` in `findOpenWorkspaceRoot`.

4. **Minor — Explicit wizard surface assertions omit `wizard:cancel-skill-install`, and no single test wires `SetupRpcHandlers` to the real `SkillsShRpcHandlers`.**
   - File: `apps/ptah-electron/src/di/rpc-surface.spec.ts:45-64`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:173-190`, `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts:124-135`.
   - Impact: Runtime registration is verified via `RPC_HANDLER_MANIFEST` and `assertManifestInvariants(RPC_METHOD_NAMES)`, so no host misses the method; however, adding `'wizard:cancel-skill-install'` to the explicit wizard lists in both host surface specs aligns it with `wizard:get-skill-review` and `wizard:install-skills-with-consent`. Separately, `setup-rpc-skill-install.spec.ts` mocks `SkillsShRpcHandlers.install` while `skills-sh-rpc.handlers.spec.ts` exercises the real `SkillsShRpcHandlers.install` independently, leaving the parameter-order wiring between the two checked by TypeScript and unit assertions rather than a single combined test.
   - Fix: Add `'wizard:cancel-skill-install'` to the explicit wizard expectations in both surface specs when those projects are next touched, and optionally add one combined handler test wiring `SetupRpcHandlers` to a real `SkillsShRpcHandlers` instance.

## Five logic questions

### 1. How does this fail silently?
- **Post-write selection failure loses write evidence (`setup-rpc.handlers.ts:1577-1591`):** Skills written during the loop are on disk in `workspaceRoot`, yet if `gate.keepSelected` returns `false`, the thrown `PERSISTENCE_UNAVAILABLE` error strips `installed` and `workspacePath` from the RPC response, causing callers that clear `installed` on RPC error (`team-builder-run.coordinator.ts:704-713`) to under-report what was installed.
- **No silent cross-workspace write remains on the consent-install path:** Every write, legacy adoption, selection, propagation, and kept-item report receives the pinned `workspaceRoot` / `harnessRoot` (`setup-rpc.handlers.ts:1435-1437, 1555, 1583, 1597`; `skills-sh-rpc.handlers.ts:433, 445, 465-472`).

### 2. What user action produces unexpected behaviour?
- **Cancelling while the final skill or final propagation is already running (`setup-rpc.handlers.ts:1488-1490, 1507, 1596-1606`):** `wizard:cancel-skill-install` returns `{ cancelled: true }` and sets `signal.aborted = true`. The in-flight skill finishes and propagates, and the install RPC settles with `{ success: false, cancelled: true, installed: [...allRequested] }`. This is the intended Batch 17b contract ("A cancelled install should not advance to launch" while still reporting confirmed writes), though a caller that only inspects `success` without inspecting `cancelled` and `installed` would display a generic failure despite all skills having landed.
- **Cancelling mid-download does not abort the `npx skills` child process (`skills-sh-cli.ts:91-160`, `setup-rpc.handlers.ts:1507`):** Because cancellation is checked between skills, a slow skill clone (up to `SKILLS_INSTALL_TIMEOUT_MS = 120_000`) continues until that single skill finishes or times out before the loop stops. This matches the documented between-skills safe boundary (`batches.md:581`, `impl-report-batch17a.md:37`).

### 3. What input data produces a wrong answer rather than an error?
- **Relative `workspacePath` matching `process.cwd()` (`workspace-authorization.ts:14`):** `sameWorkspaceRoot` uses `path.resolve(value)`, so passing `workspacePath: "."` when the host process CWD happens to equal an open workspace folder resolves to and matches that open folder. It cannot escape to an unopened folder because `findOpenWorkspaceRoot` only returns an existing entry from `getWorkspaceFolders()`, so there is no authorization bypass.
- **Trailing backslash on POSIX (`workspace-authorization.ts:17`):** `resolved.replace(/[\\/]+$/, '')` strips a trailing `\` even on POSIX, so `"/open/ws\\"` matches `"/open/ws"`, but `findOpenWorkspaceRoot` returns the registered `"/open/ws"` spelling, preventing any write to a different path.
- **Duplicate skill entries in `params.skills` (`setup-rpc.handlers.ts:1506`):** Deduplicated via `[...new Set(params.skills)]`, so each skill installs and reports once.
- **Whitespace-padded `installRunId` (`setup-rpc.schema.ts:47, 52, 65`):** Both install and cancel schemas share `z.string().trim().min(1).max(200)`, so matching IDs normalize identically and whitespace-only IDs fail with `INVALID_PARAMS`.

### 4. What happens when a dependency fails, times out, or returns a shape it should not?
- **`SkillsShRpcHandlers.install` fails or throws on skill N (`setup-rpc.handlers.ts:1557-1575`):** Caught per skill, logged, sets `failure = { failedSkill, reason }` (preserving `RpcUserError.message` and sanitizing unexpected errors to `'Skill install failed.'`), breaks the loop, keeps and propagates skills `1..N-1` in the pinned workspace, clears `installRunId` in `finally`, and returns `installed` with `success: false`.
- **`SkillsShRpcHandlers.install` returns `{ success: true }` without invoking `verifyStaged` (`setup-rpc.handlers.ts:1557`):** `!verifiedHash` triggers failure so unverified skills cannot be counted as installed.
- **`HarnessPropagationService.propagateWithReport` fails inside `SkillsShRpcHandlers.install` (`skills-sh-rpc.handlers.ts:711-719`):** Non-fatal (`libraryPass: 'failed'`); the skill is already on disk and counted in `installed`.
- **`SkillSyncGate.keepSelected` returns `false` or DI `resolveService` throws (`setup-rpc.handlers.ts:1578-1595`):** Throws `PERSISTENCE_UNAVAILABLE` (or DI error); `finally` still deletes `installRunId`, but `installed` is omitted from the error reply (Minor 2).
- **`workspaceProvider.getWorkspaceFolders()` returns `null`/`undefined` (`workspace-authorization.ts:30-32`):** Unhandled `TypeError` instead of `UNAUTHORIZED_WORKSPACE` (Minor 3).

### 5. What is missing that the requirements never mentioned?
- **Per-workspace serialization of concurrent installs (`setup-rpc.handlers.ts:1458-1475`, `skills-sh-source-root.service.ts:337-366`):** `skillInstallRuns` prevents reusing the same `installRunId`, but two concurrent `wizard:install-skills-with-consent` calls with different IDs (or omitted IDs, e.g., from legacy callers or two tabs) targeting the same workspace can still interleave `fs.rm` + `movePath` + `readMetadata`/`writeMetadata` on the same `ptah-skillssh-<owner>-<repo>` root (pre-existing behavior of `SkillsShSourceRootService.install`).
- **Mid-install folder removal (`electron-workspace-provider.ts:152-168`):** If the user closes/removes workspace A from the app while an install pinned to A is running, subsequent skills in the loop continue writing to A because authorization is checked once at entry. This is consistent with the single-resolution requirement; Batch 17b will cancel the run on workspace switch.

## Data flow

1. `wizard:install-skills-with-consent` RPC entry -> `this.parse(WizardInstallSkillsWithConsentParamsSchema, rawParams)` (`setup-rpc.handlers.ts:1430-1433`) — OK.
2. Workspace pin & auth -> `workspacePath ? findOpenWorkspaceRoot(...) : getWorkspaceRoot()`, throwing `UNAUTHORIZED_WORKSPACE` before the empty check (`:1435-1443`), empty shortcut (`:1444-1451`), then `WORKSPACE_NOT_OPEN` (`:1452-1457`) — OK (Minor 3 null-folders edge).
3. Run registration -> duplicate `installRunId` check (`:1458-1463`), `AbortController` registered in `skillInstallRuns`, removed in `finally` (`:1465-1475`) — OK.
4. Per-skill loop -> `if (signal.aborted) break`, skill name regex check, `installer.install({ source, skillId, scope: 'workspace' }, verifyStaged, workspaceRoot)` (`:1506-1556`) — OK.
5. `SkillsShRpcHandlers.install` -> schema + `rejectUnsafeInstallRequest`, `workspaceRoot = pinnedWorkspaceRoot ?? this.getWorkspaceRoot()`, `adoptLegacyInstalls(workspaceRoot)`, `sourceRoots.install(request, { scope: 'workspace', workspaceRoot }, { verifyStaged })`, `invalidateCaches()`, `harnessRoot = getHarnessRoot(workspaceRoot)`, `propagate('skillsSh:install', harnessRoot)`, `keptForInstall(harnessRoot, ...)` (`skills-sh-rpc.handlers.ts:409-486`) — OK.
6. Confirmation & post-loop -> `installed.push(skillName)`, `consent.recordConsent`, `invalidateInstallCaches`; if `installed.length > 0`, `gate.keepSelected(workspaceRoot, slugs)` + `propagation.propagate(workspaceRoot, 'wizard:install-skills-with-consent')`; return `{ success: !signal.aborted && !failure, workspacePath: workspaceRoot, installed, cancelled: signal.aborted, ...failure }` (`setup-rpc.handlers.ts:1557-1607`) — OK (Minor 2 on `keepSelected` returning `false`).
7. `wizard:cancel-skill-install` -> `this.parse(WizardCancelSkillInstallParamsSchema, rawParams)`, `skillInstallRuns.get(installRunId)?.abort()`, return `{ cancelled: controller !== undefined }` (`setup-rpc.handlers.ts:1479-1492`) — OK.

## Checks run

All commands were executed read-only against the worktree with logs saved under `.ptah/tmp/`:

- **Jest (8 focused `rpc-handlers` suites):** `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.spec.ts`
  - Result: **PASS** — 8/8 suites, **248/248 tests passed** (`.ptah/tmp/b17a-review-jest.log`).
- **TypeScript (`tsc --noEmit`):**
  - `libs/shared/tsconfig.lib.json` — **EXIT 0** (`.ptah/tmp/b17a-review-tsc-shared-lib.log`).
  - `libs/backend/rpc-handlers/tsconfig.lib.json` — **EXIT 0** (`.ptah/tmp/b17a-review-tsc-rpc-lib.log`).
  - `libs/backend/rpc-handlers/tsconfig.spec.json` — **EXIT 0** (`.ptah/tmp/b17a-review-tsc-rpc-spec.log`).
- **ESLint (all 8 changed files):**
  - `npx eslint libs/shared/src/lib/types/rpc.types.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts`
  - Result: **EXIT 0** — **0 errors, 6 pre-existing warnings** (`max-lines`, `preserve-caught-error` at `setup-rpc.handlers.ts:317`, unused types at `rpc.types.ts:754-755`) (`.ptah/tmp/b17a-review-eslint.log`).

### Residual uncertainty
- `ptah_code_search_symbols` returned 0 symbols (unindexed), so cross-repo symbol lookups used `grep`.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts` and `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` were verified by source inspection rather than running Jest outside `libs/backend/rpc-handlers/jest.config.ts` (per focused-check constraints).
- Live Electron execution and real `npx skills` CLI invocations were not run; Batch 17b frontend wiring (`team-builder-run.coordinator.ts`, `analyze-skills.page.ts`) is out of scope for this review.

## Verdict

- **Recommendation:** APPROVED (8/10)
- **Confidence:** HIGH
- **Top risk:** Regressions in the untested duplicate-`installRunId` and throw-path cleanup branches or loss of confirmed `installed` names if `SkillSyncGate.keepSelected` fails after disk writes.
- **Follow-ups (non-blocking):** Add unit tests for duplicate active `installRunId`, throw-path `finally` cleanup, `WizardCancelSkillInstallParamsSchema` rejections, and `../` / `WORKSPACE_NOT_OPEN` boundaries; add `'wizard:cancel-skill-install'` to the explicit wizard surface lists in Electron and CLI surface specs; guard `getWorkspaceFolders()` for nullish returns in `findOpenWorkspaceRoot`.
