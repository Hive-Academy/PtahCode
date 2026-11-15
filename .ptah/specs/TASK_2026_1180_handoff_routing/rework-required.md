# Rework Required: Session ID Routing Design Issue

## Parent Review Findings

### 1. Wrong Direction / Authority Leak ⚠️ CRITICAL
**Issue**: Current implementation routes in the wrong direction.
- `resolveCaller` maps predecessor ID → successor ID
- This gives OLD caller (presenting predecessor ID) the successor's authority
- The successor S cannot see children whose parent is P
- **Symptom (b) is NOT fixed**

**Required Fix**:
- Re-parent predecessor's children to successor on kept handoff (persist it)
- OR: Let successor S also match children of verified predecessors in chain (walk backward)
- Add spec that caller presenting P's ID is refused for S's children
- Add spec that S sees and controls P's children

### 2. Persistence Gap ⚠️ CRITICAL
**Issue**: `callerSuccessors` map is in-memory only
- Lost after host restart
- Child records themselves not persisted by SQLite session repo
- In this program, children become unknown after reload

**Required Fix**:
- Derive chain from persisted ackStore or child records
- Not from private in-memory Map

### 3. Symptom (a): Root Cause Unexplained
**Issue**: `ptah_session_handoff_ack` → "handoff record missing" for top-level successor
- Predecessor wrote HANDOFF.md
- Predecessor called ptah_session_handoff
- Why doesn't forward lookup find the record?

**Required**: Investigate and report root cause (may be separate PR)

### 4. Symptom (c): Report Routing Not Addressed
**Issue**: Reports and completions to old parent ID must reach successor
- This needs TARGET routing (forward P → S, opposite direction from child access)
- Current implementation doesn't address this
- Must show where this is implemented

### 5. CI Test Failure
**Status**: test (shard 4/4) failed; run still in progress, logs pending
**Required**: Name failing suite and check if it fails on main

## Design Correction Needed

**Two separate routing directions required**:
1. **Child ACCESS (backward)**: Successor S can query/control predecessor P's children
   - Map: S ← P (walk predecessors from S)
   - Caller S accesses P's adopted children
   
2. **REPORT TARGET (forward)**: Reports/completions from old ID go to successor
   - Map: P → S (walk successors from P)
   - Report addressed to P reaches S

Current implementation only partially addressed (1) in wrong direction, and didn't address (2).

## Next Steps
1. Delegate rework to non-Claude CLI lane
2. Investigate CI shard 4 failure
3. Run scoped gate before push
4. Get independent review
5. Report with ptah_agent_report before merge
