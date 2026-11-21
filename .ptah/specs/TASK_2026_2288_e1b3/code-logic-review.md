# Code Logic Review — `TASK_2026_2288_e1b3`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 2              |
| Failure modes found | 3              |

## Serious

### Concurrent first load can falsely block secret writes for the session

- File: `libs/backend/settings-core/src/encryption/secrets-file-store.ts` (`ensureLoaded` ~L113, `quarantineCorruptFile` ~L160-L175)
- Scenario: `ensureLoaded` has no in-flight dedupe, because `loaded` is set only after the await. Two concurrent first calls (for example `Promise.all` of two `read`/`write`) both read the corrupt file. The first rename succeeds. The second rename throws ENOENT because the file is already moved, so `writesBlocked = true` is set and persists for the session.
- Impact: no data loss. The corrupt file was already preserved, but every later secret write or delete throws and `flushSync` skips, with a misleading "could not be moved aside" log. The second load also resets `entries`, which can discard an entry written between the two loads.
- Fix: memoize the load promise (`this.loading ??= this.loadFromDisk()`), and/or treat ENOENT on the quarantine rename as success. Add a concurrent-read spec.

## Moderate and minor

- `analysis-namespace.builders.ts` ~L500 (diff): `readSymbolEntries =(workspaceRoot` has a missing space (formatting, for the style reviewer).
- The new specs cover only sequential use of the secrets store, so the race above would not be caught.
- The JSON facet now refuses a file with a UTF-8 BOM (JSON.parse fails). This is safe, but the user sees "not valid JSON" for a file that looks fine.

## Checked and found sound

- **Callers of the facets.** `mcp-facet-planner.ts` L213-L235 and L317 wrap `facet.remove/write` in try/catch and report `writeFailed` or `retired-failed`. A refused write does not crash the caller.
- **Locking.** Both facets do the strict read inside `withMcpConfigLock`, so the read and write happen under one lock.
- **Codex.** Only ENOENT is treated as empty. The `.bak` copy and `foreignServerKeys` behaviour are unchanged. The display read stays lenient.
- **Privacy.** No parse-error text, file contents or env/headers appear in thrown messages or logs. Only the error code or name is used. The secrets log carries a basename only.
- **Secrets store.**
  - `persist` and `flushSync` both call `assertWritable`, and `flushSync` logs only the fixed message.
  - Startup reads treat non-ENOENT errors as a throw and leave `loaded` false, so there is no silent empty state.
  - The rename timestamp has millisecond resolution. A collision would only overwrite an already-corrupt backup, so the risk is negligible.
- **Dependencies tools.** `protocol-dispatcher.ts` L2867 and L2907 are inside the dispatcher's try/catch, and `ensureDependencyGraph` readiness runs first, so the thrown errors become tool error results. Messages carry only the error name.
- **Smithery.**
  - The `error` state is rendered by its own template branch, and `Retry` resets the state to `unknown`, which shows the spinner.
  - Every browse method is gated on `=== 'configured'`.
  - `saveKey` re-checks the status through the same function.
  - An RPC error string is rendered with Angular interpolation, which escapes it.

## Verdict

- Recommendation: REVISE (one small fix)
- Confidence: MEDIUM-HIGH. I did not run the specs.
- Top risk: the false `writesBlocked` under concurrent first load.
