---
id: TASK_2026_2181_dbbb
status: done
type: BUGFIX
title: Fix slow ptah_agent_spawn and lost lane completion signals
depends_on: []
created: "2026-11-15T12:50:41.725Z"
updated: "2026-11-15T12:50:41.725Z"
description: "ptah_agent_spawn takes 61-73 s in the host so the MCP call times out and causes duplicate lanes; agent-lane-completed signals do not reach the parent session."
estimate: M
labels:
  - performance
  - agent-lanes
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

ptah_agent_spawn takes 61-73 s in the host so the MCP call times out and causes duplicate lanes; agent-lane-completed signals do not reach the parent session.

Full context, plan and discussion live in [./context.md](./context.md).
