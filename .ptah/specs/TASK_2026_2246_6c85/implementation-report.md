# P5 PR 3 implementation report

## Design

Complete pull snapshots are cached for 30 seconds under the normalized scope key. The cache holds at most 32 scopes and evicts the oldest. Refresh bypasses reads and can replace the entry; incomplete results clear it. In-flight joins retain priority, and pushes still assemble independently. The existing diagnostic reports `path: ttl-cache` on hits.

## Changed files

- `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts`: add bounded, scope-specific TTL caching and cache-hit diagnostics.
- `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.spec.ts`: cover TTL behavior, incomplete and failed results, and push isolation.
- `.ptah/specs/TASK_2026_2246_6c85/implementation-report.md`: record design and verification.

`git diff --stat` (tracked code):

```text
 .../services/plan-limits-snapshot.service.spec.ts  | 64 +++++++++++++++++++++-
 .../lib/services/plan-limits-snapshot.service.ts   | 34 ++++++++++--
 2 files changed, 93 insertions(+), 5 deletions(-)
```

## Jest tests (25 passed)

- serves a same-scope pull from the TTL cache and logs its path
- assembles again when the 30 second TTL expires
- keeps cached snapshots separate by scope
- bypasses the cache on refresh and replaces the complete entry
- does not cache incomplete discovery or serve an earlier complete entry after it
- does not cache a rejected assembly
- shares normalized scopes in flight and forces a separate refresh
- rejects every joined caller with the shared assemble error and logs no served line
- logs a push with the last scope and no raw owner key
- links an ambient-only native home to its unknown owner and isolates other homes
- warns when native metadata lookup fails and leaves the session unresolved
- links only a persisted native Codex session on the discovered home to its plan owner
- passes an incomplete discovery marker to the client snapshot
- pushes with the scope of the last request and never refreshes
- pushes with an empty scope before any request
- returns a partial snapshot within 24 seconds after slow discovery and a hung Codex read
- reserves time for a live owner read after discovery uses its 12 second deadline
- a provider lookup reads only the selected-provider owner and keeps the push scope
- a provider lookup is not cut at 3 s: the reader keeps its own limit
- a plan-limits snapshot gives Codex a 12-second deadline
- the push also gives Codex the longer deadline
- still cuts a non-Codex owner read at 3 seconds
- a provider lookup with no selected-provider owner reports no-owner
- preserves an unavailable selected-provider discovery
- a failed read still lists the owner and logs only the error name

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.spec.ts`: pass, 1 suite/25 tests, 0 failures.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: pass, 0 errors.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: pass, 0 errors.
- `npx eslint libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.spec.ts`: pass, 0 errors (module boundary rule skipped because no cached ProjectGraph).
- `git diff --check`: pass, 0 errors.

END-OF-REPORT

## Follow-up fix

Owner read deadline and error fallbacks now mark the assembled snapshot internally as non-cacheable. A non-cacheable assembly clears the scope cache entry when it is the latest assembly for that scope. An assembly token also prevents an older pull from replacing a newer refresh result. The RPC response type is unchanged and existing fallback logs remain.

Added deterministic specs for timeout fallback, thrown read fallback, and an older pull settling after refresh. Focused Jest: 1 suite, 28 tests passed. Library TypeScript check: passed. Spec TypeScript check: passed. ESLint: passed with only the existing no-cached-ProjectGraph module-boundary warnings.

