# Session Lifecycle Defects Fix - Status

## Phase 1: Root Cause Analysis (IN PROGRESS)

### Findings

**D2 - Handoff Timeout Inconsistency (HIGHEST PRIORITY)**
- Problem: When handoff start times out (30s), error returned to caller but process continues
- Impact: Late success has no ackStore record; successor handoff_ack fails with "record missing"
- Fix: Save ackStore record even on timeout, OR cancel late start properly, OR handle late completion

**D3 - Reports Lost After Parent Handoff**
- Problem: Adoption of child sessions and lanes is reverted on timeout
- Impact: Children belong to no parent; reports to old parent fail
- Fix: Ensure adoption settles correctly; inherit children in successor; track pending adoption

**D13 - Session Marked Stopped But Still Alive**
- Problem: Session has multiple IDs (tab, SDK); only one marked ended
- Impact: Status returns 'stopped' but adapter/process still active
- Fix: Ensure both IDs marked terminal; verify adapter.interruptSession fully stops process

### Research Agent

Grok agent (158cc13a-0176-40d9-9025-bd1404cb51fe) spawned to create detailed root-cause analysis documents.
Expected deliverables: 
- d13-stop-but-alive-root-cause.md
- d2-handoff-timeout-root-cause.md  
- d3-reports-and-children-lost-root-cause.md

## Phase 2: Implementation (NEXT)

### Key Files to Modify

1. **D2 Fix: session-handoff.service.ts**
   - Lines 401-414: Handle timeout better
   - Lines 426-438: Save ackStore record on timeout or defer until late success
   - Option A: Make ackStore.record idempotent and save even if result timed out
   - Option B: In finally block, check if late success and save record then

2. **D3 Fix: session-handoff.service.ts**
   - Lines 386, 409, 420: Adoption flow
   - SessionChildRegistry: Track adoption state
   - agent-rpc.handlers.ts: Route child reports to successor

3. **D13 Fix: session-spawner.service.ts**
   - Lines 1207, 1213, 1220: Stop flow
   - Ensure both childSessionId and sdkSessionId marked terminal
   - Verify adapter.interruptSession is completing

### Testing Strategy

1. Unit tests: markEnded idempotency, adoption flow
2. Integration: Handoff timeout + late start + acknowledge flow
3. E2E: Stop session, verify status immediately and after delays

## Authorization Notes

Per CLAUDE.md D31: Full authority to fix, review, and merge PR without waiting. 
Requirements:
- Every CI job on HEAD passed
- Independent review approved
- No squash, rebase, force push, or branch deletion
- Merge with `gh pr merge --merge`

## Timeline

- Research: Complete with Grok agent (waiting now)
- Implementation: ~4-6 hours (3 defects, 3 files, comprehensive tests)
- Review: Independent code-style and code-logic review
- PR/Merge: Push + create PR + watch CI + merge when approved
