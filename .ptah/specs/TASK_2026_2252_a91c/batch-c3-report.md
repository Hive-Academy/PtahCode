# Batch C3: Codex wrapper

## Files changed

- `libs/backend/codex-runtime/src/lib/codex-app-server-process.ts`: The app server request sets `windowsJobPolicy: 'job'`.
- `libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts`: The request test checks the policy. The Windows exit test checks one spawn, the policy, and snapshot cleanup after exit.
- `.ptah/specs/TASK_2026_2252_a91c/batch-c3-report.md`: This report.

## Spawn calls and policy

| Call | Policy |
| --- | --- |
| `codex-app-server-process.ts:211`, app server root | Explicit `job` |
| `codex-context.ts:195`, pass through wrapper | Forwards the request. It sets no policy. |
| `codex-runtime.ts:112`, pass through wrapper | Forwards the request. It sets no policy. |

The source scan found no other `spawnProcess` calls in this lib. It found no separate probe, version check, or login spawn call in this lib. The wrapper changes no switch or job handle. Exit snapshot cleanup and bounded close stay in place.

## Checks

- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts`: Pass. 73 tests in one suite.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json`: Pass.
- `npx eslint libs/backend/codex-runtime/src/lib/codex-app-server-process.ts libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts`: Pass. ESLint warned that the Nx project graph cache was absent. It skipped the module boundary rule.

## Decisions

- No live Windows spec was added. The required native binary at `libs/backend/windows-job-native/build/Release/windows_job.node` is absent. A real live test cannot run in this worktree. The project tags permit an extension feature to import a shared utility, but ESLint could not check that rule without its graph cache. No native import was added.
- The existing Windows exit unit test gives a focused check of snapshot cleanup after a job policy request. It also checks that only one root was spawned.

## Could not do

- A real Windows job test could not run because the native binary is absent. The spawner lane owns job assignment and handle lifetime.
- Other lane changes appeared during this work in `agent-sdk`, `platform-core`, and `platform-electron`. The other lane also wrote `batch-c1-report.md`. These files were not edited or reverted here.
