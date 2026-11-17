# Code logic review, batch B, TASK_2026_2252_a91c

Verdict: PASS WITH CHANGES

The design is sound. The adapter is lazy, the DI binding cannot break app start, and macOS and Linux are not affected. One real defect exists in the verify script for the local-production package target on Windows. The other findings are small.

Scope read in full: `electron-windows-job-assigner.ts` and its spec, `windows-job-assigner.ts` (the lib it wraps), `registration.ts` (diff), `rebuild-native.js`, `verify-packed-native.js`, `electron-builder.yml`, `electron-builder.local-production.cjs`, `package-local-production.js` (output dir), `apps/ptah-electron/project.json` (package targets, esbuild options), `esbuild.config.cjs` (banner), `publish-electron.yml` (Windows, macOS and Linux steps), `electron-e2e.yml` (calls of `rebuild-native.js`), `windows_job.c` (head), `binding.gyp`. I did not run any build, test or verify command, as instructed. Not verified by running: the electron-builder behaviour for a missing `extraResources` source, and `_CL_` with a C source file.

## Findings

### 1. Major: `verify-packed-native.js` fails for the `package-local-production` target on Windows x64

- File: `apps/ptah-electron/scripts/verify-packed-native.js:50-54` (new `verifyWindowsJobBinary`), called at line 259.
- Evidence: the function looks only at `dist/release/win-unpacked/resources/windows-job/windows_job.node` (`RELEASE_DIR` is `dist/release`). The target `package-local-production` (`apps/ptah-electron/project.json:538-551`) packs with `electron-builder.local-production.cjs`, which sets `directories.output: ../../release/local-production`. So the unpacked tree is `dist/release/local-production/win-unpacked`. The same target then runs `verify-packed-native.js` (project.json:549). `verify-local-production-unsigned.js:13,146` confirms that path.
- Effect: on a Windows x64 machine, `package-local-production` fails with "Packed Windows job binary missing outside app.asar", although the package is correct. If an old `dist/release/win-unpacked` exists, the check passes against stale files and does not look at the new package. The existing better-sqlite3 check does not have this problem, because it scans `RELEASE_DIR` recursively (`findPackedFiles`).
- Correction: find the `win-unpacked` directories by a recursive search under `RELEASE_DIR` (same as `findPackedFiles`), and check every `windows-job/windows_job.node` under a `resources` folder that has an `app.asar` next to it. Fail if none is found on win32 x64. Add a spec for the function with a temp tree that has `local-production/win-unpacked`.

### 2. Minor: the dev fallback path can point outside the install in a packed app

- File: `libs/backend/platform-electron/src/implementations/electron-windows-job-assigner.ts:29-33`.
- Evidence: if `<resources>/windows-job/windows_job.node` is missing, the code uses `resolve(appPath, '../../../libs/...')`. In a packed app `appPath` is `<install>/resources/app.asar`, so the result is a path three levels above it. The error is then "Windows job native binary is unavailable" with no hint of the real cause (missing resource).
- Effect: a packaging defect is hidden behind a generic error, and the app tries to load a native file from a folder outside its install. Risk is low (same user rights), but it is avoidable.
- Correction: use the development path only when `appPath` does not end in `app.asar` (or inject an `isPackaged` flag). Otherwise throw a clear error that names the missing resource (fixed text, no full path).

### 3. Minor: `_CL_=/std:c++20` is inherited by the new `node-gyp` child process

- File: `apps/ptah-electron/scripts/rebuild-native.js:157-162`, with `publish-electron.yml:342-344` (`_CL_: /std:c++20` on Windows).
- Evidence: `execFileSync` without `env` inherits `process.env`. `windows_job.c` is a C file. The C compiler may print warning D9002 or reject the option; I could not check this without a build. batch-b-report.md says the local build passed, but that run had no `_CL_`.
- Correction: pass `env: { ...process.env, _CL_: '' }` to the job build only. This removes the doubt at no cost.

### 4. Minor: postinstall swallows a job-build failure with a message about better-sqlite3

- File: `apps/ptah-electron/scripts/rebuild-native.js:178-190`.
- Evidence: when `npm_lifecycle_event` is `postinstall`, any error (now also from the job build) becomes a warning "better-sqlite3 Electron rebuild skipped", and the exit code is 0.
- Effect: a developer without MSVC sees a wrong message. This is not a silent failure at release time, because the CI step runs the script outside postinstall and exits 1.
- Correction: name the step in the error (wrap the job build in its own try/catch that rethrows with "Windows job build failed: ...").

### 5. Minor: the PE check does not prove the file is the file that was built, and the new function has no spec

- File: `verify-packed-native.js:50-69`.
- Evidence: better-sqlite3 is compared by sha256 with the source build (`rootHash`). The job binary is not. Any x64 DLL passes. batch-b-report.md lists the fixture checks as ad hoc commands only. No committed spec covers truncated input, a wrong machine, a missing DLL bit, a non-win32 skip or the local-production layout.
- Correction: compare sha256 with `libs/backend/windows-job-native/build/Release/windows_job.node` when it exists, and add a small Jest spec under `apps/ptah-electron/scripts` or the nearest test folder that already tests this module.

