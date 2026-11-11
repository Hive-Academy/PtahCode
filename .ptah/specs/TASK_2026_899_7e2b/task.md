---
id: TASK_2026_899_7e2b
status: done
type: REFACTORING
title: Remove the unused closeSourceAfterAutoHandoff setting
depends_on: []
created: "2026-11-09T10:00:00.000Z"
updated: "2026-11-09T10:00:00.000Z"
description: "Remove sessionBudget.closeSourceAfterAutoHandoff. Since TASK_2026_898 the ack-driven close no longer reads it (user decision: option A)."
estimate: S
labels:
  - orchestration
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Remove sessionBudget.closeSourceAfterAutoHandoff. Since TASK_2026_898 the ack-driven close no longer reads it (user decision: option A).

Full context, plan and discussion live in [./context.md](./context.md).
