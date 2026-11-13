---
id: TASK_2026_1161_64ef
status: in_review
type: BUGFIX
title: Back off review status sync on GitHub permission errors
depends_on: []
created: '2026-11-12T20:23:58.511Z'
updated: '2026-11-12T21:13:31.702Z'
description: >-
  Stop the 60s per-row retry storm when the review bot token cannot write commit
  statuses; name the missing permission.
estimate: S
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Stop the 60s per-row retry storm when the review bot token cannot write commit statuses; name the missing permission.

Full context, plan and discussion live in [./context.md](./context.md).