### 6. Minor: the new `build` target in `windows-job-native/project.json` has no consumer and reformats existing lines

- File: `libs/backend/windows-job-native/project.json:6-23`.
- Evidence: nothing in `package`, `build-main` or the workflows calls it. `nx.json` gives `@nx/esbuild:esbuild` a `dependsOn: ["^build"]` default, so any project that depends on this lib and has a `build` target now also builds it, with default bundling. The `.node` file is not part of its output. The `tags` array was reformatted without need.
- Correction: remove the target if no step needs it, or state in the report why it exists. Revert the whitespace change.

### 7. Minor: the Windows verify error appears before any other message on a machine with no package

- File: `verify-packed-native.js:259`.
- Evidence: `verifyWindowsJobBinary()` runs before the check for `RELEASE_DIR`. With no packaged output on Windows x64 the user reads "Packed Windows job binary missing" instead of "No packaged output found". Message order only.
- Correction: call it after the `RELEASE_DIR` existence check, or let finding 1's fix handle it.

## Answers

1. macOS and Linux: not broken. `win.extraResources` is read only for the win target. `rebuild-native.js:156` and `verifyWindowsJobBinary` (line 51) return early unless win32 x64. `binding.gyp` is never built there. Windows appx pass (`--win appx --prepackaged`): not broken. `--prepackaged` packs the existing `win-unpacked` tree, which already holds `resources/windows-job` from the `--win --dir` pass (publish-electron.yml:376-380 and the `--prepackaged` step). The `target:` override by the CLI affects only the target list, not `extraResources`. Other callers: `package` and `serve` in `apps/ptah-electron/project.json:481-533`, `electron-e2e.yml:107,215` (Linux, skipped by the platform guard) and `package-local-production`, which breaks the verify step (finding 1). A verify run on a Windows machine without `win-unpacked` fails with the missing-binary message (finding 7). A run after an NSIS or `--dir` package passes.
2. The `from` path is correct. `../../../libs/...` from `dist/apps/ptah-electron` reaches the repo root, the same depth as the linux entry (`electron-builder.yml:204`, `../../../apps/ptah-electron/worker-host`). Platform and global `extraResources` lists are combined; the linux entry already depends on that. If the source file is missing, electron-builder logs a warning and continues (from memory of its `copyFiles`, not run here). The verify script then fails on win32 x64 with a clear Error (line 53-55). On win32 arm64 and on other hosts nothing checks it, which is intended because the module is x64 only.
3. Packed: `process.resourcesPath/windows-job/windows_job.node`, which matches the `to:` in `electron-builder.yml:167`. Development: `appPath/../../../libs/.../build/Release`, which is correct only if `app.getAppPath()` is `dist/apps/ptah-electron` (batch-b-report.md says `bootstrap.ts:376`; I did not re-trace it). A missing, wrong or unloadable binary cannot break app start or DI: registration only creates the object (`registration.ts:110-112`), and loading happens in `assignToNewJob`, where `NativeWindowsJobAssigner` wraps load errors (`windows-job-assigner.ts:44-48`). The error appears only when a caller assigns a job, so batch C must handle that throw. `require(candidate)` is safe in the bundle: `esbuild.config.cjs:61-66` puts `const require = createRequire(import.meta.url)` in the banner of the ESM output, so esbuild's dynamic-require shim uses it. The path alias exists in `tsconfig.build.json` and `tsconfig.base.json:155`, so the lib code is bundled.
4. The PE check is correct. Offset 0x3c holds the PE header offset. Machine is at +4 (0x8664 is x64). Characteristics is at +22 (4 signature + 18 into the COFF header), and 0x2000 is `IMAGE_FILE_DLL`. Files shorter than 0x40 bytes fail before `readUInt32LE(0x3c)`. A PE offset near the end fails the `peOffset + 24 > length` test before any read at `+22`. All paths throw only the intended Error. It does not prove that the binary loads (finding 5).
5. macOS and Linux: the new block is skipped, so the script is unchanged there. Windows: `execFileSync` throws on a non-zero exit, so a node-gyp failure stops the script with exit 1 outside postinstall, and a missing output file also throws (`rebuild-native.js:165-167`). The `node-gyp` 12.4.0 package is present in `node_modules`, and `windows-latest` has Visual Studio and Python, which node-gyp needs. It downloads the Node 24 headers from the network, as the better-sqlite3 build does. The module uses N-API (`NAPI_VERSION 8`), so headers from the build Node are ABI-safe for Electron. Open risk: `_CL_` (finding 3). Note that `node-gyp` is not a direct dependency in `package.json`; it relies on being hoisted.
6. Silent failure: none found at release time. The packaging warning is caught by verify on win32 x64 only. Stale state: finding 1 (old `dist/release/win-unpacked`) and finding 5 (no hash). Missing test: the verify function and the rebuild branch have no committed test. The adapter spec covers both paths, lazy load, a load error and arm64. It does not cover a non-win32 platform, the default `process.resourcesPath`, or the packed-app case where the packed file is missing (finding 2).
