# Fix round 4 — PR #1004

## Review comments

- 4505209853: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts:168-169` now gives the replacement agent a complete instruction sentence. Regression: `SubagentBudgetMonitor` handoff text assertion in `subagent-budget-monitor.spec.ts` checks the new sentence and excludes the fragment.
- 4505209855: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:52-60` records `firstDecisionAt`. Before a decision, the gate grants 120 seconds from warning; afterward it enforces 45 seconds from the first decision. `subagent-budget-monitor.ts:799-823` already polls `expired`, so its watchdog follows this deadline. Regression: `SubagentNotesGate > starts the watchdog at the first gate decision and grants time before it` uses fake timers for both phases and the boundary.
- 4505209859: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:69-72` counts denials separated by at least two seconds as distinct bursts. Three calls in one burst remain one denial; three separate bursts trigger the existing stop flag. Regression: `SubagentNotesGate > counts three separate denial bursts but not three parallel calls`. Monitor regression specs use deterministic burst timestamps.

## Decisions

- Chose a two-second burst window. The validated `PreToolUse` input in `subagent-budget-hooks.ts` carries `tool_use_id`, which identifies each call, but no assistant turn ID. The monitor's observed assistant message IDs are not linked to an individual hook decision. A time window is therefore the reliable signal available at this boundary. This is reversible if the SDK exposes a turn identifier later.
- Preserved the three-denial stop rule and all existing stop paths. A cooperative agent has time to receive the notice; an agent with no gate decision still stops at the 120-second grace deadline.

## Verification

- `gh api repos/Hive-Academy/PtahCode/pulls/1004/comments` could not authenticate in this lane (`gh auth login` requested). The three comment IDs and requested changes came from the caller's supplied review text.
- Scoped `ptah_get_diagnostics`: zero TypeScript errors.
- `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=subagent-budget-monitor.spec.ts`: passed, exit 0.
- `npm run verify -- -t lint,typecheck,test -p agent-sdk`: lint and typecheck passed. Test exit 1 solely from the two known Windows symlink EPERM cases, `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts`; 225 suites and 5,633 tests passed, including the changed subagent specs.
- `npm run verify -- -t typecheck -p ptah-electron`: passed, exit 0.
