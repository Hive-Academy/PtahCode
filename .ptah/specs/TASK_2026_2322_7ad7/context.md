# Context — TASK_2026_2322_7ad7

Harden the code index after PR #1491 (TASK_2026_2312_c3ef) and fix the indexer findings (a), (b),
(d second bullet) of the nav benchmark (PR #1493).

## Batches (file-disjoint)

| Batch | Scope | Libs | Owner |
| --- | --- | --- | --- |
| A | Approval waits are not foreground-busy | agent-sdk | coordinator |
| B | Record `last_indexed_at` after a succeeded background run | memory-curator | coordinator |
| C4, C5 | `finalVersion` counts peer migrations; real 2-connection 0077 race test | persistence-sqlite | lane 1 |
| C1, C6 | Twin transitions, cached twin directory reads | thoth-runtime | lane 2 |
| C8 | Parse `.mjs/.cjs/.cts` | workspace-intelligence/ast | lane 3 |
| C2, C3, C7, C9 | Per-file record, stats for files without a record, symlink containment, parse/embed split | workspace-intelligence indexer | lane 4 |

## Decisions

1. A turn blocked on a permission or AskUserQuestion prompt is not foreground-busy (parent decision).
   State is read from `SdkPermissionHandler.pendingRequests` and the AskUserQuestion registry,
   no new tracker. A `ChangeNotifyingMap` and `PendingResponseRegistry.onChange` publish changes.
2. B writes `last_indexed_at` and `git_head_sha` in `settleCensus` for a succeeded background census.
   `last_error` and `symbols_cursor` stay untouched.
3. Local env: a `node_modules` symlink to the main checkout is needed so Jest finds `marked`
   (`jest.preset.js` resolves it relative to the worktree). It is git-ignored.
