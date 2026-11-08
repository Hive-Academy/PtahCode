---
id: TASK_2026_886_cae4
status: backlog
type: FEATURE
title: Add a task-end hook that disposes the worktree and runs background curation
depends_on: []
created: "2026-11-06T17:27:28.061Z"
updated: "2026-11-06T17:27:28.061Z"
description: "When a task ends, close the task, dispose its worktree under strict safety rules, then queue the curator, the indexer and skill/memory extraction in a bounded background worker."
estimate: L
labels:
  - memory
  - skills
  - worktree
  - hooks
relates_to:
  - TASK_2026_881_5b75
  - TASK_2026_878_5513
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

When a task ends, close the task, dispose its worktree under strict safety rules, then queue the curator, the indexer and skill/memory extraction in a bounded background worker.

Full context, plan and discussion live in [./context.md](./context.md).
