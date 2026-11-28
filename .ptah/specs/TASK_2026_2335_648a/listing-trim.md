# Prompt Trim Research: Agent List, Skill List, Output Style, CLAUDE.md

Measured baseline from `.ptah/tmp/prompt-dump/msg-system-4.md` (30,060 chars), `.ptah/tmp/prompt-dump/msg-user-0.md` (14,669 LF / 14,685 CRLF chars), and `.ptah/tmp/prompt-dump/r1..r3.request-records.jsonl`.

## A. Agent List

`msg-system-4.md:96-115` `[verified]` sends 20 agent entries (**14,918** line chars; **14,960** chars with header): 14 Ptah workspace agents from `.claude/agents/*.md` (**11,374** line chars; **8,201** chars in `description` frontmatter + **3,173** chars in SDK `- <name>: ... (Tools: ...)` wrappers) and 6 SDK built-in agents (**3,525** chars).

- **Ptah role generator & templates**: Built-in role templates in `libs/backend/agent-generation/templates/agents` are retired/empty (`content-manifest.json:234-237`, `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts:9-11,41-43` `[verified]`). For custom/wizard-generated `.claude/agents/*.md`, `ContentGenerationService` (`libs/backend/agent-generation/src/lib/services/content-generation.service.ts:369-383` `[verified]`) no longer LLM-generates `description` (it takes authored metadata from templates), and `plugin-activation.ts:684-688,839-845` `[verified]` mirrors `{ws}/.claude/agents` via `UserLayerMirrorService`.
- **Where bloat comes from**: Each of the 14 `.claude/agents/*.md:3` `[verified]` descriptions is 496–785 chars, packing multi-clause `"Use when ...; when ...; or when ... Not for ..."` routing prose and output filenames. Six agents (`code-logic-reviewer`, `code-style-reviewer`, `modernization-detector`, `project-manager`, `software-architect`, `team-leader`) also list 13 denied MCP tools individually in `disallowedTools`, which the SDK expands verbatim inside `(Tools: All tools except ...)` (`msg-system-4.md:99-112` `[verified]`, ~380 extra chars each).

| Agent | Source | Line chars | Desc chars | Budget (<=200) | Saving | Long-text bloat note `[verified]` |
|---|---|---:|---:|---:|---:|---|
| `backend-developer` | `.claude/agents/backend-developer.md:3` | 672 | 612 | <=200 | >=412 | Repeats layer/artifact nouns in `Use when` + `Not for` |
| `code-logic-reviewer` | `.claude/agents/code-logic-reviewer.md:3` | 1,042 | 583 | <=200 | >=383 | Lists 6 bug examples + `code-style-reviewer` contrast |
| `code-style-reviewer` | `.claude/agents/code-style-reviewer.md:3` | 1,008 | 549 | <=200 | >=349 | Lists 6 style aspects + `code-logic-reviewer` contrast |
| `devops-engineer` | `.claude/agents/devops-engineer.md:3` | 700 | 642 | <=200 | >=442 | Restates surface list twice in `Use when` + `Not for` |
| `frontend-developer` | `.claude/agents/frontend-developer.md:3` | 634 | 573 | <=200 | >=373 | Restates UI file types twice in `Use when` + `Not for` |
| `modernization-detector` | `.claude/agents/modernization-detector.md:3` | 964 | 506 | <=200 | >=306 | 4-clause `Use after ... when ...` trigger list |
| `project-manager` | `.claude/agents/project-manager.md:3` | 1,104 | 649 | <=200 | >=449 | Enumerates 5 doc sections + 3-clause `Do not use` |
| `researcher-expert` | `.claude/agents/researcher-expert.md:3` | 588 | 550 | <=200 | >=350 | 4 parenthetical examples + 3-clause `Do not use` |
| `senior-tester` | `.claude/agents/senior-tester.md:3` | 625 | 569 | <=200 | >=369 | 4 `Use after/when` clauses + escalation note |
| `software-architect` | `.claude/agents/software-architect.md:3` | 1,243 | 785 | <=200 | >=585 | Longest: 4 `Use when` + 3 `Do not use` + parity branch |
| `team-leader` | `.claude/agents/team-leader.md:3` | 1,121 | 670 | <=200 | >=470 | Explains all 3 modes inline before `Use it` / `Do not use` |
| `technical-content-writer` | `.claude/agents/technical-content-writer.md:3` | 576 | 509 | <=200 | >=309 | Lists 5 formats twice across sentence + `Use when` |
| `ui-ux-designer` | `.claude/agents/ui-ux-designer.md:3` | 565 | 508 | <=200 | >=308 | Lists deliverables twice + sequencing rule |
| `visual-reviewer` | `.claude/agents/visual-reviewer.md:3` | 532 | 496 | <=200 | >=296 | Restates 4 checks across purpose + `Use after` |
| 6 SDK built-ins (`web-fetch` 2,070; `Explore` 539; `Plan` 364; `general-purpose` 309; `claude` 132; `statusline-setup` 111) | Claude Agent SDK binary `[inferred]` | 3,525 | — | N/A | 0 | Outside repo; `web-fetch` alone is 2,070 chars (`msg-system-4.md:116`) |
| **Total** | | **14,918** | **8,201** | **<=2,800** | **>=5,401** | **~5,400–5,800 chars saved** keeping `<=200` chars/desc |

