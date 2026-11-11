# Stale Codex AT LIMIT state and plan limits of the main provider

## Defect 1: Codex stays AT LIMIT after the limit reset

Cause: `readingClears` in
`libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.rules.ts` did not
clear a table-reported (`provider-api`) weekly hit that had a known reset. The
hit borrowed the reset of the old window (`windowExhaustion`,
`libs/shared/src/lib/utils/plan-limits/window-state.ts:117-128`), and the
ledger persisted it (`ptah.planLimits.exhaustion.v1`), so the state came back
after each restart.

Commit `d91f6b2a8` on `main` ("clear a table-reported limit on a newer read")
already corrects the rule. The installed desktop build is older than that
commit. No production change was necessary in this task.

Regression test: `plan-limit-ledger.service.spec.ts`, "a restored
table-reported hit clears on a fresh below-limit read of the new window".

## Defect 2: plan limits section names Claude with Codex as main provider

Causes:

- `inspector-limits-lanes.component.ts:36` had the fixed label `'Claude'` for
  the session row.
- `session-stats-source.ts` kept the owner that the view last showed, of any
  provider, while the session had no resolved owner. A native Codex session
  resolves its owner only through the snapshot fallback
  (`plan-limits-snapshot.service.ts:276-304`), so it is frequently unresolved.
  The view then showed the limits of the Claude account.

Changes:

- `StatsLimitViewModel.sessionProviderLabel` gives the provider name of the
  session owner. The row shows it, or "Session" when no owner is known.
- `unresolvedSessionOwnerKey` shows, for an unresolved session, only an owner
  of the main provider (`AuthStateService.activeProviderId`). This is the same
  rule as the plan ring.

The `$limits` source of ptah-ui blocks
(`ptah-ui-lane-limits.source.ts`) has no fixed provider.

## Not examined

The model name in the session details panel after a restart (`gpt-6.1-sol`
for a session that started on `gpt-6.1-terra`) does not share these causes.
