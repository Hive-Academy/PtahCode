# Context — TASK_2026_2335_648a: trim the first-request prompt

Branch `feat/prompt-trim`, stacked on `feat/ptah-mcp-adoption` (#1522, head `2ccd0672f`),
because #1522 changes `ptah-core-prompt.ts` and the eager tool set. Rebase onto `main` after
#1522 merges.

## User request (2026-11-28, all phases approved)

- Find what makes the system prompt big; trim without quality loss; first-request tokens must
  be below average (reference: plain Claude Code in the same repository).
- Compare the Ptah appended prompt with the Claude Code preset. When "System prompt mode"
  (Ptah's project-specific prompt) is on, the preset should not be duplicated.
- Trim the output style properly. Fix Ptah's internal tools and instructions for all users,
  not only this machine.
- No native tool disabled and no CLAUDE.md edited before the user approves the Phase 2 table.

## Baseline facts

- User `/context`, production app (no #1522), Fable 5.2, fresh session: 45.5k loaded.
  System prompt 11.8k, system tools 11.6k, MCP tools 9.7k, memory files 5.5k, skills 3.5k,
  custom agents 2.6k, deferred MCP 26k and deferred system 12.8k (not loaded).
  `ptah_agent_spawn` 3.4k, project CLAUDE.md 5.2k.
- Dev instance (#1522 build), Haiku 5.5, first request: 51,646 input tokens (measured).
  Round 2 in a new session wrote 25,849 tokens to cache again (cache break, cause unknown).
- Request dump of the dev measurement: `.ptah/tmp/prompt-dump/` in this worktree
  (`system-0..2.md`, `msg-system-4.md`, `msg-user-*.md`, `tools.json`).

- Plain Claude Code reference (`claude -p "/context" --strict-mcp-config --model haiku`, main
  checkout, 2026-11-28; use `MSYS_NO_PATHCONV=1` in Git Bash): 28.2k loaded. System prompt
  3.4k, system tools 8.1k, custom agents 2.6k, memory files 5.7k, skills 8.5k, deferred system
  tools 14.4k (not loaded). File `.ptah/tmp/baseline/plain-claude-context.md`.
- Ptah overhead against plain (production report minus plain): +17.3k. System prompt +8.4k,
  MCP tools +9.7k, system tools +3.5k, skills -5.0k.

- Cache break (measured, orchestrator byte diff of r1/r2/r3 in `.ptah/tmp/prompt-dump/`): tools,
  system0, system1 and messages are identical. system2 differs at char 6,423: r2 inserts
  `## Relevant Workspace Symbols` (query-dependent symbol injection) BEFORE the static Ptah core
  prompt. r1 had an empty index, r3 had `memory.symbolInjectionEnabled=false`. Fix: put all
  query-dependent injections (symbols, recalled memory, memory snapshot) after the static
  prompt, or in the user message, so the static prefix stays cached.

- SDK 0.3.329 `Options.systemPrompt` (verified `sdk.d.ts:2516-2590`): `string` or `string[]`
  replaces the preset; `string[]` takes `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` (blocks before it are
  cached cross-session). Preset takes `excludeDynamicSections: true` (dynamic sections move to
  the first user message; no effect for a string prompt). `snapshot` default true.
- Ptah always sends `{type:'preset', preset:'claude_code', append}`
  (`sdk-query-options-builder.ts:2391-2395`). The "System prompt mode" toggle only switches
  Enhanced Prompts (`agent-behaviour-section.component.ts:168`, `:524`), not the preset.
- `ScheduleWakeup` is in `PROTECTED_CLAUDE_TOOLS` (`claude-builtin-catalog.ts:121-146`).
- The worktree needs a `node_modules` junction to the main checkout (added 2026-11-28).

## User decisions on phase2-table.md (2026-11-28)

- Items 1-7 approved (no further decision needed).
- Preset (item 9), user design: the "System prompt mode" toggle selects the prompt. Enhanced
  prompt absent -> Claude Code preset (toggle off, cannot turn on). Enhanced prompt present ->
  toggle on by default -> Ptah's own system prompt replaces the preset. The user can switch
  back and forth at any time.
- CLAUDE.md (item 8): user asked how other projects and worktrees are handled; no approval yet
  to edit this repository's CLAUDE.md. Fact: Ptah excludes only identical repeated copies
  (`sdk-query-options-builder.ts:1676-1688`); a worktree inside the checkout whose CLAUDE.md
  differs from the main copy loads both.
- Native tools (item 10): separate task.

## Phases

| Phase | State | Output |
|---|---|---|
| 0 Baseline (`/context` dev + plain Claude Code + quality set) | open | — |
| 1 Investigation (3 lanes) | running | `prompt-dup-map.md`, `listing-trim.md`, `cache-stability.md` |
| 2 Design table, user approval | open | — |
| 3 Implementation + budget specs | open | — |
| 4 Measurement after | open | — |

## Lanes

Grok and Kimi Code are at their limits (2026-11-28). Lanes: codex `gpt-6-luna` x2,
antigravity `gemini-4-hydrogen-high` x1.

## Lane models (corrected 2026-11-28)

B1-B4 and their reviews used codex `gpt-6-luna` / antigravity `gemini-4-hydrogen-high` because of a
pin copied from TASK_2026_2332_5b4f. That pin applied only to its live measurement. From B5 on, omit
`model`: the lanes use the user settings (codex `gpt-6.2-sol`, antigravity `gemini-4-neon-high`).
Do not copy the old pin into a handoff. Follow-up idea: `ptah_agent_spawn` warns when an explicit
`model` differs from the user setting.
