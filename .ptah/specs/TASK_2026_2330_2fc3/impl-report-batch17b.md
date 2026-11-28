# Batch 17b implementation report

Batch 17b closes Finding 11 by pinning both onboarding install requests and attributing confirmed writes by the workspace in the final reply. It also covers the Batch 17a backend review findings.

## Changed files

| File and line | Change |
| --- | --- |
| `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:485` | Explicit Cancel sends the execution's install ID. Install request and settlement start at line 679. Stopped-record updates and normalized workspace matching start at lines 834 and 858. |
| `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:549` | Verify workspace-switch attribution. At line 846, verify Cancel uses the same ID and only a matching reply after a switch can credit the cancelled record. At line 947, verify a cancelled reply for a still-active run retains partial progress and stops before launch. |
| `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:286` | Update page fixtures to return the pinned workspace for install success, partial failure, and late replies. |
| `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1209` | Capture the current workspace, send a unique install ID, and guard settlement with the captured workspace and page version. |
| `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:724` | Assert install request params and guidance continuation. At line 792, reject foreign-workspace effects without updating installed state or continuing. |
| `libs/frontend/setup-wizard/src/index.ts:12` | Export the existing Setup workspace path normalizer for the two consumers. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1425` | Reject duplicate active IDs before the empty-install shortcut. At line 1582, return confirmed writes in the failure reply when saving the selection fails. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts:242` | Cover duplicate active IDs, partial cancellation, workspace path boundaries, missing workspace, cleanup after installer throw and rejected settlement, and selection-save failures after a confirmed write, covering both a false return and an exception. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts:98` | Exercise cancel schema acceptance and rejection of missing, blank, non-string, oversized and unknown params. |
| `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:26` | Treat a nullish workspace folder list as having no registered match. |
| `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.spec.ts:68` | Cover null and undefined folder lists. |
| `apps/ptah-electron/src/di/rpc-surface.spec.ts:63` | Assert the cancel method on the explicit Electron wizard surface. |
| `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:188` | Assert the cancel method on the explicit CLI wizard surface. |
| `.ptah/specs/TASK_2026_2330_2fc3/impl-report-batch17b.md:1` | Record implementation decisions and verification. |

## Decisions

- Team-builder Cancel takes effect locally immediately. The cancel RPC acknowledges the request and the install RPC settles the writes. Keeping the existing install reply subscription lets a cancelled or interrupted record receive confirmed names after the renderer switches workspaces. Both paths use the Setup record's existing path normalization. A stopped run's install checkpoint stays incomplete. This behavior is reversible within the coordinator.
- Analyze Skills uses its existing consent flow. Its Back action and modal close behavior are disabled during installation, so this page only needs a pinned request and a guarded reply. The existing page version and a direct current-workspace check protect against replies that beat the workspace-change effect.
- A selection-save failure returns `success: false` with the confirmed `installed` names, the pinned `workspacePath`, `cancelled` and a reason. This follows the existing partial-install response pattern. An RPC error with structured error data would require both callers to interpret a second progress format. Final propagation still depends on successful selection persistence. This response choice is reversible at the RPC boundary.
- The duplicate-ID check runs before the no-op return because a duplicate active ID is invalid even with an empty skill list. The original registration remains cancellable.

## Verification

Commands ran from the worktree root with logs under `.ptah/tmp/`.

```sh
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/resolve-handler-plan.spec.ts libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.spec.ts
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json
npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/setup-wizard/src/index.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.spec.ts apps/ptah-electron/src/di/rpc-surface.spec.ts libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts
```

| Check | Result | Log |
| --- | --- | --- |
| RPC handlers Jest | Passed, 153 tests in five suites | `batch17b-jest-rpc-handlers-final.log` |
| Onboarding Jest | Passed, 110 tests in three suites | `batch17b-jest-onboarding-final.log` |
| Onboarding library typecheck | Passed | `batch17b-tsc-onboarding-lib.log` |
| Onboarding spec typecheck | Zero new errors. Exit 2 matches the known baseline in untouched files. | `batch17b-tsc-onboarding-spec.log` |
| RPC handlers library typecheck | Passed | `batch17b-tsc-rpc-handlers-lib-final.log` |
| RPC handlers spec typecheck | Passed | `batch17b-tsc-rpc-handlers-spec-final.log` |
| ESLint | Passed with four existing warnings | `batch17b-eslint-final.log` |
| `ptah_get_diagnostics` scoped to the changed onboarding and RPC handler files | Unavailable at the tool's 1024 MB compiler limit. The focused TypeScript commands above supplied compiler verification. | `batch17b-ptah-diagnostics.log` |

The first onboarding Jest run exposed a test mock that omitted the shared path normalizer. The rerun uses the real normalizer. The first backend Jest run passed 152 tests before the selection exception case was added.

The Electron and CLI surface specs were linted. Direct host suites and standalone rendering were outside the requested check set. The shared handler manifest and the onboarding component DOM were exercised by the focused suites.

Ptah file search returned no `AGENTS.md` entries. The fallback `rg` file search also returned no entries.
