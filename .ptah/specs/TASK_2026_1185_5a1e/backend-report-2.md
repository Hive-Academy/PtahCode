# Backend MCP registration follow-up

## Changes

- Restored `ensureRegisteredNow()` to the mainline full `reconcileRegistrations()` pass, including stale removals, all open folders, retained roots, and home targets.
- Kept the root scoped `retainRootNow()` and `releaseRoot()` paths because the complete focused suite passes with them.
- Kept the fast path, 3-second `timeout` outcome, coalesced `queueRepoint()`, slow registration timing warning, and new concurrency specs.
- Made the fast path retry after any failed registration or removal. It also checks that the on-disk token is authorized for the current workspace and access setting, so a replaced credential enters the serialized reconcile path.
- Did not change the existing spec expectations or the coordinator's chat and gateway edits.

## Verification

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --testPathPatterns "mcp-http"`: PASS, 7 suites, 214 tests, 0 failures. An earlier run after restoring full reconciliation had 2 failures; the final run passed after tightening the fast path.
- `npx tsc --noEmit -p libs/backend/vscode-lm-tools/tsconfig.lib.json`: PASS, exit 0.
- `npx tsc --noEmit -p libs/backend/vscode-lm-tools/tsconfig.spec.json`: PASS, exit 0.
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.concurrency.spec.ts`: PASS, exit 0, 0 errors, 3 warnings in the service file (`no-unused-vars` twice and `preserve-caught-error` once, in existing credential handling).
- `git diff --check`: PASS, exit 0. Git reported a CRLF-to-LF advisory for the concurrency spec.

Ptah MCP tools were unavailable in this lane, so repository search and native commands were used. No matching backend skill was available through the local skill catalog. No commit or push was made.
