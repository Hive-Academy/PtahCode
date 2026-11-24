# Prompt context report — TASK_2026_2323_9838

Scope: the per-turn prompt of a Ptah main-chat session (Claude SDK, entrypoint `sdk-ts`).
Data: the nav benchmark rerun (round 7, build `cd25c1cac`) and round 6 (build `75cfd492b`).
All numbers are aggregated. No raw transcript content is in this file.
Tokens are estimated as chars / 4, except where a measured API token count is named.

## Summary

- The ptah-haiku turn 1 rose from about 45k to about 56k tokens (round 6 to round 7).
- About 4.6k of that is a third copy of CLAUDE.md. It is a harness artifact, not Ptah code.
- About 6k is external (Claude CLI side). native-haiku rose by about 5k per turn too.
- About 250 tokens are Ptah-controlled (system prompt append and eager tool definitions).
- Ptah now excludes ancestor CLAUDE.md files whose bytes equal a nearer copy, and three prompt
  parts that had no size budget now have one.

## Cause of the third CLAUDE.md copy

The benchmark workspace sat inside a linked git worktree of the repository. In that layout the
Claude CLI skips the CLAUDE.md of the main checkout, so it loads 2 copies (the worktree copy and
the workspace copy).

At 18:43Z the harness ran `git init` in the workspace to fix a `ptah_grep` problem (benchmark
report, harness note 2). After that, the workspace was a standalone repository nested inside
the checkout, and the CLI loaded every ancestor CLAUDE.md: 3 copies of the same 13.4k chars.

| evidence | sessions | CLAUDE.md copies | turn 1 (API tokens) |
|---|---|---|---|
| native-haiku, 18:36–18:41Z, before `git init` | 8 | 2 | 41.6k |
| ptah-haiku smoke, same build, before `git init` | 2 | 2 | 49.5k–49.7k |
| ptah-haiku stage 2, after `git init` | 8 | 3 | 54.1k–55.9k |

The transcripts also show the git branch change from the worktree branch to `main` at the same
point. A Ptah session in a real linked worktree loads 1 project copy (this session is one).

So the claim "every Ptah session in a worktree also loads the main checkout copy" is not true.
The duplicate occurs only when the workspace is not a linked worktree but sits inside a copy of
its own checkout (a snapshot, an extracted archive, a nested standalone repository).

## Each Ptah-controlled part, round 6 vs now

"Now" is `origin/main` at `7a4049541` (measured offline at `fee63517c`; #1494 and #1495 did not
change any measured part). Round 6 values come from `git show 75cfd492b:<file>` and a
throwaway spec at that commit, or from the round 6 app log where noted.

