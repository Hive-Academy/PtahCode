---
id: TASK_2026_923_481f
status: in_review
type: BUGFIX
title: Fix Electron main event-loop stall at startup
depends_on: []
created: '2026-11-10T17:47:58.464Z'
updated: '2026-11-10T19:52:43.450Z'
description: >-
  Main process event loop is starved about 27 s at startup (pre-migration
  backup, sync SQLite work, silent periods).
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Main process event loop is starved about 27 s at startup (pre-migration backup, sync SQLite work, silent periods).

Full context, plan and discussion live in [./context.md](./context.md).
