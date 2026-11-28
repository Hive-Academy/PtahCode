---
id: TASK_2026_2329_7f4a
status: in_review
type: BUGFIX
title: Fix Full Auto (YOLO) permission enforcement for Antigravity and Codex main chat
description: >-
  Ensure Full Auto (YOLO) auto-approves tool and MCP permission requests in Antigravity (ACP) and Codex main chat sessions, and wires per-session permission level propagation and readback.
depends_on: []
created: 2026-11-26T19:23:00.000Z
updated: 2026-11-26T19:23:00.000Z
---

## Description

When Antigravity (Gemini) or Codex is selected as the main chat provider and Full Auto (`yolo`) is enabled:

1. Antigravity (`agy acp`) chat sessions run without `--dangerously-skip-permissions` (so mid-session downgrades work) and map `yolo` to ACP mode `'auto'`, which still emits `session/request_permission` for some tool/MCP calls (e.g. `mcp_ptah_lane_ptah_agent_list`). `acp-session-runtime.ts` unconditionally forwards every chat permission request to the UI approval sink without checking `livePermission === 'yolo'`.
2. Codex (`codex-app-server`) chat sessions run with `approvalPolicy: 'on-request'` and rely on `CodexApprovalBridge` + `codexPermissionPolicy`, where `fileChange` requests with `grantRoot` or extra metadata keys and all native child thread approvals (`isChild()`) bypass `yolo` and force `'present'`.
3. `ProviderSessionChatSession` ignores explicit `config.permissionLevel` on start, and `config:autopilot-get` only queries Claude's `SessionLifecycleManager` (`lifecycle.find`) when reading live `sessionPermissionLevel`, returning `null` for Codex and Antigravity sessions.
