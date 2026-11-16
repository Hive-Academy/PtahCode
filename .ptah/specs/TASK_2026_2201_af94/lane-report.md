# OpenRouter pricing fetch storm - lane report

## Files changed

- `libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.ts`
- `libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.spec.ts`
- `.ptah/specs/TASK_2026_2201_af94/lane-report.md`

## Behavior

1. A failed catalog fetch records its completion time. For 60,000 ms, lookups return from memory without another request or warning.
2. A failed fetch returns the last good catalog, including its prices, or an empty catalog when none exists.
3. A successful fetch clears the failure timestamp. `clearCache()` clears it too, allowing an immediate fetch.
4. Each failed fetch emits one warning. An invalid response without a `data` array now follows the same failure path and emits one warning.
5. The public methods and single in-flight `pending` guard remain in place.
6. Failed warmup must be retried after the failure window. `auth-providers/src/lib/di/register.ts` calls `warmup()` once at startup; `rpc-handlers/src/lib/handlers/config-rpc.handlers.ts` calls `ensureHydrated()` for later pricing requests and uses `hydrated: false` to permit another request. An empty warmup result releases `warmupPromise`, while a failed refresh with a stale catalog can retry once the cooldown expires. Neither caller has the same no-failure-memory defect: both delegate catalog fetching to this service.

## Decisions

- Treat a response missing the `data` array as a failed fetch. This makes its retry behavior match HTTP and network failures. The existing spec expected no pricing for that response. Reversible.
- Retry warmup through `ensureHydrated()` after the failure window, because the RPC caller explicitly returns `hydrated: false` so consumers may ask again. Reversible.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.spec.ts` - passed, 1 suite and 17 tests. Node printed an ES module config warning.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` - passed, exit 0, no output.
- `npx eslint libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.ts libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.spec.ts` - passed, exit 0. Nx module boundary rule warned that no cached ProjectGraph was available and skipped that rule.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-pricing.service.spec.ts` - passed, 1 suite and 4 tests. An existing pricing utility printed a warning for a missing test model.
- `ptah_get_diagnostics` scoped to both changed TypeScript files - unavailable on both attempts: its TypeScript check was still running after 45 seconds. The requested `tsc` command passed independently.

## Not done

- No commit, push, pull request, Nx command, build, or broad verification, as instructed.
- Skill discovery/loading was unavailable in this lane; no skill instructions were applied.
