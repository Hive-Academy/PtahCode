---
id: TASK_2026_2242_f87b
status: in_review
type: DEVOPS
title: Run verify checks in worktrees without the Nx daemon
depends_on: []
created: "2026-11-16T20:25:05.366Z"
updated: "2026-11-16T20:25:05.366Z"
description: "P2 of the performance program: scripts/verify.mjs sets NX_DAEMON=false for checks in a worktree, to stop one 170-270 MiB daemon per worktree."
estimate: S
relates_to:
  - TASK_2026_2181_dbbb
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

P2 of the performance program: scripts/verify.mjs sets NX_DAEMON=false for checks in a worktree, to stop one 170-270 MiB daemon per worktree.

Full context, plan and discussion live in [./context.md](./context.md).
