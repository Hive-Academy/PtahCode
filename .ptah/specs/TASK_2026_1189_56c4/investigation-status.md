# Session Lifecycle Defects - Investigation Status

## Research in Progress

Spawned Grok agent (ID: 158cc13a-0176-40d9-9025-bd1404cb51fe) to investigate three defects:
- D13: stop-but-alive 
- D2: handoff timeout duplication
- D3: reports and children lost

## Current Findings

### D13 Stop-But-Alive Defect

Key code path:
1. `session-tool-handlers.ts:721` - SESSION_STOP_TOOL_NAME case
2. Calls `session.stop(sessionId)` which delegates to SessionNamespace
3. SessionNamespace calls `requireSpawner().stop(...)` 
4. Spawner.stop() at `session-spawner.service.ts:1148` implementation:
   - Line 1207: Sets `runtime.stopping = true` 
   - Line 1213: Calls `adapter.interruptSession(tabId, 'parent-stop')`
   - Line 1220: Calls `registry.markEnded(id, 'stopped', reason, undefined, 'parent-stop')`
   - Line 1221-1224: Releases resources and budget

5. `session-child.registry.ts:429` markEnded method:
   - Sets `terminalStatus: status` in record
   - Should make the session "terminal"

6. Status check at `session-spawner.service.ts:1985` statusOf method:
   - Line 1986: `if (child.terminalStatus) return child.terminalStatus;`
   - Should return 'stopped' status

**Potential root cause:** The session might have multiple ID references (childSessionId and sdkSessionId), and when interruptSession is called or status is checked, it's reading from a different ID that was not marked as ended. OR the SDK session object itself is not properly terminated despite registry.markEnded being called.

### D2 Handoff Timeout Defect

Key files to investigate:
- ISessionHandoff interface implementation
- Session handoff service
- session-handoff-closer.ts
- Where handoff_ack checks for handoff record

### D3 Reports and Children Lost After Parent Handoff

Key concepts:
- Child sessions are registered in SessionChildRegistry
- Reports are routed via agent-rpc.handlers.ts
- Parent handoff creates a successor
- Successor must inherit child sessions and report routing

**To investigate:**
- Where child sessions are looked up when routing reports
- How handoff_ack processes the handoff record
- Why "handoff record missing" error occurs
- Child session registry inheritance flow

## Next Steps

1. Wait for Grok agent to complete root-cause analysis
2. Read the generated root-cause documents
3. Create implementation fixes based on findings
