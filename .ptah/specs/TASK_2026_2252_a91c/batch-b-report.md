# Batch B report

## Files changed

- `libs/backend/platform-core/src/di/tokens.ts` — added the `IWindowsJobAssigner` token.
- `libs/backend/platform-electron/src/registration.ts` — bound the Electron assigner in phase 0.
- `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts` — added lazy packed and development binary loading.
- `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.spec.ts` — tested both paths, lazy load, missing binary, unsupported architecture, and close with fake loaders.
- `apps/ptah-electron/electron-builder.yml` — ships the Windows binary as an external resource.
- `apps/ptah-electron/scripts/rebuild-native.js` — builds the owned N-API module from source on win32 x64.
- `apps/ptah-electron/scripts/verify-packed-native.js` — checks the external binary has x64 PE DLL headers.
- `apps/ptah-electron/src/di/expected-resolvable.ts` — lists the new DI token.
- `apps/ptah-electron/src/di/surface-composition.spec.ts` — checks the registration.
- `.ptah/specs/TASK_2026_2252_a91c/batch-b-report.md` — this report.

The interface and token are exported through `libs/backend/platform-core/src/index.ts:20-25,229`; no edit there was needed. No VS Code or CLI binding was added.

## Load paths and packaging evidence

- Packed: `process.resourcesPath/windows-job/windows_job.node`, resolved in `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts:24-28`. `apps/ptah-electron/electron-builder.yml:164-167` copies it there outside `app.asar`.
- Development: `appPath/../../../libs/backend/windows-job-native/build/Release/windows_job.node`, at `electron-windows-job-assigner.ts:29-31`. `appPath` comes from `app.getAppPath()` in `apps/ptah-electron/src/activation/bootstrap.ts:376`; the build output is `dist/apps/ptah-electron` in `apps/ptah-electron/project.json:27`.
- Load occurs inside `assignToNewJob` at `electron-windows-job-assigner.ts:17-35`. `NativeWindowsJobAssigner` wraps load errors, so a missing file does not stop registration.
- The existing workflow calls `rebuild-native.js` before packaging at `.github/workflows/publish-electron.yml:340-341` and `verify-packed-native.js` afterward at lines 399 and 429. Local package targets call both scripts in `apps/ptah-electron/project.json:481-550`.

## Commands and results

- `npx node-gyp rebuild --directory libs/backend/windows-job-native --arch=x64` — passed; built the Windows x64 module from source.
- `npx jest --config libs/backend/windows-job-native/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/windows-job-native/src/lib/windows-job-assigner.spec.ts libs/backend/windows-job-native/src/lib/windows-job-assigner.live-windows.spec.ts` — 19 passed.
- `npx jest --config libs/backend/platform-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.spec.ts` — 4 passed.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/surface-composition.spec.ts` — 14 passed.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/platform-electron/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/platform-electron/tsconfig.spec.json` — passed.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json` — passed.
- `npx eslint` on changed TypeScript and JavaScript files — passed with two existing `preserve-caught-error` warnings in `verify-packed-native.js`. Nx boundary lint was skipped because no cached project graph was available.
- Node fixture calls to `verifyWindowsJobBinary` — Linux skipped the requirement; Windows rejected a missing file and a wrong-architecture PE; accepted a synthetic x64 PE DLL.
- Node fixture call with the locally compiled `windows_job.node` copied into a temporary `win-unpacked/resources/windows-job` tree — passed the x64 PE DLL check.
- Scoped `ptah_get_diagnostics` after the main edit — zero errors. Later scoped calls timed out and returned unchecked; the explicit `tsc` commands above completed.

The packed app check could not run because packaging targets are prohibited for this batch. The coordinator or CI must run `node apps/ptah-electron/scripts/rebuild-native.js`, package Windows x64 through the existing Electron target or workflow, then run `node apps/ptah-electron/scripts/verify-packed-native.js` against `dist/release/win-unpacked`.

## Decisions

- Bind an assigner on every Electron platform; on unsupported platforms it throws `Windows jobs require win32 x64`. Alternative: omit the binding outside Windows x64. Evidence: the Electron DI guard expects registered tokens and callers can use one stable port. Reversible.
- Use `win.extraResources` and `process.resourcesPath` for the binary. Alternative: `asarUnpack`. Evidence: `electron-builder.yml:108,164-167` already uses external resources and the native loader needs one direct file path. Reversible.
- Build with `node-gyp` from the existing rebuild script. Alternative: another workflow step. Evidence: `publish-electron.yml:340-341` and local package targets already call this script before packaging. Reversible.

## Additional reads

To verify the bundle and app path assumptions and resolve the Jest type error, I read `apps/ptah-electron/esbuild.config.cjs`, `apps/ptah-electron/src/activation/bootstrap.ts`, `tsconfig.base.json`, `libs/backend/platform-electron/src/index.ts`, `libs/backend/platform-electron/jest.config.ts`, `libs/backend/platform-electron/src/implementations/electron-token-counter.spec.ts`, and `libs/backend/windows-job-native/project.json`. The first Jest run found that `process.resourcesPath` was absent from this library's Node type surface; I changed the adapter to narrow that property before use.

No matching optional skill was listed by the host, so no skill could be loaded.

## Revise round 1

Files changed in this revision:

- `apps/ptah-electron/scripts/verify-packed-native.js`: check every `win-unpacked` package under the release directory, including `local-production`, after the existing packaged-output checks. The search skips resource and dependency trees.
- `apps/ptah-electron/scripts/rebuild-native.js`: remove `_CL_` from the Windows job node-gyp child environment and give its postinstall failure a Windows job message. The explicit release path remains fatal.
- `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts`: use only the external resource for an `.asar` app path and name `windows-job/windows_job.node` in the missing-resource cause.
- `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.spec.ts`: cover a packed app with a missing resource and a non-Windows platform.
- `batch-b-report.md`: record this revision and its checks.

Evidence: `verify-packed-native.js:51-80` finds package directories; line 325 calls the check after the existing no-output checks. `rebuild-native.js:163-180` builds the job with `_CL_` removed; line 192 gives its postinstall warning. `electron-windows-job-assigner.ts:30-41` limits packed apps to the external resource.

Commands and results:

- `npx jest --config libs/backend/platform-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.spec.ts` — passed, 6 tests.
- `npx tsc --noEmit --project libs/backend/platform-electron/tsconfig.spec.json` — passed.
- `npx eslint libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.spec.ts apps/ptah-electron/scripts/rebuild-native.js apps/ptah-electron/scripts/verify-packed-native.js` — passed with two pre-existing `preserve-caught-error` warnings in the verify script.
- `node --check` on both changed scripts — passed.
- Node fixture calls to `verifyWindowsJobBinary` — passed for non-Windows skip, missing file, truncated file, wrong PE machine, valid x64 PE DLL, nested missing file, and nested `local-production/win-unpacked` success.

No script spec was added. A search for `verify-packed-native` in Electron `*.spec.*` files found no existing script-spec location. The package target and packed app check remain unrun under this batch's verification rules. The coordinator or CI must run the Windows x64 package target and its `verify-packed-native.js` gate for both normal and local-production output.

### Decisions

- Keep the PE check without a sha256 comparison to the build output. The existing source build step and PE check cover the requested gate. Adding a hash gate later is reversible.
- Keep `libs/backend/windows-job-native/project.json`'s build target and `apps/ptah-electron/tsconfig.build.json`'s alias, both added by the coordinator. Lint and the esbuild main build need them. Reversible if the build graph changes.
- Use temporary Node fixtures for the verify script. The Electron Jest project has no existing script spec location. A dedicated script test project could be added later.
