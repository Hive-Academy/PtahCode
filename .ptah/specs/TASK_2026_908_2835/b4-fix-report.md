## Changes

- C4: List refreshes after five minutes and returns a last good map only while younger than six hours; specs cover recent, stale, failed, absent, and expired maps.
- C5: Unknown IDs refresh after five minutes, with shared in-flight work; specs cover new IDs, twenty concurrent misses, recent misses, and known IDs at five hours.
- C6: Gateway URLs derive from provider entry base URLs; both entries match the previous hardcoded URLs.
- C7: Optional debug logger records provider ID and error message on refresh failure; silent singleton uses the optional-capability audit category.
- C8: Public catalog request uses `Ptah-Extension/1.0` as User-Agent.

## Decisions

- C7 decision: Options were inject a logger through the singleton or leave the singleton silent with an optional logger for constructed instances. Chose the latter because the singleton has no composition-root logger and adding a setter or concrete import would couple this plain class to DI. Evidence: existing exported singleton and optional-capability audit category in this lib. Reversible: yes.
- C6 decision: Derive URLs from `getAnthropicProvider(providerId)?.baseUrl`. Evidence: entry base URLs are `https://opencode.ai/zen/v1` and `https://opencode.ai/zen/go/v1`, matching the prior endpoints after `/models`. Reversible: yes.

## Verification

- `npx prettier --write libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.spec.ts`: passed, 2 files formatted.
- `ptah_get_diagnostics` scoped to the two changed files: unavailable; shared TypeScript diagnostics worker terminated after another run timed out. Pass/fail counts unavailable.
- `npm run verify -- -t test -p @ptah-extension/auth-providers -- --testPathPatterns=opencode`: passed, 1 Nx test task succeeded, 0 failed; no failed suites. Nx did not print per-suite counts in this output style. Waited 1995 seconds for the machine-wide slot, then the run completed with exit code 0.
- `npx tsc --noEmit -p libs/backend/auth-providers/tsconfig.lib.json`: passed, exit code 0 in about 41 seconds; 0 TypeScript errors.

## Open items

- None.
