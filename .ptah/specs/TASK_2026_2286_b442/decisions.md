# Decisions

| # | Decision | Evidence | Step |
|---|----------|----------|------|
| 1 | Type BUGFIX, depth Partial; flow research -> implement -> review -> tests -> completion | Request has a defect and a bounded layout change | evidence |
| 2 | Lanes enabled, approval lane-review | No stored preference; codex lane has room | evidence |
| 3 | Restore the agy CLI usage source with guards (stdin ignored, hard timeout, accept only `command.name === 'usage'` and `num_turns === 0`) | Live runs reply in 3 s with zero turns; other two sources cannot work on a CLI-only install | evidence |
| 4 | No design phase or prototype: the user gave the layout; the change restyles existing tables and adds no surface or capability. Before/after screenshots at completion | User request text | evidence |
| 5 | Supersedes 4: user asked (2026-11-20) for the ui-ux-designer on the whole analytics page. Run `design` -> prototype -> cross-side review -> Gate 1.7, then a second frontend batch | User message | user |
| 6 | User asked for a CLI usage-command fallback for Grok and other installed CLIs. Run `research` first: `grok usage --json` fails here ("can't show your plan's usage here yet") and `grok -p /usage` reports "Not signed in" | Live commands | evidence |
| 7 | Grok: no CLI usage fallback in this task. `~/.grok/auth.json` is `{}` (signed out), so `grok usage --json` cannot be observed; its success shape is unknown. Shipping an unproven parser is rejected | research-report.md | evidence |
| 8 | Fix the wrong label: `PLAN_LIMIT_REASON_LABELS['cli-not-signed-in']` names Antigravity for every provider (`plan-owner.model.ts:60`). Make the text provider-specific. Goes in the second frontend batch | research-report.md | evidence |
| 9 | Claude `claude -p /usage` text source: later task. The dashboard already shows Claude limits from the session SDK | research-report.md, screenshot | evidence |
| 10 | Dashboard read path must set `allowCliFallback` (second backend batch) or Antigravity stays unavailable there | backend handoff notes | evidence |
| 11 | Gate 1.7 passed: the user approved the design ("the design looks good for me", 2026-11-20). The Codex design review continues; its findings go to the fix round | User message | user |
| 12 | Design review verdict REVISE (parity gaps): keep the approved look and treat the parity constraints in HANDOFF.md as binding. Deviations from design-spec.md that follow from them: donut legend stays in both modes; session title cell is `td role="rowheader"`; share bar is the share of the total; worktrees stay an always-expanded list; the savings cell is focusable only when it has a description | design-spec-review.md, batch-c2-*/c3-* reports | evidence |
