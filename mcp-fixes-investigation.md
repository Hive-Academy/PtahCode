# MCP startup attachment investigation

## Findings

- `http-server.handler.ts` authenticates and parses each POST, records a `seen` attempt, awaits `onMCPRequest`, then records a successful `initialize` or `tools/list` response for the URL agent and socket port. Only after that does it write the JSON-RPC response. A failed response is never recorded.
- `mcp-attachment-observer.ts` stores the first attachment per agent and port for one hour and resolves `waitFor` at that point. It currently rejects `tools/list` when its tool count is missing or zero, but accepts a positive count. A positive list can therefore win over `initialize` and permanently determine the method recorded for that lane. The attachment entry is an observation, not the CLI tool catalog; the earlier `root-causes.md` claim that this map caches the CLI's `MCP 0` catalog is unsupported by the code.
- The observed `MCP 0` sequence is: a lane starts while Ptah's MCP catalog/startup is still settling; its early `tools/list` returns zero tools (the CLI may cache this list); the HTTP handler records a `seen` attempt but the observer now discards the empty list; the lane has no usable Ptah tools. If a later positive list arrives before `initialize`, the observer can release attachment waiters on that list. Attachment success then says nothing about whether the CLI's initial catalog was usable. The observer change cannot by itself make a CLI retry a cached zero-tool list, so a live Electron reproduction remains necessary to confirm the complete product-level cause.
- The reliable attachment signal is a successful `initialize` response. `tools/list` reflects catalog content, not handshake completion. Reject **all** `tools/list` responses as attachment records. This also removes the need to pass an untyped `tools` payload or a `toolCount`; the handler's `countListedTools` helper becomes unused.
- `antigravity-cli.adapter.ts` already guards the asynchronous startup timeout path with `!processClosed`, but its `onMcpAttachmentTimeout` registration immediately replays `mcpTimedOut` without that guard. A callback registered after process close can therefore report a stale timeout. Add the guard there and cover the late registration case.

## Decisions

- Record successful `initialize` only, rather than defining a tool-count threshold. Evidence: the protocol dispatcher handles `initialize` and `tools/list` separately; count is catalog data, not a handshake state. Reversible: yes.
- Remove the obsolete count parameter and helper, instead of retaining a `tools?: unknown` parameter. This leaves no loosely typed attachment argument. Reversible: yes.
