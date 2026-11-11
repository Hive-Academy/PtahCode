# Batch 2: Electron lifecycle

## Files changed

- `apps/ptah-electron/src/windows/child-window-registry.ts`: Git view kind and app-shutdown sender teardown.
- `apps/ptah-electron/src/windows/child-window-registry.spec.ts`: Git singleton, policy, query and sender test.
- `apps/ptah-electron/src/windows/git-window.ts`: Git host, scoped policy, bounds, lifecycle and scope sequencing.
- `apps/ptah-electron/src/windows/git-window.spec.ts`: host lifecycle and scope tests.
- `apps/ptah-electron/src/activation/bootstrap.ts`: bind platform Git host after IPC bridge exists.

## Behavior

Git child uses the shared child factory and renderer loader, with only `ptahWindow=git` in the URL. The host opens or focuses one child, validates scope with the shared Zod schema, replaces the provisional sequence with its own monotonic counter, caches and pushes the accepted scope. Mode requests are validated and relayed. Sender identity is removed before explicit close, failed load, main close and `closeAll`. A closed push is emitted once for attach or a broken child while main is alive; shutdown suppresses restore. Creation and registration failures return `not-ready` and notify main.

## Verification

`npm run verify -- -p ptah-electron` ran once. Its header confirmed **one project**, `ptah-electron`. Lint and typecheck passed (2/2 tasks). The test target failed after 6m46s: 42 suites failed, 68 passed, 1 skipped; 9 tests failed, 1312 passed, 3 skipped. The saved Nx log is `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\17234217241242295169`.

The new `git-window.spec.ts` initially had two TS2352 fake-type errors; I fixed these after the run by implementing the complete `IStateStorage` fake and narrowing the host's logger option to its used `error` method. This fix has **not** been rerun because the instruction specified one verify run. Many unrelated suites could not load `marked` from this worktree's missing `node_modules/marked/lib/marked.umd.js`; a packaging spec could not find `node_modules/electron/package.json`. Scoped `ptah_get_diagnostics` after the fix remained unavailable after 45 seconds, so the final spec has not been independently typechecked.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Register Git policy in the Git host constructor | Host registration vs bridge registration | The plan binds the host after IpcBridge exists; this lane cannot edit the bridge, and the registry requires a policy before child registration. | Yes |
| Suppress closed push during `closeAll` | Registry shutdown marker vs guessing app state | The bridge calls `closeAll` on shutdown while the main window may still exist; main window destruction alone cannot distinguish app quit. | Yes |
| Reuse Display window handle interfaces | Reuse vs another test surface | Both hosts operate the same BrowserWindow and bridge methods. | Yes |

## Deviations

- No skill-loading tool was listed in this lane; implementation followed the approved plan and repository code.
- Bridge lane must not register `git` view a second time; host registration already supplies its allowlist.
- No Electron screenshot was taken because an Electron run is outside this batch's permitted verification.
- The requested verify run failed; the environment's missing workspace-local packages prevent a clean full-suite result. The post-run spec type fix is unverified.
