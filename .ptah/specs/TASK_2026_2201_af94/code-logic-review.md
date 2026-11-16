# Code logic review - TASK_2026_2201_af94 (OpenRouter pricing fetch storm)

**Verdict: APPROVED.** Score 8/10: sound. No behavioural defect found in the
change; one low test-hygiene finding below.

Evidence: full diff plus both full files read; all callers of warmup,
ensureHydrated, getPricing, getCatalog and clearCache checked (register.ts,
config-rpc.handlers.ts, usage-pricing.service.ts, ollama-cloud-metadata and
local-native.strategy.ts). Focused check: the spec via npx jest, 17/17 pass.

## Five logic questions

1. New fetch or warn storm after a failure? No. The 60 s window gates
   ensureCatalog (openrouter-pricing.service.ts:145-148); pending dedups
   concurrent callers (:144, :149). clearCache is reached only from Ollama
   configure, refresh and teardown (local-native.strategy.ts:167, 182, 223,
   253): user-driven events, and requirement 3 wants them to fetch at once.
   The DI singleton makes the window process-wide (register-providers.ts:167),
   so usage-pricing's 51,000 lookups cost at most one fetch per 60 s.
2. Wrong state in failureTime, cache, pending or warmupPromise? No race found.
   ensureCatalog assigns pending synchronously, so concurrent callers join the
   in-flight fetch. clearCache during a fetch lets the old fetch land after
   the clear - pre-existing, bounded, not worsened by this change.
3. Stale catalog served forever? No. One fetch per 60 s while down; any
   success refreshes and clears failureTime (:153). Test :234 pins this.
4. Warmup decision (context item 6): a failed warmup must retry later. warmup
   runs once at DI registration (register.ts:153, :357) and config:pricing-get
   hydration relies on it (config-rpc.handlers.ts:200). Implemented:
   warmupPromise resets on an empty result (:72-75), so the next call retries
   once per window; the ensureHydrated test proves two fetches total (:264-275).
   No retry loop.
5. Breaking change? A response without a "data" array is now a failure
   (:174-176), not a cached empty catalog. Callers verified: usage-pricing
   falls back to the bundled card (usage-pricing.service.ts:17);
   ollama-cloud-metadata registers $0 on an empty catalog as before, and with
   a stale catalog it now matches the last-good data - the intended fix. The
   lost "missing data" warn text folds into the generic fetch-failed warn.

## Findings

1. Low - openrouter-pricing.service.spec.ts:217, 234, 247, 264: each new test
   calls jest.useRealTimers() only as its last line, so a mid-test assertion
   failure leaves fake timers on for the rest of the suite (afterEach
   restores mocks, not timers). Fix: one afterEach(() => jest.useRealTimers())
   in the describe, and drop the per-test calls.

No further findings. Notes, no action: (a) if fetchAndRegister rejects for a
non-fetch reason (registerProviderPricing or a logger throw), the warmup catch
keeps warmupPromise set with failureTime null, so warmup never retries again -
pre-existing semantics, outside this change; (b) after a failed refresh with a
stale catalog, the first warmup past the window re-registers the stale entries
and logs one info line - bounded to once per window.

Requirements: 1 bounded fetch and warn (:217-232); 2 stale-serve (:234-245);
3 success and clearCache reset (:247-262); 4 one warn per fetch; 5 surface
unchanged; 6 warmup retries after the window (:264-275). Tests 1, 2 and 4
fail against the old code; test 3 fails if clearCache omits the failureTime
reset. None is vacuous.
