# G1 review fixes

## Findings

Paths below are relative to `libs/backend/lane-routing/src/lib`.

| Finding | Change and location | Test coverage |
| --- | --- | --- |
| #1 | Empty rule and call lists fall through and emit a source diagnostic with status `empty, ignored`. Nonempty lists keep their precedence even when their entries earn no boost. `ranking/preference-match.ts:87`, `ranking/spread.ts:111`. | `preference-match.spec.ts:81`, “reports an empty rule and uses the call list ahead of configured ranks” and “reports empty explicit lists and orders tied configured ranks by ordinal id”. `spread.spec.ts:510`, “preserves the lower-precedence boost with empty rule” and “preserves the lower-precedence boost with empty rule and call”. The existing “uses the full inventory to report ineligible preferences without falling through to configuration” also passed. |
| #2 | For an absent or hard-excluded cursor, find the first ordinal successor among band members. The score leader remains the fallback when there is no greater ID. `ranking/spread.ts:157`. | `spread.spec.ts:396`, “selects the ordinal successor in a mixed-score band when the cursor is absent” and the hard-excluded case. Both check the rotated offers and the total order. |
| #3 | Deferred to B07 per the review scope. The B07 acceptance criteria cover the additive model-offer band and the built-in override total. `pipeline/phase-plan.ts:172`. | B07 owns verification. |
| #4 | Strict score parts accept optional `overrideLabel` up to 120 characters. `contracts/route-decide-result.schema.ts:111`. | `contracts.spec.ts:183`, “round-trips signed totals, override parts and rule and pruning details” and “accepts an override label of at most 120 characters”. |
| #5 | Validate the exclusion ID suffix with the exported `ROUTING_RULE_ID_PATTERN`, which allows 1–64 ASCII letters, digits, dots, underscores and hyphens. `routing-constants.ts:36`, `contracts/route-decide-result.schema.ts:73`. | `contracts.spec.ts:250`, “allows dots, underscores and hyphens in a routing rule id up to 64 characters” and “rejects empty, unsafe and oversized routing rule ids in exclusions”. |
| #6 | Trim display labels and fall back to candidate IDs for blank lane names. Blank trimmed selectors keep their entry position and emit `blank selector, ignored`. `ranking/candidate.types.ts:55`, `ranking/preference-match.ts:42`. | `preference-match.spec.ts:65`, “ignores blank selectors and trims or replaces directly supplied display names”. |
| #7 | Sort configured matches by rank and ordinal ID. At scoring and spreading boundaries, reject unrecognized limit states, non-finite overrides, and non-finite bases derived from score parts. `ranking/preference-match.ts:85`, `ranking/score.ts:217`, `ranking/spread.ts:128` and `:195`. | `preference-match.spec.ts:93`, “reports empty explicit lists and orders tied configured ranks by ordinal id”. `score.spec.ts:164`, “rejects unchecked limit states and non-finite overrides before scoring”. `spread.spec.ts:438`, “rejects an unknown runtime limit state even with a supplied total” and “rejects non-finite base totals from unchecked score parts”. |
| #8 | Document total, preference rank, limit class, executor kind and ordinal candidate ID in `TIE_BREAK_STEPS`. `routing-constants.ts:84`. | `spread.spec.ts:463`, “breaks equal totals by preference rank, limit class, executor kind and ordinal id”. |

## Checks

- Jest on the four changed specs plus `route-decide.gate.spec.ts` — 4 suites passed, 131 tests passed, and 0 tests failed. The gate suite failed during compilation before any gate tests ran.
- Library TypeScript check — 2 errors, both TS2322 at `pipeline/assemble-gate.ts:153` and `:219`. G2's hard constraints return the widened exclusion rule type, while `reasons/compile-reasons.ts:66` still declares the legacy union. These are the same two diagnostics that blocked the gate suite.
- ESLint on all 9 changed TypeScript files — exit 0, 0 errors and 0 warnings.
- Ptah AST and dependency lookup covered the core modules. The dependency graph reported partial coverage, so the worktree usage scan used `rg`.

## Cross-lane follow-up

- G2 owns the exclusion type widening in `reasons/compile-reasons.ts:66` and can reuse `ROUTING_RULE_ID_PATTERN` in the rules reader. Repeat the gate suite and library typecheck after the G2 alignment.
- B07 owns finding #3.
- The trace and explanation builder can read empty-source diagnostics in `SpreadResult.preferenceMatches` by checking for `status: 'empty, ignored'`. A blank selector is an entry diagnostic with `status: 'unknown'` and `detail: 'blank selector, ignored'`.
