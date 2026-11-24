# Backend implementation — `TASK_2026_979_9e1f`, batch 6

**Tasks completed**: 6.1 (async list and gateway routing), 6.2 (`gateway` caller class)

## Files

All paths are under `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\`.

- MODIFIED `mcp-caller-policy.ts`
  - Adds `'gateway'` to `McpToolClass` and adds `McpToolOrigin = 'host' | 'gateway'`.
  - `toolClass(name, origin = 'host')` returns `gateway` for a gateway-origin name.
  - `isToolPermitted(name, capability, origin = 'host')` lets only `privileged` callers use class `gateway`.
  - New `isGatewayCallerPermitted(binding)` mirrors the `IMcpGateway` caller matrix. It returns true for:
    - a privileged `agent`;
    - a privileged `session` with `gatewayApproval: true`;
    - a privileged `internal-query` with `includeConnectors: true`.
    It returns false for everything else: workspace and home slots, lane-report, read-only, and a request with no binding.
- MODIFIED `protocol-dispatcher.ts`
  - Adds `ProtocolHandlerDependencies.gateway?: IMcpGateway`.
  - `handleToolsList` is now async, and its only caller (`handleMCPRequest`) uses `return await`. After the eager and budget passes it appends the gateway tools, sorted by name, so gateway tools are never eager and pass through unchanged.
  - The gateway scope is copied from `_callerBinding`: kind, capability, workspaceRoot, `gatewayApproval` and `includeConnectors`.
  - Before the gateway list is appended, it drops:
    - names that collide with a host tool;
    - names that phase `disallowedTools` denies by exact name;
    - every gateway tool when the phase list is malformed (fail closed).
  - Reverse map: a per-gateway `WeakMap` from scope key to the names listed for that scope, capped at 64 scopes.
  - `dispatchToolsCall` sends names in the reverse map to the gateway first, passing `_abortSignal`. If no tool handles the name, it re-lists once, forwards on a hit, and otherwise returns `-32602 Unknown tool`.
  - Failure handling:
    - `listTools` throws: warn, then list Ptah tools only.
    - `callTool` throws: an `isError` tool result, never `-32603`.
    - `arguments` that are not an object: `-32602`.
  - `telemetryToolName` now shares a `hostToolNames()` helper.
- MODIFIED `mcp-caller-policy.spec.ts` — gateway class and permit tests, plus the `isGatewayCallerPermitted` matrix.
- MODIFIED `protocol-dispatcher.spec.ts` — new `describe('protocol-handlers › MCP gateway')` block with 20 cases:
  - A session with `gatewayApproval` sees sorted, non-eager gateway tools, and the scope and signal are passed on.
  - The Ptah list prefix is byte-identical to the list with no gateway.
  - These callers list and route nothing, and `listTools` is never called:
    - a session without approval;
    - lane-report and read-only lanes;
    - a privileged workspace slot and a home slot;
    - an internal query without `includeConnectors`;
    - a request with no token.
  - A privileged lane and an opted-in internal query are served.
  - A call forwards the arguments and the abort signal, and the result passes through.
  - Re-list on a miss: a name that appears since the last list is forwarded; a name still missing gets `-32602`.
  - Arguments that are not an object are rejected.
  - A phase-denied name is hidden from the list and refused on call. A malformed phase list hides every gateway tool.
  - A gateway tool that collides with a host name is dropped.
  - A `listTools` throw gives a warning and Ptah tools only.
  - A `callTool` throw gives an `isError` result.
  - A host tool call never consults the gateway.
- `protocol-dispatcher.surface.spec.ts` — unchanged. It passes as it is: no sync caller of `handleToolsList` remained outside `handleMCPRequest`.

## Stack observed

- tsyringe is not touched. The dispatcher takes plain dependency objects (`ProtocolHandlerDependencies`).
- The port types come from the `@ptah-extension/platform-core` barrel (`IMcpGateway`, `McpGatewayScope`, `McpGatewayTool`, `McpCallerBinding`), as a type-only import.
- The phase filter is reused from `mcp-caller-phase-filter.ts` (`isPhaseToolDenied`, `phaseDisallowedTools`).
- Logging uses the injected `Logger` (`deps.logger.warn`) wrapped in `runObserver`, as the sibling code does.

## Verification

- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` gives exit 0, with 0 errors.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` gives exit 0, with 0 errors.
- `npx eslint` on the 4 changed files gives exit 0: 0 errors and 77 warnings. The warnings were already there: unused imports in the spec, and `max-lines` on `protocol-dispatcher.ts`.
- `npx jest --runInBand --coverage=false --runTestsByPath` on `mcp-caller-policy.spec.ts`, `protocol-dispatcher.surface.spec.ts`, `protocol-dispatcher.spec.ts` and `effective-tool-list.spec.ts`: 3 suites pass and 1 fails. 478 of 479 tests pass.
  - The one failure is `navigation tools … (D15) a read-only caller cannot read outside its root`. It fails with `EPERM: operation not permitted, symlink`: Windows does not allow the symlink without developer mode or elevation. This is environmental, the test is outside this batch, and it does not touch gateway code.
  - The project's `jest.config.ts` could not run from the worktree as it is. The worktree has no `node_modules`, and the preset maps `marked` to `<worktree>/node_modules/marked/lib/marked.umd.js`, which does not exist. I ran the specs with a temporary copy of the project config in `.ptah/tmp/`. The only difference was that `marked` mapped to the main checkout's `node_modules`. I deleted that copy afterwards.
- Not run, because the brief limits this batch to focused checks:
  - the batch's `npm run verify -- --related -p @ptah-extension/vscode-lm-tools` and `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`;
  - `tools/degradation-audit`. Both new catches log a warning with a justifying comment, so neither is silent.
  The coordinator should run the `npm run verify` commands.

## Decisions

- **Which names are gateway names (origin).**
  - Options: (a) by name shape (`__`); (b) by registry, where any name outside the host set (`buildToolDefinitions({hasIDECapabilities: true})`) is a gateway name.
  - Chosen: (b). It matches plan M5, and that set is already the telemetry set.
  - Reversible.
- **`handleToolsCall` keeps `isToolPermitted(name, capability)` with origin `host`.**
  - The `gateway` origin check is applied inside the gateway route.
  - Evidence: non-privileged callers were already refused unknown names, through the `agent-control` fallback. Privileged callers that are not gateway-permitted still get `-32602 Unknown tool` rather than a new forbidden error. This keeps the existing contract for in-process and slot callers.
  - Reversible.
- **The dispatcher applies `isGatewayCallerPermitted` before it asks the gateway.**
  - This is defence in depth, and it saves a hub round-trip.
  - The gateway's own policy (Batch 3) stays authoritative.
  - Reversible.
- **A request with no binding (in-process or stdio) gets no gateway tools.**
  - `McpGatewayScope.kind` needs a binding kind, and the port doc lists no untokened row.
  - Reversible.
- **A malformed phase list hides every gateway tool.**
  - This is the same fail-closed reading the host `ptah_*` tools get. It is implemented in the dispatcher with the exported `phaseDisallowedTools`, because `mcp-caller-phase-filter.ts` is outside this batch's write set.
  - Reversible.

## Plan deviations

None in the contracts. `protocol-dispatcher.surface.spec.ts` is in the write set but needed no edit.

## Out-of-scope observations

- The worktree has no `node_modules`, so `jest.preset.js`'s `marked` mapping breaks every vscode-lm-tools suite when you use `npx jest --config <project>/jest.config.ts` from the worktree. `npm run verify` may hit the same thing.
- The D15 symlink test fails on this Windows machine without symlink privilege.
- Other executors have uncommitted agent-sdk changes in the tree (batch 9). I did not touch them.
