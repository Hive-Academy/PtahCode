---
id: TASK_2026_2318_3dc3
status: in_review
type: BUGFIX
title: Emit full outer-class chain for nested class members in ptah_ast_analyze
depends_on: []
created: '2026-11-23T14:33:36.295Z'
updated: '2026-11-23T16:27:56.325Z'
description: >-
  Truncated ast_analyze output names nested-class members as Inner.run;
  ptah_read_symbol needs Outer.Inner.run or plain run.
estimate: S
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Truncated ast_analyze output names nested-class members as Inner.run; ptah_read_symbol needs Outer.Inner.run or plain run.

Full context, plan and discussion live in [./context.md](./context.md).
