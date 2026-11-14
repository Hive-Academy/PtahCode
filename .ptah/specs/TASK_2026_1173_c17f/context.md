# TASK_2026_1173_c17f — Native Codex subagent visibility (Phase C of TASK_2026_1168_7335)

## Source

- Parent program: TASK_2026_1168_7335 (table in
  `D:/projects/ptah-extension/.claude-worktrees/agent-permissions-program/.ptah/specs/TASK_2026_1168_7335/context.md`).
- Brief: `D:/projects/nx-video/.ptah/specs/TASK_2026_015_1698/PTAH_PERMISSIONS_FIX_PROMPT.md`
  items 6-7 and the acceptance line on native Codex subagents (read-only).
- Symptom: native Codex collaboration subagents (`/root/native_permission_probe`,
  `/root/native_vortex`, `/root/workspace_review`) spawned by a Codex app-server main session ran
  and sent `collaboration.send_message` to the parent, but do not show in the Ptah UI like Claude
  subagents.

## Pre-flight

- Type: BUGFIX. Depth: Full (given by parent). Flow: research -> batch -> implement -> review ->
  tests -> completion. UI change: no new surface (reuse Claude subagent surfaces), so no design
  gate; completion needs dark + light Electron screenshots.
- Gate 0.1: lanes enabled (user global preference: lanes first, codex first; parent brief:
  codex lanes). `ptah_agent_list` at start: codex confirmed room (weekly 69%); Glm and kimi code
  AT LIMIT; claude / Claude Api unknown (same Claude usage, not preferred); antigravity, grok
  installed with unknown limit. Approval mode: lane-review (unattended child session).

## Lane limits

- grok (family grok): usage limit confirmed (HTTP 402 "usage balance exhausted"; list row AT LIMIT,
  weekly 100%, resets 2026-11-19 20:04 UTC). Plan review agent 2402a40f failed with 0 tool calls.
  Fallback: antigravity (other family, limit unknown).

## Boundaries

- Phase A owns permissions and approval routing UI. Phase B owns caller identity
  (`ptah-api-builder.service.ts` resolveSessionId/getParentLevel, `codex-chat-host-ports.ts`),
  MCP handshake, lane report delivery, lane completion dedup. Report needs in their files to the
  parent; do not edit them.

## Starting pointers (orchestrator code read)

- `libs/backend/codex-runtime/src/lib/codex-event-translator.ts:685-707` maps
  `collabAgentToolCall` to `toolStarted`/`toolCompleted` with `agentThreadIds` for `spawnAgent`.
- `agentThreadIds` consumers: `codex-context.ts`, `codex-child-budget-tap.ts`,
  `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts`,
  `codex-history-projector.spec.ts`, `codex-chat-turn-lifecycle.spec.ts`.

## Decisions

See `decisions.md`.
