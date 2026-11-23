---
id: TASK_2026_979_9e1f
status: in_progress
type: BUGFIX
title: Keep Ptah MCP connectors in scheduled, resumed and worktree sessions
description: >-
  Fix #1466, #1468, #1469 - connector overrides missing on scheduled runs and on SDK resume, duplicate MCP servers by URL, harness sync dirtying child worktrees.
depends_on: []
created: 2026-11-23T00:00:00.000Z
updated: 2026-11-23T00:00:00.000Z
---

## Description

GitHub issues #1466, #1468, #1469. Ptah connector MCP overrides are applied only on a fresh
chat:start. Scheduled sessions and resumed sessions lose them, and the same server is also
declared (unauthenticated) in workspace .mcp.json / .vscode/mcp.json under another name.
