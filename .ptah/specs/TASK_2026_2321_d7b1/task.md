---
id: TASK_2026_2321_d7b1
status: backlog
type: BUGFIX
title: Fix grep ignored-root zero result and Code Mode nav discoverability
depends_on: []
created: "2026-11-23T20:07:55.200Z"
updated: "2026-11-23T20:07:55.200Z"
description: "ptah_grep falls back to the Node walk when a parent repo ignores the root, uses the shared code-index exclude predicate, and Code Mode lists the code namespace with grep and readSymbol."
estimate: M
relates_to:
  - TASK_2026_2320_15a6
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

ptah_grep falls back to the Node walk when a parent repo ignores the root, uses the shared code-index exclude predicate, and Code Mode lists the code namespace with grep and readSymbol.

Full context, plan and discussion live in [./context.md](./context.md).
