# Batch 17a implementation report

The consent install resolves the destination once. A supplied path must match an open workspace folder and is replaced with that folder's registered spelling. An omitted path uses the active workspace at request start. The consent handler passes the root to every installer invocation, retains selections in that workspace, and propagates there. The installer uses the pinned root for source writes and legacy adoption, and derives its propagation and kept-item report root from the pin.

## RPC contract

```ts
export interface WizardInstallSkillsWithConsentParams {
  skills: string[];
  consentRecords: SkillConsentRecord[];
  workspacePath?: string;
  installRunId?: string;
}

export interface WizardInstallSkillsWithConsentResponse {
  success: boolean;
  /** Confirmed installed skill names in workspacePath, including partial progress. */
  installed: string[];
  workspacePath?: string;
  cancelled?: boolean;
  failedSkill?: string;
  reason?: string;
}

export interface WizardCancelSkillInstallParams {
  installRunId: string;
}

export interface WizardCancelSkillInstallResponse {
  /** Whether the cancellation request matched an in-flight install. */
  cancelled: boolean;
}
```

`wizard:install-skills-with-consent` reports the pinned `workspacePath`, the confirmed `installed` names, and `cancelled` on settlement. An empty request without an open workspace can return without a path. Explicit unknown paths return `UNAUTHORIZED_WORKSPACE`. A non-empty request with no explicit path and no active workspace returns `WORKSPACE_NOT_OPEN`.

`wizard:cancel-skill-install` returns `{ cancelled: true }` when the ID is in flight. An accepted cancel lets the current skill finish and stops the remaining skills. A cancelled install returns `success: false`, `cancelled: true`, and the confirmed names in the pinned workspace. Selection and propagation run for the confirmed names. The cancel RPC returns `{ cancelled: false }` for an unknown or settled ID. A duplicate active install ID returns `INVALID_PARAMS`. The backend clears the ID when the install settles.

If persisting the selection fails after the skill writes, the install RPC raises `PERSISTENCE_UNAVAILABLE`.

## Changed files

| File and line | Change |
| --- | --- |
| `libs/shared/src/lib/types/rpc.types.ts:110` | Additive install DTO fields and cancel DTOs. The RPC type map is at line 1648 and the runtime allowlist is at line 3924. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts:47` | Parse the optional workspace path and install ID, and validate cancel requests. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:279` | Add the cancel method to the shared handler surface. Workspace validation and pinning start at line 1425, cancellation registration at line 1479, and the install loop at line 1494. |
| `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:378` | Carry the pinned workspace through source install, legacy adoption, propagation, and kept-item reporting. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts:192` | Exercise deferred two-skill installs across a workspace switch with explicit and implicit pins. At line 242, cancel after the first skill starts and verify partial results, selection, propagation, and run cleanup. At line 285, reject an unregistered child path before invoking the installer. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:420` | Check runtime cancellation registration and static manifest membership. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts:139` | Update the empty-install expectation for the additive response fields. |
| `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts:489` | Verify the real installer handler forwards the pin to source install, adoption, propagation, and kept-item reporting while a different workspace is active. |
| `.ptah/specs/TASK_2026_2330_2fc3/impl-report-batch17a.md:1` | Contract, implementation evidence, and Batch 17b handoff. |

Electron derives its setup RPCs from `SetupRpcHandlers.METHODS` via the shared host manifest at `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:430`. The cancel RPC is registered through that same path.

## Decisions

- Return confirmed names through the existing `installed` field. A second list would duplicate the same data. A write is counted after staged verification and installer success, so it can still be reported if recording consent fails. The field choice is reversible through an additive DTO change.
- Register cancellation for in-flight IDs and discard the registration on settlement. The install loop provides a safe boundary between writes, and the existing cancel RPC patterns acknowledge whether an active operation matched. This is reversible without changing skill storage.
- Validate explicit paths by matching a registered root. The workspace authorization helper for exact roots returns the host's registered path, including support for an open folder that is currently inactive.

## Batch 17b handoff

- Send the originating `workspacePath` and a unique `installRunId` on every consent install attempt. Keep the ID with the run.
- On Cancel, call `wizard:cancel-skill-install` with the same ID. Keep the install reply handler alive. The cancel reply acknowledges the request and the install reply carries the final effects.
- Read the install reply's `workspacePath`, `installed`, and `cancelled`. Apply confirmed names only to the originating record whose workspace matches the response path. Use the confirmed names for partial progress on failure or cancellation. A cancelled install should not advance to launch.
- Derive pending skills from the requested names minus `installed`. Read `failedSkill` and `reason` to display where an install failure stopped the loop.

## Verification

The commands ran sequentially from the worktree root. Logs are under `.ptah/tmp/`. The scoped `ptah_get_diagnostics` request exceeded its 1024 MB compiler limit. Its output is in `batch17a-ptah-diagnostics.log`.

```sh
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json
npx tsc --noEmit --project libs/shared/tsconfig.lib.json
npx tsc --noEmit --project libs/shared/tsconfig.spec.json
```

All four TypeScript commands exited 0. Each has a corresponding `batch17a-tsc-*.log`.

```sh
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/resolve-handler-plan.spec.ts
```

The first run passed 187 tests and flagged one stale empty-install expectation. That spec now asserts the additive workspace and cancellation fields. The first run is in `batch17a-jest.log`.

```sh
npx eslint libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/shared/src/lib/types/rpc.types.ts
npx eslint libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.spec.ts libs/shared/src/lib/types/rpc.types.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts
```

The first ESLint command exited 0 with eight warnings. Two new test fixture assertions flagged by ESLint were replaced with explicit guards before rerunning lint. The first run is in `batch17a-eslint.log`.

The six-suite Jest rerun exited 0 with 188 passing tests. See `batch17a-jest-final.log`. ESLint over all eight changed TypeScript files exited 0 with six warnings on existing error handling, file length, and unused imports. See `batch17a-eslint-final.log`.

After replacing the test assertions flagged by lint, the install spec and backend spec typecheck were run again.

```sh
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json
```

The install spec rerun exited 0 with 15 passing tests. See `batch17a-jest-guards.log`.
The backend spec typecheck rerun exited 0. See `batch17a-tsc-rpc-handlers-spec-final.log`.
