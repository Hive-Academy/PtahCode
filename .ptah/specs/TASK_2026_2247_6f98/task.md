---
id: TASK_2026_2247_6f98
status: in_progress
type: REFACTORING
title: Let writer triggers join the task index watcher debounce
depends_on: []
created: "2026-11-16T23:07:33.000Z"
updated: "2026-11-16T23:07:33.000Z"
description: "P5 PR 4: applyFolderChange joins the watcher debounce so a burst of writes gives one rebuild."
executor: codex
estimate: S
labels:
  - perf
  - electron
relates_to:
  - TASK_2026_2181_dbbb
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

P5 PR 4: applyFolderChange joins the watcher debounce so a burst of writes gives one rebuild.

Full context, plan and discussion live in [./context.md](./context.md).
