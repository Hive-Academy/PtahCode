# G1 rotation regression

## Root cause

The G1 change returned total order as `spread.ranking`, even when `spread.pick` had moved to the next lane. Under `libs/backend/lane-routing/src/lib`, `pipeline/phase-plan.ts:189` and `:438` carry that order into the plan, and `:231–239` preserve it when building the model options. The gate fixture always selects `o1` (`route-decide.gate.spec.ts:259`). The model resolution maps that label to the first offered lane (`pipeline/phase-resolve.ts:64–70`), so Codex stayed selected. The service then saved the actual executor as the next cursor (`route-decide.service.ts:439–450`), feeding Codex back into the next decision.

## Change

- `ranking/spread.ts:55–59` and `:82–107` restore the existing offer contract. `ranking` starts with the rotated pick, follows the band cyclically, and then lists the below-band entries. `rankingByTotal` exposes the additive order and tie-breaks for downstream callers.
- `ranking/spread.spec.ts:271–287` verifies both orders on a three-candidate band with one below-band candidate. The at-limit and negative-total tests also verify the restored offer order. The gate regression test and pipeline code were left untouched.

## Checks

- Requested Jest run passed all 108 tests across 3 suites, including the original equal-lane rotation test.
- Library TypeScript check passed with zero errors.
- ESLint passed for both changed files with zero errors or warnings.
- Scoped Ptah diagnostics reported zero errors or warnings.
