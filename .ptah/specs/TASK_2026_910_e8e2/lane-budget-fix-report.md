## Changes

- `libs/shared/src/lib/utils/agent-budget-policy.ts`: verified cache reads receive a 10% floor weight; thresholds use weighted tokens; the first token-only crossing warns and grants one new turn.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-resume-gate.ts`: compare the weighted ledger total for resume decisions and reason text.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.ts`: log the weighted ratio and correct the dispatch comment.
- `libs/shared/src/lib/types/advanced-settings.types.ts`: explain verified cached-read weighting without changing the default or bounds.
- `.claude/skills/agent-lanes/SKILL.md`, `plugins/ptah-core/skills/agent-lanes/SKILL.md`: replace the stale stop contract in both tracked skill copies.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts`: correct the other tracked copy of the stale stop claim.

## Tests

- Extended `agent-budget-policy.spec.ts` for verified subset and model cache floors, unverified classes, priced maximum, first-crossing grace, duplicate turn, second new turn, and immediate context, duration, and unavailable-telemetry stops.
- Changed existing assertions in `weights each billed model in a mixed-model turn`, `weights all four classes and stops once`, `keeps raw token floor and marks missing price coverage`, and `uses the raw floor and context ceiling for persisted and live decisions` to match the new floor and grace behavior.
- Extended `lane-resume-gate.spec.ts` for a discounted ledger and changed `lane-budget-telemetry.spec.ts` to expect warning, duplicate suppression, then stop.

## Verification

- Command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime 2>&1 | Select-Object -Last 60`
- Blocker: the single verifier process remained active for over 20 minutes without exiting and was interrupted (exit code 1). `Select-Object -Last 60` emitted no tail before interruption, so pass/fail counts are unavailable. Scoped `ptah_get_diagnostics` also returned `TypeScript check still running after 45s` for all six changed TS files.

## Decisions

- D1: use reported cache reads only for verified subsets or per-model usage; clamp to the turn input count. Reversible: yes.
- D2: defer only a first token-total stop; leave duration, context ceiling, and missing telemetry immediate. Reversible: yes.

## Not done

- Verification did not complete within the requested 20-minute wait; no second run was started.
