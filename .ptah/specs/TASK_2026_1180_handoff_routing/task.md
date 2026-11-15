# TASK_2026_1180_handoff_routing

Route old session IDs to successor session after handoff.

## Status
in_review

## Branch & PR
- Branch: fix/session-id-successor-route
- PR: #1285 (OPEN, reviewed head: 9fdb39af4)
- Rework done: ownership goes backward, delivery goes forward. The 8aae0ebad
  caller-authority mapping is removed. Independent review: `review.md` (APPROVED).

## Relates to
TASK_2026_1168_7335 (program open problem #9)

## Current Phase: Design Correction

### Investigation Complete ✓
- Root cause analysis: Two separate routing directions needed
- Design flaw found: Authority leak from wrong direction
- Corrected design documented in HANDOFF.md

### Initial Implementation Done (Flawed)
- Changes: 82 insertions in 5 files
- Local tests: 183 pass, 0 errors
- **Issue**: Wrong routing direction (gives old caller successor's authority)

### What's Wrong
1. Authority leak: Successor CANNOT see predecessor's children
2. In-memory only: No persistence across restarts
3. Incomplete: Symptom (a) root cause unknown, symptom (c) not addressed

### What's Needed
1. **Child ownership (backward)**: S sees P's children via re-parent or backward walk
2. **Report delivery (forward)**: P→S map for report/completion targeting
3. **Persistence**: Derive from ackStore, not ephemeral Map
4. **Root cause**: Why "handoff record missing" for top-level successor
5. **Tests**: Specs for both routing directions

## Next Session Coordinator Tasks

1. Get CI shard 4 logs: `gh run view 43656688981 --job 132636657788 --log-failed`
2. Spawn non-Claude CLI lane with HANDOFF.md guidance
3. Review diff: verify no authority leaks
4. Run full gate: `npm run verify -- -p cli-agent-runtime`
5. Commit, push, independent review
6. Report to parent before merge

## Documentation
All analysis in `.ptah/specs/TASK_2026_1180_handoff_routing/`:
- investigation.md: Code analysis
- implementation.md: What was built
- rework-required.md: Parent findings
- HANDOFF.md: Complete handoff instructions
- status.md: Current state
- task.md: This file

## Acceptance Criteria
- [ ] Child ownership layer correct (S sees P's children, not vice versa)
- [ ] Report delivery layer working (old ID reaches successor)
- [ ] Persistence verified (survives restart)
- [ ] Root cause of symptom (a) identified
- [ ] Test specs show correct behavior for both directions
- [ ] Full gate verification passes
- [ ] Independent review approved
- [ ] CI tests pass (including shard 4/4)
- [ ] PR reviewed and approved by parent before merge
