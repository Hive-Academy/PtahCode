# MCP attachment fixes

- Added `getAttempt` and its shared attempt type to the CLI runtime probe port, exported the type, and removed the manager's structural cast. The observer retains its public type export.
- The HTTP handler passes the `tools/list` result to the observer. An empty or malformed tool list no longer creates a cached attachment, so a later valid `tools/list` or `initialize` can complete the wait. The server's existing `clearPort` clears entries on restart.
- Antigravity already writes its MCP configuration before spawning the CLI. Its startup wait now distinguishes attachment timeout from lane exit, and invokes the registered callback for an actual timeout even if the process closes in the same turn. Callback registration remains available on every returned SDK handle.

## Decisions

- Defined `McpAttachmentAttempt` in the CLI runtime port and re-exported it from the observer. Importing the observer type into the runtime would reverse the package dependency. Reversible.
- Preserved Antigravity's config-write failure fallback. The adapter marks `mcpConfigWriteFailed` so the parent can report it. Reversible.

## Verification

- Observer Jest suite: 5 tests passed, including the empty tool list regression.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed.
- `npx eslint` on changed TypeScript files: exit 0, no errors, 27 existing warnings in the large manager and Antigravity adapter files.
- CLI runtime Jest suites were attempted. The combined run exposed an outdated `getAttempt` test mock, which was corrected; the process then stalled. The narrower Antigravity suite also stalled and was stopped. Those suites have no passing result from this run.
