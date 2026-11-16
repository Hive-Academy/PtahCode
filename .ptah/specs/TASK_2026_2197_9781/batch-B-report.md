# Batch B report

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.ts` and `.spec.ts`: resolve `tokenMeasure` from the stored setting; legacy stored token limit or unit defaults to raw, new profiles to weighted. Invalid explicit values warn and use the same fallback. Reads do not write.
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts` and `.spec.ts`: token budgets use weighted token classes or raw token count by mode. Count escalation now requires a qualifying post-compaction context and effective window supplied on that completion. Ordinary evaluations pass null, and the monotone floor remains.
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts` and `.spec.ts`: `recordCompaction` accepts a completion sample and passes it once into evaluation. Config key already includes the new mode, so changes reset stage and measure.

## Exported signatures

- `SessionBudgetConfigProvider.getConfig(): SessionBudgetConfig` now resolves `tokenMeasure: 'weighted' | 'raw'`.
- `measureSessionBudget(...): SessionBudgetMeasurement` uses measure `'weighted-tokens'` for weighted token budgets and `'tokens'` for raw token budgets. Cost measures are unchanged. These names are the UI contract.
- `SessionBudgetStageInput` adds required `postCompactionContextTokens: number | null` and `effectiveAutoCompactWindowTokens: number | null`.
- `SessionBudgetEvaluationInput` adds optional versions of those completion fields; absent values are null.
- `SessionBudgetService.recordCompaction(sessionId, completion?)` accepts a completion object with the two nullable fields.

## Checks

- Focused Jest command: 3 suites, 196 tests passed.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed, no errors.
- `npx eslint` on all six changed files: exit 0; module-boundary rule skipped because no cached Nx ProjectGraph.
- Scoped `ptah_get_diagnostics`: unavailable after two 45-second attempts; direct TypeScript check passed.

## Not done

The only production caller is `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:2437`, outside this batch's write set. It still calls `recordCompaction(sessionId)` without a fresh post-compaction context sample or effective SDK auto-compact window. The gate therefore safely does not escalate from compaction count in production until that caller supplies both fields. The parent report attempt was refused with `parent-inbox-full`; this file records the integration requirement.

## Decisions

- Keep completion fields optional at the service boundary while requiring both as nullable fields in the pure stage input. Alternative: read a cached context sample during ordinary evaluation. Evidence: `recordCompaction` currently receives only the session ID; the cached turn-end context may predate compaction. Reversible.
- Use the existing config key reset path for measure changes. Alternative: add separate reset state. Evidence: `configKeyOf` serializes all measured config fields, including `tokenMeasure`. Reversible.
