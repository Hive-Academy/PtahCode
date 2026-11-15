# Re-review round 2: TASK_2026_2179_c70e

**Verdict: APPROVED.** Findings 1-8 are fixed or justified. There are no blockers or majors. Two minor items and one nit are optional follow-ups.

Scope: `git diff HEAD` (store, service, 2 specs) plus the new `session-handoff-ack.storage-candidates.ts`. Static read only. I did not review the spec contents line by line. I relied on the passing run and the implementer's description of the specs.

## Per-finding status
1. **Root spelling (was major): FIXED.** `storageForRoot` (storage-candidates.ts:29-41) matches against `getAllWorkspacePaths()` via `rootKey`, then calls the exact-key getter with the registered spelling. `rootKey` handles:
   - win32 drive paths: separators unified, `path.win32.normalize`, trailing separator stripped, lowercased.
   - Other paths: `normalizeWorkspaceRoot`, lowercased only when `process.platform === 'win32'`.
   - posix: case is preserved.

   An unmatched root logs a warning at store.ts:132 and falls back to the ambient storage. Lookups search all documents, so the record is still found. This is a justified tradeoff.
2. **Default document (was major): FIXED.** `storageCandidates` probes `getDefaultStorage` through a structural guard (storage-candidates.ts:8-15, 51-54). The spec for a record written before a workspace was active passes.
3. **Cross-document duplicates (was minor): FIXED.** `record()` runs `locate` first (store.ts:246-255). It applies the replace rule and removes the old record from its previous document. See the new finding N1 below on write order.
4. **`records()` only read the active document (was minor): FIXED.** It returns the union of all candidates, deduped by `predecessorTabId` (store.ts:209-228). The pinned document wins when the record is registered. This is safe when the proxy and the active delegate are the same document, because dedupe is by predecessor key and a re-read is idempotent.
5. **Race and warning (was minor): FIXED.** Specs cover concurrent `transition` calls (one `moved`, one `already`) and the service Logger warning. Warnings on repeated parse failures remain, which is acceptable.
6. **Prettier and hoisting (was nit): FIXED.** `byId` is hoisted (store.ts:166).
7. **`ackStore!` and `max-lines` (was nit): ACCEPTED.** These are pre-existing. The service has formatting-only changes and no new production code.
8. **Spec gaps (was nit): FIXED.** Specs now cover normalization mismatch, no active workspace, cross-document replacement, concurrent `transition`, and the Logger warning.

## New findings
- **N1 (minor), store.ts:275-281, write ordering in `record()`.** When the old record sits in a different document, the old document is written first (record removed) and the new one second. A crash or write failure between the two writes loses the handoff record. Write the new document first, then remove the old record. The reverse order gives a transient duplicate instead. That is recoverable, because `locate` is active-first and the pinned document is preferred in `stateForPredecessor`.
- **N2 (minor), store.ts:275, proxy vs active delegate.** `storageCandidates` starts with the proxy `storage`, then adds each delegate from `getStorageForWorkspace`. The proxy and the active delegate are two objects for one document. In that case `previous.storage` is the proxy and `storage` is the delegate, so `previous.storage !== storage` is true. `record()` then writes the same document twice, once from `previous.state` and once from `state`. The final content is correct, because `state` is written last and was read from the same document. It does cost an extra write and widens the N1 window. Fix: compare the two storages by document identity, for example by skipping the removal when `previous.state` and `state` hold the same records or when the delegate is the proxy's active delegate. In `stateForPredecessor`, the same pair is handled correctly: it re-reads the pinned storage and mutates that one state.
- **N3 (nit), storage-candidates.ts:17-27.** `rootKey` on posix replaces `\` with `/` before normalizing. A posix directory name that contains a backslash would be treated as a separator. This is very rare and only affects the match, never the written key. A comment would be enough.

## Other checks
- `locate` is sequential and throws if any candidate read rejects. One broken delegate document fails every lookup. This is not a regression for plain `IStateStorage`, which has a single candidate.
- Plain `IStateStorage`: unchanged behaviour. `storageForRoot` returns the storage itself and `storageCandidates` returns one entry.
- The removed refused branch has no remaining callers. The `already` result still continues to the closer, which is safe as before.
- Typing: no `any`, `@ts-ignore` or `as unknown as` in the new code. `getDefaultStorage` uses a narrow structural cast to `{ getDefaultStorage?: unknown }`, which is acceptable. Logger is used. No swallowed errors.
- store.ts is 335 lines. That exceeds the new-code guideline but is justified by the extraction already done.

## Checks run
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` store spec, ack service spec and `session-handoff.service.spec.ts`: **3 suites, 97 tests passed**.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: **exit 0**.
- `npx eslint` on the store and the new helper: the run finished with no error output. I did not capture an explicit summary line, so I am relying on the implementer's report of 0 errors.
- Not run: nx, verify, or other libs' specs. I did not re-run `tsconfig.spec.json`. The implementer reported it as passing.
