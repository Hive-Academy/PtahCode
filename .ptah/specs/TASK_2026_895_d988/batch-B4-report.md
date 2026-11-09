# Batch B4 report

## Changes

- Added five Gate 0.1 regression cases in `libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`: legacy defaults, weighted mechanical/logic/review policy with executor comparison, subagent model pin, timeout fallback, and unavailable null-model row. Every new result is checked against `GateResultSchema`.
- No production code or fixture was edited. The policy and result schema paths were already changed by other writers and were left untouched.

## Verification

- `npm run verify -- -p @ptah-extension/lane-routing`: first run failed on two new test expectations; corrected both, then the permitted retry passed.
- Final verify: lint and typecheck 2/2 tasks passed; test 1/1 task passed. Jest: 35 suites passed, 1 skipped; 887 tests passed, 8 skipped, 0 failing.
- Scoped `ptah_get_diagnostics` after the final edit: 0 errors, 0 warnings.

## Decisions

- A subagent model pin must name a listed model or the phase policy tier. Used `haiku` for the small mechanical phase pin. The first `opus` expectation was invalid for the default fixture; `phase-plan.ts:326-330` confirms the rule. Reversible by configuring a listing that includes another model.
- Asserted the existing unavailability reason token `no-eligible-candidate`, as emitted in the first test run, rather than a prose paraphrase.
- Additional reads after the first failing test: `pipeline/phase-plan.ts:145-169,307-337` and `route-decide.gate.spec.ts:118-149` to resolve pin semantics and fixture configuration.

## Open issues

- None found.
