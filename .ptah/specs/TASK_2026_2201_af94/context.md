# TASK_2026_2201_af94: OpenRouter pricing fetch storm

## Symptom (measured)

`%APPDATA%/Ptah/logs/Ptah Electron-2026-11-16.log`, 10:25 to 11:12 UTC: 151,758 lines
`[OpenRouterPricing] https://openrouter.ai/api/v1/models fetch failed — pricing will be
unavailable. fetch failed`, up to 17,265 in one minute. The network was down in that period.
The day before had 20 such lines.

## Cause

`libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.ts`,
`ensureCatalog()`:

- A failed `fetchCatalog()` resolves to `emptyCatalog()` but sets neither `cache` nor
  `cacheTime`, and `finally` clears `pending`.
- So the next `getPricing()` call starts a new HTTP request at once. A fast network failure
  (DNS, offline) makes this one request and one warn line per lookup.
- `UsageAnalyticsService.summarize` (`libs/backend/usage-analytics`) prices each contribution
  (about 51,000 per summary) through `usage-pricing.service.ts`, so one summary makes thousands
  of requests on the Electron main process.
- A second effect: when a fetch fails after the 5-minute TTL, a good older catalog is thrown
  away and lookups return null.

## Required behavior

1. After a failed fetch, start no new fetch for a bounded time
   (`FAILURE_RETRY_MS = 60_000`). In that time `ensureCatalog()` answers without network and
   without a log line.
2. On a failed fetch, serve the last good catalog if one exists (stale), else the empty catalog.
3. A successful fetch clears the failure state. `clearCache()` clears it too, so an explicit
   refresh still fetches at once.
4. At most one warn line per failed fetch (already true once 1 holds).
5. Keep the public surface (`getPricing`, `warmup`, `ensureHydrated`, `fetchAndRegister`,
   `getCatalog`, `clearCache`) and the single in-flight `pending` guard.
6. Check `warmup()` / `ensureHydrated()`: `warmupPromise` stays set after a failure. Decide
   from the callers if a failed warmup must be retried later (after the failure window) and say
   so in the report. Do not widen the scope beyond this service and its spec unless a caller
   has the same no-failure-memory defect; then report it, do not fix it.

## Tests (in `openrouter-pricing.service.spec.ts`, same folder)

- 1,000 `getPricing` calls after one failed fetch make exactly 1 `fetch` call and 1 warn.
- After `FAILURE_RETRY_MS` (fake timers / mocked `Date.now`) the next call fetches again.
- A failed refresh after the TTL still returns prices from the last good catalog.
- Success after failure resets the state. `clearCache()` permits an immediate fetch.
