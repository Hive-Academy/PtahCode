# B2-5 integration report

## Files modified

- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts`
- `libs/backend/rpc-handlers/src/index.ts`
- `apps/ptah-electron/src/di/container.smoke.spec.ts`
- `apps/ptah-electron/src/di/expected-resolvable.ts`
- `apps/ptah-electron/src/di/rpc-surface.spec.ts`
- `apps/ptah-electron/src/di/surface-composition.spec.ts`

The four guard paths specified under `libs/backend/vscode-core` and `libs/backend/rpc-handlers/src/lib/handlers` do not exist in this worktree. The corresponding Electron guard files above were updated instead.

Ptah skill discovery was available but returned no locally installed skill for this backend DI task; the remote matches were not invocable.

## Registration

`registerSharedRpcHandlers` calls `registerSkillServices` first, using the container's registered `LOGGER`. The four service tokens are exported from the RPC handlers package so host DI guards can refer to the same symbols. The Electron smoke guard resolves each service twice and checks singleton identity; the census and composition guards include all four tokens.

## Scoped verification

`npm run verify -- -p @ptah-extension/rpc-handlers,@ptah-extension/agent-generation`: lint and typecheck passed for both projects (4/4 tasks succeeded, 2 cached). The script's default test phase failed (exit 1):

- `rpc-handlers:test`: 130 suites could not load because the worktree lacks `node_modules/marked/lib/marked.umd.js`. `jest.preset.js` maps `marked` to that path; the same mapping exists on `main`, and the file exists in the parent checkout. This is a pre-existing worktree dependency issue, unrelated to skill registration.
- `agent-generation:test`: two existing `user-layer-reap.spec.ts` symlink cases failed with Windows `EPERM`. Those symlink calls exist on `main`; the failure is an existing host permission limitation, unrelated to this task.

`git diff --check` passed. The source path read by the new composition guard exists.

## Blockers

- The test phase cannot pass in this worktree until its `marked` dependency path is restored and the Windows symlink permission issue is addressed.
