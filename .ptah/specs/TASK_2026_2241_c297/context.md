# TASK_2026_2241_c297 â€” P5 PR 1: host load measurement

Program: TASK_2026_2181_dbbb, item P5 ("host load: task index rebuild storm and
`provider:getPlanLimits`"). Agreed order: measure first, then fix.

## Scope of this PR

Measurement only. No behavior change. No new dependency. Debug level on the injected `Logger`.

1. Task index rebuild line (`libs/backend/task-specs/src/lib/rebuild-timing.ts`, called from
   `task-index.service.ts` `rebuild()` finally block): add `rootId` (short sha256 of the
   normalized root, never the path), `activeRoots`, `scanMs` (duration of `scanner.scan`), and
   process-lifetime counters `rootRebuilds` (this root) and `triggerRebuilds` (this trigger kind).
   Trigger, phase durations, `carriers`, `rows`, `coalesced` exist already.
2. Plan limits snapshot line (`libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts`):
   one debug line per served `snapshot()` and `currentSnapshot()` call: source (`pull`/`push`),
   `path` (`joined`/`assembled`), scope shape (provider set, session count, owner key count,
   refresh, short `scopeId` hash), `discoveryMs`, `readsMs`, `durationMs`, `owners`,
   `discoveryIncomplete`, cumulative counters.
3. Owner cache line (`libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts`
   `getOwnerSnapshot`): one debug line per request: `outcome` (`cache-hit`/`flight-join`/
   `flight-start`), the bypass reason when not a hit, `providerId`, `refresh`, cumulative counters.
4. Parser (`scripts/perf/streaming-load-metrics-lib.cjs` and its spec): aggregate the three lines
   into `taskIndex`, `planLimits` and `planUsageCache` sections.

## Verified facts (against the code at main b4ab8f096)

- `rebuild()` always runs a full `scanner.scan(root)` (`task-index.service.ts:818`) and logs
  `logRebuildTiming` in its `finally` (:894-899). The line has no root and no counters.
- `snapshot()` dedupes only concurrent same-scope calls and deletes the entry on settle
  (`plan-limits-snapshot.service.ts:119-144`). No TTL cache exists.
- `getOwnerSnapshot` serves a 30 s cache unless `refresh`, a named Claude route, or the CLI
  fallback rule applies (`plan-usage.service.ts:266-280`), else it joins or starts a flight.

## How to read the numbers

The new lines are DEBUG. The logger default is `info` outside development
(`libs/backend/vscode-core/src/logging/logger.ts:76-84`). Start Electron with
`PTAH_LOG_LEVEL=debug` (or the dev profile), reproduce the load, then run
`node scripts/perf/streaming-load-metrics.mjs --last 15m --md report.md`. At the `info` level,
the parser shows only rebuilds of 250 ms or more, but their counters still count every rebuild.

## Review

Glm review (`review-glm.md`): APPROVE, no blocking or major findings. Minor 1 (debug level not
stated) is fixed in the parser header and above. Minor 2 (join rejection spec) and minor 3
(owner cache counter values) are fixed with new assertions. Nit 4 (`refresh` normalization) is
fixed. Nits 5-7 are accepted as is: hash prefixes are documented as lower bounds, the file
length warning existed before, and a pre-aborted read is not a cache request.

## Later PRs (not in this PR, plan goes to the parent first)

- PR 2: `applyFolderChange` joins the watcher debounce window.
- PR 3: TTL cache for a complete same-scope pull snapshot. `refresh: true` bypasses. An
  incomplete snapshot is never served from the cache. The push is not cached.
