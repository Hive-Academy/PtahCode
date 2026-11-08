# Code Logic Review - SDK MCP workspace URL

Verdict: APPROVE (score 8/10, confidence HIGH). 0 blocking, 0 serious, 2 moderate, 1 minor.

## Checks

1. URL grammar - OK. New URL `/session/{enc(id)}/workspace/{enc(cwd)}[/profile/apps]` matches the closed grammar in `http-server.handler.ts` (`extractCallerWorkspaceRoot` ~326-332 allows the session prefix, the workspace segment, then an optional `/profile/{name}`). `extractCallerToolProfile` (~336-341) has an optional `/workspace/[^/?]+` before `/profile/`, so apps profile after the workspace segment is read. `encodeURIComponent` removes `/`, `?` and `\`, so `[^/?]+` plus `decodeURIComponent` round-trips Windows and POSIX roots. The same shape is already used by `ptahMcpSessionUrl` (codex-ptah-mcp.ts:51-52).
2. Equality - OK. `bindingMatchesUrl` (mcp-caller-auth.types.ts ~95-119) is exact string equality with no case, slash or drive-letter normalization. This is safe because the URL and the bound root come from the same `cwd` variable inside one `buildMcpServers` call (sdk-query-options-builder.ts:2223-2234). The `!cwd` guard at 2218 throws before issue, so an empty or undefined cwd can never produce a bound-vs-URL mismatch (it fails loudly instead). The single call site (line ~1516) passes the same `cwd` used for the capability policy. On resume or a cwd change, each build re-issues a token and builds a URL from that build's cwd, so they stay consistent. Junction/symlink forms are not canonicalized, but both sides use the identical string.
3. Other call sites - OK. Grep of `.issue(`: `sdk-query-runner.service.ts:843` (internal-query uses `/workspace/{enc(cwd)}`, correct), `codex-chat-host-ports.ts:401` (URL from `ptahMcpSessionUrl` with cwd, correct), `lane-mcp-credentials.ts` and `connection.ts` are outside the SDK chat URL path. No other session-bound token is paired with a workspace-less URL.
4. Formatter reflow of the SendMessage gate - behavior-neutral. `git diff -w` shows only line wrapping and multi-line object literals in `budgetMessageGate` and the doc comment. Logic, return values and the fail-open catch are unchanged.
5. Security - not weakened. The server code is untouched. A forged workspace segment still needs a token whose binding has the identical root, so a mismatch yields 403 / -32003. The workspace is attribution only; the token is the credential.

## Findings

1. Moderate - http-server.handler.spec.ts (new it.each, ~"accepts a workspace-bound session URL..."): this test exercises only unchanged server code, so it passes on the old code too. It pins the contract (success with workspace, 403/-32003 without, for `/projects/x y/` and `D:\projects\x y`) but would not detect the regression. The detecting tests are the builder specs, which now assert the `/workspace/...` path. The contract and the writer are not tested together.
2. Moderate - sdk-query-options-builder.spec.ts: no test feeds the URL the builder produced into `extractCallerWorkspaceRoot` / `registry.authorize`. A one-line round-trip test (builder URL, then the real handler or `bindingMatchesUrl`) would prevent a repeat of this drift. Root-cause class: two independent writers of the grammar (`ptahMcpSessionUrl`, `ptahMcpUrl`, the builder inline template) with no shared helper.
3. Minor - sdk-query-options-builder.ts:2234 builds the URL inline instead of reusing the existing `ptahMcpSessionUrl` helper; follow-up refactor only, not required for correctness.

## Residual uncertainty

Not run (read-only brief): tests, typecheck. Did not verify the Claude SDK's HTTP client preserves `%5C` and `%3A` unchanged in the request path (the Codex path and file-writer URLs already rely on the same encoding).
