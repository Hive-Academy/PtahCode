---
id: TASK_2026_2306_livemodels
status: in_progress
type: REFACTORING
title: Live-only provider model lists, delete static fallbacks (closes #1455)
depends_on: []
relatesTo: []
created: '2026-11-22T13:00:00.000Z'
updated: '2026-11-22T13:00:00.000Z'
description: >-
  Delete every hardcoded provider model list (staticModels in provider
  entries, OPENCODE_MODEL_ROUTES, KNOWN_CLOUD_MODELS, Copilot/Kimi/Sakana
  fallbacks). Model lists come only from the live vendor endpoint, then the
  last persisted live catalog, then an explicit "could not load models"
  error. OpenCode protocol/type come from the live gateway payload. Replace
  the drift probe with a live parser-shape check. Closes issue #1455.
executor: claude
estimate: L
---
