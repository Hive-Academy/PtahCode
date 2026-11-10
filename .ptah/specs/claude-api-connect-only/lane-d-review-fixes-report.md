# Lane D review fixes

## Finding 1
`libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:82,353,597`: active Claude API replacement emits `use-main-agent`, invoking the existing `auth:saveSettings` route refresh; inactive replacement stays `connect-only`. The helper text matches each path. Tests: `credentials-tab.component.spec.ts:69,315,328`; `libs/frontend/core/src/lib/services/providers-connection-setup.service.spec.ts:303,328` assert active `auth:saveSettings` with `authMethod: apiKey` and inactive secret-only RPC without settings save.

## Finding 2
`libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:321-324,600`: disable and guard deletion for active Claude API and explain the required route change. `libs/frontend/core/src/lib/services/providers-connection-setup.service.ts:72,835-840`: block active-route deletion before RPC using persisted auth method. Tests: `credentials-tab.component.spec.ts:340`; `providers-connection-setup.service.spec.ts:400-415` cover blocked active and secret-only inactive deletion.

## Finding 3
`libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-anthropic-api.spec.ts:86-104`: the subscription lane has its own stored credential, a defined profile and captured spawn environment while the shared direct key is stored; all three Anthropic auth variables are absent.

## Finding 4
`libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:512-525`: failed instance-secret deletion restores and saves the original config, logs a fixed Error without key material, and throws a fixed typed `SdkError`. Test: `ptah-cli-registry-anthropic-api.spec.ts:106-116`.

## Finding 5
`libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:313,395,586,655,837`: removed the helper between imports and call `getPtahCliLaneProvider` directly. Covered by `ptah-cli-registry-anthropic-api.spec.ts:46-116`.

## Changed files
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.spec.ts`
- `libs/frontend/core/src/lib/services/providers-connection-setup.service.ts`
- `libs/frontend/core/src/lib/services/providers-connection-setup.service.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-anthropic-api.spec.ts`
- `.ptah/specs/claude-api-connect-only/lane-d-review-fixes-report.md`

## Verification
`npm run verify -- -p chat,core,cli-agent-runtime`: 6/6 lint/typecheck tasks passed; 2/3 test tasks passed (chat and core), 1/3 failed (cli-agent-runtime). The CLI runtime log reported 176 suites passed, 3 failed; 3,684 tests passed, 2 failed, 1 skipped. One suite failure was a type error in this lane's new mock and was fixed. The other two failing assertions were in `ptah-cli-registry-spawn-model.spec.ts` and `ptah-cli-registry-capabilities.spec.ts`, outside the requested files. `npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns=ptah-cli-registry-anthropic-api`: 1/1 task passed after the fix. `git diff --check`: passed.

## Open points
The full CLI runtime test target remains red on the two other registry assertions; the full scoped verify was not repeated as required. No rendered UI screenshot was possible without a running host, and build/serve/dev were prohibited. No matching skill was provided through this lane's CLI skill mechanism.
