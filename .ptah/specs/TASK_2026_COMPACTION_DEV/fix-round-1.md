## Fixes

1. Existing Electron `config.json` value is copied into the resolved `settings.json` only when that file has no threshold: `libs/backend/platform-core/src/legacy-threshold-migration.ts:10-36`, called before DI from `apps/ptah-electron/src/main.ts:77-89`. Dev checks its own legacy config first, then the production app's legacy config. Spec: `libs/backend/platform-core/src/legacy-threshold-migration.spec.ts:7-25`.
2. Migration sentinels now use the resolved settings directory. V3 continues to use `~/.ptah` for encrypted secrets: `libs/backend/platform-electron/src/settings/electron-settings-registration.ts:141-151`. Runner and V3 specs: `libs/backend/settings-core/src/migrations/migration-location.spec.ts`.
3. The sentinel prefix follows the explicit development mode flag, avoiding case-sensitive path comparison: `libs/backend/platform-electron/src/settings/electron-settings-registration.ts:144`.
4. Dev seeding sets `PTAH_SETTINGS_DIR` first, reports a real Error on failure, and allows launch with default settings: `apps/ptah-electron/src/activation/dev-settings.ts:4-15`, called from `apps/ptah-electron/src/main.ts:70-75`. Failure spec: `apps/ptah-electron/src/activation/dev-settings.spec.ts`.
5. Seeding writes a unique temporary file in the target directory, atomically publishes with a same-directory hard link, and removes the temporary file. The hard link gives atomic no-overwrite behavior if two dev launches race: `libs/backend/platform-core/src/file-settings-manager.ts:96-107`. Race and malformed-source specs: `libs/backend/platform-core/src/file-settings-path.spec.ts`. The initial race spec failed because Jest could not spy on a read-only `fs` namespace; its mock setup was corrected after verification, and scoped TypeScript diagnostics are clean.
6. The initial dev copy forces `gateway.enabled` and `cron.enabled` to false while preserving other values and tokens: `libs/backend/platform-core/src/file-settings-manager.ts:87-94`. Spec: `libs/backend/platform-core/src/file-settings-path.spec.ts`.
7. A non-absolute `PTAH_SETTINGS_DIR` emits a warning and falls back to `~/.ptah`: `libs/backend/platform-core/src/file-settings-manager.ts:68-78`. Spec: `libs/backend/platform-core/src/file-settings-path.spec.ts`.
8. No code change. The 200000 default for 1M-context sessions and the existing warning for thresholds below 100000 are the user's explicit decision.
9. Added coverage of runner marker directory and prefix (`libs/backend/settings-core/src/migrations/migration-location.spec.ts:19,34`), V3 `secretsDir` (`:41`), the actual `registerElectronSettings` development branch (`libs/backend/platform-electron/src/settings/electron-settings-registration.spec.ts:22`), seed failure (`apps/ptah-electron/src/activation/dev-settings.spec.ts:13`) and publish race (`libs/backend/platform-core/src/file-settings-path.spec.ts:85`).

## Defect 6 evidence

Electron calls gateway startup at `apps/ptah-electron/src/activation/start-messaging-gateway.ts:86`. Gateway `startEnabled()` returns without starting adapters when the master `gateway.enabled` switch is false (`libs/backend/messaging-gateway/src/lib/adapter-lifecycle.service.ts:228-239`). Cron reads `cron.enabled` at `libs/backend/thoth-runtime/src/lib/start-thoth-cron.ts:242-250` and passes that value to scheduler start at `:413-418`; its default is true (`libs/backend/platform-core/src/file-settings-keys.ts:455`). The seed therefore disables both switches in the dev file while retaining token ciphertext and all other settings. Production source is read only.

## Verification

One run, PowerShell `Select-Object -Last 60` equivalent of the requested `| tail -60`:

`npm run verify -- -p platform-core,agent-sdk,platform-electron,settings-core,ptah-electron,rpc-handlers 2>&1 | Tee-Object -Variable verifyLines | Select-Object -Last 60`

Result: lint/typecheck **11 tasks: 11 succeeded**. Tests **16 tasks: 12 succeeded, 4 failed**; exit code 1. The verify script listed exactly the six requested projects in both phase headers, but Nx did not print a `Running target ... for 6 projects` header in the captured output. `platform-electron` and `settings-core` test tasks passed. The run preceded the final race-test mock correction; `ptah_get_diagnostics` then found 0 errors and 0 warnings in that file. No second verify run was made, as requested.

FAILED suite paths from the four Nx test logs (21 unique):

- `libs/backend/platform-core/src/session-driver-lock/control-endpoint.spec.ts`
- `libs/backend/platform-core/src/session-driver-lock/kernel-session-driver-lock.spec.ts`
- `libs/backend/platform-core/src/file-settings-path.spec.ts` (new test mock failed in the run; corrected afterward)
- `libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.capabilities.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.session-notice.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts` (installed SDK 0.3.278; spec expects 0.3.318)
- `libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/install-scope/install-scope-migration.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.session-notice.spec.ts`
- `libs/backend/rpc-handlers/src/lib/install-scope/install-scope-migration.fixtures.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-agent-child.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-resume-activate.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-session-folder.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-policy-roots.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/session-folder.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/file-view-rpc.handlers.spec.ts`
- `apps/ptah-electron/src/config/worker-host-packaging.spec.ts`
- `apps/ptah-electron/src/di/phase-2-libraries.config-home.spec.ts`

## Decisions

- Used Electron startup migration for the legacy threshold because `config.json` belongs to the host and is outside the platform-neutral settings migrations. It is additive and only writes a missing file-based value; the legacy value remains for a possible rollback. Reversible by removing the startup call and helper.
- Kept `dev-v` sentinel names while moving them to the dev settings directory. Production keeps `vN.applied` under `~/.ptah/migrations`. Reversible by changing the registration arguments.
- Used a hard link for the final seed publish because it is atomic and fails on an existing target; rename can replace the winner of a concurrent launch. The temporary file is always removed.
- Kept the requested 200000 default for 1M-context sessions. A persisted threshold below 100000 remains warned and treated as unset.
