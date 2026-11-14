# B2 report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`: declared usage scope and observed native thread accessor.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts`: reports turn scope and observed thread.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`: normalizes segment usage, passes native thread, enqueues completion trigger after sink settlement.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts`: preserves NULL counters, classifies missing reasons, records completion rows and triggers reconciliation.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.ts`: new scope normalizer.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.spec.ts`: normalizer tests.

## New exported names

- `LaneUsageNormalizer`.

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-outcomes | Select-Object -Last 40`: 3 succeeded, 1 failed; cli-agent-runtime typecheck reported readonly counter assignment errors in new normalizer. Corrected afterward; command not rerun per one-run instruction.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=lane-usage-normalizer.spec.ts | Select-Object -Last 40`: NX 1 task succeeded, exit 0.
- `ptah_get_diagnostics`: twice unavailable after 45-second compiler timeout following the fix; post-fix type safety remains unconfirmed.

## Tests added

- Message accumulation, turn totals, cumulative deltas, regression, missing field and measured zero in `lane-usage-normalizer.spec.ts`.

## Out-of-set edits

- None.

## Extra reads

- None. Read compiler output cache log for the scoped typecheck failure.

## Decisions

- A provider-observed Codex thread accessor is separate from the Ptah session fallback; only the observed ID enters native ownership. Reversible.
- Missing usage records a NULL-only row with a reason so the sink can track coverage. Reversible.

## Open problems

- Codex reason counters have not been added to lane-outcomes; the current implementation only classifies reasons on usage contributions. This part of B2 remains incomplete.

- Parent progress report could not be delivered: parent-inbox-full.
