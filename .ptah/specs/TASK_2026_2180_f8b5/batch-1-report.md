# Batch 1 report

## Storm cause (evidence)

The Nov 15 Electron log has 1,045 `index rebuild timing` entries from 11:00 through 11:03 UTC, all `trigger: watcher`; 1,044 report zero carriers and one reports 493. The watcher accepts task-folder events and previously forced a full scan when no writer-carrier snapshot existed. Its 300 ms timer reset on each event, and per-root single-flight allowed unrestricted cross-root scans. This explains repeated empty scans and main-loop load. The historical timing records contain no root or path/event-kind fields, so exact roots, root count, change/create/delete counts, and the specific external writer cannot be established. The new aggregate batch metric records active root count and event-kind/path-class counts without paths. No specific writer can be safely changed from this evidence.

## Changes

- `task-index.service.ts`: bounded folder content fingerprints after published scans; unchanged watcher events skip scan, replacement, push, and timing. Deleted folders are fingerprinted as absent. Watcher batches have a 300 ms quiet period and 1 s maximum wait. Explicit writes and reindex still scan. Added aggregate watcher metrics and routed scans through the global queue. Existing retry backoff remains.
- `task-index-rebuild-queue.ts`: internal FIFO queue with a two-root concurrency cap, one trailing job per root, 64 waiting-root bound, wait/depth callback, and disposal.
- `task-index.service.spec.ts`: regression for unchanged event, content edit, and deletion.
- `task-index-rebuild-queue.spec.ts`: concurrency/FIFO and disposal tests.

## Checks

- Focused Jest: 2 suites passed, 65 tests passed (`.ptah/tmp/batch1-jest.log`).
- Task-specs TypeScript: passed, 0 errors (`.ptah/tmp/batch1-tsc.log`).
- ESLint four changed files: passed, 0 errors, 2 warnings (`.ptah/tmp/batch1-eslint.log`): pre-existing non-null assertion and file length. Nx ProjectGraph cache unavailable, so boundary rule was skipped.
- Scoped Ptah diagnostics after edits: 0 errors.

## Decisions

- Fingerprints hash bounded direct-child file content, because equal size and mtime can hide edits. Cache at most 512 folders and 128 children per folder; an uncacheable folder rebuilds on its next event. Reversible.
- Historical logs cannot attribute an external writer or identify roots; report the evidence and add path-free metrics instead of changing a writer on a guess. Reversible.

## Open issues

- Historical root identities and file event kinds are unavailable in existing logs. New metrics identify event classes and active root count in future incidents.
- Existing `task-index.service.ts` exceeds the 700-line lint warning threshold. No extra file beyond the four-file write set was modified.
