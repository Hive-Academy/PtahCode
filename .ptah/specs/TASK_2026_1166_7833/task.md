---
id: TASK_2026_1166_7833
status: in_review
type: BUGFIX
title: Stop idle child sessions from handing off without need
depends_on: []
created: '2026-11-13T04:20:52.654Z'
updated: '2026-11-13T06:13:40.543Z'
description: >-
  Idle child sessions hit the runtime cap and hand off at once; runtime warning
  wakes idle children; budget handoff gives no reason.
estimate: S
relates_to:
  - TASK_2026_1165_2766
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Idle child sessions hit the runtime cap and hand off at once; runtime warning wakes idle children; budget handoff gives no reason.

Full context, plan and discussion live in [./context.md](./context.md).
