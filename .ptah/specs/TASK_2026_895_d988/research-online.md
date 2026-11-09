# Dynamic model selection for Ptah (checked 2026-11-09)

Decision served: how to choose executor, model tier and effort per batch while allowing vendor defaults to evolve. “Undated” means the live documentation gives no update date. **Verified** labels cite documentation; **Inference** labels identify recommendations.

## 1. Claude Code subagents

### Findings

- **Verified, undated:** Frontmatter `model` accepts `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`. `opusplan` is documented as a session setting (Opus planning, Sonnet execution), but subagent frontmatter support is **UNVERIFIED**. [Subagents](https://code.claude.com/docs/en/sub-agents#choose-a-model); [model aliases](https://code.claude.com/docs/en/model-config#model-aliases).
- **Verified, undated:** An Agent tool call can override `model` per invocation with a family alias only, not a full ID or `inherit`. Since v2.1.251 precedence is call → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → parent. Earlier versions put the environment variable first. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides most choices in v2.1.257+. [Subagents](https://code.claude.com/docs/en/sub-agents#choose-a-model).
- **Verified, undated:** `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` pin alias resolution. `settings.json` `model` is an initial choice; `availableModels` restricts named choices; `enforceAvailableModels: true` is needed to restrict Default (v2.1.175+). A forbidden agent choice can be substituted. [Model configuration](https://code.claude.com/docs/en/model-config#control-the-model-users-run-on); [subagents](https://code.claude.com/docs/en/sub-agents#choose-a-model).
- **Verified, undated:** Frontmatter `effort` accepts `low|medium|high|xhigh|max`, subject to model support. Per-call effort for non-fork agents requires v2.1.292+; `CLAUDE_CODE_EFFORT_LEVEL` outranks it. [Subagents](https://code.claude.com/docs/en/sub-agents#choose-an-effort-level).

### Implication for Ptah

- Change hardcoded agent IDs to aliases or `inherit`; route batch tier through the Agent call where supported.
- Version-gate precedence and effort behavior, and record requested versus actual model because allowlists can substitute.
- Keep `opusplan` for the parent session or separate plan/execute stages, not an assumed subagent model.

## 2. Claude Agent SDK

### Findings

- **Verified, undated:** TypeScript `query({options:{agents:{...}}})` takes programmatic `AgentDefinition` objects; optional `model` accepts family aliases, `inherit`, or full IDs. Programmatic definitions override same-name filesystem agents. [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents#programmatic-definition).
- **Verified, undated:** The SDK documents runtime factories for agent definitions and `Query.supportedModels(): Promise<ModelInfo[]>` for available models with display information. Thus model resolution can happen before `query()`; the list is discovery, not a cross-provider capability guarantee. [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents#dynamic-agent-configuration); [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript).
- **Verified, undated:** Non-fork agents start with fresh context; parent context reaches them through the Agent prompt. [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents#what-subagents-inherit).

### Implication for Ptah

- Build SDK `agents` per run from a tier resolver while preserving role prompts and tool restrictions.
- Intersect `supportedModels()` with policy, and keep filesystem aliases as fallback for externally started Claude sessions.

## 3. Vendor CLIs

### Findings

| CLI | Discovery | Selection / effort | Source |
| --- | --- | --- | --- |
| Codex | App-server `model/list` returns available models and supported reasoning efforts. Plain CLI machine-readable list **UNVERIFIED**. | `--model`; `config.toml` `model`, `model_reasoning_effort`; per-agent settings. | [App-server](https://developers.openai.com/codex/app-server), [config](https://developers.openai.com/codex/config-file/config-reference), [multi-agent](https://developers.openai.com/codex/multi-agent) (undated). |
| Copilot | Interactive `/model` lists account models; noninteractive discovery **UNVERIFIED**. | `--model`, `/model`, `auto`; `COPILOT_MODEL` for custom providers. Reasoning-effort switch **UNVERIFIED**. | [Programmatic reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference), [overview](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-cli) (undated). |
| Cursor | `agent models` lists account models; JSON format **UNVERIFIED**. | `agent --model`; persistent CLI default and reasoning effort **UNVERIFIED**. | [Parameters](https://cursor.com/docs/cli/reference/parameters) (undated). |
| OpenCode | `opencode models` lists models with filter/JSON options. | `--model provider/model`, config `model`; variants and ACP effort choices. | [Commands](https://opencode.ai/docs/cli/commands/), [ACP](https://opencode.ai/docs/cli/acp) (undated). |
| Gemini CLI / Antigravity | `/model` offers Auto/Manual. Machine-readable model list **UNVERIFIED**; a [2026 feature request](https://github.com/google-gemini/gemini-cli/issues/27847) asks for it. Separate Antigravity CLI contract **UNVERIFIED**. | `--model` > `GEMINI_MODEL` > `settings.json` `model.name`; Auto routing. Generic effort switch **UNVERIFIED**. | [Model selection](https://geminicli.com/docs/cli/model/), [routing](https://geminicli.com/docs/cli/model-routing) (undated). |
| Grok Build | `grok models` lists models; JSON format **UNVERIFIED**. | `-m/--model`, `GROK_DEFAULT_MODEL`, `models.default`; `models.default_reasoning_effort`. A [2026-08 issue](https://github.com/xai-org/grok-build-plugin-cc/issues/31) reports a `--model` hang in v1.0.5; resolution **UNVERIFIED**. | [CLI reference](https://docs.x.ai/build/cli/reference), [configuration](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/26-config-reference.md) (undated). |

### Implication for Ptah

- Use vendor adapters with explicit discovery and effort capabilities. Where model discovery is only interactive, omit model flags and retain vendor default/Auto.
- Record CLI version, requested tier, selected model if observable, and fallback reason. Time out Grok explicit-model runs pending version-specific verification.

## 4. Model routing approaches

### Findings

- **Verified, 2024:** RouteLLM learns a strong-versus-cheap choice from prompt features and calibrates a cost-quality threshold on representative traffic; thresholds are dataset dependent. This covers model choice, not Ptah executor eligibility. [RouteLLM](https://github.com/lm-sys/RouteLLM).
- **Verified, undated:** Codex recommends a stronger model for demanding subagent reasoning and a cheaper/faster one for scans; Claude Code `opusplan` separates planning from execution. These are role/stage policies rather than fixed IDs. [Codex multi-agent](https://developers.openai.com/codex/multi-agent); [Claude model settings](https://code.claude.com/docs/en/model-config#opusplan-model-setting).
- **Verified, undated:** OpenAI Agents SDK supports per-agent models and handoffs. Aider's architect/editor split was requested, but its [candidate documentation URL](https://aider.chat/docs/usage/architect.html) returned 404 here, so details are **UNVERIFIED**. [OpenAI handoffs](https://openai.github.io/openai-agents-python/handoffs/).
- **Inference:** Useful Ptah signals are task kind, prompt/context weight, cross-file difficulty, tool/host needs, reversibility, budget and prior outcomes. RouteLLM supports prompt difficulty/budget; the host/risk signals follow from Ptah's orchestration constraints. [RouteLLM](https://github.com/lm-sys/RouteLLM) (2024).

### Implication for Ptah

- Filter executors by required tools, platform and provider access before selecting model tier and effort.
- Start with auditable rules; train a router only after representative quality and cost outcomes exist.
- Escalate ambiguous integration/security work; use small tiers for bounded inventory/search and routine edits.

## 5. Task decomposition and token economy

### Findings

- **Verified, 2025:** Anthropic reports roughly 4× chat tokens for agents and 15× for multi-agent research runs, with vague delegation causing duplicate or irrelevant searches. These are its workload observations, not a universal Ptah cost constant. [Anthropic multi-agent system](https://www.anthropic.com/engineering/multi-agent-research-system).
- **Verified, undated:** SDK subagents receive a fresh context and only the parent-supplied prompt; needed paths, errors and decisions must be included in the brief. [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents#what-subagents-inherit).
- **Verified, 2025:** Cognition argues tightly coupled multi-agent work loses shared context and disperses decisions; Anthropic also excludes tasks with substantial shared context or dependencies. [Cognition](https://cognition.ai/blog/dont-build-multi-agents); [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system).
- **Inference:** No sourced universal subtask token threshold exists. A good brief includes one outcome, bounded scope, known decisions, required tools, acceptance checks and concise return format; parallelize independent work only. [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system) (2025).

### Implication for Ptah

- Batch around one verifiable result and bounded file/tool scope, rather than filling all lanes.
- Count setup/context duplication, rework and duplicate searches alongside raw token totals.
- Keep dependent edits in one owner; return concise evidence from independent lanes.

## Options

| Option | Design | Pros | Cons | Cost |
| --- | --- | --- | --- | --- |
| A. Native defaults | Agents `inherit`; lanes omit model. | Minimal maintenance; current vendor choices. | Weak batch control and spend predictability. | Low build; uncertain runtime. |
| B. Alias tiers | Claude files use family aliases; lanes default unless mapped. | Dynamic versions, simple fallback. | Cross-vendor tiers approximate. | Medium. |
| C. Catalog + rules | Discover per CLI, filter eligible executors, map tier/effort, log actual choice, escalate on failed checks. | Auditable; account-aware. | Adapter and policy upkeep. | Medium-high. |
| D. Learned router | Train on Ptah outcomes under cost/quality budget. | Can improve with data. | Needs labels, evaluation and drift control. | High. |

## Recommendation

Recommend **C staged through B**: migrate agent files to aliases/`inherit`; add capability adapters; apply simple task-shape rules; retain CLI default when discovery is weak; record requested/actual model, effort, cost and outcome. Defer D until outcomes support comparison. This follows documented Claude precedence and discovery while avoiding guessed IDs. [Claude subagents](https://code.claude.com/docs/en/sub-agents#choose-a-model) (undated); [Codex app-server](https://developers.openai.com/codex/app-server) (undated); [RouteLLM](https://github.com/lm-sys/RouteLLM) (2024).

## Decisions

- **Research recommendation, reversible:** use executor eligibility first, then rules-based tier/effort routing with native-default fallback. Options A-D above; evidence is heterogeneous CLI discovery and delegation overhead.
- **Research recommendation, reversible:** model tier and reasoning effort remain separate fields because vendor scales differ.
- No product decision or repository implementation was made in this research pass.

## Open questions

- Which installed CLI/Claude Code versions must be supported? Several override controls are version-gated.
- What quality, budget and privacy-safe outcome metrics can Ptah collect for calibration?
- Is Antigravity a separate executable or a Gemini CLI integration in Ptah's current lane implementation?
- Can Copilot, Gemini and Cursor report the actually selected model in a machine-readable run result?
