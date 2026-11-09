# Implementation report

## Files changed

- `libs/backend/platform-core/src/interfaces/mcp-caller-credentials.interface.ts`: define the shared seven-day interactive credential maximum age.
- `libs/backend/platform-core/src/index.ts`: export that constant from the public alias.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`: use the shared age for Claude sessions.
- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts`: use the shared age and revoke the issued Codex subject at session close.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-auth.types.ts`: define the clear invalid-credential error while retaining the generic malformed/missing-token error.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts`: use the new error for a well-formed unknown, expired, or revoked token.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts`: assert the shared lifetime.
- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.spec.ts`: assert the shared lifetime and close-time revocation.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.spec.ts`: cover validity past four hours, seven-day expiry, revocation and the diagnostic.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.spec.ts`: assert the 401 JSON-RPC response and that it contains no token.

## Recovery and teardown evidence

The response says: "Recreate the affected session to reconnect Ptah tools." A new credential is issued when the SDK builds MCP servers (`sdk-query-options-builder.ts:2223-2233`); the registry has no renewal on lookup (`mcp-caller-token-registry.ts:129-151, 332-374`). The investigation identifies session recreation as the available recovery path (`investigation.md`, Q5). Claude teardown calls `revokeMcpSubject` (`session-control.service.ts:242,336,405`) and that calls `revokeSubject` (`sdk-query-options-builder.ts:1078-1079`). Codex teardown invokes `sessions.closed` (`codex-chat-session-controls.ts:101-106`), which now revokes the matching subject (`codex-chat-host-ports.ts:306-312`). Server stop still calls `revokeEphemeral` (`http-mcp-server.service.ts:736-750`).

## Verification

`npm run verify -- -p platform-core,agent-sdk,rpc-handlers,vscode-lm-tools` - exit 1. Header confirmed four requested projects. Lint/typecheck: 7 succeeded, 1 failed (`@ptah-extension/rpc-handlers:typecheck`); the short failure was `TS2345: Argument of type string | undefined is not assignable to parameter of type string` at `codex-chat-host-ports.ts:559`. Fixed by narrowing `routingId` before storing it. Subsequent `ptah_get_diagnostics` on that file: 0 errors, 0 warnings. Tests: 0 succeeded, 4 failed at Nx target level. Platform-core: 57 suites passed, 2 failed (socket/control-endpoint tests); agent-sdk: 221 passed, 6 failed, 2 skipped; vscode-lm-tools: 60 passed, 44 failed; rpc-handlers: 107 passed, 131 failed. Repeated failure verbatim: `Could not locate module marked mapped as: D:\projects\ptah-extension\.claude-worktrees\mcp-auth-reject\node_modules\marked\lib\marked.umd.js`. The Codex host spec in the saved run also failed on the fixed TS2345 error. The changed HTTP handler spec could not start because of the `marked` resolver error. No second verify run was made, per the one-run instruction. Ptah diagnostics for the final HTTP spec edit timed out after 45 seconds.

## Decisions

- Use the existing `platform-core` dependency for the shared constant. Both consumers already imported its public alias; no new dependency edge. Reversible: yes.
- Keep malformed or absent bearer responses generic; use the clear recovery message only after a well-formed token fails lookup. This preserves the existing HTTP 401 and 403 split. Reversible: yes.
- Use the adapter's existing `sessions.closed` lifecycle point for Codex revocation; the subject is bound to the prepared profile at issue time. Reversible: yes.

## Not done

A passing full verify remains outstanding because of the worktree `marked` mapping and unrelated platform-core socket test failures. The fixed Codex type error and the final HTTP spec assertion were not rerun through Jest.

