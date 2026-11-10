# Batch 3 report

## Files

- `libs/backend/rpc-handlers/src/lib/handlers/git-window-rpc.handlers.ts` and `.spec.ts`: six RPC handlers and boundary tests.
- `libs/backend/rpc-handlers/src/index.ts`: public export.
- `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`: host-profile method family.
- `apps/ptah-electron/src/ipc/ipc-bridge.ts`: generalized child denials and role-specific RPC refusal.
- `apps/ptah-electron/src/ipc/ipc-bridge.git-window.spec.ts`: exact Git policy, sender trust, allowed/denied methods, and other channel tests.

## Behavior

The handlers parse strict shared Zod schemas before calling the host. An unbound host returns not-ready/negative results. `setMode` delegates to the host's relay, which owns the push to main. IPC checks the registered sender id and trusted top frame, uses the registry policy for child methods, and denies every child role fire-and-forget, set-state and CPU profiling.

## Verification

`npm run verify -- -p @ptah-extension/rpc-handlers,ptah-electron` exited 1. The lock header confirmed exactly two projects. Nx lint/typecheck: 4/4 tasks succeeded (one cached). Nx tests: both project targets failed. RPC handlers: 105 failed suites, mostly Jest could not locate mapped `marked/lib/marked.umd.js`; the new handler spec also had one TS2322 mocked `setMode` signature, fixed after this run by typing its parameter. Electron: 109 suites passed and one `shell-csp.spec.ts` suite failed from Electron security probe timeouts plus an EPERM cleanup error. The new Git IPC spec was not listed as failing. No second full verify was run, per the run-once instruction. Scoped `ptah_get_diagnostics` timed out three times after 45 seconds; it did not provide a usable result.

## Decisions

- Git policy registration is owned by `ElectronGitWindowHost`, per orchestrator coordination. Options were bridge registration or host registration; the host file already registers the exact reduced allowlist after bridge creation. Reversible. The Git IPC spec simulates that host registration with the host-exported allowlist.
- Keep the display child's existing user-facing RPC refusal and diagnostic wording. Options were generic child wording or role-specific wording; existing display spec asserts the latter. Reversible.

- Use `not-ready` for unbound `open`, with false/null for other methods. Options were `desktop-only` or `not-ready`; the approved contract and `GitWindowHost` port explicitly specify `not-ready`, matching the Display handler unbound path. Reversible.
## Deviations

The parent-owned integration has now added `gitWindow:` to `libs/backend/vscode-core/src/messaging/rpc-handler.ts` `ALLOWED_METHOD_PREFIXES` and registered the handler in Electron DI. This lane did not modify those files. `apps/ptah-electron/src/windows/git-window.ts` and the registry are being edited by another lane; this lane did not modify them. Skill discovery was not available in this lane's host catalogue.

## Batch 4 guard-spec changes

- Ensure an owner adds `gitWindow:` to `libs/backend/vscode-core/src/messaging/rpc-handler.ts` `ALLOWED_METHOD_PREFIXES` and checks its registration guard; otherwise the handler cannot register.
- Add `GitWindowRpcHandlers` to `apps/ptah-electron/src/di/phase-4-handlers.ts` registration alongside `DisplayWindowRpcHandlers`.
- Add `GitWindowRpcHandlers` to `apps/ptah-electron/src/di/expected-resolvable.ts` and update `container.smoke.spec.ts` expectations for resolution.
- Update `apps/ptah-electron/src/di/rpc-surface.spec.ts` to expect exactly the six `gitWindow:*` methods in the main RPC surface, and `surface-composition.spec.ts` for the new handler if it asserts handler sets.
- Bind `PLATFORM_TOKENS.GIT_WINDOW_HOST` after bridge construction in activation/bootstrap.ts as the plan describes; check its DI and RPC guards. Batch 4 owns DI files; activation/bootstrap.ts is owned by the parallel host lane.

