# PR A report

PR A adds the Windows job contract and an owned Node-API package. No caller uses it yet.

## Files written

- `libs/backend/platform-core/src/interfaces/process-spawner.interface.ts`
- `libs/backend/platform-core/src/interfaces/windows-job-assigner.interface.ts`
- `libs/backend/platform-core/src/index.ts`
- `libs/backend/windows-job-native/.gitignore`
- `libs/backend/windows-job-native/binding.gyp`
- `libs/backend/windows-job-native/native/windows_job.c`
- `libs/backend/windows-job-native/project.json`
- `libs/backend/windows-job-native/tsconfig.json`
- `libs/backend/windows-job-native/tsconfig.lib.json`
- `libs/backend/windows-job-native/tsconfig.spec.json`
- `libs/backend/windows-job-native/jest.config.ts`
- `libs/backend/windows-job-native/eslint.config.mjs`
- `libs/backend/windows-job-native/src/index.ts`
- `libs/backend/windows-job-native/src/lib/windows-job-assigner.ts`
- `libs/backend/windows-job-native/src/lib/windows-job-assigner.spec.ts`
- `libs/backend/windows-job-native/src/lib/windows-job-assigner.live-windows.spec.ts`
- `tsconfig.base.json`
- `.ptah/specs/TASK_2026_2252_a91c/batch-a-report.md`

## Coordinator commands

Run this command from the workspace root on Windows x64:

```text
npx node-gyp rebuild --directory libs/backend/windows-job-native --arch=x64
```

The binary path is `libs/backend/windows-job-native/build/Release/windows_job.node`.

Run the live spec with this exact command from the workspace root:

```text
npx jest --config libs/backend/windows-job-native/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/windows-job-native/src/lib/windows-job-assigner.live-windows.spec.ts
```

## Checks

- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/windows-job-native/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/windows-job-native/tsconfig.spec.json`: passed.
- Scoped `ptah_get_diagnostics`: no errors.
- Jest with both new spec paths: 13 unit cases passed. Six live cases skipped because the binary is absent. The coordinator must build and run them.
- `npx eslint` on changed TypeScript and config files: passed. Nx module boundary lint was skipped because no cached project graph exists.
- Native C was reviewed against the Microsoft job object and Node-API documentation. It was not compiled here, as required by the task.

## Decisions

- Use one unnamed, non-inheritable job per assigned PID. The alternative was a named job. The approved design asks for a private job. This is reversible.
- Use `scope:shared` and `type:util`. Both tags are allowed by the workspace boundary rules. `platform-core` also has these tags. This is reversible.
- Keep the native build as a manual `node-gyp` step. The alternative was an install script. The task forbids install-time compilation. This is reversible.
- Mark the TypeScript handle closed before calling the native close function. The native function closes its handle once, even when a Win32 error is thrown. This keeps the TypeScript `close()` method idempotent. This is reversible.

## Coordinator results after the lane

- `node-gyp rebuild`: exit 0, zero compiler warnings (win32-x64).
- Jest for the library with the binary present: 19 passed (13 unit, 6 live Windows).
- `npm run verify -- -p @ptah-extension/windows-job-native`: lint, typecheck and test passed.
- `npm run verify -- -p @ptah-extension/platform-core`: lint and typecheck passed. Tests: 1117
  passed, 2 failed. The 2 failures are the known `session-driver-lock` cases, which also fail
  on main on this machine. This change does not touch them.
- Corrections to the live spec: the orphan case now calls `grandchild.unref()` so the parent
  exits, and the exited PID case matches the message (Jest realms break `toThrow(Error)`).
- The library is registered in `nx.json` (two plugin lists), `.github/ci/test-weights.json`
  and `.commitlintrc.json`.

## Review round 1 (`code-logic-review.md`)

- Major 1, foreign external: corrected with `napi_type_tag_object` and
  `napi_check_object_type_tag` (`NAPI_VERSION 8`).
- Major 2, finalizer closes the job: documented in the C file and on `WindowsJobHandle`.
- Minor, NaN PID: corrected in the C argument check.
- Minor, PID reuse: the precondition is documented on `assignToNewJob` and in the C file.
- Minor, `PROCESS_TERMINATE`: no change. `AssignProcessToJobObject` requires it.
- Minor, failed `CloseHandle`: no change. The handle is invalid then, a retry cannot help.
- Minor, default binary path: PR B injects the loader for the packed layout.
