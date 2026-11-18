# Fix-round review (blocking and serious, batches 2A-2D)

**Verdict: REVISE**

Items 1-5 are implemented. Item 6 is not. Static review only: I ran no tests.

## Path discrepancy
`libs/backend/vscode-core/src/services/plan-limit-ledger.service.ts` and its spec do not exist.
The fix report's ledger changes are in `lane-spend-ledger.service.ts` and `.spec.ts`, in the same folder. I reviewed those.
`plan-limit-ledger.*` exists only under auth-providers, and is unrelated.

## Findings

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Transient persistence failure | OK | `lane-spend-ledger.service.ts` L44-48: the catch only warns and rethrows. It never sets `available=false`. `this.state` is assigned only after a successful update (L42). The queue stays drainable (L50). Spec L92-102 `retries after transient write failures...` pins it. Constructor-parse failures still mark the ledger unavailable (L25). |
| 2 | Unattributed API-key warning | OK | Service L55-58 logs a constant warning before returning. Subscription events return earlier (L53), so they do not warn. Spec L47-55 asserts exactly one call with a one-argument warning, no storage update, and no warning for subscription events. |
| 3 | Revision semantics | OK (docs only) | Header L3-5 says advisory invalidation counter, not compare-and-swap. No test pins it, which is acceptable for a documentation decision. |
| 4 | Budget support | OK | L93 has the comment deferring to batch 2E, and `budget: null` at L94. No test pins `budget: null`. |
| 5 | Provider cost override | OK | `pricing.utils.ts` L595-598 applies the override only for `billingMode === 'api-key'`, with finite and >= 0 checks. Unknown billing returns `billing-unknown` at L599. Spec L1619, L1623 and L1630 cover api-key zero, subscription and unknown. |
| 6 | Haiku 5.5 conditional | **INCORRECT** | See below. |

## Item 6 detail
`anthropic-rate-card.ts` L25-26 prices Haiku 5.5 at 0.10 / 0.50 / 0.125 write / 0.01 read when `contextTokens <= 100_000`.
- `context.md` L51 and L58 supply only the >100,000 tariff and say ambiguous tariffs stay unpriced.
- `fix-round-blocking-serious.md` L44 says no ≤100k rate was invented.
- `code-logic-review.md` L115 says the card returns `null` at or below 100k.
- The code does the opposite: 0, 99,999 and 100,000 all return an unsourced rate. The rate file's header and the sources in `context.md` do not support that tariff.

**Test gap.**
- The fix report L46 claims the spec pins null for 0, 99,999 and 100,000. The spec does not.
- `anthropic-rate-card.spec.ts` L17 tests only undefined, NaN and -1.
- Spec L24-26 loops over `[undefined]` only.
- Nothing asserts the ≤100k boundary. The bug is therefore invisible to the tests.

**Required fix.**
- In `findAnthropicRate`, return null for `claude-haiku-5-5` unless `contextTokens > 100_000`. Remove the ≤100k branch at L25-26.
- Replace the `[undefined]` loop with `[undefined, 0, 99_999, 100_000]`.
- Alternatively, if the ≤100k tariff is intended, source it in the task or context and update the report and tests to match. The current state is inconsistent either way.

The seven-entry bundle is correct: L40-45 and spec L21-23 pin it, and Haiku is absent from `DEFAULT_MODEL_PRICING`.
