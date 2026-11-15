---
id: TASK_2026_2179_c70e
status: in_review
type: BUGFIX
title: Make handoff ack survive a lost record read
depends_on: []
created: '2026-11-15T08:56:36.773Z'
updated: '2026-11-15T09:41:39.726Z'
description: >-
  ptah_session_handoff_ack refuses with 'handoff record missing' after the
  record was found; make it retryable, atomic, and pinned to the record
  workspace.
estimate: M
relates_to:
  - TASK_2026_1168_7335
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

ptah_session_handoff_ack refuses with 'handoff record missing' after the record was found; make it retryable, atomic, and pinned to the record workspace.

Full context, plan and discussion live in [./context.md](./context.md).
