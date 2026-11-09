# Batch B6 report

## Files changed

- `libs/backend/task-end-hook/src/lib/di/tokens.ts`, `di/register.ts`, `di/register.spec.ts`: separate close-out PR token, singleton close-out service and reconciler registrations, host-port test scope.
- `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts`: inject the separate PR token and close-out service token.
- `libs/backend/task-end-hook/src/index.ts`: export close-out services, host ports/results and configuration keys.
- `apps/ptah-electron/src/di/task-end-hook-composition.ts`: bind the close-out PR status port through the existing GitInfoService. Platform Electron already binds `GIT_CLEANUP_PORT`; no duplicate binding was added.
- `apps/ptah-electron/src/activation/task-end-hook.activation.ts`, `.spec.ts`: start reconciliation after hook startup, scan linked review/done tasks at boot and index changes in the background, and dispose subscription/reconciler. Added activation coverage.

## Design

The existing `GitInfoService.readPrStatus` adapter is reused for exact branch PR lookup. Unavailable, missing URL, or mismatched branch results become `unknown`. The reconciler's own timeout, polling and detached close-out run remain in the library. Activation scans indexed tasks with a session-organization worktree/branch link, passing the close-out opt-in setting read from workspace configuration. The existing hook activation gate also gates this startup path. The platform's guarded cleanup adapter is already registered under the same `Symbol.for` token during platform registration; composition leaves that binding intact.

## Decisions

- Separate `CLOSE_OUT_PR_STATUS_PORT` from the existing dispose P9 `PR_STATUS_PORT`. Options were sharing a token or adding one; their interfaces and result semantics differ. Evidence: B3 review note and `pr-status.port.ts`. Reversible.
- Reuse `GitInfoService.readPrStatus` instead of adding a second `gh` runner. Evidence: existing composition adapter and typed result already expose PR number, state, URL, and head branch. Reversible.
- Use linked session worktree/branch metadata for task-scoped boot scans. The task index summary has no branch or worktree fields. Evidence: `TaskSpecSummary` and `SessionOrganizationStore`. Reversible.
- Do not register the cleanup port twice. Evidence: `platform-electron/src/registration.ts` registers `Symbol.for('PtahTaskEndGitCleanupPort')`. Reversible.

## Verification

Ran `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron` twice in the foreground (one allowed rerun). Both runs passed lint and typecheck. The first Electron test run failed because an eager cleanup-port resolve broke isolated composition specs; removed it. On rerun all Electron targets, including tests, passed. Task-end-hook on both runs had the documented Windows baseline of 7 failing suites / 41 failing tests (EPERM/path behavior), with no new failures. `ptah_get_diagnostics` was called after edits but timed out twice while its TypeScript check continued; scoped verify typecheck passed.

## Not done

No `container.smoke.spec.ts` or `expected-resolvable.ts` change was needed; the Electron smoke target passed on rerun. The boot scan can only reconcile tasks with a stored session-organization worktree and branch, and passes the workspace root as the main root. A workspace opened directly at a secondary worktree may need main-root resolution in a later batch. No platform adapter deduplication was done. A skill-loading tool/catalog was unavailable in this lane; repository instructions and the supplied plan were followed directly.
