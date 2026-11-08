# Claude SDK MCP workspace URL regression

## Root cause

Commit `9101d8bc6` bound interactive Claude SDK session tokens to `workspaceRoot: cwd`, while their dynamic MCP URL still ended at `/session/{id}`. The HTTP handler therefore parsed no workspace identity. The token registry's exact identity check rejected discovery requests with HTTP 403 and JSON-RPC `-32003`.

## Fix

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2234`: append `/workspace/${encodeURIComponent(cwd)}` after the encoded session ID and before `/profile/apps`. The URL now declares exactly the root used in the token binding. The HTTP parser decodes the single segment, preserving Windows drive letters, backslashes, spaces, and trailing separators.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts:2252`: assert the token-bound root matches the encoded URL path for POSIX and Windows fixtures, including a space and trailing POSIX slash. Update session and Apps URL expectations, including the full-build Apps test at line 458.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.spec.ts:1171`: use the real HTTP handler and token registry to show that the workspace-bound session URL succeeds and the session-only URL fails with 403/`-32003`, for POSIX and Windows roots.

## Other call sites

- `sdk-query-runner.service.ts` issues an `internal-query` token bound to `cwd` and already uses `/workspace/${encodeURIComponent(cwd)}`.
- CLI lanes issue agent tokens bound to `workingDirectory`; `ptahMcpServerUrl` already puts `/workspace/${encodeURIComponent(workingDirectory)}` after the agent segment, and `laneMcpAuthUrl` prefixes `/auth/{token}` without dropping the workspace path.
- No other production `mcpCallerCredentials.issue` site builds a session URL without a workspace segment. The DI registration only forwards credential issuance.

## Tests

- Builder spec covers POSIX `/projects/x y/` and Windows `D:\\projects\\x y` roots, URL encoding, profile order, and binding.
- HTTP auth spec covers acceptance of the encoded workspace URL and rejection of the bare session URL for both roots.

## Verification

- `ptah_get_diagnostics` after the source and spec changes: 0 errors, 0 warnings. Later diagnostics attempts after formatting timed out while the TypeScript check ran; the scoped Nx typecheck passed.
- `npm run verify -- -t lint,typecheck,test -p agent-sdk,vscode-lm-tools`: lint and typecheck passed (4/4 tasks). Test phase: `vscode-lm-tools:test` passed; `agent-sdk:test` failed with 3 suites. `sdk-query-options-builder.spec.ts` failed on an old Apps URL expectation; it was corrected afterward. `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts` failed on the known Windows symlink `EPERM` baseline. Full test run reported 222 passed, 3 failed, 2 skipped suites in agent-sdk.
- `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=sdk-query-options-builder.spec.ts`: passed (1/1 task) after correcting the stale Apps URL expectation.

## Live check needed

Launch a fresh Claude SDK chat in Electron with the local MCP server active and verify that Ptah tool discovery succeeds. This lane did not launch the app.

## Decisions

- Keep the workspace-bound token and append the workspace URL segment. Alternative: remove the binding. Evidence: the HTTP parser already accepts the combined shape and the other SDK/CLI URLs follow it. Reversible: yes.
