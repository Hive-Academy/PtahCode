# TASK_2026_2178_7e73 – Close permission-policy gaps (D24 + D17)

**Status:** in_review

**Relates to:** TASK_2026_1168_7335 (agent permissions program)

## Summary

Fix two permission-enforcement gaps:
- **D24**: Lane-policy no-row yolo default → plan (most restrictive)
- **D17**: Native-child approval routing → reach parent session or fail closed

## PR

https://github.com/Hive-Academy/PtahCode/pull/1288

**Commits:**
- D24: fix(shared): default lane policy to plan when no row exists
- D17: fix(codex-runtime,agent-sdk): route native-child approvals to parent session
