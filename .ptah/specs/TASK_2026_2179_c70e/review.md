# Review — TASK_2026_2179_c70e (handoff ack "record missing")

**Verdict: CHANGES_REQUESTED** (no blocker; 2 major findings that leave edge cases of the original bug class open)

Scope: uncommitted diff in `session-children/` (store, service, 2 specs). `workspace-aware-state-storage.ts` and the `isWorkspaceScopedStateStorage` guard are unchanged by the diff (guard already exists in platform-core). The diff also contains unrelated frontend/chat files (`cli-lane-default-cell`, `cli-provider-grid.css`, etc.). Confirm these are not meant for this branch.

## What is correct
- `transition()` (store.ts:~239) does locate, compare, patch and write in one `serialized()` block. The `moved`/`already`/`missing` semantics are right. It is the only caller that needed the atomic result. The `missing` result becomes retryable with a Logger warning (service.ts:380-390).
- No other code relies on the removed refused `handoff record missing`: `git grep` finds no remaining reference outside `.ptah`. The retry path reuses the existing text at service.ts:299.
- `already` (state is no longer `recorded`, e.g. a racing ack moved it to `closePending`) then continues to the closer. That is safe: `closeCompleted` is short-circuited earlier, and the stop path is guarded by `stopWaiters`/`stopped`. It is also what the old `!moved && found` path did.
- Plain `IStateStorage` has no regression. `storageFor`/`locate` degrade to `this.storage` and a single candidate.

## Findings
1. **major** — store.ts:121-125 (`storageFor`) and :198 (`record()`). Fallback to the ambient storage when the root is not registered. `getStorageForWorkspace` is an exact-key `Map.get` (workspace-aware-state-storage.ts:329). The interface doc (workspace-scoped-state-storage.interface.ts:35-38) says `undefined` must not be papered over with the active workspace's storage. A `workspaceRoot` that differs in case, separators or a trailing slash (the interface doc notes Windows drive-letter case) silently writes the record into whichever workspace is active. That is the wrong-document write this change is meant to prevent. Fix: match against `getAllWorkspacePaths()` with host-style normalization, and log a warning on fallback.
2. **major** — store.ts:127-144 (`locate`) with no workspace active, or a record written to the default storage. The default storage is not in `getAllWorkspacePaths()`, and `getDefaultStorage()` is not part of the structural guard. A record written while no workspace is active (the `storageFor` fallback goes to the proxy, which uses `defaultStorage`) is invisible once a workspace becomes active. `locate` checks only the proxy (the active document) plus registered workspaces. `findByPredecessor` then returns `undefined` and the ack gives `retryable-failure` indefinitely. Fix: also probe `getDefaultStorage` through an optional capability, or refuse to record without a registered root. At minimum, add a spec for the no-active-workspace case. It is untested.
3. **minor** — store.ts:146-163 (`stateForPredecessor`) and `record()`. The duplicate check is per document. The same `predecessorTabId` could exist in two documents (an old record in the active doc, a new one in the pinned doc). `locate` is active-first, so a lookup returns the stale record and then pins to the stale record's `workspaceRoot`. Duplicates are not prevented across documents. Low probability, but `record()` should check `locate` first.
4. **minor** — store.ts:183 (`records()`). It reads only the active document (`this.read()`). Callers that enumerate (prune, recovery) will miss other workspaces' records. Check who calls it, or document the behaviour.
5. **minor** — store.ts `locate` and `discardStarting`. `discardStarting` finds the record by id only and filters by id plus `starting`. This is fine. But `locate` calls `readState` on every candidate, and each parse failure quarantines or logs. Reading N workspace documents per lookup can repeat invalid-document warnings. Cost is acceptable.
6. **nit** — store.ts `locate`, `stateForPredecessor` and the `record()` signature lines exceed the prettier width (one-line generics). `stateForPredecessor` re-declares `byId` after use in `locate`. Hoist it.
7. **nit** — service.ts:380, 392 use `this.ackStore!`. This is pre-existing and lint warns only. `max-lines` is already 1126 (a warning, pre-existing). Do not extend this file further.
8. **nit** — specs. The store spec covers pinning after a workspace switch, a record living in a non-pinned document, and `transition` moved/already/missing. Uses `as` casts on the test-document map (`as T | undefined`, `as { records... }`) — not `any`. Missing tests: case or normalization mismatch (finding 1), no active workspace (finding 2), cross-document duplicate (finding 3), concurrent `transition` calls producing exactly one `moved`. The service spec mocks `transition` to `'missing'` and checks the retry and that the closer is not called. It does not assert the Logger warning.

## Typing, logging, errors
- No `any`, `@ts-ignore` or `as unknown as` in the changed source. Logger is used (service.ts:381). No swallowed errors in the new code.

## Checks run
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` store spec + service spec: **2 suites, 19 tests passed**.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: **exit 0**.
- `npx eslint` on the 4 files: **0 errors, 6 warnings** (all on service.ts: non-null assertions and max-lines, pre-existing patterns).
- Not run: nx, verify, other libs' specs. Electron is the host most affected, since `WorkspaceAwareStateStorage` is used there and in the CLI.

## Required before approval
Findings 1 and 2, each with a spec. Finding 3 is recommended.