Routing quality stays intact with a 1-sentence role + trigger + short exclusion (`<=200` chars), e.g. `software-architect` (785 -> 178 chars): `"Designs component architecture and implementation-plan.md (or parity-inventory.md) for multi-boundary tasks or refactors. Not for single-file edits, batches.md, or coding."` Keep `Not for` only where sibling pairs overlap (`code-logic-reviewer` vs `code-style-reviewer`, `software-architect` vs `team-leader`).

## B. Skill List

`msg-system-4.md:135-167` `[verified]` sends 29 entries (**9,715** entry chars; **9,808** chars with header):

| Source group | Count | Entry chars | Current control / discovery `[verified]` |
|---|---:|---:|---|
| Claude Code built-ins (`dataviz` 1,447, `claude-api` 1,171, `schedule` 463, `claude-approvals` 462, `run` 368, `loop` 344, `simplify` 188, `security-review` 90) | 8 | 4,533 | Not in `CLAUDE_BUILTIN_TERMINAL_SKILLS` (`claude-builtin-catalog.ts:80-119`), so never denied |
| Ptah `ptah-core` + workspace skills (`.claude/skills/*/SKILL.md`, synced via `harness-sync` from `plugins/ptah-core/skills` + repo skills) | 13 | 4,225 | `plugin-activation.ts:789-795`; `skillListingMaxDescChars` unset (SDK default `1536`, `sdk.d.ts:7518-7521`) |
| Ptah commands (`.claude/commands/*.md` from `plugins/ptah-core/commands`, `plugins/ptah-nx-saas/commands`) | 7 | 883 | Already lean (89–125 char descriptions) |
| Workspace workflow (`.claude/workflows/fleet-fix.js:2`) | 1 | 74 | Already minimal |
| **Total** | **29** | **9,715** | **4,533 chars (46.7%) are unrequested Claude built-ins** |

- **Why built-in skills still load when `agentOrchestration.enabledClaudeBuiltinSkills` is `[]`** (`file-settings-keys.ts:414` `[verified]`): `resolveClaudeBuiltinPolicy` (`claude-builtin-catalog.ts:229-250` `[verified]`) only denies the 7 terminal-only skills in `CLAUDE_BUILTIN_TERMINAL_SKILLS` (`keybindings-help`, `update-config`, `fewer-permission-prompts`, `plugin-authoring`, `init`, `workflow-authoring`, `code-review` at `claude-builtin-catalog.ts:80-119`) plus account-synced `anthropic-skills:<name>` entries (`synced-claude-skills.reader.ts:5-15` `[verified]`), after `guardClaudeBuiltinSkillDenials` (`claude-skill-name-discovery.ts:529-559` `[verified]`) drops collisions against `.claude/skills`, `.claude/commands`, user skills, and enabled `installed_plugins.json` entries (`claude-skill-name-discovery.ts:12-22,188-205`). Because those 8 general built-ins are absent from `CLAUDE_BUILTIN_TERMINAL_SKILLS`, `enabledClaudeBuiltinSkills: []` emits no `skillOverrides` entry for them.
- **SDK options to exclude them**:
  1. `Settings.disableBundledSkills: true` (`sdk.d.ts:7731-7734` `[verified]`, or `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`) in `buildFlagSettings` (`sdk-query-options-builder.ts:443-479`): removes all Claude Code bundled skills and workflows from the model listing while keeping built-in slash commands typable and leaving plugins, `.claude/skills/`, and `.claude/commands/` unaffected (**saves 4,533 chars**).
  2. `Settings.skillOverrides` (`sdk.d.ts:7726-7730` `[verified]`): supports `'user-invocable-only'` (hides from model listing while keeping `/name` typable) and `'off'`. Extending `claude-builtin-catalog.ts:80-119` with the 8 general built-ins (or gating them behind `disableBundledSkills` + opt-in) lets users re-enable `dataviz` or `claude-api` via `enabledClaudeBuiltinSkills` (`claude-builtin-catalog.ts:151`).
  3. **Description budget**: Set `skillListingMaxDescChars: 200` on flag settings (`sdk.d.ts:7518-7521` `[verified]`) as a hard SDK safety net, AND trim `plugins/**/skills/*/SKILL.md` + `.claude/skills/*/SKILL.md` `description` frontmatter to `<= 200` chars (13 active skills: 4,225 -> ~2,450 chars including headers/prefixes, **saving ~1,775 chars**; also shrinks `ptah-angular`, `ptah-nx-saas`, `ptah-dotnet`, `ptah-react` when enabled).

