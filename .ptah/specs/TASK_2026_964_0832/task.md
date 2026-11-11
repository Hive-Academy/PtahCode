---
id: TASK_2026_964_0832
status: backlog
type: BUGFIX
title: "Fix sidebar missing child sessions after a stale joined session:list read"
depends_on: []
created: "2026-11-11T21:13:09.910Z"
updated: "2026-11-11T21:13:09.910Z"
description: "A loadSessions caller that joined an in-flight session:list got the old list, so a new child session stayed out of the sidebar."
estimate: XS
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

A loadSessions caller that joined an in-flight session:list got the old list, so a new child session stayed out of the sidebar.

Full context, plan and discussion live in [./context.md](./context.md).
