# B1 discovery and handoff

## Contract

`PhaseDispatchV1` carries version 1, phase `kind`, rendered discipline `text`, validated `definition` metadata, its `toolProfile`, and optional host-resolved `skills` with a nonempty path or text. `resolvePhaseDispatch` validates before returning a spawn handoff; `parsePhaseDispatch` validates an incoming handoff. A missing or malformed definition fails before either returns. The existing `resolvePhaseDefinition(kind, reader)` call and its `{text, toolProfile, definition}` result remain valid. Legacy `ptah_session_start({task, branch})` and `ptah_agent_spawn({task, role})` remain accepted by their current strict schemas; B2/B3 own their new optional keys.

## B3 SDK call boundary

- Interactive SDK launch: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:513-529` (`invokeWithLoadedQuery`, `queryFn({prompt, options})`). The caller and options assembly are `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:1784-1810` and `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1212-1759`. One-shot call: `sdk-query-runner.service.ts:427-476`. The `sdk-model-service.ts:1278-1300` query is a model-list probe, not the session call.
- SDK subagent prompt/skill and tool options should be applied in `sdk-query-options-builder.ts` at its `build` options object (`1439-1451`, `1550`, `1624-1627`), with final launch inspection in the runner. Do not edit the model-list probe for phase delivery.

## B4 effective-list ownership

| Executor | Effective list / filter boundary |
| --- | --- |
| Session MCP | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:535-568` (`handleToolsList` calls `buildToolSet`, then `isToolPermitted`); execution check at `:927`. This is the advertised callable MCP list. |
| CLI lane MCP | The same `protocol-dispatcher.ts:535-568` per caller; lane SDK built-ins and denials are assembled separately in `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:196-210`. A non-Claude CLI needs its own effective-list adapter at its process/request boundary. |
| SDK session/subagent | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1439-1451,1550,1624-1627` builds `tools` and `disallowedTools`; Ptah MCP tools are filtered by `protocol-dispatcher.ts:535-568`. Static subagent deny source is `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:101-118`. |

## Installed CLI channel probe (2026-11-12)

Probed `Get-Command` and each available binary's `--help`; compared with `ptah_agent_list` status. A help option is evidence of a channel, not proof that a spawned agent loaded a particular skill. B3 should record actual delivery per run.

| CLI | Observed skill channel | Safe fallback |
| --- | --- | --- |
| codex (installed) | Prompt/developer-instructions preamble via Ptah agent list; no explicit skill-path flag found in `codex --help`. | Inline resolved discipline; report `skillDelivery: unavailable` until a skill load is proven. |
| copilot (binary present; Ptah disabled) | `--acp` help says it loads `.github/skills`; path through project config, no per-spawn path flag confirmed. | Inline discipline; report unavailable if disabled or loading unconfirmed. |
| cursor (absent) | Unavailable to probe. | Inline discipline if installed later; report unavailable until probed. |
| antigravity (Ptah installed, binary absent from PATH) | No direct CLI probe possible. | Inline discipline; report unavailable. |
| opencode (binary present; Ptah disabled) | `--prompt` available; no skill argument found in help. | Inline discipline; report unavailable until enabled and verified. |
| grok (installed) | `--agent` accepts an agent definition file path; `--agents` accepts inline JSON definitions. These are agent channels, not a confirmed skill channel. | Inline discipline; report unavailable for skills. |
| claude (installed) | `--append-system-prompt`; SDK `Options.skills` and synced `.claude/skills` in `sdk-query-options-builder.ts:602-610,1110-1138`. | Inline discipline; if skills are disabled/unverified, report unavailable. |
| gemini (binary present) | `gemini skills` command manages discovered skills; no per-spawn skill-path flag found in help. | Inline discipline; report unavailable unless discovery/load verified. |
| kimi (binary present) | `--skills-dir <dir>` explicitly loads skills from a directory. | Use path channel when configured and verified; otherwise inline discipline and report unavailable. |

`ptah_agent_list` also names Pi (absent), Glm (provider lane), and Kimi Code (installed). For every channel with no proven skill load, resolved discipline is still delivered as text and `skillDelivery` must say `unavailable`.

## Verification evidence

- Before and after: `npx ts-node --transpile-only tools/role-census/check-role-census.ts` exited 0 both times. Each reported templates 68, skills 81 (baseline 119), generated-agents 176, docs 116, test 938, source 201, other 120; total 1700 lines in 292 files.
- Scoped Ptah diagnostics on the three changed implementation/spec files reported 0 errors and 0 warnings. `git diff --check` exited 0.
- `npm run verify -- -p @ptah-extension/shared,@ptah-extension/lane-routing` exited 0. Nx reported 4/4 lint/typecheck tasks succeeded and 2/2 test tasks succeeded (0 cache hits). It waited 830 seconds for the shared lock, then released the lock with exit code 0.
- The lane exposed no invocable skill-loading mechanism for this task. Repository instructions and the installed CLI help were read directly.
