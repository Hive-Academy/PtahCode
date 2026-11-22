---
id: TASK_2026_2303_cost
status: in_review
type: BUGFIX
title: Session sidebar cost and time labels for non-Claude main agents
depends_on: []
relatesTo: [TASK_2026_2302_usage]
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T16:30:00.000Z'
description: >-
  Seen in live tests: (1) a Codex main-agent session shows Time as an
  em dash in the session stats sidebar; (2) per-model rows call
  formatCost(null) for an unpriced model and render a misleading value
  instead of "Not priced". Fix both in the renderer stats components and
  cover with specs; check Codex, Antigravity and Claude rows.
executor: claude
estimate: S
---
