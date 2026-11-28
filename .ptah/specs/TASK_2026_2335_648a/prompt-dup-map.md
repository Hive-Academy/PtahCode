# Prompt duplication map — measured Haiku request, 2026-11-28

Scope: read-only trace of `.ptah/tmp/prompt-dump/` and prompt assembly. Input sizes below use the supplied dump metadata (chars); source attribution is verified where code or dump text says so, otherwise marked inferred. “Static” means invariant text; “session-varying” includes workspace, enabled tools, settings, user configuration and runtime data.

## A. Section map

| Sent block / section | Chars | Source and location | Static / varies |
|---|---:|---|---|
| system-0 identity (“You are Claude Code…”) | 94 | SDK supplied block; `.ptah/tmp/prompt-dump/system-0.md:1` | Static identity |
| system-1 harness and security guidance | 2,029 | SDK supplied block; `.ptah/tmp/prompt-dump/system-1.md:1-12` | Mostly static; host permission/tool behavior may vary |
| system-2 pronouns, irreversible actions, privacy | Included in 21,733 | SDK/preset, `.ptah/tmp/prompt-dump/system-2.md:1-5` | Static |
| system-2 session guidance and environment | Included in 21,733 | SDK/preset, `.ptah/tmp/prompt-dump/system-2.md:7-15` | Some runtime/model claims can vary; inaccurate/stale model list is possible |
| system-2 context management | Included in 21,733 | SDK/preset, `.ptah/tmp/prompt-dump/system-2.md:16-33` | Static |
| system-2 Ptah identity and environment | Included in 21,733 | `PTAH_CORE_SYSTEM_PROMPT`, `ptah-core-prompt.ts:75-88`; request copy `.ptah/tmp/prompt-dump/system-2.md:35-47` | Static, currently says VS Code |
| system-2 Ptah MCP substitution table, execute_code guidance, memory trigger, token economy | Included in 21,733 | `PTAH_MCP_SUBSTITUTION_SECTION`, `ptah-core-prompt.ts:26-49`; generated table uses `renderCoreSubstitutionBlock()` (`:20-30`) | Table and eager tool advice vary with registered tools; most prose static |
| system-2 delegation, ask-user, denial, task-workflow, Git/PR, formatting | Included in 21,733 | `ptah-core-prompt.ts:60-197` (main prompt begins `:75`); dump headings `.ptah/tmp/prompt-dump/system-2.md:90-217` | Static policy; delegation availability/tool handles runtime-dependent |
| msg-system-4 Environment | 30,060 total block | `.ptah/tmp/prompt-dump/msg-system-4.md:1-119` | Session-varying environment, agent types and skill availability; dynamic SDK/MCP injection (exact per-section attribution not available from source dump alone) |
| msg-system-4 MCP Server Instructions | Included in 30,060 | `.ptah/tmp/prompt-dump/msg-system-4.md:120-160`; built by `server-instructions.ts:37-42,64-125` | Varies by registered tool list and bounded/truncated server instruction output |
| msg-user-0 CLAUDE.md system reminder | 14,685 | `.ptah/tmp/prompt-dump/msg-user-0.md:1-193` | Session/workspace-varying user/project instructions |
| Tools JSON (36 definitions) | 78,834 bytes in dump; characters/tokens not measured here | `.ptah/tmp/prompt-dump/tools.json`; eager selection in `protocol-dispatcher.ts:674-800`; descriptions authored in tool builders | Definition inventory varies by host/capability/profile; eager vs deferred changes list payload |

SDK builder assembles Ptah core + optional UI hint, per-session user system prompt, injected output style and enhanced prompts, then session-start/corpus/memory/code-symbol blocks. It returns `{type:'preset', preset:'claude_code', append}` (`sdk-query-options-builder.ts:351-388, 2320-2395`). Thus system-2 is a combined SDK preset plus appended content; its internal per-section character split cannot be recovered from the combined block without SDK preset source or a separately instrumented request. The 21,733 chars is a block count, not a claim that all text is SDK-owned.

