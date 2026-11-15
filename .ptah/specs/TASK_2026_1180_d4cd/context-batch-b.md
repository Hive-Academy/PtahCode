# TASK_2026_1180_d4cd — batch (b): antigravity usage reader

The task carrier (`task.md`, `context.md`) lives on branch `fix/lane-plan-limit-state`
(PR #1298). This branch carries batch (b) only, so it adds no second carrier.

## Scope

- Read usage with `agy -p /usage --output-format json` in a temporary cwd. The legacy TSV
  output stays as the fallback parse.
- New tolerant Zod parser `antigravity-usage-json.parser.ts`.
- The OAuth reader returns `no-usage-source` before any HTTP call when no token file exists.
- CLI timeout 15 s. Chain deadline 20 s (`USAGE_CHAIN_DEADLINE_MS`,
  `ANTIGRAVITY_CHAIN_TIMEOUT_MS`). The outer lane lookup deadline stays 12 s.

## Decisions

- Windows carry no `modelScope`. A group name ("Gemini Models") is not a model id, so a
  scope of that name never matches a routed model and the window never gates. The window
  key and label carry the group. Batch (d) maps groups to model ids.
- No exhaustion evidence from the CLI reading. A parse failure gives `unknown (reason)`.
  A CLI window at 100% does not make AT LIMIT by itself.

## Lanes

| Lane | Agent | Job | Deliverable |
| --- | --- | --- | --- |
| codex | 7478759c | implementation | batch-b-report.md |
| Claude Api (ptah-cli) | db3cd26e | logic review | review-batch-b.md |
| codex | 94012bc3 | review fixes 1-8 | batch-b-fix-report.md |
| Claude Api (ptah-cli) | 96cb3b1d | re-review | review-batch-b-2.md |
| codex | 95f05f2d | re-review fixes N1-N5 | batch-b-fix2-report.md |
| Claude Api (ptah-cli) | 18ba1e09 | third review | review-batch-b-3.md |

Review 3 finding M1 (Windows tree kill of an exited parent PID) was fixed by the coordinator:
`stopRun` skips the tree kill on Windows when the parent exited.
