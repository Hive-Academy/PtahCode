# TASK_2026_905 — Fix report

## Bug

A Ptah CLI agent with a configured name ("Glm", "kimi code") showed its name for some time.
Then the UI (the usage/limits popover, the lane cards) changed it back to "Ptah CLI".
See `root-cause.md` for the file:line evidence.

## Root cause (summary)

1. `CliSessionReference` did not record the agent name. `agent-events.ts` persisted the ref
   without it, and `lane-restore.ts` restored it without it.
2. `AgentMonitorStore.loadCliSessions` rebuilt the finished cards of a session (session resync,
   `chat:resume`) without `displayName`. `toStatsLimitLaneRun` then used the fallback "Ptah CLI".
3. The stats popover grouped all `ptah-cli` runs under one provider key (`cli`) and took the
   label of `runs[0]`. Two agents merged, and a nameless run could set the label.

## Changes

| File | Change |
| --- | --- |
| `libs/shared/src/lib/types/agent-process.types.ts` | `CliSessionReference.ptahCliName?` |
| `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` | Persist `ptahCliName` beside `ptahCliId` |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-restore.ts` | Restore a non-blank `ptahCliName` |
| `libs/backend/agent-sdk/src/lib/session-metadata-store.ts` | Zod check of persisted `ptahCliName` (non-blank, max 200) |
| `libs/frontend/chat-streaming/src/lib/restored-display-name.ts` (new) | Keep the live card name, else use the ref name |
| `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` | `loadCliSessions` keeps `displayName`; a reopened card takes the respawn name |
| `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts` | Pass `ptahCliId` and `cliLabelSource: 'product'` for a nameless run |
| `libs/frontend/chat-ui/.../plan-limits/lane-tiles.ts` | `laneProviderKey` (cli + ptahCliId), `laneGroupLabel` (newest agent-named run) |
| `libs/frontend/chat-ui/.../plan-limits/stats-limit-view-model(.types).ts` | Provider tiles keyed per Ptah CLI agent; label from `laneGroupLabel` |

"Ptah CLI" is now only the fallback when no run of the group has a name.

## Regression specs

- `agent-events.spec.ts`: persists the name beside the id.
- `lane-restore.spec.ts`: restores the name and drops a blank one.
- `session-metadata-store.spec.ts`: keeps a valid name, drops a 201-char name.
- `agent-monitor.store.spec.ts`: 4 tests (name kept across a rebuild, cold restore from the ref,
  nameless ref, respawn with a new name).
- `session-stats-source.spec.ts`: carries id and name, falls back only without a name.
- `stats-limit-view-model.spec.ts`: two agents are two providers, a nameless restore never
  replaces the name, fallback only when all runs are product-labeled.

## Independent review (codex)

See `review-codex.md`. Verdict: CHANGES REQUESTED, 3 findings.

1. Major — refs persisted before this fix have no name, so a cold restore of an old session
   still shows "Ptah CLI". **Deferred (follow-up).** These refs never recorded a name. A fix needs
   a `PtahCliRegistry` lookup by `ptahCliId` in `session:cli-sessions` / `restoreAgentRecords`
   and in `chat:resume` (`chat-session.service`), which adds new DI to these services and to
   about 12 hand-built specs. New runs and every live session are fixed by this PR.
2. Minor — a newer nameless run could replace a named label. **Fixed** (`cliLabelSource`,
   `laneGroupLabel`).
3. Minor — `ptahCliName` skipped the boundary check. **Fixed** (Zod schema in
   `session-metadata-store.ts`).

## Verification

`npm run verify -- -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/chat-streaming,@ptah-extension/chat-ui,@ptah-extension/chat,@ptah-extension/agent-sdk`
(6 projects), exit code 0:

- lint + typecheck: `12 tasks: 12 succeeded, 4 cached`
- test: `6 tasks: 6 succeeded, 2 cached`

Note: the first run failed in unrelated suites with "Could not locate module marked". The
worktree had no `node_modules`; a junction to the main checkout `node_modules` fixed it
(git-ignored, environment only). No build, serve, e2e or visual check was run.
