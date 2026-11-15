# PR review fixes report

## Fixes

- Finding 1: `mcp-core/agent-spawn-replay-status.ts:6` bounds status to 2 seconds and replays on lookup rejection or timeout; `mcp-core/protocol-dispatcher.ts:1302` uses it and keeps the warning free of task text and secrets. `mcp-core/agent-spawn-dedupe.ts:76` also conservatively replays if a validity callback rejects.
- Finding 2: `mcp-stdio/agent-tool.dispatcher.ts:216,467` owns one dedupe instance and places the limit gate and spawn inside its attempt. Replays return the HTTP wording without a second limit lookup; `force` bypasses the reservation. Both dispatchers use the shared status helper.
- Finding 3: `mcp-core/protocol-dispatcher.ts:1227` scopes by session and caller agent, with credential binding identity when available; `mcp-core/agent-spawn-dedupe.ts:49` always hashes canonical arguments plus an explicit key. `mcp-core/tool-description.builder.ts:839` states the same-key, same-arguments rule. `mcp-core/__snapshots__/effective-tool-list.spec.ts.snap:24`: `ptah_agent_spawn` hash `e9214b14a826e7dc` → `c48353a8330c1127`.

## Tests

- Added HTTP rejected-status replay, caller-agent separation, and different-argument keyed spawn cases in `mcp-core/protocol-dispatcher.spec.ts:4446`.
- Updated the existing rejected-validity expectation and added same-key/same-argument replay in `mcp-core/agent-spawn-dedupe.spec.ts:32,83`.
- Added stdio concurrent/retry/force/explicit-key cases in `mcp-stdio/agent-tool.dispatcher.spec.ts:79`.

## Check results

- Snapshot update: exit 0; `Test Suites: 1 passed, 1 total`; `Tests: 4 passed, 4 total`; `Snapshots: 3 updated, 3 total`.
- Focused Jest (five requested specs): exit 0; `Test Suites: 5 passed, 5 total`; `Tests: 522 passed, 522 total`; `Snapshots: 3 passed, 3 total`.
- Dedupe spec after the final expectation change: exit 0; `Test Suites: 1 passed, 1 total`; `Tests: 8 passed, 8 total`.
- `tsc --noEmit` library: exit 0, no diagnostics. Spec: exit 0, no diagnostics.
- ESLint on all changed TypeScript files: exit 0; `✖ 79 problems (0 errors, 79 warnings)` (existing warnings in large files). Final changed-source lint: exit 0, no diagnostics.
- Prettier on changed TypeScript files: exit 0. Final changed-source formatting: exit 0.
- Degradation audit: exit 0; `degradation-audit: TOTAL 221 unsuppressed site(s)`; `libs/backend/vscode-lm-tools: 2 ok (baseline 2)`.

## Decisions

- `mcp-http/http-server.handler.ts:570` assigns `accepted.binding` from the credential gate to `_callerBinding`. The binding has `kind` (`agent`, `session`, `workspace`, `home`, or `internal-query`), optional `agentId`, `sessionId`, `workspaceRoot`, `toolProfile`, `phaseKind`, `disallowedTools`, and `capability`; it contains no raw secret or connection identifier. Agent/session IDs provide a stable scope when present. Workspace/home bindings identify the same workspace or home across clients, so they cannot distinguish individual external connections. Their retries retain the workspace-root fallback; no secret is hashed or logged.
- Skill discovery returned no locally installed matching skill. Source inspection and repository guidance were used.

## Open issues

None identified.

PR-REVIEW-FIXES: DONE
