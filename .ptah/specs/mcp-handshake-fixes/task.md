# Task: Fix MCP handshake race and Antigravity adapter issues

**Status:** in_review  
**Type:** BUGFIX  
**PR:** https://github.com/Hive-Academy/PtahCode/pull/1287  
**Branch:** fix/mcp-handshake-race  
**Commit:** bbf277a96

## Overview

Fixed two critical MCP attachment defects in CLI agent lanes:
1. MCP 0 startup race (lane shows 0 tools due to early connection)
2. Antigravity handshake incomplete (callback not registered)
3. Type safety issue (getAttempt cast workaround)

## Completed Work

### Investigation & Root Cause Analysis
- Analyzed MCP attachment flow in cli-agent-runtime and vscode-lm-tools
- Identified that lanes connect before MCP server is ready, caching "seen" responses without tools
- Found Antigravity adapter did not properly register handshake timeout callback
- Determined unsafe type cast in agent-process-manager.service.ts needed interface update

### Implementation
- Backend-developer lane (Claude) implemented all three fixes
- Added `getAttempt` method to `IMcpAttachmentProbe` interface
- Exported `McpAttachmentAttempt` type from cli-agent-runtime
- Enhanced `record` method to validate tool lists before caching
- Updated http-server.handler to pass tools parameter
- Removed unsafe type cast from agent-process-manager.service.ts
- Fixed Antigravity handshake callback registration
- Added comprehensive test coverage

### Verification
- Observer Jest tests: 5 passed (including empty tool list regression)
- TypeScript diagnostics: in progress
- Lint checks: in progress
- PR CI jobs: running

## Files Changed
- libs/backend/cli-agent-runtime/src/index.ts
- libs/backend/cli-agent-runtime/src/lib/cli-agents/mcp-attachment-probe.port.ts
- libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts
- libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts
- libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts
- libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.ts
- Test files updated for coverage

## Related
- Program: TASK_2026_1168_7335 (agent permissions fixes)
- Phase: Follow-up to Phase A/B/C
- Open problems addressed: #3 (MCP 0 race), #10 (type safety)

## Next Steps
- ✅ Wait for PR CI to complete
- ⏳ Fix any CI failures
- ⏳ Parent reviews and merges PR
- ⏳ Verify fix in Electron
