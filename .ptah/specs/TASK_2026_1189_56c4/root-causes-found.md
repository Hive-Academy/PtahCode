# Session Lifecycle Defects - Root Causes Found

## D2: Handoff Timeout Creating Inconsistent State (CRITICAL FINDING)

**Location:** `session-handoff.service.ts:401-414, 426-438`

**Root Cause:**
When `ptah_session_handoff` times out (30 second deadline at line 403):
1. At line 405-413: Timeout error is returned to caller
2. At line 409: Adoption is reverted
3. **BUT** the `attempt` promise continues running in the background (never cancelled)
4. If the host starts the session LATE (after timeout), the following are NOT executed:
   - Line 420: `settleAdoption(adoption, tabId, 'kept')` 
   - Line 421-424: `remember()` call 
   - Line 426-438: `ackStore.record()` is NOT called - **THIS IS THE KEY**

**Result:** 
- Host may still create the successor session
- Caller is told handoff failed (timeout)
- NO handoff record is saved in ackStore
- When successor calls `ptah_session_handoff_ack`, it cannot find the record
- Error: "handoff record missing" from line 226 in acknowledgeOnce

**Why D2 creates duplicates:**
- If caller retries `ptah_session_handoff` after timeout, a NEW session starts
- Now TWO successors exist: one from late completion, one from retry
- Parent/child relationships are broken

## D3: Reports Lost After Parent Handoff

**Root Cause (partially from D2):**
After a parent hands off:
1. If handoff times out, ackStore record is not saved
2. Child sessions are adopted (line 386: `adoptWork(record, tabId)`) but:
   - If timeout occurs, adoption is reverted (line 409)
   - Children are given back to the predecessor
   - Successor never gets ownership of child sessions
3. Child reports are routed to parent (via registry lookup in agent-rpc.handlers)
4. When parent is gone, reports fail with `parent-session-not-active`
5. Reports are not re-routed to successor because successor never became the owner

**Related:** SessionChildRegistry and report delivery routing in agent-rpc.handlers.ts

## D13: Stop-But-Alive Session

**Location:** `session-spawner.service.ts:1148-1235` (stop method), `session-child.registry.ts:429` (markEnded)

**Root Cause (HYPOTHESIS - awaiting Grok confirmation):**
1. Session has two IDs: `childSessionId` (UUID) and `sdkSessionId` (native session ID)
2. At line 1220: `registry.markEnded(id, 'stopped', ...)` marks entry as terminal
3. BUT the adapter might still have the session active under its original ID
4. Status check at `statusOf` (line 1985) first checks `terminalStatus`
5. If registry entry has both childSessionId and sdkSessionId, but only one is marked ended:
   - sdkIdOf() lookup might return the SDK session ID
   - adapter.isSessionActive() might still return true for that ID
   - Status becomes inconsistent

**Possible additional issue:**
- adapter.interruptSession (line 1213) might not actually terminate the process
- The runtime might still be running even after `runtime.stopping = true`

## Interconnections

All three defects involve **late completions or incomplete state transitions**:
- D2/D3: Late session start after timeout leaves ackStore record unsaved
- D13: Session marked stopped but process/adapter still active
- All three: Multiple ID references (tab ID vs SDK ID) that can be out of sync

## Next Steps

1. ✓ Grok agent completing root-cause documents
2. Create fixes:
   - D2: Make handoff idempotent OR cancel late start OR save record even on timeout
   - D3: Ensure adoption completes before returning, or inherit children in successor
   - D13: Ensure adapter.interruptSession fully terminates, or fix ID sync
3. Tests to verify fixes
