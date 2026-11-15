---
id: TASK_2026_1185_5a1e
status: in_review
type: BUGFIX
title: "Stop chat:start from waiting on the MCP registration queue"
depends_on: []
created: "2026-11-15T02:00:00.000Z"
updated: "2026-11-15T02:00:00.000Z"
description: chat:start waits 14-51 min in the unbounded .mcp.json reconcile queue; add fast path, deadline, scoped work and coalescing
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

chat:start waits 14-51 min in the unbounded .mcp.json reconcile queue; add fast path, deadline, scoped work and coalescing

Full context, plan and discussion live in [./context.md](./context.md).
