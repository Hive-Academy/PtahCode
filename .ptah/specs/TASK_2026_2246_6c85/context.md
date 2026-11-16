# TASK_2026_2246_6c85 — P5 PR 3: cache complete plan limits snapshots for 30 s

Program: TASK_2026_2181_dbbb (P5, host load). PR 1 (measurement): TASK_2026_2241_c297, PR #1380, merged.

## Evidence (production Electron log, 2026-11-16, 22 h, info level)

- 187 `[RPC] slow handler` warnings (over 2 s) for `provider:getPlanLimits`: p50 3357 ms,
  p90 10574 ms, max 74321 ms. Up to 29 per hour.
- 15 main-loop hang records have `provider:getPlanLimits` in flight.
- Gaps between slow calls: median 99 s. 32 of 186 under 10 s, 57 under 30 s. A 30 s TTL removes
  at most 31% of the slow calls; a 10 s TTL at most 17%.
- `PlanLimitsSnapshotService.snapshot` dedupes only concurrent same-scope calls
  (`pendingSnapshots`). There is no TTL cache, so each new pull runs `assemble()`.

## Decision (program coordinator)

- TTL 30 s for a complete pull snapshot, per scope key (the key includes the scope).
- `refresh: true` skips the cache.
- Never cache an incomplete snapshot (`discoveryIncomplete`).
- The push path (`currentSnapshot()`) is not cached. The in-flight dedupe stays.

## Out of scope

- Longer caching of failed owner reads (OpenCode unavailable 163 times, Antigravity fallback 37
  times in the same log). Decide after the PR 1 debug data.

## Glm review answers (code-review.md, verdict approve, 0 blocking, 0 major)

- Minor 1 (no invalidation hook on a credential change): accepted. The coordinator approved a 30 s TTL. The doc comment of `snapshot()` records the bound: the next push, `refresh: true` or the TTL shows the change.
- Minor 2 (a `known` no-open-session owner is cached): accepted. The state is known without a provider read, and an owner without an open session is common, so an exclusion would defeat the cache. The ledger push corrects the view.
- Minor 3 ("Never rejects." doc comment): fixed. The comment says that an owner read failure never rejects and a discovery failure rejects and is not cached.
- Minor 4 (test gaps): fixed. New tests for two orders of one scope and for the 32-key eviction.
- Nit 5 (mixed clock): fixed. The assembly paths use `this.now()`.
- Nit 6 (expired entries stay until touched): accepted. The 32-key bound holds.
- Nit 7 (FIFO eviction): fixed. A hit re-inserts the entry, so the bound evicts the least recent scope.