## B. Duplication and mismatches

| Repeated statement / content | Occurrences and evidence | Assessment |
|---|---|---|
| Prefer Ptah tools over built-in equivalents; tool-first navigation/search/read guidance | Ptah table and fallback in `ptah-core-prompt.ts:26-30`; MCP server instructions header/fallback in `server-instructions.ts:37-48`; supplied server text in `msg-system-4.md:120-160`; SDK harness itself also says dedicated file/search tools in `system-1.md:11` | Verified duplication. Keep the generated substitution table as the source of truth; server handshake only needs compact tool-list/fallback guidance. |
| Tool substitution rows | Ptah section calls `renderCoreSubstitutionBlock()` (`ptah-core-prompt.ts:20-30`); server instruction generator parses substitution rows and emits a bounded summary (`server-instructions.ts:54-125`). | Verified shared content by design, but not necessarily byte-identical; inspect exact dump before removing either. Runtime descriptions can teach tool specifics. |
| Output style / user prompt added to system prompt | Assembly appends userSystemPrompt and outputStyleBody (`sdk-query-options-builder.ts:351-382`); build method receives session config (`:2320-2335`). | Not a duplicate by itself; avoid reprinting style body in Ptah core. |
| “Do not ask; decide” and criteria for asking | Ptah prompt `ptah-core-prompt.ts:111-126`; SDK-specific/user CLAUDE.md may independently specify collaboration rules (see `msg-user-0.md:6-193`) | Likely overlapping rule family; exact statement-level duplicates require comparing the full CLAUDE.md text. |
| Orchestration/delegation, subagent handling, verification | Ptah `ptah-core-prompt.ts:90-109,136-183`; user CLAUDE.md has verification/worktree/coordinator rules `msg-user-0.md:25-120,165-193` | Verified topic duplication; CLAUDE.md carries repo-specific constraints and has higher task specificity. Remove general duplicated workflow prose from always-on prompt where the project file governs it. |
| Git worktree/PR rules | Ptah `ptah-core-prompt.ts:184-187`; user file `msg-user-0.md:92-164,181-192` | Topic duplication; user content is specific and longer-lived project policy. |
| Verification command policy / avoid expensive checks | Ptah `ptah-core-prompt.ts:43-49`; CLAUDE.md `msg-user-0.md:25-80`; system-2 general verification/report guidance `:1-5` | Verified overlap, with user rules specifically tailored to this repo. Prefer concise generic fallback plus user policy. |
| “VS Code Extension” identity and host claims | Ptah `ptah-core-prompt.ts:75-84`; input says Electron host and the project guidance says Electron is priority (`msg-user-0.md:81-90`) | Verified contradiction for this request. The same renderer supports Electron and extension-style hosts; replace hard-coded VS Code identity with host-neutral/Electron-first wording. |
| Tool schema details versus prompt substitutions | 36 definitions in `tools.json`; eager tool set at `protocol-dispatcher.ts:674-712`; prompt names many tools in `ptah-core-prompt.ts:26-49,90-109` | Some duplicated names are necessary routing cues. Move per-tool usage detail to tool descriptions or deferred help; keep only high-value substitution rules in prompt. Exact eager description text was not fully mapped. |

## C. Claude Code preset versus Ptah prompt

