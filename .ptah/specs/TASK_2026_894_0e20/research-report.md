# Codex settings consolidation research

## Summary

**Decision:** replace `agentOrchestration.codexAutoCompactTokens` and `agentOrchestration.codexToolOutputTokenLimit` with global budgets; keep `agentOrchestration.codexWebSearch` and move it and sandbox to Codex provider settings. No migration (`.ptah/specs/TASK_2026_894_0e20/decisions.md:7-8`, 2026-11-08). **Verified:** the old numeric keys reach Codex CLI lanes. An exact/short-name search found no reader in Codex chat host or chat runtime; chat needs an explicit global read path.

## Findings

### 1. References

- Definitions/defaults: `libs/shared/src/lib/types/advanced-settings.types.ts:99,215-248` defines Codex group and three controls (120000, 2500, true); global controls are at `:139-210`. `libs/backend/platform-core/src/file-settings-keys.ts:107-113,145-156,350-355` allowlists old and global keys; Codex defaults come from advanced settings. `libs/shared/src/lib/types/rpc/rpc-auth.types.ts:610-625` has settings schemas; `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:403-410,654-661` has agent RPC fields. `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:89-91` exports old keys.
- Backend readers/writers: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:215-238` reads three keys at spawn; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-budgets.ts:21-60` validates/defaults them. `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:204-243,536-542,1125-1139,2011-2043` validates, reads, writes agent config. `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:943,1093` passes budgets to adapter. `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:267-289` separately reads global agent budgets.
- UI: `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts:86-90` mounts context budgets, Codex group and sandbox. `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:70-75,286` reads/writes via generic settings RPC. Sandbox uses agent RPC at `libs/frontend/chat/src/lib/settings/advanced/codex-sandbox-setting.component.ts:454-487`.
- Docs: `apps/ptah-docs/src/content/docs/settings/context-management.md:88,96-100,119` documents old controls and sandbox. Exact-key tests: `libs/shared/src/lib/types/advanced-settings.types.spec.ts:92-115,215`; `libs/backend/platform-core/src/file-settings-keys.spec.ts:282-305,919-921`; `libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts:71-73`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.settings-routing.spec.ts:189-191`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts:1297`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-budgets.spec.ts:10-115`; `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.set-config.spec.ts:633-736`; `libs/backend/rpc-handlers/src/lib/handlers/settings-rpc.handlers.spec.ts:424`; `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.spec.ts:309,434-454`.
- Repository-wide `rg` of exact and short names found no Electron/VS Code package.json contribute entries or e2e harness references. There is no `apps/ptah-extension-vscode` directory in this worktree. No other exact-name product references were found beyond the paths above.

### 2. Current value flow

- CLI: read (`agent-spawn-environment.service.ts:215-238`) → validate (`codex-lane-budgets.ts:41-80`) → process manager (`agent-process-manager.service.ts:943,1093`) → Codex CLI config `model_auto_compact_token_limit`, `tool_output_token_limit`, `web_search="live"|"disabled"` (`cli-adapters/codex/codex-lane-config.builder.ts:105-122`) or app-server profile (`cli-adapters/codex/codex-lane-profile.ts:118-125,190-207`; `libs/backend/codex-runtime/src/lib/codex-lane-thread-config.ts:155-159`). `0` omits numeric overrides (`codex-lane-config.builder.ts:56-59,105-118`; `codex-lane-thread-config.ts:155-159`). App-server Zod accepts nonnegative integers (`codex-execution-profile.ts:97-98`). Unsupported config fallback clears overrides (`cli-adapters/codex/codex-app-server-lane-rejection.ts:27-39`).
- Chat: sandbox is read at `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:513-516`. Exact and short key searches found no chat token-key read in that directory or `libs/backend/codex-runtime/src/lib` outside lane config. **Inference:** chat turns currently use Codex budget defaults absent another generic path; implementation must inspect chat thread/turn start and wire global values there.

### 3. Global mapping evidence

- `compaction.toolOutputBudgetTokens` is the direct output replacement: default 2500; UI minimum 100 (`advanced-settings.types.ts:139-150`). Old Codex key allowed zero (`:228-239`). Ptah already reads global output cap (`libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.ts:192-195`). Codex runtime cap needs its own config override.
- `agentBudget.handoffContextTokens` (default 150000) is a stop/handoff boundary, and `agentBudget.warnRatio` (default .85) is an early warning fraction (`advanced-settings.types.ts:165-183`). `agentBudget.stopWeightedTokens` and `maxDurationMin` are lifetime guards (`:171-189`), unsuitable as auto-compact thresholds. `compaction.threshold` is allowlisted (`file-settings-keys.ts:145`) but absent from advanced UI and its reader is Claude-oriented, accepting 100000–1000000 or unset (`compaction-config-provider.ts:150-171`).

### 5. Other Codex settings in these tabs

`codexWebSearch` and `codexSandboxMode` are the two current Context management controls to move (`orchestration-settings.component.ts:87-89`). The CLI matrix shows Codex model/effort (`libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts:230-234`) and a sandbox note pointing to Orchestration (`cli-lane-default-cell.component.ts:17`); update that note. `codexModel`, `codexReasoningEffort`, `codexAutoApprove` remain allowlisted (`file-settings-keys.ts:107-109`) but are outside the current Context management Codex group.

## Recommended mapping

1. Read validated `compaction.toolOutputBudgetTokens` (2500 default) and pass to Codex `tool_output_token_limit` for lanes **and chat**. Ptah global trimming is live (`advanced-settings.types.ts:149`); Codex process/thread override applies at next start/turn, so describe both timings.
2. For **lanes**, derive `model_auto_compact_token_limit = floor(agentBudget.warnRatio × agentBudget.handoffContextTokens)`. Defaults yield 127500, below 150000 handoff. This is a **recommendation/inference**, not current behavior. For main chat, use that rule only if chat has an agent handoff boundary; otherwise use an explicit shared chat compaction threshold when defined. Do not silently impose lane handoff semantics on chat.
3. Global controls exclude zero (`advanced-settings.types.ts:145-148,165-182`); ignore old persisted zero per no-migration decision. Validate imported/file values before multiplying; require finite positive ratio and safe integer context. Bound the result below the effective model context window where known; if unknown, do not promise compaction before handoff. Define `compaction.enabled=false` behavior explicitly (`compaction-config-provider.ts:161`), preferably omitting Codex auto-compact override. `agentBudget.stopWeightedTokens` and `maxDurationMin` remain independent guards.
4. Keep web-search key/`web_search` transport (`codex-lane-config.builder.ts:122`) and sandbox key/agent RPC flow (`codex-sandbox-setting.component.ts:454-487`). Move their UI controls only.

## Change list

### Shared/settings

1. `libs/shared/src/lib/types/advanced-settings.types.ts:99,213-248` — remove two numeric definitions and Codex context group; retain web-search definition for provider UI. `libs/shared/src/lib/types/rpc/rpc-auth.types.ts:610-625` — remove old numeric schemas, retain web-search. `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:403-410,654-661` — remove numeric agent get/set fields.
2. `libs/backend/platform-core/src/file-settings-keys.ts:107-113,145-153,350-355` — remove numeric keys from allowlist; retain global keys, web-search and sandbox. `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:89-91` — stop exporting removed keys.

### Backend readers

3. `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:215-238`; `cli-adapters/codex/codex-lane-budgets.ts:21-60` — read/validate global values and derive compact threshold; keep web-search read. `agent-process-manager.service.ts:943,1093` passes resulting budgets unchanged.
4. `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-config.builder.ts:105-122`; `codex-lane-profile.ts:118-125,190-207`; `codex-app-server-lane-profile.ts:17`; `libs/backend/codex-runtime/src/lib/codex-lane-thread-config.ts:155-159` — retain Codex wire names but feed global-derived numbers. Check related validation/fallback/interfaces at `codex-execution-profile.ts:97-98`, `codex-runtime.types.ts:98-99`, `codex-app-server-lane-rejection.ts:27-39`.
5. `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:204-243,536-542,1125-1139,2011-2043` — remove old numeric config RPC handling; retain web-search. Add global override read to chat start near `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:513-516` and the runtime thread/turn entry point it invokes; no existing chat numeric reader can simply be renamed.

### Frontend UI

6. `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts:86-90` — remove Codex group/sandbox from Context management. Mount web-search plus existing sandbox component in `libs/frontend/chat/src/lib/settings/providers/connection-detail-drawer.component.ts` Codex provider settings area; confirm correct tab in implementation. Generic group uses settings RPC (`advanced-settings-group.component.ts:70-75,286`); sandbox retains agent RPC. Update `cli-lane-default-cell.component.ts:17` note.

### Tests

7. Update exact-key tests listed in Findings 1. Add lane cases for invalid globals, zero old persisted value ignored, threshold/model-window bound and next-start apply. Preserve Codex wire tests at `libs/backend/codex-runtime/src/lib/codex-lane-thread-config.spec.ts:92-93`; add a chat-turn global override test, currently absent. Update provider UI placement tests, including `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.spec.ts:309,434-454`.

### Docs

8. `apps/ptah-docs/src/content/docs/settings/context-management.md:88,96-100,119` — remove old numeric controls, explain global mapping and timing, move web-search/sandbox explanation to Codex provider docs linked at `:100,160`. Do not document old-value migration because none is requested.

## Risks

- Old zero meant Codex default; global output minimum is 100 (`advanced-settings.types.ts:145-148,228-238`). Removing persisted old settings changes that behavior as requested.
- Derived default 127500 differs from old 120000 (`advanced-settings.types.ts:165-183,215-225`). The Codex model context window may be smaller; cap safely when model metadata exists.
- Global UI says live, whereas Codex CLI/app-server overrides are fixed at start/config (`advanced-settings.types.ts:137,149,225,238`; `codex-lane-thread-config.ts:155-159`). Communicate apply timing.
- No build, tests or e2e were run, per task. No product code changed.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Recommend global output cap | Global `compaction.toolOutputBudgetTokens`; retain Codex key | Same 2500 default and semantics (`advanced-settings.types.ts:139-150,228-239`); user decision (`decisions.md:7`) | Yes |
| Recommend lane compact at `floor(warnRatio × handoffContextTokens)` | Derived early boundary; Claude-oriented `compaction.threshold`; retain old key | Global boundaries (`advanced-settings.types.ts:165-183`); threshold reader (`compaction-config-provider.ts:150-171`) | Yes |
| Keep web-search key; move web-search and sandbox UI | Move controls; remove capabilities | User decision (`decisions.md:8`); current UI (`orchestration-settings.component.ts:87-89`) | Yes |

## Clarifications Needed

None for this bounded research recommendation. Implementation must verify Codex chat configuration API and model-window availability before finalizing chat override handling.
