# Lane brief round 4 (final) — TASK_2026_1189_56c4 (D2/D3 only)

Worktree: D:\projects\ptah-extension\.claude-worktrees\fix-session-lifecycle-handoff-a49b5b532596.
The rules of lane-brief.md and lane-brief-round3.md still apply (no verify/nx/build, no commit/push/stash,
only focused jest/tsc/eslint, no session-spawner edits, no `isError` change, never weaken authorization).
Review to fix: .ptah/specs/TASK_2026_1189_56c4/review-round-3.md. Keep the changes small.

1. Late success after the reconciliation revert (High, must fix). When `attempt` succeeds after the
   5-minute reconciliation reverted adoption, adopt again (the same adoption path as the normal start:
   the caller's current running lanes and child sessions move to the successor) BEFORE the ack record is
   written, then settle that adoption 'kept'. If the re-adoption fails, report it and record the ack in a
   form whose acknowledgement does NOT stop the predecessor (or do not record it), so no work is orphaned.
   Spec: hung start, reconcile absent (revert), late success -> children and lanes end with the successor,
   ack recorded; and the failure variant leaves the predecessor running with its work.
2. Stale SDK id in the recoverable record (Medium, must fix). onSessionIdResolved must update the
   in-memory recoverable record as well as the persisted one. Spec: persistence fails, the SDK id resolves,
   the successor acknowledges with its SDK id and succeeds.
3. SDK-only delivery (investigate first). Read agent-report-router.service.ts (~597) and the adapter
   liveness check it calls. Decide from the code whether a state exists where the successor tab id is NOT
   active but its SDK id is (for example after the SDK id resolves, does the adapter drop the tab key?).
   If such a state can happen in production, fix delivery through the verified tab<->SDK binding with the
   owner check kept, and test delivery when only the bound SDK id is active. If it cannot happen, change
   nothing and write the evidence (file:line) in the report.

Do not change anything else. At the end run every spec in libs/backend/cli-agent-runtime/src/lib/session-children/
plus agent-report-router.service.spec.ts, both tsconfigs and eslint on changed files. Append "## Round 4" to
fix-report.md: per item the design or evidence, file:line, spec names, commands with pass/fail counts.
