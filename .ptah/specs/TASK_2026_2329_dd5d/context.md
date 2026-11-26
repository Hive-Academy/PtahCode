# Task Context - TASK_2026_2329_dd5d

## User Request
/orchestrate we have worked before on fixing the install and review skills in our setup wizard , and also i'm experiencing lots of issues when i navigate back and forth when i open the setup wizard for example and start an analysis and go back i see it as intrrrupted in the list while it should be showing as active and it shouldn't be stopped, also somehow the decision model is not properly working when reviewing skills, and skills themselves are not ordered by download count

## Task Type
BUGFIX

## Complexity
Medium-Complex (3 distinct bug areas across frontend onboarding/setup-wizard and backend agent-generation/lane-routing/rpc-handlers)

## Strategy
BUGFIX pack (`software.md`), Partial/Full depth:
`research` -> `batch` -> `implement` -> `review` -> `tests` -> `completion` -> `research` (after-QA modernization scan)

## CLI Lanes
- **Preference source**: `ptah_memory_search` found preference for CLI lanes (`codex` implementation / cross-family review) when spawnable.
- **Availability**: `ptah_agent_list` reported 3 confirmed-room lanes (`codex`, `Ollama Code`, `kimi code`) and installed `antigravity`, `grok`; however, `ptah_agent_spawn` is not exposed in this runtime's tool list, so CLI lanes cannot be spawned from this session.
- **Mode**: `disabled` (because `ptah_agent_spawn` is unavailable in this session).
- **Approval**: `user` (for any document gates if triggered; BUGFIX is plan-free).
- **Execution**: Built-in subagents (`research`, `self` / custom roles) with independent review subagent and explicit weaker-evidence disclosure where same-family fallback applies.

## Worktree & Branch
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Branch**: `fix/setup-wizard-nav-skill-review` (branched from `main` @ `6a99ab936`)

## Related Prior Work
- `TASK_2026_2325_899d` (PR #1514, merged as `6a99ab936`): "Add AI judge for onboarding skill recommendations"

## Conversation Summary
- Initial task setup, worktree creation, and root-cause investigation started across three reported issues:
  1. Navigating back and forth in setup wizard stops or marks an active analysis as interrupted instead of keeping it running and showing it as active.
  2. Decision model not properly working when reviewing/ranking skills.
  3. Skills not ordered by download count.
