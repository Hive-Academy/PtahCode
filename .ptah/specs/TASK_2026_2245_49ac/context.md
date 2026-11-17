# TASK_2026_2245_49ac — P5 PR 2: rebuild only changed task folders

Program: TASK_2026_2181_dbbb (P5, host load). PR 1 (measurement): TASK_2026_2241_c297, PR #1380, merged.

## Evidence (production Electron log, 2026-11-16, 22 h, info level)

- 680 rebuilds of 250 ms or more: watcher 652 (96%), activation 20, writer 8 (1%).
- Rebuild totalMs p50 1273 ms, max 405591 ms. Queue wait max 196 s. Up to 505 carriers.
- Each flush is a full scan (`task-index.service.ts` `rebuild()` calls `scanner.scan(root)`)
  and a full `replaceWorkspace`.

## Decision (program coordinator)

- Watcher and writer triggers rebuild only the task folders that changed (folder scan plus
  `upsertMany` / `deleteByFolder` in one transaction). A removed folder deletes its entry.
- Activation and `tasks:reindex` keep the full scan.
- When the changed set is unknown (watcher error, overflow, too many pending folders), fall back
  to the full scan.
- The writer debounce (`applyFolderChange` joins the watcher debounce) is a separate, later PR.

## Required tests

- A changed folder updates only its entry.
- A deleted folder removes its entry.
- A new folder adds its entry.
- A burst of events for many folders collapses to one flush.
- A fallback to the full scan when the changed set is unknown.

## Review answers

Round 1 (`code-review.md`, Glm, request changes):

- B1: fixed. The rebuild queue merges `forceFull` with OR. Tests in the queue and service specs.
- M1: fixed. Folder mode needs a written full scan (scan metadata in the store).
- M2: fixed. An unknown-only batch that fails is retried with a full scan.
- m1: fixed. The counts come from the data read before the write.
- m2: fixed. Both stores reject folder changes before a written full scan. The service
  then retries with a full scan, so the writer RPC gets no error.
- m3: fixed. The docblock states when folder results equal a full scan.
- Nits: open. They are not one-line changes and do not change behavior.

Round 2 (`code-review-2.md`, Glm, no blocking findings):

- Major 1: fixed. A failure after `scanFolders` resets the folder scan, so the full scan runs.
- Major 2: fixed. The store metadata is read only after the cheap checks and `isReady()`.
- Minor 1: fixed. The unknown retry uses the same delay steps as named folders.
- Minor 2: answered in the docblock. The gap is short and the re-warm full scan repairs it.
- Minor 3: fixed. New test for a created folder that resolves a dangling parent.

Details: `implementation-report.md` and `review-2-fixes.md`.
