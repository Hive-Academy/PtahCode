# MCP handshake race review

**Status: APPROVED**

## Findings

- **MCP 0 race:** `McpAttachmentObserver.record()` returns unless `entry.method === 'initialize'`. A `tools/list` response cannot populate the attachment map or release a waiter. The observer spec covers `tools/list` before `initialize` and direct `get()` behavior.
- **Antigravity handshake:** The adapter stores `onMcpAttachmentTimeout` and replays an earlier timeout only while `!processClosed`. Its startup handler also checks `!processClosed` before firing the callback. The adapter specs cover an active timeout, closure before timeout, and registration after closure.
- **Optional probe API:** `IMcpAttachmentProbe.getAttempt?` is optional, and the process manager calls `probe.getAttempt?.(agentId, port)`. It falls back to `no-request-seen` when no attempt is available. Manager specs cover timeout warning detail, valid attachment, and late attachment clearing the warning.

## Concerns

- No explicit test omits `getAttempt` from a probe object and asserts the `no-request-seen` detail. The optional call is straightforward and this is a minor coverage gap, not a blocker.
- The requested line range in `agent-process-manager.service.ts` is now the setup area; MCP attachment handling is at lines 1548–1622.

## Verification

- `nx test @ptah-extension/vscode-lm-tools --testPathPatterns=mcp-attachment-observer.spec.ts --coverage=false --maxWorkers=2`: 5 tests passed.
- `nx test @ptah-extension/cli-agent-runtime --testPathPatterns='(agent-process-manager.service|antigravity-cli.adapter.mcp).spec.ts' --coverage=false --maxWorkers=2`: 274 tests passed.
- Review used source and targeted specs only; no product code was changed. Ptah workspace analysis did not return, so targeted native file reads were used. A matching CLI skill invocation mechanism was unavailable in this lane.
