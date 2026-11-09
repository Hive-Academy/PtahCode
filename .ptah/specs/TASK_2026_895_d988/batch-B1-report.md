# Batch B1 report

## Changes

- `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts` — exported phase-shape enum schema and inferred type; added optional `shape` and bounded integer `weight` to strict phase input.
- `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts` — exported model-tier and effort enum schemas and inferred types; required both fields on chosen and unavailable roster entries while retaining their existing model types.
- `libs/backend/lane-routing/src/lib/contracts/contracts.spec.ts` — covered legacy phase input, valid shapes and weight bounds, invalid values, and missing tier/effort on either roster row.
- `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` — updated chosen and unavailable parse fixtures with tier and effort.

## Verification

- `ptah_get_diagnostics` scoped to the four edited files: no diagnostics in those files; sibling errors in `assemble-gate.ts` (below).
- Ran `npm run verify -- -p @ptah-extension/lane-routing` exactly once: **failed**. Lint passed; typecheck failed at two outside-write-set constructors. Jest: 29 suites passed, 5 failed, 1 skipped; 795 tests passed, 3 failed, 8 skipped. Neither edited spec appeared among the failed suites.
- Outside-write-set failures:
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:291` — unavailable return is missing required `tier` and `effort` (TS2739).
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:324` — chosen return is missing required `tier` and `effort` (TS2739). These two errors prevent `route-decide.gate.spec.ts`, `route-decide.preflight.spec.ts`, and `di/register.spec.ts` from running.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:468` — chosen fixture fails the published schema parse.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:611` — unavailable fixture fails the published schema parse.
  - `libs/backend/lane-routing/src/lib/reasons/confidence.spec.ts:271` — gate fixture fails the published schema parse.

## Decisions

- Added optional phase hints directly to the existing strict schema, rather than adding a separate input version. Evidence: the contract requires legacy input to parse and the existing `PhaseSchema` is the gate phase input. Reversible.
- Exported enums, schemas, and inferred types from their respective contract schema modules, keeping fields sourced from one definition. Reversible.

## Open issues

- Later batches must populate tier/effort in gate assembly and update the three outside-write-set schema fixtures before project verification can pass.
