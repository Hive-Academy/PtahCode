# Batch 4: DI guards

## Files

- `apps/ptah-electron/src/di/phase-4-handlers.ts`: register and log `GitWindowRpcHandlers` beside Display.
- `apps/ptah-electron/src/di/expected-resolvable.ts`, `container.smoke.spec.ts`, `rpc-surface.spec.ts`: resolution and exact six-method guard.
- `libs/backend/vscode-core/src/messaging/rpc-handler.ts`, `rpc-handler.spec.ts`: runtime prefix and registration guard.
- `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`: shared registry, manifest ownership and prefix census.
- `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: headless-host method census.
- `apps/ptah-electron/src/di/surface-composition.spec.ts` was inspected and has no Display-window or handler-family census, so no edit was needed.

## Behavior

The phase-4 container resolves the Git handler by class. The RPC registration guard accepts `gitWindow:`; Electron and CLI surfaces enumerate the six methods from the ungated manifest. The Electron host token is already bound in `activation/bootstrap.ts` by batch 2.

## Verification

`npm run verify -- -p ptah-electron,@ptah-extension/vscode-core` ran once. The verifier identified exactly two projects: `ptah-electron` and `@ptah-extension/vscode-core`. After waiting 1,473 seconds for a shared slot, lint/typecheck passed (4/4 tasks), tests passed (12/12 tasks), and the command exited 0. The extra `rpc-handlers` and `cli-engine` guard specs were outside this two-project verification scope. Scoped Ptah diagnostics for edited files timed out after 45 seconds with TypeScript still running; they returned no pass/fail result.

## Decisions

- Mirrored Display-window guards in the RPC allowlist and CLI surface tests. Options: limit changes to the named DI files or include additional guard/census lists. The request explicitly calls for additional matching guard/census lists, and these two files contain them. Reversible.
- Left `surface-composition.spec.ts` unchanged. Options: add an unrelated family assertion or retain its surface round-trip scope. It contains no Display-window census; the exact Git family is guarded in `rpc-surface.spec.ts`. Reversible.

## Deviations

Other `displayWindow:` references found under `libs/backend` are `platform-cli/src/registration.ts` (host binding comment), `rpc-handlers/src/lib/handlers/display-window-rpc.handlers.ts` and its spec (implementation-specific), and `vscode-core/src/messaging/rpc-handler.ts` (edited). None of the unedited references is a guard/census list. Skill discovery/loading was unavailable in this lane. No Electron visual check was run because this batch changes backend guards and Electron launch is outside the permitted verification.
