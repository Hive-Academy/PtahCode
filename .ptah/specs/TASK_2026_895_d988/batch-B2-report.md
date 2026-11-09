# Batch B2 report

## Changes

- Added pure `policyForPhase` with R1–R5, typed tier/effort/rule ID, ordered precedence, and omitted-weight middle buckets.
- `PhasePlan` now carries policy for eligible and unavailable phases. Subagent scoring uses the policy tier; lane model selection and pin rules remain intact. Removed `tierFor`.
- Added policy boundary/default tests and plan tests for Haiku subagent scoring, unchanged configured lane model, unavailable-plan policy, and explicit Haiku tier pin.

## Verification

- Ran exactly once: `npm run verify -- -p @ptah-extension/lane-routing`. Failed on known intermediate-state errors listed below. Typecheck lint step: lint passed, typecheck failed. Test run: 29 suites passed, 6 failed, 1 skipped; 815 tests passed and 3 failed, with remaining suites blocked by type errors.
- After fixing a test fixture error surfaced by verify, ran changed specs with `npx jest --config libs/backend/lane-routing/jest.config.ts --coverage=false --maxWorkers=2 ...`: 2 suites, 25 tests passed.
- Scoped `ptah_get_diagnostics` after final edits: no diagnostics in the four write-set files. Three diagnostics remain in `assemble-gate.ts`.
- Remaining outside failures: `pipeline/assemble-gate.ts:291,324` TS2739, roster entries missing `tier` and `effort`; `reasons/confidence.spec.ts:271` expected schema parse success, received false; `reasons/compile-reasons.spec.ts:468,611` expected schema parse success, received false. `route-decide.gate.spec.ts` (plus `di/register.spec.ts` and `route-decide.preflight.spec.ts`) cannot run because of the two `assemble-gate.ts` TS2739 errors.

## Decisions

- R2 gives `visual-review` Opus/high (or xhigh at 8000), as explicitly specified. Legacy `tierFor` gave that kind Sonnet; the other no-shape/no-weight legacy kinds retain their old tiers. Reversible via policy only.
- `applyPinModel` already accepts a Haiku tier pin when the subagent's policy tier is Haiku. `decision-payload.ts` uses arbitrary model strings, so it needs no change. Reversible by policy/pin logic.
- Every kind in the contract exists in `PHASE_KINDS`; none skipped. `max` is never produced.

## Open issues

- B3/B4 must add tier/effort to assembled roster rows and update the published-schema test fixtures; these are outside B2's write set.
- Extra source reads needed to build a typed plan fixture: `pipeline/gather.ts`, `ranking/candidate.types.ts`, `ranking/rotation.store.ts`, `ranking/hard-constraints.ts`, `matrix/capability-matrix.store.ts`, `matrix/outcome-figures.ts`. Also read task `context.md`, `batches.md`, and verify output logs. No other source files edited.
