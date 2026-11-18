# Decisions — TASK_2026_2277_22ef

| # | Decision | Source | Evidence |
| --- | --- | --- | --- |
| 1 | Type FEATURE, depth Full, lanes `enabled`, codex first | Evidence (memory, global CLAUDE.md, `ptah_agent_list`) | `context.md` Gate 0.1 |
| 2 | Usage source for grok and antigravity: repair the direct readers first, then add a pseudo-terminal `/usage` probe as a fallback | User (AskUserQuestion, 2026-11-18): "Both, readers first" | `context.md` live probe results |
| 3 | Deliver as three pull requests: (1) grok and antigravity limit state, (2) Claude API pricing and spend, (3) limits for an idle named Claude account | Coordinator; reversible | The three parts touch different readers and have different risk |
| 4 | Do not keep `agy -p /usage` as a fallback: it starts a model turn | Evidence | Live probe: `DEADLINE_EXCEEDED`, turn in progress |
| 5 | A spend total for an API-key lane is labeled as spend, never as plan room | Evidence | `analysis.md` section E |
| 6 | Split pull request 1: 1a = direct readers, failure reasons, removal of `agy -p /usage`, 402 matcher (plan batches B1, B2, B3 without the PTY coordinator seam); 1b = PTY `/usage` probe (B4 to B9, adds `node-pty`) | Coordinator; reversible | 1a has no native dependency and gives a correct limit state at once; 1b needs real interactive screen fixtures and a packaged smoke test |
| 7 | Pull request 1a starts without a separate plan approval | User answer "Both, readers first" covers it | AskUserQuestion 2026-11-18 |
| 8 | Show the account email for the main Claude account too, and a masked email label on each Claude limits row (pull request 3) | User request 2026-11-18 | PR #1368 reveals the email only for named accounts |
| 9 | This task and its branch deliver pull request 1a only. The PTY probe (1b), the Claude API pricing and spend (2) and the named-account limits with the account email (3) become separate tasks with `relatesTo` this task; their plans stay in this folder | Coordinator; reversible | The host sets a task to done when its pull request merges; one task for four pull requests would close too early |
| 10 | Keep `antigravity-usage-json.parser.ts` and `antigravity-usage-window.ts` without a production caller | Coordinator; reversible | Re-review minor 1; part 1b parses the same usage rows |
| 11 | The email label on each Claude limits row is masked as `a***@domain` (pull request 3) | User answer 2026-11-18 | Refines decision 8 |
