# Code logic review, round 2 - TASK_2026_921_fde0

Verdict: APPROVE. Score: 9/10. No blocker and no major defect. Two nits remain.
Scope: `git diff` of the 8 listed files, read-only. No test, build or nx command was run.

## Round 1 findings

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | Long-frame line over 256 bytes | Resolved | `renderer-frame-monitor.service.ts:74-103` (`scriptLog`), `:34-41` (`cutText`); spec worst-case test |
| 2 | `electronState()` cached `{}` with no host API | Resolved | `vscode.service.ts:244` returns `{}` before any cache write |
| 6 | Empty path and pending load | Resolved | `recent-sessions.store.ts:45-53`; 3 new specs for A then empty, empty then A |
| I | Missing tests | Resolved | vitals empty path spec, `pinnedError` log spec, 5 new `vscode.service` specs |

## Byte arithmetic (finding 1)

- Real line from `logging.service.ts:257-276` is `[ISO] [WARN] RendererFrame:` + space + message + space (the `''` data argument).
- `lineBytes()` uses `CONSOLE_PREFIX` (ends with a space) + a second space + message. The byte count is equal to the real line (the leading extra space replaces the trailing one). It is exact, not an estimate.
- `cutText` cuts by code point to 24 bytes before JSON escaping. Escapes can grow the text (`"` to 2 bytes, control character to 6 bytes), so the loop in `scriptLog` shortens the largest raw field one code point at a time until the whole line fits.
- Termination: every pass removes one code point or deletes a field. The set of fields is finite. The loop ends when the line fits or no string field remains (`if (!largest) break`). The remaining base line (about 68 bytes plus numbers) is far under 256. `1e308` prints as `1e+308` (6 bytes), so large numbers do not break the cap.
- Summary line: fixed keys plus `1e+308` values gives about 150 bytes. It is under the cap.
- Worst-case test: each field is 4 units of quote, control character and emoji. After the cut it is 24 raw bytes and 48 escaped bytes. Four such fields give about 320 bytes before trimming, so the test uses the trim loop. It uses the real `LoggingService` and joins all console arguments including `''`. It would fail without the fix (old code: 80-character cut, no byte fit).

## New findings

1. NIT - `renderer-frame-monitor.service.ts:6`. `CONSOLE_PREFIX` hard-codes `[WARN] RendererFrame:` and the ISO timestamp width. If the log format or context name changes, the cap is wrong. The worst-case test uses the real logger, so it fails in that case. Fix (optional): add a comment that the test guards this link.
2. NIT - `vscode.service.spec.ts` slow-read spec. `mockReturnValueOnce(10).mockReturnValueOnce(8122)` depends on `performance.now` having no other caller before the first `getState`. It is stable now. Fix (optional): use `mockImplementation` with a counter that only reacts after the service starts.
3. NIT - `scriptLog` picks the "largest" field by raw bytes, not escaped bytes. This does not affect correctness (it still terminates and fits), only which field loses characters first.

## Project rules

- No `any`, no `@ts-ignore`, no `as unknown as` in new code. The `as Record<string, unknown>` casts in `vscode.service.ts` are narrowed by a prior object check.
- No swallowed error. The slow-read warning logs only the duration, not the state. Tests assert that no path text or state value reaches the log.
- `pinnedError` and `unpinnedError` (first 200 characters) can contain a path from an RPC error. This was round 1 finding 7 (nit) and stays open. It is local log data only.
- `LoggingService` does not inject `VSCodeService`, so the new `inject(LoggingService)` creates no cycle.
