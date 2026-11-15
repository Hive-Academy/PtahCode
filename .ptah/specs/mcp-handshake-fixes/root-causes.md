# MCP Handshake Race — Root Cause Analysis

## Issue 1: MCP 0 Startup Race (Open Problem 3)

**Symptom:** First chat session after Electron start sometimes shows "MCP 0" (lane has zero Ptah MCP tools).

**Root Cause:** The CLI agent lane connects to the local MCP HTTP server and calls `tools/list` before the server is fully initialized. The attachment probe records the `tools/list` call as "seen" without the full tool list, so the lane reports 0 tools. The MCP 0 entry is cached in `mcpAttachmentObserver` for 60 minutes, blocking subsequent connection attempts.

**How It Works:**
1. `agent-process-manager.service.ts` spawns the CLI agent lane (lines 1493–1533).
2. Lane starts and attempts to connect to MCP HTTP server on `localhost:<port>`.
3. Lane makes `tools/list` RPC call to Ptah MCP server before the server is ready.
4. The `mcp-attachment-observer.ts` records a successful "seen" entry (line 74: `record(entry)`).
5. Observer caches this entry with `RETENTION_MS = 60 * 60 * 1000` (1 hour).
6. Subsequent lanes see the cached "MCP 0" entry and do not retry.

**Why It Happens:**
- Lane spawning does not wait for the MCP HTTP server to be ready.
- The attachment probe records the first response ("seen") without validating tool count.
- No retry logic exists for lanes that connect too early.

**Affected Code:**
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.ts` (lines 29–36: `get()` returns stale cached entry)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` (lines 1493–1533: no wait for server readiness)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/mcp-attachment-probe.port.ts` (no retry mechanism)

**Fix Strategy:**
1. Make the attachment probe wait for the server to be ready before recording successful attachment.
2. Add a handshake retry mechanism if the lane connects before the server is initialized.
3. Clear the MCP 0 cache entry on server restart to allow retries.

---

## Issue 2: Antigravity MCP Handshake Incomplete

**Symptom:** Antigravity CLI lane does not complete the Ptah MCP handshake (unlike Codex, which was fixed in Phase A/B).

**Root Cause:** The Antigravity adapter does not pass the handshake callback `onMcpAttachmentTimeout` to the Ptah MCP server initialization, preventing the lane from waiting for the MCP attachment or from reporting handshake failures back to the parent.

**How It Works (in Codex / Claude, which is correct):**
1. CLI adapter returns an `SdkHandle` from `runSdk()` with an `onMcpAttachmentTimeout` callback (optional).
2. `agent-process-manager.trackSdkHandle()` (line 1515–1519) registers the callback if present.
3. The callback is called after `MCP_ATTACHMENT_TIMEOUT_MS` (15 seconds) if the lane does not complete the handshake.
4. Lane reports `handshake-timeout` warning if the MCP server does not respond.

**How Antigravity Is Different (incorrect):**
1. Antigravity adapter defines `onMcpAttachmentTimeout` on line 1210 but sets it conditionally based on `mcpTimedOut` flag.
2. The flag is set in the `onOutput` callback (line 1186), but this callback may not fire if the lane exits before MCP attachment.
3. The lane does not wait for MCP attachment or report the timeout back to the parent session.

**Comparison with Codex (lines 315–320 in codex-app-server-lane.adapter.spec.ts):**
- Codex correctly sets `h.profile.mcpServers[0]` with the Ptah MCP server configuration.
- Codex passes the handshake callback through the `SdkHandle`.

**Affected Code:**
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts` (lines 1210–1212: incomplete handshake implementation)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts` (reference implementation for correct handshake)

**Fix Strategy:**
1. Ensure Antigravity adapter initializes MCP configuration before spawning the lane (not just during output).
2. Register the `onMcpAttachmentTimeout` callback correctly so the lane can report handshake failures.
3. Ensure the lane waits for MCP attachment or reports a clear timeout/failure.

---

## Secondary Issue: Type Safety for getAttempt (Open Problem 10)

**Current Code (lines 1497–1502):**
```typescript
const attemptProbe = probe as typeof probe & {
  getAttempt?: (id: string, port: number) => { reason: string; method: string } | undefined;
};
```

This cast works around the fact that `getAttempt` is not in the `IMcpAttachmentProbe` interface.

**Fix:**
Add `getAttempt` to the `IMcpAttachmentProbe` interface in `mcp-attachment-probe.port.ts` and remove the cast.

---

## Next Steps

1. **Implement Issue 1 fix:** Add MCP server readiness check and retry logic.
2. **Implement Issue 2 fix:** Ensure Antigravity handshake callback is registered and works.
3. **Remove the getAttempt cast:** Update the interface and remove the workaround.
4. **Test with Electron first:** Run verification on Electron to prove the fix works.
