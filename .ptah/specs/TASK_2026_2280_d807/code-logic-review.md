# Code Logic Review: Claude API spend batches 2A–2D

**Verdict: REVISE**

Scope: I read the rate card, the `pricing.utils.ts` diff, the provider entry diff, the sink interface diff, `plan-limit-ledger.service.ts`, `plan-limit-ledger.schema.ts` and `classifier.ts`. I did not run tests. I did not read the specs, `rpc-lane-spend.types.ts` or `rpc-lane-plan-limits.types.ts`, or the reader interface in full. Contract checks (SpendPeriod, discriminator, no secrets on the wire) are therefore unverified except through how the ledger and classifier use them.

## Blocking

1. **`plan-limit-ledger.service.ts:34-36`: one failed write disables the ledger permanently.**
   - A transient `storage.update` failure sets `available = false`.
   - After that, every `recordUsage` rejects and `readSpend` reports `unavailable` until the process restarts.
   - The in-memory `state` is still valid, because it is only assigned after a successful write.
   - Fix: keep `available` false only for corrupt reads, and only for the failed write itself. Or retry on the next write.
   - It is not silent, because it is logged and rejected. But it is an effectively unrecoverable state loss from a transient error.

2. **`plan-limit-ledger.service.ts:43`: events with no owner are silently dropped, and the contract asks for attribution to be enforced.**
   - A missing `ownerKey` on an `api-key` event returns a resolved promise with no log.
   - Dropping them from spend is intended. But with no counter, warning, or "unattributed" coverage signal, a producer that forgets to capture the owner makes spend under-count with no signal.
   - Fix: log a warn (without secrets), or count the event as unattributed and surface it in `coverage`.

## Serious

3. **`plan-limit-ledger.service.ts:68-71`: revision mismatch is not implemented.**
   - Revision is only a read-side counter. `clear` and `recordUsage` take no expected revision.
   - A stale clear or update therefore cannot be rejected.
   - The `clear` timestamp default is `Date.now()`, so a stale clear is not prevented either.
   - Fix: accept `expectedRevision` on `clear`, or document that the revision is advisory.

4. **`plan-limit-ledger.service.ts:71`: `budget` is hard-coded to `null`.**
   - The "null/undefined budget defaults to no limit" behaviour is trivially met.
   - Nothing reads or persists a budget, so budget support is not delivered by this batch. Confirm that was intended.

5. **`pricing.utils.ts:591-594`: provider-reported cost is returned before the subscription and billing-unknown checks.**
   - A subscription or unknown-billing message that carries a reported cost returns `costBasis: 'reported'` with `pricingCoverage: 'full'`.
   - Previously it returned `covered-by-subscription` or `billing-unknown`.
   - The ledger filters by `billingMode`, so spend is protected. But other callers of `calculateExactMessageCost` (session stats UI) can now show subscription turns as billed dollars.
   - Fix: apply the override only when `billingMode === 'api-key'`.

6. **`anthropic-rate-card.ts:36-41`: `ANTHROPIC_RATE_CARD` holds seven IDs, not eight.**
   - `claude-haiku-5-5` is excluded because `findAnthropicRate(id)` is called without context.
   - This is correct for the "Haiku 5.5 is conditional" rule, and an ambiguous tariff stays unpriced.
   - But it does not satisfy "eight exact model IDs present" in the bundled `DEFAULT_MODEL_PRICING` map.
   - Confirm the task intent. If eight are required, document that Haiku 5.5 lives only behind `findAnthropicRate`. A test should pin this.
   - **Open question:** the rate card only returns Haiku 5.5 pricing when context is **over** 100k, and returns null at or below 100k. I assumed that is the card's intent: the file header says the conditional rate is never seeded globally. The reviewer cannot tell whether a ≤100k Haiku 5.5 rate is meant to exist. Check against the spec.

## Moderate

7. **`plan-limit-ledger.service.ts:46-49, 54`: the events and credits arrays grow without bound.**
   - Each `enqueue` re-parses the whole state twice (lines 28 and 31), then rewrites the entire blob. Cost is O(n) per event.
   - There is no retention beyond `clear`. Fix: prune events older than 30 days (plus the cumulative window if needed), and dedupe or cap credit evidence.

8. **`plan-limit-ledger.service.ts:44`: `SpendEventSchema.parse` throws synchronously from a `Promise`-returning method.**
   - Callers using `.catch` alone will miss it. Fix: wrap in `try`/`catch` and return `Promise.reject`.

9. **`plan-limit-ledger.service.ts:87-95`: snapshot supersession is a known limitation, now noted.**
   - A run that spans a period boundary reports its absolute snapshot cost inside the later period, which over-counts that period.
   - Token counts are still summed, so tokens and cost can disagree.
   - Acceptable if documented. The code comment only mentions the replacement, not this limit.

