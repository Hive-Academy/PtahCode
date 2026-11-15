# Task: Fix D13 "stop-but-alive session" defect

**Relates to:** TASK_2026_1168_7335

**Status:** in_progress

**Created:** 2026-11-15

## Summary

After a child session or lane is stopped with ptah_session_stop, the host can still treat it as alive, or vice versa. Status, routing and reports disagree with reality.

## Acceptance Criteria

1. Root cause identified in host session lifecycle code
2. Fix implemented that ensures stop state is durable and observable
3. Regression test added to prevent recurrence
4. All CI green
5. Independent review approved

## Notes

- This is an open problem #2 from the agent permissions program (TASK_2026_1168_7335)
- D13 decision: "ptah_session_stop marked a session stopped, but it kept running. Needs its own task."
- Focus on session lifecycle state management in @ptah-backend/cli-agent-runtime and related libs
