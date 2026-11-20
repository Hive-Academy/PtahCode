# Context — TASK_2026_2290_p2

Phase P2 of program TASK_2026_2288_acp1. Stacked on refactor/provider-session-p1 (PR #1444).

Carried from P1 review (../TASK_2026_2289_p1/code-logic-review.md): M-1 per-turn replay ids; M-3 stream rows for errors and failed turns; m-1 lane-level SDK-unavailable case; m-3 runtime sets `replayed`; m-4 wire `onStreamEvent` on the Grok lane (visual check later in Electron).

## Outcome

- Review round 1 REVISE (3 Serious) → fix round 1 → round 2 APPROVED (same-family subagent).
- Carried to P7 (chat adapter): round-2 Moderate notes — `interrupt()` can report `interrupted`
  for a turn that finished in the same instant (`acp-session-runtime.ts:1286`); the lane interrupt
  flag is set with no turn in flight (no impact today). Unfixed Minors are listed in
  fix-round-1-report.md. m-4 (wire `onStreamEvent`) goes to P3.
- Gate: `npm run verify -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`
  passes (lint+typecheck 8/8, tests 4/4). Live `PTAH_LIVE_AGY=1` spec passes on agy 1.5.13.
- `cli-engine` `session-store-migration.spec.ts` failed once in a full run (ENOENT on a temp log);
  passes alone on P2 and on main (3/3): flaky temp-file race, not P2.
