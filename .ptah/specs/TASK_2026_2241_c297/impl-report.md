# Measurement implementation report

## Files changed

- `libs/backend/task-specs/src/lib/rebuild-timing.ts`, `task-index.service.ts`, and their two adjacent specs.
- `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts` and its spec.
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` and its spec.
- `scripts/perf/streaming-load-metrics-lib.cjs` and `streaming-load-metrics.spec.ts`.

## Design

- **Task index:** Records scan wall time around the scanner promise, counts every rebuild in the existing `finally`, and hashes the normalized map key. Counts are private service maps. The existing log level thresholds remain intact.
- **Plan limits:** The pending promise carries an internal `{snapshot, discoveryMs, readsMs}` record. Each caller logs after that promise settles and returns the same snapshot object. Pushes assemble independently. The shared snapshot type and dedupe rule are unchanged.
- **Owner cache:** Logs at the existing cache hit or flight path. The bypass label follows the cache condition's first failed rule. The three counters are private service fields. The cache and flight condition are unchanged.
- **Parser:** Recognizes the actual Electron daily-log shape (`[ISO] [LEVEL] ISO - message: {JSON}`), aggregates only the new diagnostic lines, and adds three markdown sections. Existing metrics and thresholds are unchanged. New fixtures are constructed from `Logger.log` format because no historical lines exist yet.

## Exact debug payload shapes

- `[task-specs] index rebuild timing`: `{trigger, rootId, activeRoots, scanMs, rootRebuilds, triggerRebuilds, enumerateMs, readMs, parseValidateMs, sqliteReplaceMs, listenerMs, waitedMs, totalMs, carriers, rows, coalesced, failed}`. The existing warn/info/debug threshold still selects the level.
- `[PlanLimitsSnapshot] snapshot served`: `{source, path, scopeId, hasProvider, sessionCount, ownerKeyCount, refresh, durationMs, discoveryMs, readsMs, owners, discoveryIncomplete, pulls, joins, pushes}`.
- `[PlanUsage] owner snapshot request`: cache hit `{outcome, providerId, refresh, hits, joins, starts}`; flight join/start `{outcome, bypass, providerId, refresh, hits, joins, starts}`.

Payloads contain no raw root path, session ID, owner key, email, or error message.

## Focused checks

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/rebuild-timing.spec.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts` — pass, 2 suites / 67 tests.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.spec.ts` — pass, 1 suite / 18 tests.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` — pass, 1 suite / 59 tests.
- `npx jest --config scripts/jest.config.ts --runInBand --coverage=false --runTestsByPath scripts/perf/streaming-load-metrics.spec.ts` — pass, 1 suite / 18 tests.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json` — pass, 0 errors.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — pass, 0 errors.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` — pass, 0 errors.
- `npx eslint` on the 10 changed source/spec files — pass, 0 errors / 3 warnings (existing unused catch binding, non-null assertion, and file length; Nx module-boundary rule skipped because no cached ProjectGraph).
- `git diff --check` — pass, no whitespace errors.

## Open question

None. No invokable skill mechanism was exposed to this lane; the local backend skill instructions were read directly. Native search, TypeScript, Jest, and ESLint served as fallbacks where Ptah indexed tools were not used.
