# Root cause — Ptah CLI agent name reverts to "Ptah CLI"

## Symptom

A Ptah CLI agent with a configured name ("Glm", "kimi code") shows its name while it runs.
Later the usage/limits popover and the agent card show "Ptah CLI". `ptah_agent_list` still
shows the right names, because it reads the agent registry directly.

## Cause 1 — the persisted reference has no name (backend)

- `libs/shared/src/lib/types/agent-process.types.ts` `CliSessionReference` had `ptahCliId`
  but no `ptahCliName`. `AgentProcessInfo` has `ptahCliName`.
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` (the `ref` literal at about
  line 736) persists `ptahCliId` and does not persist `ptahCliName`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-restore.ts` `restoreLaneIdentity`
  (line 76) restores `ptahCliId` only, so a backend-restored lane also has no name.

## Cause 2 — a session resync rebuilds finished cards without the name (renderer)

- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` `loadCliSessions`
  (line 2071) removes every non-running card of the session and rebuilds it from
  `CliSessionReference`. The rebuilt card (line 2111-2150) sets `ptahCliId` but no
  `displayName`. Only `liveUsageOf` carries usage and model from the old card.
- `loadCliSessions` runs from `SessionLoaderService.restoreCliSessionsForSession`, which the
  chat view calls when its resolved session id is known or changes
  (`chat-view.component.ts:1461`), and from `chat:resume`. So the run shows "Glm" while it is
  live, the run ends (here with the usage-limit error), the reference is persisted, and the
  next resync swaps the card for a nameless copy. That is the "for a portion of time" effect.
- `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts:86`
  `cliLabel: agent.displayName || CLI_LABELS[agent.cli]` then gives `'Ptah CLI'`.

## Cause 3 — the popover merges every Ptah CLI agent into one tile

- `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.ts:83-89`
  groups provider tiles by `run.cli`, and `lane-tiles.ts:85` keys lane tiles by
  `cli + role`. All `ptah-cli` runs ("Glm" on Ollama Cloud, "kimi code") share one tile.
  Its label is `runs[0].cliLabel`, so an older nameless restored run names the whole group.

## Other "Ptah CLI" literals (checked, not changed)

- `chat-attention-source.service.ts:181`, `chat-attention-host-message-handler.service.ts:247`:
  provider of a chat tab (`tab.providerId === 'ptah-cli'`), not a CLI lane agent.
- `task-agent-discovery.service.ts:75`: already uses `cli.ptahCliName` first.
- `cli-orchestration-matrix.component.ts:621`: lane-default settings for the CLI type.
- `agent-monitor-panel.component.ts:134,436` and `session-agent-roster.ts:162` read
  `displayName`, so cause 2's fix also fixes them.
