# Code Logic Re-review: Claude API spend batches 2A-2D

**Verdict: REVISE** (the code is sound for the scoped files, but the work is not wired in and two pricing/recovery gaps remain).

Checks run (all passed, no output beyond npm notices):
- jest, ledger and classifier specs: 2 suites, 14 tests.
- jest, rate card and pricing specs: 2 suites, 192 tests.
- `tsc --noEmit` on `vscode-core/tsconfig.lib.json` and `shared/tsconfig.lib.json`: no errors.
- `eslint` on the ledger service, ledger schema, `plan-usage/`, rate card and spend types: no findings.

Line numbers below refer to the current files. Ledger service = `libs/backend/vscode-core/src/services/plan-limit-ledger.service.ts` (124 lines).

## 1. First-review items

| # | Item | Status | Evidence | Test |
|---|------|--------|----------|------|
| 1 | One failed write disables the ledger permanently | FIXED | `available` is set false only in the constructor (L19-22). The write `catch` (L35-38) only logs and rethrows, and `state` is assigned after `update` succeeds (L33). | `retries after transient write failures without publishing unpersisted totals` (spec L92) |
| 2 | API-key event with no owner dropped silently | FIXED | L47-50 logs a warn with no event fields. It is still a drop, not an "unattributed" coverage signal. | `warns without event metadata...` (spec L47) |
| 3 | Revision mismatch not implemented | PARTLY | Documented as advisory in the file header (L3-5). `clear` takes no expected revision, so a stale clear is still not rejected. This is a documentation choice, not a fix. | no test |
| 4 | `budget` hard-coded null | PARTLY | Comment at L72 defers it to batch 2E. Not delivered. | no test |
| 5 | Reported cost overrides subscription and unknown billing | FIXED | `pricing.utils.ts` now gates the override on `billingMode === 'api-key'` (diff, around L591). | spec L1623, L1630, L1619 |
| 6 | Eight IDs, not seven, in the bundle | PARTLY (documented) | `anthropic-rate-card.ts` L5, L37 and `rates` hold eight IDs, and `ANTHROPIC_RATE_CARD` holds seven. Haiku 5.5 needs context over 100,000. A claimed fix is a comment plus a test. | `bundles seven unconditional IDs...` (rate-card spec L21) |
| 7 | Unbounded events and credits arrays | NOT FIXED (deferred, documented) | L90-92 comment. Every write still re-parses and rewrites the whole state. | no test |
| 8 | Sync throw from `SpendEventSchema.parse` | FIXED for `recordUsage` (L52-57) | `recordCreditEvidence` (L62) and `clear` (L66) still parse synchronously before the promise, the same defect class. | spec L57 (recordUsage only) |
| 9 | Cross-period snapshot over-count | PARTLY | Comment only (L89-90). The behaviour is unchanged. | spec L104 covers only the single-period case |
| 10 | Corrupt storage: no recovery path | NOT FIXED | A corrupt read sets `available=false` for the process lifetime. `enqueue` then throws (L28), so `clear` cannot repair it. | spec L86 proves "not overwritten" only |

Minor items 11-14: not addressed and not blocking.

## 2. New defects from the fix round

1. **N1 (Serious): the 1-hour cache write tariff is not modelled.** `ModelPricing` has a single cache-creation rate, and the card uses the 5-minute rate (1.25x input). 1-hour writes (2x input) are therefore priced at the lower rate, and the result is still marked `full` coverage. This is an under-count that looks exact. Either add a TTL-aware rate or mark 1h-cache usage as partial or unpriced.
2. **N2 (Moderate): `registerProviderPricing` now deletes bundled dashed entries.** When a hydrated dotted id such as `claude-opus-5.5` arrives, `modelPricingMap['claude-opus-5-5']` is deleted if it is still the bundled one (`pricing.utils.ts` diff, near L183). This is a side effect for every caller that goes through the shared map. I found no test for the delete path.
3. **N3 (Moderate): name collision.** `PlanLimitLedgerService` already exists in `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts` and is exported from there. The new vscode-core class has the same name but a different purpose (spend, not plan exhaustion). Imports in `apps/ptah-electron/src/di/codex-runtime-composition.ts:24` could resolve to the wrong one. Rename it, for example to `LaneSpendLedgerService`.
4. **N4 (Minor): `AgentLaneSpendResult` uses an inline `import()` type** in `rpc-lane-plan-limits.types.ts`. It is not exported from `libs/shared/src/index.ts`.

## 3. Specific checks

**(a) Rate card.** I could not reach the official page. `search_web` returned only secondary sources through redirects, so every value below is **corroborated, not verified**. Retrieval date in the code: 2026-11-18.

