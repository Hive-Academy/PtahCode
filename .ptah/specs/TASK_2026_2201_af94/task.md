---
id: TASK_2026_2201_af94
status: in_review
type: BUGFIX
title: Stop the OpenRouter pricing fetch storm after a failed catalog fetch
depends_on: []
created: "2026-11-16T14:31:49.399Z"
updated: "2026-11-16T14:31:49.399Z"
description: "ensureCatalog keeps no failed result, so each price lookup starts a new fetch while the network is down"
estimate: XS
relates_to:
  - TASK_2026_2198_569c
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

ensureCatalog keeps no failed result, so each price lookup starts a new fetch while the network is down

Full context, plan and discussion live in [./context.md](./context.md).
