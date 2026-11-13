---
id: TASK_2026_1167_ca65
status: in_review
type: BUGFIX
title: Keep turns alive while a background SDK task works
depends_on: []
created: '2026-11-13T07:05:35.475Z'
updated: '2026-11-13T07:24:06.824Z'
description: >-
  No-activity watchdog aborts a root turn at 180 s while a backgrounded SDK task
  still reports progress; track root-owned background tasks with a 600 s quiet
  bound.
estimate: S
relates_to:
  - TASK_2026_1165_2766
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

No-activity watchdog aborts a root turn at 180 s while a backgrounded SDK task still reports progress; track root-owned background tasks with a 600 s quiet bound.

Full context, plan and discussion live in [./context.md](./context.md).