## C. Output Style

- **Definition & sizes**: Defined in `.claude/output-styles/simplified-technical-english.md:1-205` `[verified]` — **5,198** chars total (LF-normalized; **4,997** chars body, **201** chars frontmatter; ~5,500 chars in production system prompt with SDK wrapper `[inferred]`).
- **Delivery to SDK**: `OutputStyleSessionActivationService` delegates to `resolveActivation` (`libs/backend/output-styles/src/lib/output-style-activation.resolver.ts:44-71` `[verified]`):
  - **Flag path** (default when user/project/builtin file is visible): `buildFlagSettings` (`sdk-query-options-builder.ts:443-479` `[verified]`) sets `Options.settings.outputStyle = styleName`. Optional CLI parity writes `outputStyle` to `.claude/settings.local.json` (`libs/backend/output-styles/src/lib/claude-settings.writer.ts:60-79` `[verified]`).
  - **Inject fallback** (user-tier style on localhost proxy where `settingSources` omits `'user'`): `assembleSystemPrompt` (`sdk-query-options-builder.ts:373-382` `[verified]`) pushes `outputStyleBody` once into `systemPrompt.append`.
- **Once vs per-turn**: Ptah's `inject` path sends it once in `systemPrompt.append` (`sdk-query-options-builder.ts:377-382` `[verified]`), and multi-turn `.ptah/tmp/prompt-dump/r2.request-records.jsonl` shows no per-turn style reminder attachment (`[verified]` for dumped run without active STE). Flag-path internal CLI reminder behavior is unverified because `cli.js` is absent from `@anthropic-ai/claude-agent-sdk` (`[unknown]`).
- **Trimmed STE proposal**: **5,198 -> 3,370** chars total (**4,997 -> 3,169** chars body), saving **1,828 chars** (36.6% of body) by merging overlapping Vocabulary/Consistency/Technical Content rules and removing redundant multi-line examples (`Instructions`, `Verbs`, `Multi-word Nouns`, blockchain-specific noun list) while keeping every rule, word-count/sentence limit, and all 11 Scope exemptions:

```markdown
---
name: Simplified Technical English
description: Writes all responses in ASD-STE100 Simplified Technical English - short sentences, approved words, active voice.
keep-coding-instructions: true
---

# Simplified Technical English

Write user-facing text according to ASD-STE100 Simplified Technical English (STE), Issue 9, so technical text stays clear and unambiguous.

## Vocabulary and Consistency
- Use ASD-STE100 approved dictionary words when possible, only with their approved meaning and part of speech.
- Use American English spelling.
- Use approved technical nouns and technical verbs for domain terms; keep established software terms (e.g., API, RPC, TypeScript, pull request) and never simplify a term if that changes its technical meaning.
- Use one term per item, action, or concept throughout; never swap synonyms for style (e.g., keep "repository", not "repo" or "codebase").
- Avoid jargon or informal expressions unless they are approved technical terms.
- Use the exact command, component, field, and function names from the project.
- Use abbreviations only when helpful; define unfamiliar ones before repeated use, keep each abbreviation consistent, and avoid unnecessary abbreviations (project rule, not ASD-STE100).

## Sentences, Paragraphs, and Lists
- Write short, clear sentences with subject, verb, and object close together; keep one subject or principal idea per descriptive sentence.
- Maximum length: 20 words in a procedural sentence; 25 words in a descriptive sentence.
- Do not omit words only to shorten a sentence; use articles ("a", "an", "the") when necessary; do not use contractions or semicolons.
- Put one topic in each paragraph, start descriptive paragraphs with a topic sentence when possible, use at most six sentences per descriptive paragraph, give information gradually, and repeat key words for the same concept.
- Use short vertical lists for complex information: numbered when sequence matters, bulleted otherwise.

## Instructions and Verbs
- Write instructions in the imperative form, one per sentence (two only when actions occur at the same time); put important conditions before the instruction and use "you" when referring to the user.
- Prefer simple verb forms: infinitive, imperative, simple present, simple past, simple future, and past participle as an adjective. Avoid complex verb constructions when a simple one gives the same meaning.
- Use active voice; in descriptive text, use passive voice only when the agent is unknown.
- Avoid `-ing` verb forms (write "When you configure...", not "When configuring...") unless the word is an approved dictionary word, an approved technical noun, or a modifier in an approved technical noun.
- Keep multi-word nouns to three words maximum when possible (recognized technical nouns may exceed three words); write the full technical noun first when necessary, then use an approved short form or abbreviation.

## Scope
Apply these rules to user-facing explanations, summaries, reviews, recommendations, and instructions.
Do not apply to: source code, commands, file paths, configuration keys, function/variable/type/protocol names, literal error messages, quoted source text, or commit messages.
Follow `AGENTS.md`, `CLAUDE.md`, or equivalent files for code and project artifacts. When an STE rule conflicts with technical accuracy, preserve technical accuracy.
```

