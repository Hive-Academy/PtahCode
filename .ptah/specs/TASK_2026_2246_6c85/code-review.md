# Code review — TASK_2026_2246_6c85 (plan limits snapshot TTL cache)

Independent read-only review of the uncommitted change in this worktree.

## Verdict: approve

There are no blocking findings. The change meets every required rule. Three focused
checks pass on my run:

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.spec.ts` — 1 suite, 28 tests, 0 failures.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — 0 errors.
- `npx eslint` on both changed files — 0 errors, 0 warnings.

File paths below refer to `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts` (service) and `.spec.ts` (spec) unless stated otherwise.

---

## Required rules — verification

### 1. TTL 30 s — met

`PLAN_LIMITS_SNAPSHOT_TTL_MS = 30_000` (service:94). A hit requires `now() < expiresAt`
(service:153), and `expiresAt` is stamped at write time (service:184), which is
microtasks after `assemble()` returns. The served data is therefore at most about
30 s old. The expiry test pins the boundary at exactly 30 s (spec:120-131).

### 2. `refresh: true` skips the cache and replaces the entry — met

The lookup runs only when `request.refresh !== true` (service:151). A refresh
assembly writes its complete result when it is the latest assembly for the scope
(service:174-187). Tested at spec:140-148.

### 3. The cache key includes the scope, normalized — met

`cacheKey = scopeKey(scope, false)` (service:150). `scopeKey` dedupes and sorts
`sessionIds` and `ownerKeys`, and includes `selectedProviderId`
(service:408-415). `{}` and `{ sessionIds: [] }` produce the same key. Tested
across providers at spec:133-138.

### 4. Never cache an incomplete snapshot — met

Three sources mark the assembly non-cacheable:

- `discoveryIncomplete` — `cacheable = entries.discoveryIncomplete !== true` (service:260).
- An owner read that timed out — the `remainingMs <= 0` early return calls
  `onFallback?.()` (service:309), and the timer abort path calls it in the catch
  (service:339).
- An owner read that threw — the same catch (service:327-340).

A non-cacheable result that is the latest assembly deletes the older complete
entry (service:175-176). Tested for timeout (spec:162-178), throw (spec:180-189),
and incomplete discovery removing an earlier complete entry (spec:191-199).

### 5. An older pull cannot overwrite a newer refresh entry — met

`latestCacheAssembly` holds one assembly token per cache key
(service:108, 159-160). Only the assembly whose token is current writes or clears
the entry (service:174), and the `finally` deletes the token only when it is still
current (service:190-194). Trace: pull A sets token A; refresh R overwrites it with
token R; A settles and its token no longer matches, so A writes nothing; R writes.
Tested at spec:150-160.

### 6. Bounded cache — met

`cachedSnapshots` evicts the oldest entry before it inserts at 32 keys
(service:179-182). `MAX_SNAPSHOT_KEYS = 32` (service:95).

### 7. The RPC response type is unchanged — met

`git status` lists only the two service files as changed. `cacheable` lives on the
internal `AssembledSnapshot` (service:97-102). The shared `PlanLimitsSnapshot`
is untouched.

### 8. The push path is not cached — met

`currentSnapshot()` reads no cache and writes none (service:198-206). The push
test now asserts `discoverTargets` ran a second time (spec:253), which proves the
push assembles fresh.

---

## Races, memory, and stale data

**In-flight dedupe and the cache do not fight each other.** The pending check runs
before the cache check (service:143 before 151), so a pull joins an in-flight
assembly even when a cache entry exists. A joined caller sets no token; the
original pull's write covers it. A cache-hit pull returns before any token or
pending entry is created (service:155), and it still updates `lastRequest`
(service:141), so the push scope follows the most recent request, cache hit or not.

**A rejection cannot wedge the token map.** `pending` rejections reach the
`finally`, which clears the token when current (service:190-194). The new rejected
assembly test confirms both the rejection and the absent cache entry (spec:201-207).

**Memory stays bounded.** `cachedSnapshots` holds at most 32 full snapshots.
`latestCacheAssembly` has no cap, but it self-drains: the latest pull for each
scope deletes its own token at settle, so the map is empty once all pulls settle.
Its transient size is proportional to concurrently in-flight distinct scopes, which
is the same exposure the pre-existing `pendingSnapshots` bound already accepts.

**Stale data risk is bounded by design.** The client store ignores a snapshot older
than the one it holds, by `generatedAt` (`plan-limits.store.ts:288`), so a cached
pull cannot overwrite a newer `planLimits:changed` push. Ledger changes still push
fresh assemblies through `currentSnapshot()`. A rate-limit reset therefore reaches
the view through the push, and 30 s of pull staleness is the accepted cost in the
task decision. The one flow with no correcting push is a provider login change;
see Minor 1.

---

## Findings

### Blocking

None.

### Major

None.

### Minor

1. **No invalidation hook for provider login changes.** A credential that is added
   or removed changes the owner list, but not the scope key, so pulls serve the old
   owner set for up to 30 s (service:150-158 has no invalidation path; no caller
   clears `cachedSnapshots`). A new credential produces no ledger evidence, so no
   push corrects the view either. Mitigations that exist: the 30 s bound, the
   `refresh: true` bypass, and the store's `generatedAt` guard. The task decision
   accepted a 30 s TTL without invalidation, so this is within scope, but the
   fastest user path — add an account, open the usage view — can show a missing
   account for up to 30 s. Fix: add a `clearCache()` method that clears
   `cachedSnapshots` (and optionally `latestCacheAssembly`) and call it from the
   existing auth-change event in the host, or record the accepted bound in the
   service doc comment.

2. **`known` owners with `service-unavailable` are cached.** `NO_OPEN_SESSION` is
   a `known` entry with `status: 'service-unavailable'` and
   `unavailableReason: 'no-open-session'`
   (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:54-60`).
   `known` entries pass through without `onFallback` (service:280-281), so such an
   assembly is cacheable. This does not violate the stated rule, which scopes
   non-cacheable to `discoveryIncomplete` and `readOwner` fallbacks, and the state
   is deterministic ("known without asking the provider",
   plan-owner-read.ts:43). But an owner whose session opens inside the TTL stays
   `service-unavailable` on pulls for up to 30 s; the ledger push and the store
   guard correct the view. Fix: either accept and document this, or mark the
   assembly non-cacheable when a `known` snapshot carries
   `unavailableReason: 'no-open-session'`.

