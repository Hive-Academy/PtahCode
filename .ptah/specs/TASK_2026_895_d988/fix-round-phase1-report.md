# Phase 1 Fix Round Report

## Fixes

- Finding 2: `phase-plan.ts:83,146,184` carries optional shape and weight from each input phase on both plan paths. `assemble-gate.ts:251,262,273,282` reads those fields from the draft plan, removes the repeated phase lookup and throw, and keeps the reason suffix unchanged. `compile-reasons.spec.ts:451,608` uses the plan-based helper signature.
- Finding 1: `phase-plan.spec.ts:68-112` covers unpinned haiku scoring with tier provenance, a haiku tier pin on a light R4 phase, and an unlisted haiku pin on a legacy sonnet phase. Production scoring and pin logic were unchanged.
- Finding 4: `route-tools.ts:121` says that subagent tier is the model alias to pass and that tier and effort are advisory for CLI lanes. `route-tools.spec.ts:81` asserts that wording.

## Verification

- `npm run verify -- -p @ptah-extension/lane-routing,@ptah-extension/vscode-lm-tools` run 1: failed in lane-routing test compilation because two new assertions accessed a property on an unnarrowed union. Lint/typecheck: 4/4 tasks passed; test stage: 1/2 tasks passed. Fixed the assertions.
- Same command, run 2: passed, exit code 0. Lint/typecheck: 4/4 tasks passed; tests: 2/2 tasks passed.
- Scoped `ptah_get_diagnostics` was attempted after edits; it returned unavailable because its TypeScript check exceeded 45 seconds. The required verify typecheck subsequently passed.

## Decisions

- Use `Pick<PhasePlan, 'policy' | 'shape' | 'weight'>` for `withPolicyReason` so the reason is derived from one plan. Alternative was separate policy and shape/weight parameters. The roster already owns a PhasePlan, and the choice is reversible.
- Keep the existing legacy pin result: an unlisted haiku pin on a sonnet phase leaves the selected sonnet model with tier provenance. `applyPinModel` returns the original score when the pin is neither listed, lane-default, nor the selected tier. This is reversible.

## Concerns

- The legacy haiku pin is accepted as an executor pin, but its model does not override the selected sonnet tier. The test records current behavior as requested.
- The Claude subagent runtime's acceptance of `haiku` was not checked within this scoped fix round.
- No source files beyond the specified read set were read. The failed Nx terminal output log was read to identify the test compilation error.