| Model id | Input / output (USD per 1M) | 5m write | Read | 1h write | Status |
|---|---|---|---|---|---|
| claude-opus-5-5 | 4 / 20 | 5 | 0.20 | not modelled | matches search (read is 0.05x) |
| claude-sonnet-5-5 | 2 / 10 | 2.50 | 0.10 | not modelled | matches search |
| claude-haiku-5-5 (over 100k) | 0.50 / 2.50 | 0.625 | 0.05 | not modelled | input, write and read match search. Output 2.50 not in my search result. |
| claude-haiku-5-5 (100k or less) | not in card | | | | search shows 0.10 input, 0.125 write, 0.01 read. Unpriced, which is safe but incomplete. |
| claude-fable-5-2 / 5-1 | 8/40 and 10/50 | 10 / 12.50 | 0.20 / 0.25 | not modelled | **cannot verify**, not in my search |
| claude-opus-4-8 | 5 / 25 | 6.25 | 0.50 | not modelled | **cannot verify** |
| claude-sonnet-4-6 | 3 / 15 | 3.75 | 0.30 | not modelled | **cannot verify** |
| claude-haiku-4-5 | 1 / 5 | 1.25 | 0.10 | not modelled | **cannot verify** |

Output prices for all models were not confirmed. The provider entry duplicates these numbers (`claude-cli-provider-entry.ts`: sonnet read 0.1e-6, fable-5-2 added). It has no test tying it to the card, so the two can drift.

**(b) Unknown model.** PASS. `findAnthropicRate` returns null for unknown ids (`Object.hasOwn`), and the exact-cost path returns "not priced" with null cost (pricing spec L466, L687). Haiku 5.5 without context is also null (spec L1635).

**(c) No fake zero spend.** PASS. With no ledger data, `readSpend` returns `coverage: 'none'` with zero events and `availability: 'available'`. A corrupt read returns `unavailable` with `periods: null` and `cumulative: null` (L73). Note that an empty available ledger still reports `0` totals with `none` coverage. Consumers must read `coverage`. A reader that throws (for example `flush` rejecting) propagates to the caller (L69). `flush` returns `pending`, which never rejects, so that is fine.

**(d) Failed write.** PASS. Totals are published from `this.state`, which is assigned only after `update` resolves (L32-33). The ledger is not disabled by a write failure (see item 1). Test: spec L92.

**(e) Secrets in logs.** PASS. The ledger logs only the error `name` and fixed strings (L21, L36, L49). No owner key, email or key is logged. I checked the classifier too, which does not log.

**(f) Zod.** PASS for persisted data. The constructor parses with `SpendLedgerSchema` and `recordUsage` parses with `SpendEventSchema`. `recordCreditEvidence` and `clear` parse their inputs with the schema element. `isolated` JSON from `IStateStorage.get<unknown>` is parsed before use. Provider-reported cost is validated by `Number.isFinite` and `>= 0`, not by Zod, which is acceptable for an in-process value.

**(g) `libs/shared` exports.** Additive only. Changes: `libs/shared/src/index.ts` adds one `export type` line (`ApiLaneSpend`, `LaneSpend`, `LaneSpendPeriod`, `PlanLaneUsage`). `ExactCostOptions` gains optional fields only (`providerReportedCost`, `pricingProvider`, `contextTokens`). `DEFAULT_MODEL_PRICING` gains seven keys. No removed or renamed export. The `claude-cli-provider-entry` price edits are value changes (sonnet read 0.2 to 0.1 microdollars) and not API changes. `ANTHROPIC_RATE_CARD`, `findAnthropicRate` and the date/source constants are **not** re-exported from `index.ts`. That is fine if they are internal.

**(h) DI.** FAIL (not wired). `LANE_SPEND_READER` and `LANE_SPEND_LEDGER` exist in `tokens.ts` (L34-35, L212-213) but nothing registers them. `git grep` shows no `container.register` for either token, nothing in `apps/ptah-electron/src/di/` (including `expected-resolvable.ts`), and nothing in `libs/backend/cli-engine`. The class takes `IStateStorage` and a logger in its constructor with no `@injectable`, so it needs a factory registration. Nothing calls `recordUsage` or `readSpend`, so the feature has no producer and no consumer yet. This may be intended for batch 2E. The task says batches 2A-2D, so I list it as "not affected yet, but a registration is required before any use". `tools/di-lint` would flag no unregistered token, because the tokens are unused.

**(i) `plan-usage/` folder.** PARTLY. `libs/backend/plan-usage-classifier` no longer exists, and `git grep` finds no reference to `plan-usage-classifier` outside `.ptah`. The folder holds the classifier and its spec. But it is **not exported** from `libs/backend/vscode-core/src/index.ts` (no match), and the ledger is not exported either, so no other project can import them.

## 4. Verdict: REVISE

Blocks a commit:
1. **Exports and wiring (h, i):** export the ledger, schema type, classifier and spend tokens from `vscode-core`'s `index.ts`, and either register them in the Electron and CLI roots or state in the task that wiring is deferred to a named batch.
2. **N3:** rename the colliding `PlanLimitLedgerService`.
3. **N1:** the 1-hour cache write rate. Either model it or stop reporting `full` coverage when cache creation tokens carry a 1h TTL.
4. **Item 10:** provide a recovery path for corrupt spend storage, or record explicitly that it is deferred. Today `clear` cannot repair it.
5. **Rate card (a):** confirm the eight output prices and the four unverified models against the official page. I could not do this.

Non-blocking: items 3, 4, 7 and 9 (documented limits), N2 test, `recordCreditEvidence` and `clear` sync parse, an `AgentLaneSpendResult` export.
