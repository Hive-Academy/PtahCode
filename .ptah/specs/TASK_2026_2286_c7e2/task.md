---
id: TASK_2026_2286_c7e2
status: in_progress
type: BUGFIX
title: Run startup CLI probes off the Electron main thread
depends_on: []
created: '2026-11-20T18:10:00.000Z'
updated: '2026-11-20T18:10:00.000Z'
description: >-
  CLI detection and readiness probes call child_process directly on the
  Electron main thread; on Windows each spawn blocks for seconds and RPCs time
  out at startup.
executor: claude
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

CLI detection and readiness probes call child_process directly on the Electron main thread; on Windows each spawn blocks for seconds and RPCs time out at startup.

Full context, plan and discussion live in [./context.md](./context.md).
