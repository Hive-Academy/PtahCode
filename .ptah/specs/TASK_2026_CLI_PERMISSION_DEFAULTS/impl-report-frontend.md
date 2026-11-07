# Frontend implementation report

## Files changed

- `libs/frontend/core/src/lib/services/providers-settings.types.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts` (new)
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts` (new)
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`

## UI behavior

The CLI table has separate permission and network selectors based on verified manifest capabilities. The Ptah CLI default is shared across provider instances and has a dedicated control beside their cards. A saved row is labeled separately from the manifest built-in default. Unavailable controls show a reason and keyboard focusable tooltip. Full auto requires explicit confirmation; Cancel keeps the prior selection. Writes go through SettingsSaveFeedbackService and state.saveSettings with agent:getConfig read-back. Reset sends a null row and Undo restores the prior saved row. The Codex row notes its relationship to the existing sandbox setting.

## Tests added

The new cell spec checks option filtering, network restriction, unavailable reason, shared Ptah scope, accessible labels, confirmation Cancel/Confirm, and reset emission. Matrix specs cover save with Undo, reset with Undo, and a rejected write retaining the prior selection and showing the failure message. Existing assertions were updated for the new table column.

## Verification

- `npm run verify -- -p @ptah-extension/chat,@ptah-extension/core`: first run failed. Lint passed 2/2, typecheck failed 2/2 on three errors that were fixed. Test passed core and failed chat: chat had 345 passing suites, 1 failing suite, 2 failing assertions from the added column; these assertions were updated. The runner did not print a `Running target test for N projects` header.
- Same command, second run: typecheck passed 2/2; lint passed core and failed chat on one `no-output-native` error. The output was renamed from `reset` to `resetRequested`. Tests passed 2/2 projects. Exit code 1 due lint. The runner did not print a `Running target test for N projects` header.
- Same command, third run: **passed, exit 0**. Lint/typecheck 4/4 Nx tasks passed (2 cached); tests 2/2 project tasks passed (1 cached). Chat Jest: 347/347 suites passed; 6,194 passed, 2 skipped, 0 failed out of 6,196 tests. The runner did not print a `Running target test for N projects` header; Nx reported 2 test project tasks. Jest warned that one worker needed force exit after its tests, but the phase completed within 5m 36s.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=cli-orchestration-matrix.component.spec.ts --coverage=false --maxWorkers=2`: **passed, exit 0** after adding integration coverage. Nx reported 1/1 test project task passed; Jest reported 1/1 suite and 63/63 tests passed. The runner did not print a `Running target test for N projects` header.
- `ptah_get_diagnostics` scoped to four changed source files: unavailable because its TypeScript worker had timed out.
- No active browser session was available; serving an app is outside the permitted verification scope, so no rendered screenshot was inspected.

## Decisions

- The backend added nullable row patches during this task. Reset uses `{ cliLaneDefaults: { [cli]: null } }`, with read-back requiring the row to disappear. Reversible: remove the action if the backend contract changes.

## Open issues

- The backend lane changed Codex reset to clear the legacy sandbox key (`setAgentCfg('codexSandboxMode', undefined)`) after the initial report, so read-back should now show no saved row. The frontend integration has not been exercised against a running host.
- Visual inspection was unavailable because no browser session or app was running, and serving an app was prohibited by the verification scope.
