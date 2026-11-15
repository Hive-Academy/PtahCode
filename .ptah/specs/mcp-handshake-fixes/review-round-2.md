# Independent MCP handshake race review

Scope: `origin/main...HEAD`, inspected as source and diff only. No tests were run and no source code was changed.

**VERDICT: APPROVE**

1. **`record()` method filter — correct.** `mcp-attachment-observer.ts:64` immediately returns unless `entry.method === 'initialize'`. This rejects `tools/list` and every other runtime method, without writing an entry or notifying a waiter. The HTTP handler at `http-server.handler.ts:591-604` also calls `record()` only after a successful `initialize` response. `recordAttempt()` can still retain `tools/list` as a diagnostic `seen` attempt; it does not resolve attachment waiters.
2. **Client without `initialize` — no indefinite hang.** `waitFor()` always installs a timeout and optionally an abort listener (`mcp-attachment-observer.ts:77-106`). Antigravity's startup wait is bounded by `MCP_ATTACHMENT_TIMEOUT_MS` (15 seconds) and races process completion. The manager's separate late waiter is bounded at one hour and aborted on lane completion (`agent-process-manager.service.ts:1599-1621`). Such a client may receive a handshake warning, but cannot leave a waiter pending forever. The late waiter can remain for the lane's lifetime, up to its one-hour bound.
3. **Reconnect after expiry — works.** `record()` calls `get()` before deduplication; `get()` deletes an entry older than one hour, allowing the new `initialize` to be inserted and listeners notified. A prior `seen` *attempt* never blocks `record()` at all. `recordAttempt()` replaces the same-key attempt on reconnect, while `getAttempt()` removes expired attempts.
4. **Tool count — response path preserved.** The HTTP handler still awaits `onMCPRequest`, then writes the returned JSON response for `tools/list` (`http-server.handler.ts:590-610`). The new attachment guard changes only observer state. The HTTP handler spec checks that `tools/list` still receives a response, and the frontend tool-count code is outside this diff. This supports that the fix does not suppress the tool catalog or UI count, although a live UI display was not verified under the requested read-only review.
5. **Antigravity callback guard — correct.** `if (mcpTimedOut && !processClosed) callback()` at `antigravity-cli.adapter.ts:1319` replays an earlier timeout only while the process remains active. The timeout producer also checks `!processClosed`, and the manager callback checks both `!probe.get(...)` and `!tracked.hasExited` before warning.
6. **`getAttempt` typing — safe.** `IMcpAttachmentProbe.getAttempt?` was already optional on `origin/main`; this diff does not change that interface. The manager uses optional invocation (`probe.getAttempt?.(...)`), so older implementations remain valid. Added test stubs are compatible and unnecessary for type safety.

**High findings:** None.

**Medium findings:** None.

Minor note: `git diff --check origin/main...HEAD` reports trailing whitespace and an extra final blank line in changed spec documentation. These do not affect the handshake behavior.
