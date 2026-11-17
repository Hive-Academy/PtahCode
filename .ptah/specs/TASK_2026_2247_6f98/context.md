# Context: writer triggers join the task index watcher debounce

Program: TASK_2026_2181_dbbb, phase P5 (host load), PR 4.

## Problem

`TaskIndexService.applyFolderChange` (the writer path of task tools and RPCs) calls
`scheduleRebuild(root, [folderName], 'write')` at once. A burst of writes (for example
an agent that updates many task files) gives one rebuild for each write. The watcher
events for the same writes are debounced (300 ms, at most 1000 ms) and arrive as a
second rebuild.

## Decision (parent coordinator)

The writer joins the watcher debounce. A burst of writes and their watcher echoes give
one flush. About 150 lines. A separate PR after PR 2 (#1385), so PR 2 stays small.

## Constraints

- `applyFolderChange` keeps its contract: its promise settles after the index contains
  the change, and it rejects when that rebuild rejects.
- When no watcher state exists for the root, keep the direct rebuild.
- Activation and `tasks:reindex` do not change.
- PR 2 (#1385) changes `flush()` in the same file. Keep the change small and local so
  the merge with PR 2 is easy.
