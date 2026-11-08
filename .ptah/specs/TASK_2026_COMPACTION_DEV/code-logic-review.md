# Code Logic Review - TASK_2026_COMPACTION_DEV

## Verdict

REVISE, score 6/10.

The dev-settings isolation is wired consistently for every settings.json reader and writer I traced. Secrets, production sentinels and harness presets stay on `~/.ptah`. The 200000 default and its precedence rules are correct. Two real defects remain: the `compaction.threshold` key move silently drops values already stored by Electron users, and the dev sentinel placement can skip migrations for a reseeded dev profile. Several error-path and test gaps are listed as minor.

Not run (as instructed): tests, builds, git state changes. Findings come from reading the diff and the direct readers and writers.

## Defects

1. **major - Existing Electron `compaction.threshold` values are silently ignored after the key becomes file-based**
   - `libs/backend/platform-core/src/file-settings-keys.ts:144`, read path `libs/backend/platform-electron/src/implementations/electron-workspace-provider.ts:99-105`.
   - Before this change the key was not in `FILE_BASED_SETTINGS_KEYS`, so on Electron it lived in `config.json` (`this.config['ptah']['compaction.threshold']`).
   - Now `getConfiguration` routes it to `fileSettings` and never consults `config.json`. No migration or fallback read exists (grep: no other `compaction.threshold` handling in non-spec code).
   - A user who set a threshold sees it reset. Combined with the new 200000 default, their session then compacts at a size they did not choose.
   - Fix: add a settings migration (v5) that moves `ptah.compaction.threshold` from `config.json` to settings.json when settings.json has no value. Or add a one-time fallback read from `config.json`.
   - The same loss applies to any CLI user whose CLI config stored the key (`libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts`).
   - A settings-UI write does reach settings.json: `set` at `electron-workspace-provider.ts:221-222` routes file-based keys to `fileSettings.set`. That part is fine.

2. **major - Dev sentinels live in `~/.ptah/migrations`, away from the settings file they describe**
   - `libs/backend/platform-electron/src/settings/electron-settings-registration.ts:150` (`markerDir = ptahDir`, prefix `dev-v`), `libs/backend/settings-core/src/migrations/runner.ts:36-40`.
   - The marker says "dev-vN applied" for whatever settings.json currently sits in the dev directory.
   - If the user resets the dev profile (deletes `~/.ptah-dev`), the seed copies a fresh `~/.ptah/settings.json`. If that source file has not yet been migrated by a production launch, the stale `dev-v2/v3` sentinels make the runner skip v2 and v3 against the new copy. Model/reasoning keys and plaintext gateway secrets then stay unmigrated in dev.
   - A custom `PTAH_SETTINGS_DIR` also collides on the same `dev-v*` names, because every non-default directory shares one sentinel set (see the next point).
   - Production sentinels cannot be marked or skipped by a dev run: the prefix differs, so criterion 2 holds in that direction.
   - Fix: keep the dev sentinels beside the settings (`<settingsDir>/migrations/v*.applied`). Criterion 2 only requires that production sentinels stay in `~/.ptah`. Alternatively, drop the sentinel for dev and rely on the migrations' content-level idempotence: v2 returns early when the keys are gone, v4 has an in-file marker, and v3 only moves what is present.

3. **minor - The `settingsDir === ptahDir ? 'v' : 'dev-v'` test is brittle**
   - `electron-settings-registration.ts:150`.
   - The comparison is case-sensitive. On Windows, `PTAH_SETTINGS_DIR=c:\users\x\.ptah` makes production use `dev-v*` sentinels and re-run all migrations. This is harmless only because the migrations are idempotent.
   - The prefix keys off "not the default dir", not off dev mode, so a user-set `PTAH_SETTINGS_DIR` in a production build is labelled "dev".
   - Fix: compare with `path.relative` or a case-normalised path, or derive the choice from the dev flag.

4. **minor - Seed failures are uncaught at module scope**
   - `apps/ptah-electron/src/main.ts:70-72`, `libs/backend/platform-core/src/file-settings-manager.ts:71-79`.
   - `mkdirSync` and `copyFileSync` errors other than `EEXIST` (permissions, disk full, locked file) propagate as a top-level main-process exception, before any logger exists.
   - This is not a silent swallow, and it fails safe: the throw happens before `PTAH_SETTINGS_DIR` is set, but the app crashes anyway rather than writing `~/.ptah`.
   - Fix: wrap the call in `main.ts` and `console.error` a typed message. Then either start with an empty dev profile (still setting the env var) or abort with a clear dialog. Do not fall back to `~/.ptah`.

