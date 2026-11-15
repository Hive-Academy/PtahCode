# D13 "stop-but-alive session" - Preliminary Analysis

**Status:** In progress (waiting for investigation lane)

**Date:** 2026-11-15

## Summary of Issue

After calling `ptah_session_stop` on a child session, the host can still treat the session as alive, or vice versa. Status, routing and reports disagree with the durable state.

## Code Flow Analysis

### Stop Method Implementation
File: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1148-1235`

Key steps in the `stop()` method:
1. **Line 1150-1159**: Check if session is still starting (pending start)
2. **Line 1161-1165**: Resolve the owned session
3. **Line 1171-1195**: Handle handoff logic
4. **Line 1197-1204**: If target already ended, return `alreadyEnded: true`
5. **Line 1207**: `runtime.stopping = true` - marks runtime as stopping
6. **Line 1213**: `await adapter.interruptSession(tabId, 'parent-stop')` - interrupts the session (async)
7. **Line 1220**: `registry.markEnded(id, 'stopped', reason, undefined, 'parent-stop')` - marks session as ended
8. **Line 1221-1224**: `releaseResources()` and `releaseBudget()` cleanup

### Key Registry State Management
File: `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts:428-451`

The `markEnded()` method:
- Sets `terminalStatus` on the record (line 442)
- Is idempotent - if already terminal, returns early (line 438)
- Stores the record in the registry (line 448)
- Adds to ended history and prunes (lines 449-450)

### Status Computation
File: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1985-1986`

The `statusOf()` method:
- Returns `terminalStatus` if it exists (line 1986)
- Otherwise computes based on phase and pending work

The `snapshotOf()` method:
- Deliberately removes `terminalStatus` from the snapshot (line 2077)
- Instead includes computed `status` field via `statusOf()` (line 2098)

## Potential Root Causes

### Hypothesis 1: Race Condition with Async Operations
- The `adapter.interruptSession()` at line 1213 is awaited
- But if it fails, the error is caught and logged (line 1214-1217)
- The session is still marked as ended (line 1220)
- However, the interrupt failure might allow the session to continue running
- Comment at line 1215 says: "the child is still marked stopped; the interrupt error is recorded"

**Question:** If interrupt fails but session is marked stopped, what prevents messages/state from the still-running session from being treated?

### Hypothesis 2: Stale Runtime State
- At line 1207: `runtime.stopping = true` is set
- At line 2136: `this.runtimes.delete(childSessionId)` deletes the runtime
- Race condition: if an async operation checks `runtime.stopping` after deletion, it will get undefined
- The check `if (!runtime || runtime.stopping)` might not work correctly

**Question:** Are there async operations that check `runtime.stopping` after the runtime is deleted?

### Hypothesis 3: Registry vs Runtime State Mismatch
- Registry is marked ended: `terminalStatus` set
- But runtime state might not be consistently synchronized
- If code checks runtime state instead of registry state, it might see it as alive

**Question:** Are there code paths that check only the runtime state without checking the registry?

### Hypothesis 4: Session Lifecycle Callback Race
- After `markEnded()` is called, cleanup happens
- But the session lifecycle callbacks might be triggered concurrently
- An `onSessionEnd` callback might try to update state after cleanup has begun

**Question:** Are the session end callbacks properly synchronized with the stop operation?

## Files Requiring Investigation

1. `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts` - SDK session lifecycle
2. `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts` - Full spawner lifecycle
3. `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts` - Session control
4. Registry implementation for consistency checks
5. Runtime management - when/how runtimes are created and deleted
6. Status routing code that might query session state

## Likely Fix Areas

1. Ensure consistent ordering: mark ended BEFORE releasing runtime
2. Add a "marked as stopped" flag that persists separately from runtime
3. Synchronize async operations that check session state
4. Add explicit state validation that both registry and runtime agree on terminal status
5. Add regression test that verifies: after stop(), status() always shows stopped state

## Next Steps

1. Wait for investigation lane to complete detailed analysis
2. Review identified code paths for race conditions
3. Implement fix with proper synchronization
4. Add regression test
5. Run full verification suite