10. **`plan-limit-ledger.service.ts:16-24`: constructor reads storage synchronously with `storage.get`.**
    - On corrupt data it sets `available = false` and warns, and it does not overwrite the data. That meets "corrupt data not silently replaced".
    - But later writes are blocked forever, so the user has no way to reset the ledger. Provide a deliberate recovery path.

## Minor

11. **`plan-limit-ledger.service.ts:103`:** `creditEvidence` is not capped in the response size.
12. **`classifier.ts:10`:** `nowMs` of `undefined` relies on the reader's default. This is fine. A reader rejection propagates to the caller, which is acceptable but undocumented.
13. **`plan-limit-ledger.service.ts:78-82, 90-92`:** several statements are packed onto one line (`;` chains), which hurts readability.
14. **`plan-limit-ledger.schema.ts:6`:** `occurredAtMs` is accepted as any safe integer, with no upper bound or future-time check. A bad clock cannot corrupt state, but it can hide events, because reads filter on `<= nowMs`.

## Verified OK

- **Rate card conversion:** `1e-6` is applied correctly.
- **Sonnet 5.5 cache read:** `0.10` in both the card and the provider entry.
- **Fable 5.2 pricing:** added to the provider entry and matches the card.
- **Prototype keys:** `Object.hasOwn` guards against `__proto__` lookups.
- **Period boundaries:** the `today` period is UTC-floor based. `7d` and `30d` are rolling windows ending at `nowMs`.
- **Owner-scoped clear:** it bumps only that owner's revision and removes only that owner's events and credits.
- **Event dedupe:** the key is owner + `runId` + `eventKey`. Higher revisions replace lower ones.
- **Filtered events:** subscription, estimated and unattributed events are excluded. `unpriced` events count toward partial coverage.
- **Write-after-storage:** state is committed only after `storage.update` resolves. Writes are serialized, and the queue drains after a failure.
- **Logging:** the logger is injected, only the error kind is logged, and there are no secrets.
- **Classifier:** plan inputs pass through unchanged. API inputs delegate to the reader, and availability flows through.
- **Layering:** no new library tags or upward imports in the files I read. `rpc.types.ts` is not modified (git status).

## Unmet or unverified

- Revision-mismatch protection (item 3) and budgets (item 4).
- The module-boundary lint was skipped, per the notes.
- Test coverage of the findings above, in particular items 1, 2, 5 and 6, is not confirmed.

---

## Addendum: follow-up verification

I read the classifier code in its new location and checked prices against one web search, not the official pricing page directly. I did not re-run tests.

**Classifier move: confirmed.**
- `libs/backend/vscode-core/src/services/plan-usage/plan-usage.classifier.ts` and its spec exist.
- `libs/backend/plan-usage-classifier` no longer exists.
- Logic is unchanged and still passes. Plan inputs pass through, API inputs go to `LaneSpendReader`, and availability flows through.

**Rate card against the web search.** The sources the search returned were secondary (redirects, third-party sites), so treat this as corroboration and not authoritative.

| Model | Card | Search result |
| :--- | :--- | :--- |
| Opus 5.5 | 4 / 20 / read 0.20 | matches |
| Sonnet 5.5 | 2 / 10 / read 0.10 | matches; the 0.10 correction is supported |
| Haiku 5.5 over 100K | 0.50 / 2.50 / read 0.05 | matches |
| Fable 5.2 | 8 / 40 / read 0.20 | matches |
| Fable 5.1 | 10 / 50 / read 0.25 | matches |

- **Cache writes:** each card write rate is 1.25× its input rate, which is the 5-minute tier, not the 1-hour tier (2×).
- **Not checked:** Opus 4.8, Sonnet 4.6 and Haiku 4.5. The search did not cover them. Someone must check them against the official page.
- **Haiku 5.5 at or below 100K:** this resolves the open question in item 6. The search shows a second tariff of 0.10 / 0.50 / read 0.01. The card returns `null` there, so those calls are unpriced. That is safe and not a fake zero, but it is incomplete pricing, and I would rate it Moderate.
  - Fix: add the ≤100K tier to `findAnthropicRate`, or document that it is deliberately unpriced.
  - The `null` for an undefined context is correct.

**Unknown model handling.**
- `findAnthropicRate` returns `null` for unknown IDs, and `Object.hasOwn` blocks prototype keys. In `calculateExactMessageCost`, native lookup failure becomes "not priced", not zero.
- A provider-reported cost, including zero, overrides bundled rates, because it is returned first. My Serious item 5 still applies: the override should be limited to `billingMode === 'api-key'`.

**Ledger initialization.**
- With no persisted data, the ledger starts empty and available. A read then returns `coverage: 'none'` and zero priced events, not a fabricated cost.
- Corrupt data sets `unavailable`, with `periods: null` and `cumulative: null`, and the data is not replaced. That meets the requirement.
- Earlier blocking item 1 (a failed write permanently sets `available = false`) is unchanged.

**Verdict stays REVISE.** The classifier move is fine, but Blocking items 1 and 2 and Serious items 3 to 5 are still open.
