# HANDOFF: Session ID Routing Rework (TASK_2026_1180_handoff_routing)

**Session**: Child session "Old session IDs to successor" 
**Worktree**: D:\projects\ptah-extension\.claude-worktrees\fix-session-id-successor-route-049dff74f19f
**Branch**: fix/session-id-successor-route
**PR**: #1285 (OPEN, HEAD: 8aae0ebad) - DO NOT MERGE

## Current State

**Status**: ❌ CRITICAL DESIGN ISSUES - Rework in progress

### Investigation Complete
- Root cause analysis done (investigation.md)
- Design flaws identified (rework-required.md)
- Corrected design documented below

### Initial Implementation Done (But Flawed)
Changes in 5 files, 82 insertions:
- session-child.registry.ts: Added callerSuccessors map
- session-handoff.service.ts: Added resolveSessionId()
- session-spawner.service.ts: Added resolveCaller(), updated 5 methods
- Specs: Added regression tests

**Local verification**: Jest 183 pass, TypeScript 0 errors, ESLint 0 errors
**CI**: Mostly passing, test shard 4/4 failed (logs still pending)

## Parent Review: Critical Issues Found

### 1. AUTHORITY LEAK (Wrong Direction)
- Current: resolveCaller maps predecessor→successor, gives OLD caller successor's authority
- Problem: Successor CANNOT see predecessor's children (symptom b NOT fixed)
- Correct: Successor S should see P's children, NOT vice versa

### 2. IN-MEMORY ONLY (Not Persistent)
- Current: callerSuccessors is ephemeral Map
- Problem: Lost after host restart
- Correct: Derive chain from persisted ackStore

### 3. ROOT CAUSE UNKNOWN (Symptom a)
- "handoff record missing" for top-level successor
- Predecessor wrote HANDOFF.md, called ptah_session_handoff
- Why doesn't forward lookup find record? Must investigate.

### 4. REPORT ROUTING MISSING (Symptom c)
- Reports/completions to old parent ID not reaching successor
- Needs separate TARGET routing (forward P→S)
- NOT implemented yet

### 5. CI TEST FAILURE
- test (shard 4/4) failed
- Logs pending (still in progress)

## Corrected Design (From Parent)

### Two Separate Routing Layers

**Layer 1: CHILD OWNERSHIP (Backward)**
- Direction: S ← P (walk predecessors from S)
- Goal: Successor S sees and controls predecessor P's children
- Implementation options:
  a) Re-parent P's children to S during kept handoff (persist)
  b) Add resolveOwner() backward walk through predecessorOf chain
- Authorization: Only S gains P's children; P gains nothing
- Test specs:
  - S sees P's children ✓
  - Caller presenting P ID is refused/unattributed ✓
  - Only S controls them ✓

**Layer 2: REPORT DELIVERY (Forward)**
- Direction: P → S (forward to successors)
- Goal: Reports and completions to old parent ID reach successor
- Implementation: Forward map (persistent) in ackStore or new store
- Test specs:
  - ptah_agent_report with P ID delivers to S ✓
  - Completions with P ID reach S ✓

## Files to Modify

1. session-child.registry.ts:
   - Remove callerSuccessors Map
   - Add predecessorOf reverse index OR add reparent logic
   - Implement resolveOwner(id) backward walk if using that approach

2. session-handoff.service.ts:
   - Remove/fix resolveSessionId()
   - Add persistent forward map for report delivery (or use ackStore)
   - Keep ack record lookup logic clean

3. session-spawner.service.ts:
   - Remove resolveCaller() authority resolution
   - If using re-parenting: no changes needed (children already under S)
   - If using backward walk: Use resolveOwner() in resolveOwned()

4. Specs:
   - Add test: S sees P's children
   - Add test: P's ID caller is refused/unattributed
   - Add test: Reports to P reach S
   - Update existing tests as needed

## Investigation Tasks for Next Session

1. **Why re-parent or backward walk?**
   - Read SessionChildRegistry.reparent() logic
   - Read SessionSpawnerService.resolveOwned() ownership checks
   - Decide: re-parent during handoff vs backward walk during lookup

2. **Symptom (a) root cause**: Why "handoff record missing"?
   - Top-level successor scenario
   - Trace through SessionHandoffService.acknowledgeOnce()
   - Check if record is created properly in guardAndStart()

3. **Persistence strategy**:
   - Can report map be in ackStore? Check structure
   - Or create separate map derived from ackStore?

4. **CI Failure**: Once logs available
   - Check if related to changes
   - Determine if pre-existing flaky test

## Next Steps

For next session coordinator:

1. Get CI shard 4 logs (once run completes): `gh run view 43656688981 --job 132636657788 --log-failed`
   - Record failing suite in status.md

2. Spawn non-Claude CLI lane with this HANDOFF.md as context:
   - Task: Implement corrected design above
   - Focus: Child ownership layer (choose re-parent or backward walk approach)
   - Then: Report delivery layer
   - Then: Test specs for both
   - Then: Investigate symptom (a)
   - Verify: focused jest/tsc/eslint only

3. After lane completes:
   - Review diff: verify no authority leaks
   - Run `npm run verify -- -p cli-agent-runtime`
   - Commit, push, request independent review
   - Report to parent with head SHA, gate results, review verdict, CI state

4. **Do not merge** until parent approves rework

## Key Files

All documentation in: `.ptah/specs/TASK_2026_1180_handoff_routing/`
- investigation.md: Deep code analysis
- implementation.md: What was done (needs rework)
- rework-required.md: Parent review findings
- status.md: Current status and CI state
- HANDOFF.md: This file

## PR and Branch Info

- Branch: fix/session-id-successor-route (on 8aae0ebad)
- PR: https://github.com/Hive-Academy/PtahCode/pull/1285
- Command to push after rework: `git push` (force NOT allowed)
- Review required before merge (D31 rule)

## Parent Instructions

Next session: Run steps in this order:
1. Read CI shard 4 log
2. Spawn non-Claude CLI lane with corrected design
3. Review diff after lane completes
4. Run `npm run verify -- -p cli-agent-runtime`
5. Commit, push, get independent review
6. Report to parent before merge
