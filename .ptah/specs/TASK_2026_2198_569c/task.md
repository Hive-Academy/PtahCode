---
id: TASK_2026_2198_569c
status: in_review
type: BUGFIX
title: Stop main-loop stalls from usage summary and repository backfill
depends_on: []
created: "2026-11-16T09:41:20.954Z"
updated: "2026-11-16T09:41:20.954Z"
description: "Electron main loop blocks 30-55 s per minute around analytics:spendSummary and the repository identity backfill."
executor: codex
estimate: M
labels:
  - performance
  - electron
  - main-loop
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Electron main loop blocks 30-55 s per minute around analytics:spendSummary and the repository identity backfill.

Full context, plan and discussion live in [./context.md](./context.md).