## D. CLAUDE.md Template and Project Guidance

- **Measured dump**: `msg-user-0.md` = **14,669** chars (LF; **14,685** CRLF): `213` wrapper + `893` `~/.claude/CLAUDE.md` + `13,539` project `CLAUDE.md` (`13,459` chars on disk at `CLAUDE.md:1-187` `[verified]`).
- **Ptah's CLAUDE.md generator & size guidance**: `.claude/commands/initialize-workspace.md:1-110` (mirrored in `plugins/ptah-nx-saas/commands/initialize-workspace.md:1-110` `[verified]`) instructs Claude to create a Root `CLAUDE.md` plus per-folder Module `CLAUDE.md` files with **no character or token budget** (only `"Keep each file concise and actionable"` at `:108`). `AnalysisClaudeMdLinker` (`libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts:16-219` `[verified]`) only writes the 6-line `<!-- ptah:analysis:begin -->` link block (`CLAUDE.md:181-187`). Adding a strict size cap to `initialize-workspace.md` (e.g., Root `CLAUDE.md <= 4,000` chars / ~1,000 tokens; Module `CLAUDE.md <= 1,500` chars loaded on demand) prevents unbounded per-session reminders.
- **Duplication with Ptah's appended system prompt**: `SdkQueryOptionsBuilder.buildSystemPrompt` (`sdk-query-options-builder.ts:2325-2395` `[verified]`) appends `PTAH_CORE_SYSTEM_PROMPT` (`ptah-core-prompt.ts:75-193`) + `enhancedPromptsContent` (`EnhancedPromptsService.getEnhancedPromptContent` at `enhanced-prompts.service.ts:875-890`, generated by `PromptDesignerAgent` with `VALIDATOR_TOTAL_TOKENS = 2000` / `2300` at `prompt-designer.types.ts:141-142` `[verified]`; example in `.ptah/analysis/ptah-extension/enhanced-prompt.md:1-71` is **6,847** chars). Duplicated surfaces `[verified]`:
  - `CLAUDE.md:59-68` (`Product focus: Electron first`, `ptah-electron`, `ptah-extension-webview`, `platform-cli`, `cli-engine`) vs `.ptah/analysis/ptah-extension/enhanced-prompt.md:6-11` and `CLAUDE.md:14-17` (`typecheck-templates`) vs `enhanced-prompt.md:26`.
  - `CLAUDE.md:70-170` (worktree, PR, CI, commit-in-foreground rules) overlaps `.claude/skills/orchestration/references/git-standards.md` and `task-tracking.md`, while `PTAH_CORE_SYSTEM_PROMPT` (`ptah-core-prompt.ts:46,186`) explicitly defers verification commands and git/PR rules to `CLAUDE.md` — meaning `CLAUDE.md` should hold only workspace-specific commands/rules and drop rules already enforced in skills/hooks (trimming `CLAUDE.md` by ~4,000–5,000 chars), and `PromptDesignerAgent` (`generation-prompts.ts:31-69`) should avoid restating `CLAUDE.md` rules when generating `## Project-Specific Guidance` (saving ~1,500–2,500 chars when Enhanced Prompts is enabled).

