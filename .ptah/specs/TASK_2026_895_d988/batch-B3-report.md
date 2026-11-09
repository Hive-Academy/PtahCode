# Changes

- `assemble-gate.ts`: chosen and unavailable roster rows now copy `tier` and `effort` from their phase plan. Reasons retain their compiled text and append `policy <ruleId>; tier <tier>, effort <effort>, shape <shape|unset>, weight <weight|unset>` using the matching input phase. Unavailable `model` remains null. The small `withPolicyReason` helper is exported for focused testing because constructing a full gate result requires fixtures outside this batch's write set.
- `compile-reasons.spec.ts`: chosen and unavailable schema fixtures now include tier/effort and check that the compiled reason survives before the exact policy suffix. The chosen test checks its executor and fallback text; the unavailable test checks its reviewer-family exclusion text.
- `confidence.spec.ts`: both chosen rows in the gate schema fixture now include tier/effort.
- No reason length limit exists in the chosen or unavailable result schema (`z.string()`), so the full suffix is retained.

# Verification

- `npm run verify -- -p @ptah-extension/lane-routing` — **failed** on the one required run. Lint and typecheck passed (2/2). The full test run had 881 passed, 1 failed, 8 skipped. Failure: `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:479`, new assertion expected substring `eligible`, while the compiler emits `executor lane grok` and `fallback cause timeout`. The assertion was corrected within the write set.
- `npx nx test @ptah-extension/lane-routing --testPathPatterns=compile-reasons.spec.ts --coverage=false --maxWorkers=2 --output-style=static` — **passed**, 67/67 tests, after the correction.
- `ptah_get_diagnostics` scoped to all three changed source files — **passed**, zero TypeScript errors after the final edit.
- Remaining known failures: none in the targeted rerun. The full verify command was not repeated, per the once-only instruction; its recorded failure is the corrected assertion above. The anticipated `route-decide.gate.spec.ts` failure did not appear in that full run.

# Decisions

- Appended the policy suffix in the assembler and kept `compile-reasons.ts` unchanged, as required. This is reversible and preserves the compiled reason verbatim.
- Used `?? 'unset'` for absent shape/weight, preserving a numeric weight of zero. This is reversible and matches the requested suffix format.
- Exported the smallest suffix helper for test access because full gate assembly fixtures were outside the permitted write set. Schema fixtures separately establish that chosen and unavailable rows parse with tier/effort. This is reversible.

# Open issues

- No known code issue remains in the write set. Full verification has not been rerun after the assertion fix because the task explicitly requires exactly one verify invocation.
- Additional reads beyond the specified ranges: `assemble-gate.ts:1-50`, `phase-plan.ts:1-77`, `route-decide-result.schema.ts:163-180`, and `compile-reasons.spec.ts:1-44` to inspect imports and place the test; the failed Jest terminal log was read to diagnose its named failure. No other repository source files were read.
- No skill catalogue or skill-loading tool was available to this lane, so no optional skill was loaded.
