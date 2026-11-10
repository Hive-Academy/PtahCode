---
id: TASK_2026_894_0e20
status: done
type: BUGFIX
title: Fix the Settings design regressions in CLI and orchestration tabs
description: >-
  Fix broken layouts in Settings (Ptah CLI shared defaults, CLI agents matrix, routing
  capability matrix, rotation picks) and move Codex-only settings out of Context management.
depends_on: []
created: 2026-11-08T18:40:00.000Z
updated: 2026-11-08T18:40:00.000Z
---

## Description

After the agent-budget and CLI lane default features landed, several Settings surfaces lost
their design: the Ptah CLI shared defaults card renders as a squeezed column, the CLI agents
matrix wraps capability chips and squeezes the lane-defaults column, the routing capability
matrix and the rotation "last pick" list render as raw text and tables, and Codex-only
settings (auto-compact, tool output limit, web search, sandbox) still sit in the Context
management tab instead of the Codex provider settings.