| Claim | Evidence / status |
|---|---|
| Ptah currently sends the preset plus append, not a standalone string. | **Verified:** `sdk-query-options-builder.ts:2391-2395` returns `type:'preset'`, `preset:'claude_code'`, `append:finalContent`; pure assembly labels result `preset-append` (`:384-387`). |
| The toggle named “System prompt mode” controls Enhanced Prompts enablement, not preset selection. | **Verified:** renderer saves `enhancedPrompts:setEnabled` (`agent-behaviour-section.component.ts:168` and `:524`); RPC handler registers the method (`enhanced-prompts-rpc.handlers.ts:103-108`) and implements set-enabled (`:460-496`). Backend appends enhanced prompt content when supplied (`sdk-query-options-builder.ts:351-382,2320-2335`). No branch here swaps `claude_code` for a string. |
| Turning the toggle off removes the Ptah core prompt. | **False / verified:** `PTAH_CORE_SYSTEM_PROMPT` is pushed unconditionally (`sdk-query-options-builder.ts:366`); the setting controls enhanced prompt generation/content, not the core append. |
| A standalone string can omit the Claude Code preset. | **Not verified for installed SDK.** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and local `node_modules` were absent in this checkout. Builder comment says the core prompt “extends” preset and calls preset+append always (`ptah-core-prompt.ts:4-12`; `sdk-query-options-builder.ts:2305-2307`), but this is project commentary, not SDK contract evidence. Other repo code models a `standalone` mode for CLI lanes (`claude-sdk-lane-options.ts:238`), which does not prove main-query support. |
| If standalone is supported, preset removal saves the preset-owned portion of system-0/1/2, not all 21,733 chars. | **Inference:** system-2 interleaves preset and Ptah append; exact preset-only char count is unavailable. Do not treat 21,733 as savings. |
| Preset content that must be retained if switching to plain string | **Inference / safety recommendation:** retain safety and permission boundary instructions, tool invocation semantics, environment/context behavior, git/tool-use rules, and dynamic workspace/model/session data unless SDK source proves those are injected separately. Preserve dynamic skills and output-style behavior only if their injection still works under standalone. |
| What SDK behavior is lost without preset | **Unknown pending SDK source:** whether dynamic environment, tool-use policy, skills, output style, model identity, or context-management sections are omitted/available elsewhere cannot be asserted from this checkout. The measured prompt has Environment, agent type, and skill list in msg-system-4 (`:1-119`), which suggests at least some dynamic content is separate, but does not establish the standalone contract. |
| SDK option to remove preset sections | **Unknown:** SDK declaration/source unavailable in worktree; no claim that such an option exists. |

## D. Trim proposal for Ptah prompt

Estimates refer to current appended Ptah core (~14,600 chars per task input), not total request size. Ranges are planning estimates; exact section lengths weren’t independently measured. Savings overlap if deletion shifts shared text; do not sum blindly.

| Section / current location | Action | Est. saving | Quality risk | Reason |
|---|---|---:|---|---|
| Host identity + Environment Context `ptah-core-prompt.ts:75-84` | Shorten and make host-neutral; say Electron-first, with extension host where relevant | 500–700 chars | Low | Current VS Code-only statement contradicts Electron. Tool runtime already supplies environment details. |
| MCP substitution guidance `:26-49` | Keep compact generated substitution table; shorten explanation and IDE/memory/token-economy prose; defer API details to tool help/descriptions | 1,000–1,800 | Medium | High-value routing must remain, but detailed API examples and generic call-count advice can be fetched when needed. Keep critical memory-trigger policy only if behavior evidence shows it matters. |
| CLI delegation recipe `:60-70,90-109` | Keep one concise spawn/wait/read rule; defer lifecycle/report edge cases to agent tool descriptions | 700–1,200 | Medium | Core orchestration capability is important; detailed receipt/status/report variants are discoverable from tools and current system instructions. |
| AskUserQuestion section `:111-126` | Shorten to a few decision criteria; remove repeated budget/format/subagent details | 700–1,000 | Low | The central default and high-cost ambiguity test preserve behavior. |
| Permission denial and “read before propose” `:128-134` | Keep compact or delete rules already enforced by SDK/tool boundary | 250–450 | Medium | Preserve user-denial semantics if not guaranteed by host; code-reading rule is generic and partly repeated elsewhere. |
| Orchestration/workflow tables `:136-183` | Move task classification/depth/delegation matrices to an orchestration skill; retain a short default for non-trivial work | 1,500–2,500 | Medium | Long static workflow matrix is conditional guidance; skill can load when relevant. Must preserve automatic invocation behavior if currently relied on. |
| Git & PR `:184-187` | Delete repo-specific duplication; keep only short generic safety rule if needed | 400–700 | Low | User CLAUDE.md supplies concrete worktree/PR rules; generic preset covers safety. |
| Rich Formatting `:188-197` | Delete or reduce to one sentence | 500–900 | Low | UI rendering and tool outputs already define presentation; markdown basics have low task-specific value. |
| User/output style and enhanced prompts injection | Keep injection path unchanged; do not bake configurable style text into static Ptah prompt | 0 | Low | These are dynamic user choices and are already assembled once (`sdk-query-options-builder.ts:351-382`). |
| **Total candidate reduction** | **Shorten/move/delete above; preserve substitutions and essential safety** | **~5,500–9,000 chars** | **Medium overall** | **Inferred; measure an actual post-change request before release. No preset removal counted.** |

