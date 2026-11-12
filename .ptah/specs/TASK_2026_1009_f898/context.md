# Context: Phase 1 - Phase contract

Parent program: `TASK_2026_977_0876` (merged to `main` as `a5e4e7b92`, pull request #1131).
This task is Phase 1 of that program. The scope and the acceptance are in
`.ptah/specs/TASK_2026_977_0876/task-description.md` § 5 "Phase 1 - Phase contract".

## Worktree

- Path: `.claude-worktrees/phase-contract`
- Branch: `feat/phase-contract`, created from `origin/main` at `a5e4e7b92`.

## Inputs from Phase 0

- `task-description.md` § 9 point 1: `plugins/ptah-core/skills/orchestration/**` is the authored
  source. `.claude/skills/orchestration/**` is a copy.
- State on `a5e4e7b92`: 5 of 9 files differ between the two copies (`SKILL.md`,
  `references/agent-catalog.md`, `references/git-standards.md`, `references/strategies.md`,
  `references/task-tracking.md`). The first step of this phase merges them and adds a check that
  keeps them equal.
- `template-classification.md`: where the discipline content of each role template goes.
- `parity-inventory.md`: capabilities to keep, move or remove. This phase removes nothing.
- User decisions U-D1 to U-D12 (`task-description.md` § 7). U-D9: a spawn has three inputs
  (`phase` primary, `skills` optional, `role` only for a user-written agent file).
- `tools/role-census`: the count of role-name lines in each bucket can go down only. When this
  phase removes names, it runs `--update` in the same pull request.

## Rules of the program that apply

- No silent removal. The subagent path of today continues to work.
- Lane output is evidence, not proof. A reviewer cannot approve a removal.
- Each orchestrator decision goes in `decisions.md`.

## Gate 0.1 (2026-11-12)

- Preference source: user global instructions (delegate to CLI lanes, prefer non-Claude vendors).
- Mode: `enabled`. Approval mode: `lane-review`.
- Lanes from `ptah_agent_list`: `codex` (installed, Weekly 21%, aged value), `Claude Api`
  (available, limits not tracked), `antigravity` (installed, unknown), `grok` (installed, unknown),
  `claude` (installed, not preferred). `Glm` and `kimi code` are AT LIMIT. `copilot` and
  `opencode` are disabled. `cursor` and `pi` are not installed.
- Plan: `codex`. Cross-side review of the plan: `Claude Api`.

## Coordination

The session `Coordinator (cont.)` coordinates the design system tracks. It confirmed on
2026-11-12 that its sessions do not edit the write set of this phase.
