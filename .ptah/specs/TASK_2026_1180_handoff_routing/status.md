# Task Status: Session ID Routing (TASK_2026_1180_handoff_routing)

## Current State

**PR**: https://github.com/Hive-Academy/PtahCode/pull/1285 (OPEN, 1 commit: 8aae0ebad)
**Status**: DO NOT MERGE - Critical design issues identified

## Implementation Completed (But Flawed)

Changes made (82 insertions, 5 files):
- SessionChildRegistry: Added `callerSuccessors` map and `resolveCaller()`
- SessionHandoffService: Added `resolveSessionId()`, updated `acknowledgeOnce()`
- SessionSpawnerService: Added `resolveCaller()`, updated 5 ownership methods
- Tests: Regression tests added to both specs

Verification (Local):
- Jest: 183 tests passed
- TypeScript: 0 errors
- ESLint: 0 errors

## Critical Design Issues (Parent Review)

### 1. WRONG ROUTING DIRECTION ⚠️ CRITICAL
- `resolveCaller` maps predecessor→successor
- This gives OLD caller (presenting predecessor ID) successor's authority
- **Successor CANNOT see predecessor's children** (symptom b NOT fixed)
- **Required**: Either re-parent children to successor (persist), or let successor S match children of predecessors (walk backward)

### 2. PERSISTENCE GAP ⚠️ CRITICAL
- `callerSuccessors` in-memory only
- Lost after restart
- Must derive from persisted ackStore or child records

### 3. SYMPTOM (a) ROOT CAUSE UNKNOWN
- "handoff record missing" for top-level successor - cause not identified

### 4. SYMPTOM (c) NOT ADDRESSED
- Reports/completions to old parent ID not routed to successor
- Needs separate forward TARGET routing (P→S)

### 5. CI TEST FAILURE
- test (shard 4/4) failed
- Run still in progress, detailed logs pending

## What Needs to Happen

**Correct Design**: Two separate routing layers needed
1. **Child access (backward)**: Successor S can access predecessor P's children
   - Requires: Re-parenting or backward chain walk
   - Test: S sees P's children; P's ID caller is refused/unattributed

2. **Report target (forward)**: Reports from old ID reach successor
   - Requires: Forward P→S map
   - Test: `ptah_agent_report` to old parent ID reaches successor

## Delegation Required

1. **Rework investigation**: Non-Claude CLI lane
   - Understand why current direction wrong
   - Find correct way to re-parent or chain-walk children
   - Investigate symptom (a) root cause
   - Implement persistent routing
   - Add proper test specs

2. **CI failure**: Determine if related to changes or pre-existing

3. **Verification**: Run `npm run verify -- -p cli-agent-runtime` + Electron tests after rework

4. **Independent review**: Get fresh review after rework

5. **Report**: Provide ptah_agent_report before merge

## Files Modified

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`

## Investigation Outputs

- `investigation.md`: Initial detailed analysis (from first agent)
- `implementation.md`: What was implemented (from Codex agent)
- `rework-required.md`: Parent review findings and required fixes
- This status file

## Next Session

1. Wait for CI logs to be available
2. Spawn rework lane (non-Claude) to investigate and implement correct design
3. Focus on:
   - Correct routing direction for each symptom
   - Persistence (derive from ackStore)
   - Test specs showing correct behavior
   - CI failure investigation
4. Run full gate verification
5. Get independent review
6. Merge when all passes

## PR Controls

**Do not merge** until:
- Design issues corrected
- CI shard 4 failure investigated and resolved
- Full gate verification passes
- Independent review approves rework
- Report provided via ptah_agent_report
