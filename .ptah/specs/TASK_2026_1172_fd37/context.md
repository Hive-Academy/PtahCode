# TASK_2026_1172_fd37 — Phase A: lane permission propagation and approval routing

Program: TASK_2026_1168_7335 (phase A, child session "perm-propagation").
Brief: `D:/projects/nx-video/.ptah/specs/TASK_2026_015_1698/PTAH_PERMISSIONS_FIX_PROMPT.md` (read-only).
Worktree: `D:\projects\ptah-extension\.claude-worktrees\fix-lane-permission-routing-106fb5c3b593`,
branch `fix/lane-permission-routing`.

## Pre-flight

- Type BUGFIX, depth Full (parent instruction). Flow: research -> batch -> implement -> review
  -> tests -> completion.
- Gate 0.1: lanes enabled (user memory: lanes first, codex first). Codex has confirmed room
  (weekly 69%). Glm and kimi code AT LIMIT. Approval mode: lane-review (no user gate; child
  session is unattended).

## Scope

1. Settings persistence: CLI lane permission reverts to Plan after reload.
2. Requested vs effective lane permission (Codex read-only, Claude API ptah-cli in Plan).
3. Plan-mode clarity: explicit blocked state and a mode-change path.
4. Approval routing to the correct session UI.

Out of scope: caller identity resolution, Codex lane MCP handshake, report delivery,
completion dedup (Phase B, TASK_2026_1171_7664); native Codex subagent UI (Phase C).
Do not edit `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts`.

## Early code findings (orchestrator, code-backed, runtime unconfirmed)

- F1 (H1 variant, issue 2, Codex app-server parent):
  `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts:12-15` calls
  `codex.getPermissionLevel(record?.realSessionId ?? callerId)`. For a Codex tab the caller id is
  the tab id (MCP URL `/session/{tabId}`), and the SDK lifecycle has no record for it.
  `CodexChatAdapter.getPermissionLevel` (`libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:202-208`)
  looks up `this.sessions` keyed by session id, not tab id, so it returns `undefined`, and the
  function returns `'plan'`. `CodexChatAdapter.resolveLiveSessionId` (same file 216-228) maps tab
  id -> session id but is not used here. Same pattern in
  `libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts:137-151` (resume path).
  Result: every lane spawned from a Codex app-server tab is capped to plan silently
  (`permissionSource: 'parent-plan'` in `cli-lane-policy-resolver.ts:94-97`).
- F2 (H1 as stated, unattributed caller): `agent-namespace.builder.ts:366-372` — with no caller
  session id, `parentLevel` is `undefined` (no cap). So an unattributed caller does NOT cap to
  plan; H1 as written is disproved for the no-caller case. A bound-but-unknown caller caps.
- F3 (issue 2, Claude ptah-cli lane): `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:247-271`
  derives `permissionMode` from the global `permissionHandler.getPermissionLevel()`, not from the
  resolved lane policy. To verify whether `ptah-cli-registry.ts:801-829` overrides it.

## Settings persistence evidence (issue 1, runtime, this machine)

- `~/.ptah/settings.json` (Electron global file settings, read-only inspection):
  `agentOrchestration.cliLaneDefaults` = `{permission:"yolo", network:"allow"}` for ptah-cli,
  claude, copilot, opencode, antigravity, codex. `codexSandboxMode` = `danger-full-access`.
  `autopilot` = `{enabled:true, permissionLevel:"yolo"}`.
- So storage holds no Plan value. The research lane (research-settings-persistence.md) found no
  code path that resets a saved row to Plan.
- Most likely explanation of "reverts to Plan": the lane's EFFECTIVE permission was Plan because
  of F1 (parent-plan cap from a Codex tab parent). The saved default was not used. Batch 2 makes
  the cap and its source visible in the spawn result and the lane status.
- Second contributor: the provider card badge "Current CLI mode" shows a fixed note, not the
  saved default (`cli-provider-card.component.ts:86-99`).

## Decisions

See decisions.md.
