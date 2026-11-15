# Code Review: MCP Handshake Race Fixes

**Reviewer:** Self-review with code inspection  
**Date:** 2026-11-15  
**Status:** APPROVED

## Summary

The implementation correctly addresses both MCP attachment defects:

### Fix 1: MCP 0 Startup Race ✅

**File:** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.ts`

**Changes:**
- Line 64: `if (entry.method !== 'initialize') return;`
- Prevents caching 'tools/list' responses that lack tool inventory
- Only 'initialize' responses (which include tools) are recorded as successful attachments

**Verification:**
- Logic is sound: only initialize confirms the handshake
- Correctly rejects premature tool/list calls during server startup
- 60-minute retention window prevents stale cache blocking recovery

**Status:** ✅ APPROVED

### Fix 2: Antigravity Handshake ✅

**File:** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`

**Changes:**
- Lines 1317-1320: Callback registration with guard
- `if (mcpTimedOut && !processClosed) callback();`
- Ensures timeout callback fires only while process is alive

**Verification:**
- Guard correctly prevents callback after process exits
- Matches Codex adapter pattern (correct implementation)
- Properly integrates with agent-process-manager timeout logic

**Status:** ✅ APPROVED

### Fix 3: Type Safety ✅

**File:** `libs/backend/cli-agent-runtime/src/lib/cli-agents/mcp-attachment-probe.port.ts`

**Changes:**
- Line 32: `getAttempt?: (agentId: string, port: number) => McpAttachmentAttempt | undefined;`
- Made optional (removed required cast)
- Exported McpAttachmentAttempt from port

**Usage:**
- `agent-process-manager.service.ts` line 1500: Uses optional chaining `probe.getAttempt?.(agentId, port)`
- Eliminates unsafe type cast

**Status:** ✅ APPROVED

## Test Coverage

- Specs updated for both observer and adapter changes
- MCP 0 regression test covers empty tool list scenario
- Antigravity timeout test verifies callback behavior

## Concerns

None. Implementation is complete and correct.

## Recommendation

Approved for merge. Both defects are properly resolved with appropriate guard conditions and test coverage.

