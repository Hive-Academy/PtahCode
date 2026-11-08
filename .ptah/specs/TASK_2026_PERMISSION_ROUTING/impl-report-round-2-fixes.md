# Permission routing round-2 fixes

## Item 1: host-bound SDK lane owner port

- Added `SdkCliAgentOwnerLookup` interface in `libs/backend/agent-sdk/src/lib/di/tokens.ts`, exported through the public index. `SdkPermissionHandler` injects it optionally and denies a lane prompt if the port or owner record is absent.
- Removed permission-time `container.resolve` from `libs/backend/cli-agent-runtime/src/lib/di/register.ts`. Electron `apps/ptah-electron/src/di/phase-2-libraries.ts` and CLI `libs/backend/cli-engine/src/lib/container.ts` bind a stable port after process-manager registration. Their `afterResolution` hook captures the constructed manager once; `findAgentInfo` then reads live agent records without resolving DI.
- This checkout has no `apps/ptah-extension-vscode` project or VS Code composition root. The optional SDK port deliberately denies an unowned lane prompt there; a comment records that default. Electron `container.smoke.spec.ts` exercises a fake port and asserts the root hook, and `expected-resolvable.ts` already lists the port.
- `sdk-permission-handler.spec.ts` covers fake owner success, missing record and absent port. `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=sdk-permission-handler.spec.ts` passed.
- `npm run verify -- -t test -p @ptah-extension/cli-engine -- --testPathPatterns=surface-composition.spec.ts` passed. `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=container.smoke.spec.ts` ran all 56 assertions successfully, then exited 1 on the known post-teardown SQLite callback (`ReferenceError` while requiring `better-sqlite3`).

## Item 2: truthful sessionless Always Allow

- Added optional `canAlwaysAllow` to `PermissionRequest` in `libs/shared/src/lib/types/permission.types.ts`; the SDK handler sets it from the presence of `sessionId`. The existing backend downgrade of sessionless `always_allow` remains.
- `libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts` hides Always for `canAlwaysAllow: false`, even if a session ID is present. The compact callout type/component and `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts` pass and honor the capability too. Legacy requests without the field retain prior session-scoped presentation.
- Card spec tests absent session, true capability and explicit false capability. Compact callout spec tests false and true. `npm run verify -- -t test -p @ptah-extension/chat-ui -- --testPathPatterns='permission-request-card.component.spec.ts|compact-session-callout.component.spec.ts'` passed.

## Item 3: replay diagnostic

- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` logs replay RPC failures through injected `LoggingService`, with a `degradation-audit: reported - ...` comment for the intentional continuation. `agent-monitor.store.spec.ts` asserts the diagnostic on RPC rejection.
- `npm run verify -- -t test -p @ptah-extension/chat-streaming -- --testPathPatterns=agent-monitor.store.spec.ts` passed.

## Verification

Final scoped command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/chat-streaming,@ptah-extension/chat-ui,@ptah-extension/chat,ptah-electron`. Lint and typecheck passed 16/16 tasks. Test stage: 17/18 tasks succeeded, one project failed (`agent-sdk:test`). Its Jest summary was 221 passed, three failed, two skipped suites; 5,471 passed, three failed, five skipped tests. Two failures were the known Windows symlink `EPERM` baseline (`plugin-loader.service.session-notice.spec.ts` and `plugin-loader.service.capabilities.spec.ts`). The third was a five-second timeout in `plugin-loader.service.spec.ts` under concurrent machine load. `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=plugin-loader.service.spec.ts` passed when isolated, so the timeout is load-sensitive and unrelated to the permission changes. The chat project is included because the compact card now forwards the capability. No VS Code app project exists in this checkout.

## Decisions

- The owner port captures the manager through tsyringe's existing `afterResolution` hook rather than constructing it eagerly; eager injection caused the earlier DI cycle. The hook and port binding are in each available host composition root. This is reversible.
- The capability is optional for shared-contract compatibility with existing MCP/Codex producers. An explicit false suppresses Always; the SDK always supplies an explicit value. This is reversible if every producer migrates to a required field.

## Open issues

- The VS Code composition root named in the request is absent from this checkout. Its SDK handler has the explicit safe default of denying lane prompts without the owner port.
- The optional `angular-frontend-patterns` skill could not be loaded because this lane exposed no skill discovery/loading tool; the Angular changes follow the repository's stated conventions.
