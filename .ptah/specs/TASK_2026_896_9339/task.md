---
id: TASK_2026_896_9339
status: in_progress
type: FEATURE
title: Routed per-call model for system CLI lanes from live catalogs
depends_on:
  - TASK_2026_895_d988
created: "2026-11-08T22:50:03.787Z"
updated: "2026-11-08T22:50:03.787Z"
description: "Let the routing decision choose a concrete model id for a system CLI lane from that CLI's live catalog and pass it as the per-call model, with CLI-default fallback and requested/actual model logging. Tiers stay a Ptah CLI concept."
estimate: L
labels:
  - agent-lanes
  - token-economy
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Let the routing decision choose a concrete model id for a system CLI lane from that CLI's live catalog and pass it as the per-call model, with CLI-default fallback and requested/actual model logging. Tiers stay a Ptah CLI concept.

Full context, plan and discussion live in [./context.md](./context.md).
