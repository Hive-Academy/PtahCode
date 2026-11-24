# Status (agy/grok/kimi usage fix)

- Batch 1 done: agy fix + tests (cli source, reader, runner), Kimi exhaustion + at-limit tests,
  grok investigation (no backend defect; UI wording defect for the parent, see findings.md).
- Verify: `npm run verify -- -p auth-providers` passed (lint, typecheck, test).
- Real run: agy CLI stage, 4.4 s, 2 groups x (weekly, 5 hour).
- Next: independent review, commit, push, PR, watch CI.
- Message for the parent (report was not delivered, parent not active): grok card wording is wrong in
  libs/frontend (plan-limit-tiles.ts:254-268, lane-tiles.ts:490, stats-limit-view-model.ts:131):
  show planLimitReasonLabel(statusReason, providerId) when no-usage-source has a statusReason.
  No shared-contract change was needed.