5. **minor - The copy is not atomic**
   - `file-settings-manager.ts:76` (`copyFileSync` with `COPYFILE_EXCL`).
   - A crash or kill mid-copy leaves a truncated `~/.ptah-dev/settings.json`. Every later launch sees the file as existing and never reseeds.
   - Fix: copy to `settings.json.seed.tmp` and `renameSync` it (or `linkSync`) to the target.

6. **minor - Seeding duplicates live integration settings into the dev profile**
   - `main.ts:71`.
   - The whole file is copied, including messaging-gateway bot tokens (`libs/backend/messaging-gateway/src/lib/token-vault.interface.ts:3` says they are stored in settings.json). Their ciphertext decrypts with the shared master key in `~/.ptah`.
   - The dev app can therefore start a second poller on the same bot or cron configuration as the production app.
   - Unverified at runtime. I did not trace the gateway start conditions.
   - Fix: after the copy, force the gateway and cron "enabled" keys off in the dev copy, or document that dev starts with these disabled.

7. **minor - `resolvePtahSettingsDir` does not validate the value**
   - `file-settings-manager.ts:65-68`.
   - A relative `PTAH_SETTINGS_DIR` resolves against the process cwd. A child process spawned with a different cwd would read or write a different directory.
   - Fix: apply `path.resolve` and require an absolute path, otherwise ignore the variable with a warning.

8. **minor - Behaviour changes at the edges of the 200000 default**
   - `libs/backend/agent-sdk/src/lib/helpers/auto-compact-control.ts:67`, resolver branch around line 168-175.
   - Every first-party Claude session now compacts at 200000, including 1M-context models. The user opts out only by setting a threshold up to 1000000, or by disabling compaction.
   - A persisted threshold below 100000 is treated as unset by `compaction-config-provider.ts:149-170`, with a warning. The class default now fills the gap instead of the runtime's own choice.
   - A direct `resolveAutoCompactControl` caller passing an invalid `windowTokens` gets the class default silently. That is a substitution the docstring says should not happen.
   - Fix: document the 1M behaviour in the settings UI copy. Optionally return `source: 'default'` plus a warning flag when the user value was invalid.

9. **minor - Missing tests for the new wiring**
   - No spec covers `MigrationRunner` with `markerDir` / `markerPrefix` (`runner.ts`; `migration-edge-cases.spec.ts` is unchanged).
   - No spec covers `runV3Migration` with a separate `secretsDir` (`v3-migration.ts`).
   - No spec covers the `registerElectronSettings` branch that picks `settingsDir` and the sentinel prefix.
   - Neither the `main.ts` dev block nor any seed failure is tested: unwritable target, `EEXIST` race, truncated source.
   - `file-settings-path.spec.ts` only covers the happy path and the already-seeded path.
   - There is no test that a migrated dev profile never touches `~/.ptah/settings.json`.
   - Fix: add those specs, using temp directories.

## Verified OK

- Settings.json writers all resolve through the same directory:
  - `PtahFileSettingsManager` constructor (`file-settings-manager.ts:118`), so settings UI, export/import and `cross-process-child.ts:38` (it forks with the inherited env; no `env:` override found) all write the dev file.
  - `HarnessConfigStore.settingsPath` and `updatePtahSettings` (`harness-config-store.service.ts`).
  - Migrations v2 and v4, which take `settingsDir`.
  - The tray watcher, through `workspaceProvider.fileSettings`.
- Dev never writes `~/.ptah/settings.json`: the seed only reads the source and writes to the target, `PTAH_SETTINGS_DIR` is set synchronously before DI, and a seed throw happens before the env is set.
- Secrets (`SecretsFileStore(ptahDir)`, master key provider, v3 `secretsDir = ptahDir`) and harness presets (`getPtahHome()` for `HARNESSES_DIR`) stay on `~/.ptah`. v3 is called with `ptahDir` as `secretsDir`, which matches criterion 2.
- Migrations v2 and v4 are idempotent against a settings.json copied from an already-migrated production file, so the first dev run is safe.
- Production behaviour with `PTAH_SETTINGS_DIR` unset: the default is `homedir()/.ptah`, the runner prefix is `v`, `markerDir === ptahDir`, and `secretsDir === ptahDir`. This is unchanged from before. The CLI passes `globalStoragePath` as the explicit override, and `MigrationRunner(ptahDir, ...)` there is untouched, so the CLI is not half-moved by an inherited env var.
- The 200000 default: user `compaction.threshold` wins over the default, `enabled: false` returns `autoCompactEnabled: false`, the env window wins, and proxied stays `null`. The spec for the session-control reset to 200000 is updated consistently.
- `compaction.threshold` routing: spec added in `file-settings-keys.spec.ts:23`. An unset value falls through to `undefined`, which the provider treats as unset. No VS Code app exists in `apps/` in this tree, so the VS Code contributed-setting concern does not apply here.

