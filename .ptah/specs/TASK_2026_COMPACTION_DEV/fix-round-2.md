## Fixes

- A: `libs/backend/platform-core/src/legacy-threshold-migration.ts:23-33` writes `__migrations.legacyCompactionThreshold` with the moved threshold, or alongside an existing file value. Later launches skip the legacy source even after the user clears the setting. `libs/backend/platform-core/src/legacy-threshold-migration.spec.ts:8-40` exercises both cases.
- B: `apps/ptah-electron/src/main.ts:69-98` sets the dev directory before composition, then seeds and migrates only inside the successful single-instance-lock branch.
- C: `libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts:51-64` applies the shared one-time move to both legacy CLI stores before file settings load. `libs/backend/platform-cli/src/implementations/cli-legacy-threshold-migration.spec.ts:8-30` covers both stores and user clearing.
- D: `libs/backend/platform-core/src/file-settings-manager.ts:99-115` falls back to `copyFileSync` with `COPYFILE_EXCL` for `EPERM`, `EXDEV`, and `ENOTSUP`, warns with the real link Error, leaves `EEXIST` as already seeded, and always removes the temporary file. `libs/backend/platform-core/src/file-settings-path.spec.ts:110-134` covers the fallback.

## C evidence

The CLI default data directory is `~/.ptah` (`libs/backend/platform-cli/src/registration.ts:48`). Its workspace provider stored non-file-based keys in `<userDataPath>/config.json` and now routes `compaction.threshold` to file settings (`libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts:74,104-107`). Its config shim formerly stored non-file-based `ptah.${key}` values in `global-state.json` (`libs/backend/cli-engine/src/lib/container.ts:596-605,626-630`; store registration at `libs/backend/platform-cli/src/registration.ts:75`). Both legacy files can therefore hold a threshold; the shared migration reads nested `ptah['compaction.threshold']` and flat `ptah.compaction.threshold` (`libs/backend/platform-core/src/legacy-threshold-migration.ts:15-21`).

## Verification

One run, using PowerShell `Select-Object -Last 40` as the requested `tail -40` filter:

`npm run verify -- -p platform-core,platform-electron,settings-core,ptah-electron,cli-engine,platform-cli -- --testPathPatterns="file-settings-path|legacy-threshold-migration|file-settings-keys|electron-settings-registration|migration-location|dev-settings" 2>&1 | Tee-Object -Variable verifyLines | Select-Object -Last 40`

Result: **test phase: 16 tasks, 16 succeeded**. **Lint/typecheck phase: 11 tasks, 0 succeeded, 11 failed**; overall verify exit code 1. The failures were command-line parsing, not reported source diagnostics: `verify.mjs` forwarded `--testPathPatterns=...` to `tsc` and lint. The TypeScript log says `error TS5023: Unknown compiler option '--testPathPatterns=...'` (for example Nx terminal output `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\12772048215017225233`). Scoped `ptah_get_diagnostics` timed out twice after 45 seconds. No second verify run was made under the once-only instruction.

## Decisions

- Stored the one-time marker in the same atomic settings-file write as the threshold, following the existing v4 `__migrations` convention. Clearing a value retains the marker, and a crash cannot leave a moved value without completion state. Reversible by removing this migration and its marker.
- CLI `config.json` takes priority if both legacy CLI stores contain a threshold; an existing `settings.json` value takes priority over either. This follows the current workspace-provider read path.
- Kept `PTAH_SETTINGS_DIR` assignment before the Electron lock because child processes and later composition need it; only file writes moved behind the lock.
