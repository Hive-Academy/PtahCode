# Code Logic Review (digest path) - TASK_2026_2309_5bea

Verdict: REVISE. Score: 6/10.
Review family: reviewer = anthropic (in-process subagent), implementer = codex

Scope: `contained-task-folder.ts`, `task-digest.service.ts`, `task-digest-rules.ts`, the digest diffs in
`task-index.service.ts`, `tasks-rpc.handlers.ts`, `tasks-rpc.schema.ts`, `scenario-sanitizer.ts`, the shared types,
and `session-task-reader.ts`. Tests were not run. Finding 1 was reproduced with a node one-liner.

Gate 2 round 2 corrections: all five are present in code.
- Depth 4 and `too_many` are kept: `task-index.service.ts:547-552`.
- `directory`, `too_large`, `rejected` are kept: `task-index.service.ts:512-521`.
- Fresh `tasks:readFolderMarkdown` check with post-await revalidation: `session-task-reader.ts:327-350`.
- `NESTED_LIST_CAP = 64`: `task-digest.service.ts:33`. Every list is charged (`:95`). Budget is checked before enqueuing (`:126`). Unvisited summaries are marked `truncated` (`:92`, `:129`).
- Equal-mtime tie-break takes the smaller name: `task-digest-rules.ts:96`.
- Failed, unstable or transient results are not memoized: `task-digest.service.ts:41`, `:131`, `:166`, `:181`.

| Rule | Result | Evidence |
| --- | --- | --- |
| A Containment | PASS | `validSegment` regex excludes `..`, separators and NUL (`contained-task-folder.ts:21`). Every ancestor is checked with lstat plus realpath containment (`:35-45`, `:111-115`). Canonical path is checked before and after `readDirectory` (`:62-76`) and after read (`:98-107`). No-follow read with dev/ino identity and a post-read lstat is in `electron-file-system-provider.ts:119-137`. RPC schema parse and `resolveRoot` authorization are in `tasks-rpc.handlers.ts:679-681`. Errors are sanitized (`:1501-1508`). The digest type has no absolute path. |
| B Bounded I/O | PASS | Caps are in `task-digest.service.ts:32-38`. Reads are capped before decode, and `stream: true` avoids a fatal error on a split code point (`contained-task-folder.ts:121-122`). Digest depth is 2 (`:96`). `listFolderEntries` keeps 4 and `too_many`. |
| C Determinism / cache | PASS with caveat | Code-unit comparator (`:52`). Cache keys use the canonical path. Digest cache is bounded to 32 and fragment cache to 1024 (`:60-67`). A warm hit returns before any read (`:41-44`). Caveat: Finding 4. |
| D Rules pure / regex safe / severity | FAIL | Pure (no fs, no clock). Filename patterns are safe because names are at most 255 characters. The ReDoS in Finding 1 and the severity errors in Finding 2 fail this rule. The digest type has no `branch` or `pr`. |
| E Renderer | PASS with caveat | Stale-response guard is `isCurrent` at `session-task-reader.ts:422`, with `dirty` re-read at `:451-456`. Failure is surfaced through `setError` (`:461-466`) and retry works (`:257`). `openDocument` revalidates after the await (`:335-350`). Destroy clears the timer (`:245-248`). The front-matter regex at `:109` is linear. Caveat: Finding 5. |
| F Concurrency | PASS | `inFlight` dedupes by root and task (`task-digest.service.ts:147-155`). A shared rejection is deleted in `finally`, so it does not poison later calls. |
| DI | PASS | The token is registered in `register.ts` and listed in `expected-resolvable.ts`. Only Electron constructs `TasksRpcHandlers`. |

## Findings

### Blocking

1. **Quadratic regex on whitespace blocks the main process.**
   - File: `task-digest-rules.ts:191` (`/^\s*[-*]\s+\[([ xX])\]/gm`) and `:193` (`/^\s*status:.../gim`).
   - Cause: under the `m` flag, `\s*` also matches newlines. At every line start the regex consumes all remaining blank lines and then backtracks, so the cost is O(n^2).
   - Scenario: a `tasks.md` or `batches.md` of up to 64 KiB (`EXTRACTION_MAX_BYTES`) made of blank lines or whitespace. Reproduced with a node one-liner: 65536 newlines took about 8.5 s for each regex, and the extraction runs in the Electron main process. A hostile cloned repo can freeze the app each time the digest recomputes.
   - Fix: use `[ \t]*` instead of `\s*` in both patterns. Alternatively scan per line with `split` and test each line.

### Serious

2. **Review severity counts are wrong in both directions.**
   - Inflated: `task-digest-rules.ts:157` treats `|` as a list marker. A summary-table row such as `| Serious issues | 2 |` is counted as one serious item, and `| Moderate issues | X |` counts as one moderate item. Reproduced: the regex returns `Serious` for that row. Every review that follows the standard template gains +1 serious and +1 moderate.
   - Undercounted: `:154-156` resets `sectionSeverity` on every heading. Items under `### Title` sub-headings inside `## Serious issues` (the standard review shape, with `- File:` bullets) therefore count as 0.
   - Fix: only count table rows when the first cell is exactly a severity tag and the row is not a summary-label row. Keep the section severity until a heading of the same or a higher level ends the section, and count `###` headings under a severity section as items.

### Moderate

3. **An unreadable or skipped progress document looks like "no progress".**
   - File: `task-digest.service.ts:109-110`, with the reads at `:87-107`.
   - Scenario: `batches.md` fails to read or is skipped by the `MAX_READS` cap. `progressText` returns `''`, the extractor returns `null`, and the digest omits `progress` with no top-level marker. Only the per-document `extraction` field says why.
   - Fix: set `progress` to `null` explicitly and add a reason, or expose `progress.unavailable`.

4. **An invalid carrier looks the same as a missing task.**
   - File: `task-digest.service.ts:174` and `:208-209`.
   - Scenario: a `task.md` with a parse error returns `null`, which the reader renders as "task missing" (`session-task-reader.ts:433-436`).
   - Fix: return a typed `invalid_carrier` outcome, or throw a coded error.

5. **The first digest failure leaves the file list empty.**
   - File: `session-task-reader.ts:411` and `:373-379`.
   - Scenario: when the first load fails, `data` is `sectionData(link, null)` with `documents: []`. This does not meet "file list stays usable on digest failure" for a first-time failure.
   - Fix: fall back to the file list from `listFolderEntries`, or state the limitation in the requirements.

### Minor

6. **Fragment cache trusts size and mtime.**
   - File: `task-digest.service.ts:162`.
   - Scenario: a same-size rewrite within the filesystem's mtime resolution returns stale text. The plan accepts this. It is noted only for completeness.

## Five logic questions (short)

1. Silent failure: Findings 3 and 4.
2. Unexpected user action: a task folder with a hostile `tasks.md` freezes the app (Finding 1).
3. Wrong answer from valid input: Finding 2.
4. Dependency failure: transient read failures are not cached and surface as a sanitized error. No other gap found.
5. Missing: a reason for "progress unavailable" (Finding 3).