## Review family

Claude Sonnet subagent; implementer Codex.

## Re-review (round 1)

### Verdict

REVISE, score 7/10. Eight of the nine fixes are correct, and defect 8 is NO CHANGE by coordinator decision. The legacy-threshold fix introduces one new major defect (it resurrects a cleared threshold on every launch), plus three minor ones.

Not run (as instructed): tests and builds. Findings come from reading the diff and the new files, and one grep of `file-settings-manager.ts` for key deletion.

### Fix check

| # | Result | Evidence |
| --- | --- | --- |
| 1 | Correct for the overwrite requirement, but see new defect A | `libs/backend/platform-core/src/legacy-threshold-migration.ts:26-27` returns when `compaction.threshold` is already a nested or flat key (`in` also catches `null`). Malformed settings.json throws before any write and is caught and logged at `apps/ptah-electron/src/main.ts:83-88`. The write is temp file plus rename. |
| 2 | Correct | Sentinels now sit in the settings directory: `electron-settings-registration.ts:141-151` passes `settingsDir` as `markerDir`. Production (`PTAH_SETTINGS_DIR` unset, `NODE_ENV` not development) resolves to `~/.ptah/migrations/vN.applied`, unchanged. A reset of `~/.ptah-dev` removes its sentinels too. v3 secrets still go to `ptahDir`. |
| 3 | Correct | `electron-settings-registration.ts:144` follows `NODE_ENV === 'development'`, the same test `main.ts` uses for `isDev`. |
| 4 | Correct | `apps/ptah-electron/src/activation/dev-settings.ts:10-14` sets `PTAH_SETTINGS_DIR` before the seed. A failure is reported as an `Error` and launch continues on the dev dir, so nothing falls back to `~/.ptah`. |
| 5 | Correct, with a minor caveat (defect D) | `file-settings-manager.ts:96-107` writes a temp file with `wx` and publishes it with `linkSync`, which cannot replace an existing target. A crash mid-write leaves only a temp file, never a truncated `settings.json`. |
| 6 | Correct | `file-settings-manager.ts:87-94` forces `gateway.enabled` and `cron.enabled` to false in the parsed copy, in both nested and flat form. The production file is only read. Tokens and other keys are preserved. |
| 7 | Correct | `file-settings-manager.ts:68-78` ignores a relative value with a one-time warning and uses `~/.ptah`. |
| 8 | No change (coordinator decision) | - |
| 9 | Correct | Specs now cover the runner marker location and prefix, v3 `secretsDir`, the `registerElectronSettings` dev branch, the seed failure, the malformed source, the publish race and the relative env value. |

### Dev never writes `~/.ptah/settings.json`: confirmed

- `main.ts:70-75`: `PTAH_SETTINGS_DIR` is set before any call that resolves the settings directory.
- `main.ts:77`: `activeSettingsDir = resolvePtahSettingsDir()` is the dev directory.
- The only write in the legacy migration is to `<activeSettingsDir>/settings.json`.
- In dev, the production app's `config.json` (`appData/Ptah/config.json`) is only read.

### New defects

A. **major - The legacy threshold is resurrected on every launch after the user clears it**
   - `libs/backend/platform-core/src/legacy-threshold-migration.ts:26-27`, called at `apps/ptah-electron/src/main.ts:82-84`.
   - The old `config.json` value is deliberately left in place for rollback. The "already migrated" test is only "settings.json has the key".
   - Clearing the setting deletes the key (`file-settings-manager.ts:222`, `delete this.settings[key]`). The next launch then sees no threshold in settings.json and copies the stale `config.json` value back.
   - The user cannot return to "no threshold"; the old, possibly unwanted value reappears silently.
   - In dev it also re-copies the production app's legacy value every time the dev threshold is unset.
   - Fix: record completion durably, either with a marker key in settings.json (as the v4 migration does with `__migrations...`) or a sentinel file beside it, and skip once recorded. Alternatively, rename or remove the `compaction.threshold` key from `config.json` after a successful move.

