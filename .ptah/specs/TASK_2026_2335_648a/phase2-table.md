# Phase 2 design table — TASK_2026_2335_648a

Tokens are calculated as chars / 4 unless marked measured. Sources: `prompt-dup-map.md`,
`listing-trim.md`, `cache-stability.md`, `context.md` (orchestrator byte diff and SDK check).

| # | Item | Change (all users) | Saving | Risk | Batch |
|---|---|---|---|---|---|
| 1 | Cache break | Move query-dependent injections (symbols, recalled memory, memory snapshot) after the static prompt: first user message or after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | 25.8k cache-write tokens per new session with symbols (measured once) | Low | B1 |
| 2 | Bundled Claude skills | `disableBundledSkills: true` unless `enabledClaudeBuiltinSkills` opts in (`skillOverrides`) | about 1.1k | Low | B1 |
| 3 | Skill descriptions | `skillListingMaxDescChars: 200` and short Ptah-shipped skill descriptions | about 0.45k | Low | B1 + B4 |
| 4 | Ptah core prompt | Trim 5.5-9k chars: orchestration tables to the orchestration skill, shorter substitution prose, AskUserQuestion, formatting, git; host-neutral identity (no "VS Code Extension") | 1.4-2.2k | Medium | B2 |
| 5 | `ptah_agent_spawn` | Description 8.7k to about 3k chars; lifecycle detail to the agent-lanes skill | about 1.4k | Medium | B3 |
| 6 | Agent descriptions | Ptah agent generator (`content-generation.service.ts:369-383`) caps descriptions at 200 chars; regenerate `.claude/agents` | about 1.4k | Low-medium | B4 |
| 7 | STE output style (repository file) | 5.2k to 3.4k chars, every rule kept | about 0.45k | Low | B4 |
| 8 | CLAUDE.md | Generator size budget, no duplication with Project-Specific Guidance; trim repository CLAUDE.md | 1.0-1.6k | Medium | needs user approval |
| 9 | Claude Code preset | New "Ptah full prompt" mode: `systemPrompt: string[]` (Ptah prompt + kept preset rules + boundary + dynamic). Setting, default off until measured | 1.5-3k (inferred) | High | B5, needs user approval |
| 10 | Native tools (PowerShell + Bash, ScheduleWakeup) | Out of scope; ScheduleWakeup is protected | 1.2-2.8k | Medium | separate task |

Items 1-7: about 6.2-7.0k tokens less on the first request (45.5k to about 38.5-39.3k).
With 8 and 9: about 8.7-11.6k less (to about 34-37k). Plain Claude Code reference: 28.2k.