| part | r6 chars | now chars | delta | est. tokens delta | cause |
|---|---:|---:|---:|---:|---|
| core system prompt (`PTAH_CORE_SYSTEM_PROMPT`) | 13,875 | 13,875 | 0 | 0 | none (#1475 kept the size) |
| system prompt append, total (app log, bench session) | 16,637 | 16,910 | +273 | +68 | new session-start memory block (328 chars); symbol block varies by query |
| relevant workspace symbols block (app log) | 2,760 | 2,703 | −57 | −14 | query-dependent |
| eager (`alwaysLoad`) Ptah tools, 15 tools: name + description + schema | 20,325 | 21,029 | +704 | +176 | `ptah_grep` +656 (description and schema), `ptah_read_symbol` +36, `ptah_workspace_analyze` +12 |
| deferred Ptah tools, 65 tools (only names reach the prompt) | 58,085 | 58,085 | 0 | 0 | none |
| eager tool set (85 tool names in the app log) | same | same | 0 | 0 | none |
| MCP server instructions | 501 | 501 | 0 | 0 | none (hard cap 512) |
| workspace agents (`.claude/agents`, 14 files, descriptions) | 8,201 | 8,201 | 0 | 0 | none |
| workspace skills (`.claude/skills`, 23, descriptions) | 7,047 | 7,047 | 0 | 0 | none |
| plugin skills and commands (`plugins/*`, descriptions) | 8,442 | 8,442 | 0 | 0 | none |
| CLAUDE.md (one copy) | 13,127 | 13,475 | +348 | +87 per copy | repository edit |
| CLAUDE.md copies in the bench Ptah arm | 2 | 3 | +1 copy | about +4.6k (API tokens) | harness `git init` artifact |

Ptah-controlled total: about +1k chars, about +250 tokens per turn.

Other attachments of a round 7 Ptah session, for scale (no round 6 transcript exists):
agent listing about 15.7k chars (also in native), skill listing about 10.5k chars (27.9k in
native), deferred tool names about 4k to 8.5k chars, MCP instructions about 2.6k chars (about
0.5k Ptah, the rest the claude.ai Claude Docs connector).

## What changed in this task

1. `libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.ts` — finds ancestor `CLAUDE.md`,
   `.claude/CLAUDE.md` and `CLAUDE.local.md` files whose bytes equal a file nearer to the session
   folder. The nearest copy stays. A file with an `@path` import, a path with a glob character,
   or a file over 512 KiB is kept. A symlink to a kept file is not excluded. After the review
   (S1), it excludes nothing unless the session loads both the `project` and `local` sources
   and no loaded settings file sets its own `claudeMdExcludes`. The user memory file is never
   kept or excluded. The walk has a 1.5 s time limit and then excludes nothing.
   After the PR review, managed settings can also turn the walk off. It excludes nothing when
   a managed source exists or cannot be read: `/etc/claude-code/managed-settings.json`, its
   `managed-settings.d` folder, the cached server-managed settings in the Claude config folder,
   or the WSL `reg.exe`. On macOS and Windows, MDM and the registry key cannot be checked with
   a file read, so the walk is off there. The import scan is linear (an `indexOf` scan for HTML
   comments), and a fence closes only on the same marker with a run at least as long.
2. `sdk-query-options-builder.ts` — the main-chat `build()` passes the result as the flag-tier
   `claudeMdExcludes`. The CLI merges arrays across settings sources as a de-duplicated union
   (verified in the CLI 2.1.329 settings merge function), so the user's own excludes stay.
3. New budget specs (measured on main plus five percent):
   - eager Ptah tool definitions: 21,029 chars, budget 22,080, count pinned at 15
     (`eager-tool-definitions.budget.spec.ts`).
   - worst-case relevant-symbols block: 3,618 chars, budget 3,799.
   - worst-case recalled-memory block: 2,767 chars, budget 2,905.
   The core prompt (`ptah-core-prompt.spec.ts`) and the MCP server instructions (512-char cap)
   already had budgets.
4. The benchmark report of TASK_2026_2320_15a6 now gives this attribution and a harness note.

Expected effect (estimate, not measured live): in the round 7 layout (a standalone repository
nested in a worktree) the session loads 1 copy instead of 3, about −9k tokens per turn, so turn 1
goes from about 55k to about 46k. In a normal linked worktree there is no change, because the
CLI already loads one project copy there.

## Candidates for the user (not changed)

These look like overlap, but the user added them on purpose. I did not remove them.

1. **MCP server instructions in main chat.** About 500 chars repeat 3 rows of the substitution
   table that the core prompt already carries. The text exists for hosts that do not get the core
   prompt (Codex and other lanes). Main chat could skip it, about −125 tokens per turn.
2. **"Project-Specific Guidance" (enhanced prompt from the workspace analysis).** In a real
   session it is about 3.4k chars, and much of it restates CLAUDE.md (worktree rule,
   `npm run verify`, Electron first, commitlint). The bench run did not have it.
3. **Core prompt delegation text.** "3-Tier Agent Hierarchy & CLI Delegation" (about 3k chars)
   and "### Delegation" (about 0.4k chars) both describe when to use a Task subagent vs a CLI
   lane.
4. **`ptah_agent_spawn` is eager at about 7.8k chars** (description 1,480, schema 6,320). It is
   the largest eager tool, about 2k tokens per turn.
5. **Header text.** The core prompt says "Ptah Extension - AI Assistant for VS Code" also in the
   Electron host. This is not a size issue.
