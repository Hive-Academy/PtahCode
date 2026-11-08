# Permission routing round-3 fix

## Change

- Extracted the Electron SDK lane-owner port binding into `registerElectronSdkLaneOwnerLookup` in `apps/ptah-electron/src/di/phase-2-libraries.ts`. The production phase-2 composition calls it after registering the CLI agent runtime.
- Updated `apps/ptah-electron/src/di/container.smoke.spec.ts` to use that production binding with the real `AgentProcessManager` and `SdkPermissionHandler`. Removed the fake owner lookup and source-text assertion. The test verifies that the handler received the composed port and that the port finds a lane record restored through the manager's public API.
- `apps/ptah-electron/src/di/expected-resolvable.ts` already lists `SDK_CLI_AGENT_OWNER_LOOKUP`; no change was needed. The coordinator-reserved runtime resolve in `agent-rpc.handlers.ts` was not changed.

## Tests and verification

- `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=container.smoke.spec.ts` — the final run executed all 57 assertions successfully (one suite, 57/57 tests passed). Jest exited 1 because of the known post-teardown SQLite `require('better-sqlite3')` callback. Earlier iterations of this same focused command exposed missing fixtures in the minimal container; those were corrected before the 57/57 run.
- `npm run verify -- -t lint,typecheck -p ptah-electron` — passed, 2/2 tasks succeeded.
- Scoped `ptah_get_diagnostics` was unavailable after 45 seconds; the successful project typecheck above covers the changed files.

## Decisions

- The test uses the production binding function in the existing minimal Electron container harness. This exercises the actual `afterResolution` capture without booting Electron's native dependencies under Jest.
