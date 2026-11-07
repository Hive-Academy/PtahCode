---
id: TASK_2026_891_b41c
status: in_progress
type: REFACTORING
title: Remove the dead VS Code change-set card branch from the transcript
description: >-
  The chat transcript still renders a change-set card for host="vscode" when the display feed
  is disabled. The feed is enabled whenever the host is Electron, the only host, so the branch,
  the card component and its VS Code-only actions are dead code. Remove them; keep the
  Electron turn summary chip and everything it uses.
depends_on: [TASK_2026_890_e3a7]
created: 2026-11-07T15:40:00.000Z
updated: 2026-11-07T15:40:00.000Z
---

## Description

Found by TASK_2026_890_e3a7 (docs gap fill). The user approved the removal (2026-11-07).
Worktree `.claude-worktrees/remove-vscode-change-set`, branch
`refactor/remove-vscode-change-set`, base `origin/main` @ 05d3bb160.
