---
id: TASK_2026_2288_e1b3
status: in_review
type: BUGFIX
title: Stop corrupt config and transport failures from losing or hiding data
depends_on:
  - TASK_2026_2287_d4a9
created: '2026-11-20T20:10:00.000Z'
updated: '2026-11-20T20:10:00.000Z'
description: >-
  Four bugs the degradation-audit sweep found: corrupt secrets file and MCP
  configs are overwritten, Smithery shows a missing key on a network failure,
  and dependency tools return [] for an error.
executor: claude
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Four bugs the degradation-audit sweep found: corrupt secrets file and MCP configs are overwritten, Smithery shows a missing key on a network failure, and dependency tools return [] for an error.

Full context, plan and discussion live in [./context.md](./context.md).