## E. Savings & Change Summary

| Item | Saving (chars) | Change location (`file:line`) | Quality risk | Reason |
|---|---:|---|---|---|
| Agent descriptions (`<=200` chars/agent) | ~5,400–5,800 | `.claude/agents/*.md:3` + `scripts/regen-agents.mjs:14-30`; `libs/backend/agent-generation/src/lib/services/content-generation.service.ts:369-383` `[verified]` | Low | Keeps role + trigger + key sibling boundary; drops redundant `Use when`/`Not for` lists |
| Agent explicit `disallowedTools` list | ~2,280 (optional) `[inferred]` | `.claude/agents/{code-logic-reviewer,code-style-reviewer,modernization-detector,project-manager,software-architect,team-leader}.md` frontmatter (`msg-system-4.md:99-112`) | Medium | Only if wildcard/profile is supported by SDK without widening browser/web access |
| Exclude Claude built-in skills (`disableBundledSkills` or catalog `skillOverrides`) | 4,533 | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:443-479` & `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts:80-119,229-250` `[verified]` | Low | Removes 8 unrequested built-ins (`dataviz`+`claude-api`=2,618 chars); keep opt-in via `enabledClaudeBuiltinSkills` (`file-settings-keys.ts:414`) |
| Trim Ptah skill descriptions (`<=200` chars) + SDK cap | ~1,775 (+plugin skills) | `plugins/**/skills/*/SKILL.md` + `.claude/skills/*/SKILL.md`; `skillListingMaxDescChars: 200` in `sdk-query-options-builder.ts:470-479` (`sdk.d.ts:7518-7521`) `[verified]` | Low | Preserves skill id + primary trigger while removing multi-line trigger lists |
| Trim `Simplified Technical English` output style | 1,828 | `.claude/output-styles/simplified-technical-english.md:1-205` `[verified]` | Low | Preserves every STE rule, sentence/paragraph cap, and all 11 Scope exemptions; cuts duplicate examples |
| `CLAUDE.md` budget + dedup vs `Project-Specific Guidance` | ~4,000–6,500 (workspace-dependent) | `.claude/commands/initialize-workspace.md:11-67,108`; `plugins/ptah-nx-saas/commands/initialize-workspace.md:11-67`; `CLAUDE.md:70-170`; `libs/backend/agent-generation/src/lib/services/prompt-designer/generation-prompts.ts:47-69` `[verified]` | Low–Med | Adds Root `<=4,000` char budget and prevents `EnhancedPrompts` from duplicating `CLAUDE.md` |
| **Total (first-turn listing + style + guidance)** | **~17,500–20,400** (plus optional ~2,280) | | | Roughly **35–42% of the ~45–52k token / ~150k+ char first-turn overhead** |

## Decisions
- Use `<= 200` chars per agent and per skill `description` as the unified target budget, enforced via `Settings.skillListingMaxDescChars: 200` for skills and authoring rules/validation for `.claude/agents/*.md`.
- Prefer `claude-builtin-catalog.ts` `skillOverrides` (`'user-invocable-only'` or `'off'` gated by `agentOrchestration.enabledClaudeBuiltinSkills`) or `Settings.disableBundledSkills: true` (`sdk.d.ts:7731-7734`) over `Options.skills` allowlisting, so workspace/plugin skills continue to load naturally.
- Keep `keep-coding-instructions: true` and all ASD-STE100 rules + 11 Scope exemptions in the trimmed STE output style.

## Unknown
- Whether the Claude Code native binary emits any hidden per-turn `<system-reminder>` when `outputStyle` rides the `flag` tier (`Options.settings.outputStyle`) could not be verified from disk because `cli.js` is absent in `node_modules/@anthropic-ai/claude-agent-sdk` (the package bundles native binaries; `r2.request-records.jsonl` showed no per-turn style reminder in a session without active STE).
- Whether `.claude/agents/*.md` `disallowedTools` supports a prefix/wildcard (to eliminate the ~2,280-char per-tool expansion in `msg-system-4.md:99-112`) was not verified against the Claude CLI binary's agent frontmatter parser.
- Exact per-user savings on `CLAUDE.md` + `EnhancedPrompts` depend on each user repository's `CLAUDE.md` size and whether `EnhancedPrompts` is enabled; the ~4,000–6,500 char estimate reflects PtahCode's own `CLAUDE.md` (13,459 chars) and `.ptah/analysis/ptah-extension/enhanced-prompt.md` (6,847 chars).
