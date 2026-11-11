# Context — TASK_2026_896_9339

## Problem and scope

`ptah_agent_spawn` accepts `modelTier: opus | sonnet | haiku`, but system CLI lanes do not consistently translate it into a runnable model and effort. The desired selection must come from the installed/authenticated CLI's runtime catalog. A tier with no defensible catalog match must leave the model unset so that CLI chooses its own default. Log requested tier/model and the model actually observed during the lane; distinguish an unobserved actual model from the selected model.

Prerequisite PR #1015, merge `708fe72ed`, added `lane-routing` phase tier/effort policy (`libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.ts:12-43`) and routing contracts. Its policy gives architecture/review phases opus/high or xhigh, light mechanical/test/docs work haiku/low, and general work sonnet/medium. That routing recommendation is upstream of this task; this task translates the tier for a specific CLI at spawn time.

## Current behavior and evidence

| Fact | Evidence |
| --- | --- |
| MCP dispatcher forwards `model`, `modelTier`, and `effort` to system CLI spawning, while the `ptahCliId` path defaults tier to sonnet. | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts:490-518` |
| The system lane model resolver turns `modelTier` into a model only when `cli === 'claude'`; explicit model then per-CLI setting then CLI default are current precedence. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:189-209`; `lane-spawn-policy.ts:251-264` |
| Effort is resolved separately from tier: explicit spawn effort, setting, inherited chat effort, reviewer default, then CLI default. Cursor/OpenCode have no effort mapper. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:305-384` |
| Spawn logging records `model` and a lane policy line with model source and effort, before calling the adapter. It currently lacks distinct requested-tier and observed-actual fields. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:497-506,929-944,980-1020,1042-1083` |
| Every system adapter has `listModels()`, but Copilot returns a static list and Cursor can return curated fallback rows. Those rows cannot be treated as live tier evidence. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:275-276`; `cursor-cli.adapter.ts:319-337`; `cli-adapter.interface.ts:62-66,361` |
| Codex already validates app-server `model/list` rows, exposes the runnable `model` value, and bounds its catalog call to 8 seconds. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.ts:6-35`; `codex-app-server-lane-catalog.ts:4-44` |
| Antigravity, Grok, OpenCode and Pi probe their installed binaries for models; Claude uses its native model service. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:526-547`; `grok-cli.adapter.ts:212-224`; `opencode-cli.adapter.ts:402-412`; `pi-cli.adapter.ts:288-309`; `claude-cli.adapter.ts:140-151` |

## Constraints

- Plan only; do not edit production code. Work only in this worktree. Do not commit, push, or open a PR.
- Electron is the priority host. Preserve platform-cli and cli-engine composition and public spawn contracts.
- A catalog ID, never a static vendor list or display name alone, must be the runnable model. A curated fallback or failed catalog is not live evidence.
- Preserve explicit model and effort precedence. Never translate a tier into an invented model; no matching row means omit model and use CLI default.
- Verify only with `npm run verify -- -p <projects>` on affected projects; never run build, serve, dev, e2e, package targets, or workspace-wide checks. Do not raise degradation-audit baselines. No `any`, `@ts-ignore`, or `as unknown as`; use Zod at boundaries and DI tokens in `di/tokens.ts`.

## Open questions for implementation evidence

- Copilot: find a supported runtime CLI/SDK catalog command. If none exists, retain `listModels()` for UI compatibility but report catalog unavailable to tier routing and use CLI default.
- Cursor: can the SDK catalog be queried without an API key, and can the adapter distinguish live rows from its curated fallback? Tier routing must use only the live branch.
- For each adapter, determine whether a confirmed model ID appears in start/usage/completion events. When it does not, log actual as `unobserved`, never copy the requested model into the actual field.
- Check how resumed sessions constrain model changes; the tier map must not silently override a resume's existing session model.