## Decisions

- Do not recommend removing `claude_code` preset based on current evidence. The main builder unconditionally selects it, and the installed SDK declaration/source needed to establish standalone semantics is missing.
- The toggle currently affects Enhanced Prompts content only; it does not disable the core Ptah append or the Claude Code preset.
- First trim should target duplicated static workflow, Git/PR, verification and verbose tool-operation details. Preserve user CLAUDE.md, dynamic settings, tool access, and safety behavior.
- Correct “VS Code Extension” identity because the measured session is Electron and product guidance supports both hosts.

## Unknown

- Installed Claude Agent SDK version and `Options.systemPrompt` union; whether plain string is supported and exactly what preset sections/dynamic injection it bypasses.
- Per-section char/token attribution inside the 21,733-character combined `system-2.md`; need SDK preset source or a capture that separates preset and append.
- Exact character/token contribution of eager tool descriptions individually. `tools.json` is 78,834 bytes total, but the request’s tool-description token count wasn’t isolated.
- Full exact duplicate matching across all 36 descriptions and CLAUDE.md. This report maps verified repeated policy themes and known substitution reuse; a normalized text-diff is needed for literal occurrence counts.

### Eager tool inventory (description sources)

The dispatcher eagerly registers 16 base tools, 3 IDE tools and 2 Electron SQLite tools (`protocol-dispatcher.ts:674-706`). The 21 names and definition sources are:

| Eager tools | Description/definition source |
|---|---|
| `ptah_search_files`, `ptah_ast_analyze`, `ptah_context_enrich_file`, `ptah_get_diagnostics`, `ptah_workspace_analyze`, `ptah_get_dependents`, `ptah_get_symbol_index`, `ptah_relevance_rank_files` | Tool definitions are assembled in the workspace navigation/inspection tool modules; `protocol-dispatcher.ts:674-688` supplies eager membership. Their individualized descriptions are carried in registered tool definitions, not this dispatcher. |
| `ptah_inspect`, `ptah_read_symbol`, `ptah_grep` (constant aliases `INSPECT_TOOL_NAME`, `READ_SYMBOL_TOOL_NAME`, `GREP_TOOL_NAME`) | Navigation tool definitions/description builders; eager membership via aliases in `protocol-dispatcher.ts:676-678`. |
| `ptah_agent_list`, `ptah_agent_spawn`, `ptah_agent_read`, `ptah_agent_status`, `ptah_session_handoff_ack` | Agent tool builders; the handoff description is `session-handoff-ack.tool.ts:13`; membership `protocol-dispatcher.ts:688-692`. |
| `ptah_lsp_references`, `ptah_lsp_definitions`, `ptah_get_dirty_files` | IDE tool definitions; conditionally eager (`protocol-dispatcher.ts:695-700`). |
| `ptah_code_search_symbols`, `ptah_memory_search` | Electron SQLite/symbol-memory tool definitions; conditionally eager (`protocol-dispatcher.ts:702-706`). |

Tool definitions are produced from registered tools and filtered/marked eager by `markEagerTools` (`protocol-dispatcher.ts:766-800`). The dump’s `tools.json` is the actual sent definition corpus; this investigation did not resolve each description string back to its originating module line. See Unknown; do not infer that eager status means the prompt itself includes duplicate full descriptions.