3. **The doc comment "Never rejects." is now contradicted by a test.**
   `snapshot()` documents "Never rejects." (service:132-134), but the new test
   asserts a discovery rejection propagates to the caller (spec:201-207). The
   behavior is pre-existing (`await pending` had no catch before this change);
   read failures never reject because `readOwner` catches them. Fix: change the
   comment to state that a discovery failure rejects while owner-read failures do
   not, or catch in `snapshot()` and return a fallback snapshot if "never rejects"
   is the real contract.

4. **Two test gaps.** No test covers the 32-key eviction of `cachedSnapshots`
   (service:179-182), and no test covers cache-key normalization for ordered
   scopes, for example `{ sessionIds: ['b', 'a'] }` then `{ sessionIds: ['a', 'b'] }`.
   The in-flight normalization test covers `scopeKey`, which the cache reuses, so
   the residual risk is small. Fix: add one test that pulls 33 scopes and asserts
   the first scope re-assembles, and one test that two orderings of one scope share
   a cache entry.

### Nit

5. **Mixed clock use.** `snapshot()` and `logSnapshot()` use the `this.now()` seam
   (service:129, 138, 153, 184, 218), but `currentSnapshot()` and `assemble()`
   still call `Date.now()` directly (service:199, 255-266). The sibling
   `chat-follow-up-queue.service.ts:230` uses its `now()` seam consistently. The
   spec drives time with fake timers, which mock `Date.now` itself, so behavior is
   unchanged; a subclass that overrides `now()` would only affect half the paths.
   Fix: use `this.now()` in the touched methods, or drop the seam.

6. **Expired entries linger until touched.** An expired entry is deleted only when
   the same scope is pulled again (service:157) or when eviction runs. Up to 32
   dead snapshots can stay retained for the host's lifetime. This satisfies the
   stated bound, so it is safe. Fix, if wanted: sweep expired entries during the
   eviction check.

7. **Eviction is FIFO, not LRU.** A cache hit does not refresh the entry's
   insertion order, so under more than 32 distinct scopes a hot scope can be
   evicted by one-shot scopes. A miss only costs one re-assembly. Fix, if wanted:
   re-insert on hit (`delete` then `set`) to make the bound LRU.

---

## Repository rules on the changed lines

- No `any`, no `@ts-ignore`, no `as unknown as X` in the changed lines. The
  `logger as unknown as Logger` cast in the spec helper (spec:88) is pre-existing
  and untouched by this diff.
- No `console.*`; the injected `Logger` is used for the new `ttl-cache` diagnostic
  line (service:154, 213-223).
- No silent error swallow: both `readOwner` fallbacks log the failure kind at debug
  before the `onFallback` callback (service:305-310, 328-339).
- File size: the service is 415 lines, below the 700-line `max-lines` budget
  (`eslint.config.mjs:520-523`); spec files are exempt from that rule.
- The `ttl-cache` diagnostic logs the hashed scope id only (service:214), which
  keeps the no-secrets rule of the file header.
