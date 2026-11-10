# Task Context - TASK_2026_893_6b26

## User Request
earlier i had a worktree and a branch that convert the landing page into arabic and add arabic rtl support , this branch is very old and the code has shifted a ton, and now all i want is focus on what matter most for the developers working with arabic language is our main chat page and rtl support in the chat where agent respond in arabic , can you investigate these please and see easiest way to get that going

## Task Type
FEATURE (investigation-first)

## Complexity
Medium

## Strategy
FEATURE, Partial depth: research (codex lane) -> Gate: findings to user -> architect plan -> team-leader -> QA.
No new UI surface is planned (RTL/bidi rendering of existing chat), so no designer/prototype; completion
needs before/after Electron screenshots (dark + light) of the chat screen.

## CLI Lanes
- Preference source: memory `orchestration-executor-preference` (lanes-first, codex first, reviews by a
  different family) + user global CLAUDE.md (delegate heavily, prefer non-Claude vendors).
- Mode: enabled. Approval mode: lane-review.
- ptah_agent_list (2026-11-08): codex installed, confirmed room (weekly 47%); opencode installed (unknown);
  antigravity installed (reader failed); claude installed (unknown); copilot disabled; grok AT LIMIT
  (resets 2026-11-12); Glm AT LIMIT (resets 2026-11-09); kimi code AT LIMIT (resets 2026-11-25).

- Limit hit: opencode (family opencode), cause "Free usage limit reached" on review lane f8f23737, reset unknown -> skip
  for this run. Fallback for code review: antigravity (other family).

- Limit hit: antigravity (family antigravity), 429 "Individual quota reached" on re-review lane 26b7ce58 after it wrote
  code-logic-re-review.md and sent its report; reset ~2026-11-09 00:45 UTC. Deliverable accepted (complete verdict).

## Worktree
D:\projects\ptah-extension\.claude-worktrees\chat-arabic-rtl  (branch feat/chat-arabic-rtl from main ffb7c71a7)

## Prior work
- Old worktree D:\projects\ptah-extension\.claude-worktrees\pr-603-landing-i18n (branch claude/sleepy-turing-pdzxlm,
  head 391c9f8a1, 52 commits not on main): landing-page Arabic translation + RTL work (TASK_2026_575).
- Commits not on main: fdd2b2944 (web-panel-ui rtl panel shell), 5480e030a / eaa0cf284 / c6af95c4d (i18n-check
  scripts), 3daeac7f0 (Arabic register decision, TASK_2026_575 paused).

## Conversation Summary
- User wants the smallest path to good Arabic/RTL rendering in the main chat page (agent replies in Arabic),
  not a full landing-page translation.