B. **minor - The legacy migration runs before the single-instance lock**
   - `main.ts:77-89` runs ahead of `app.requestSingleInstanceLock()` at line 91.
   - A second launch of a production app can read-modify-write `settings.json` while the first instance is persisting. The rename can drop that write.
   - The window is small and only open while the key is missing. Fix: move the migration into the `gotLock` branch.

C. **minor - The legacy migration is Electron-only**
   - CLI users whose stored `compaction.threshold` sat in the CLI config still lose it. The fix notes do not cover this.
   - Document it as a known limitation, or add the same one-time move in the CLI bootstrap.

D. **minor - `linkSync` needs hard-link support**
   - `file-settings-manager.ts:104`.
   - On a filesystem without hard links (FAT/exFAT, some network or synced home directories) the call throws a non-`EEXIST` error. The dev app then launches with empty settings after a reported error.
   - It fails safe, but the seed never works on that volume. Fix: fall back to `copyFileSync` with `COPYFILE_EXCL` when `link` fails with `EPERM`, `ENOTSUP` or `EXDEV`.

## Re-review (round 2)

### Verdict

APPROVED, score 8/10. Defects A-D are fixed correctly and no new blocking or major defect was found. Two minor residuals are listed below. Not run (as instructed): tests and builds.

### Fix check

| # | Result | Evidence |
| --- | --- | --- |
| A | Fixed | `libs/backend/platform-core/src/legacy-threshold-migration.ts:23-33`. The marker `__migrations.legacyCompactionThreshold` and the moved value go out in one temp-file-plus-rename write. Later launches return at the marker check, so the move happens at most once per profile. The threshold is only set when neither the nested nor the flat key exists, so an existing settings.json value is never overwritten; the marker is still written in that case. A cleared value stays cleared. |
| B | Fixed | `apps/ptah-electron/src/main.ts:69-98`. Only the `PTAH_SETTINGS_DIR` assignment stays before `requestSingleInstanceLock()`, and it writes nothing. Seeding and the legacy migration run inside the `gotLock` branch, so a losing second instance touches no files. |
| C | Fixed | `libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts:51-62`. The move covers `config.json` and `global-state.json` in the CLI data dir and runs before the file settings manager loads. The migration helper handles the nested `ptah['compaction.threshold']` and the flat `ptah.compaction.threshold` shapes. |
| D | Fixed | `libs/backend/platform-core/src/file-settings-manager.ts:99-115`. On `EPERM`, `EXDEV` or `ENOTSUP`, the code warns and calls `copyFileSync` with `COPYFILE_EXCL`, which cannot replace an existing dev file. `EEXIST` from either call is swallowed by the outer catch, and the `finally` always removes the temp file. |

### Checks that confirm the key properties

- The marker survives the real manager: `file-settings-manager.ts:332-339` persists nested JSON (`unflattenObject`), so `__migrations.legacyCompactionThreshold` is read back as nested on the next launch. Both specs exercise this through `PtahFileSettingsManager.set(..., undefined)` followed by a second migration call.
- Both profiles are covered. Production Electron and the CLI share `~/.ptah/settings.json`, so one marker covers both sources. The first source to move wins, the other is skipped, and a later clear sticks.
- CLI startup safety: every failure path is inside the `try/catch` at `cli-workspace-provider.ts:52-61`. A missing file returns at `existsSync`. Malformed legacy JSON or a non-object settings.json throws, is caught, and becomes a process warning. The constructor continues and `PtahFileSettingsManager` is still created.
- The CLI passes `globalStoragePath` as the explicit directory, so an inherited `PTAH_SETTINGS_DIR` cannot redirect the CLI migration.

### New defects

E. **minor - A malformed legacy file warns on every CLI start, and `global-state.json` is parsed on every start**
   - `libs/backend/platform-cli/src/implementations/cli-workspace-provider.ts:51-62`.
   - The marker is only written after a threshold has been found, so a malformed `config.json` or `global-state.json` produces a `SyntaxError` warning at each launch. A large, valid `global-state.json` is read and parsed at each launch, only to find no threshold.
   - Fix: after one failure or one "no threshold" result, record that in settings.json, or skip when the marker already exists before parsing the legacy file. Move the marker check ahead of the legacy `JSON.parse`.

F. **minor - The `copyFileSync` fallback is not atomic**
   - `file-settings-manager.ts:108-109`.
   - A process kill during the fallback copy leaves a truncated `~/.ptah-dev/settings.json` that blocks every later seed. This is the defect-5 scenario again, but only on filesystems without hard links (the fallback path).
   - Fix: acceptable as a known limitation for those volumes. If wanted, validate with `JSON.parse` after the copy and unlink the target when invalid.
