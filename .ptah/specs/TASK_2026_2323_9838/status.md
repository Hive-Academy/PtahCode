# Status — TASK_2026_2323_9838

## Batch 1 — investigation and fix (2026-11-24)

- Root cause of the third CLAUDE.md copy: the bench harness ran `git init` in the workspace
  after the native-haiku arm and before the ptah-haiku arm. Not Ptah code.
- Ptah-controlled growth r6 → main: about +1k chars, about +250 tokens per turn (system
  prompt append +273 chars, eager tools +704 chars). Core prompt, server instructions, eager
  tool set, agents, skills and plugin commands: no change.
- Fix: flag-tier `claudeMdExcludes` for byte-identical ancestor CLAUDE.md copies
  (commit 88da79d34). Budget specs for the eager tool set, the symbol block and the memory
  block.
- Related tests and lint/typecheck passed for agent-sdk and vscode-lm-tools.
- Parent approved a merge of origin/main (7e24e47d1) to correct the benchmark report.

## Batch 2 — gate, review and PR (2026-11-24)

- Review S1 fixed (fe1bb6860): a copy is excluded only when the kept copy loads. Re-review:
  APPROVE 8.5/10.
- Full gate passed: `npm run verify -- -p agent-sdk,vscode-lm-tools` and
  `npm run verify -- -t typecheck -p ptah-electron`.
- Report and benchmark-report correction committed (9e13544c3). PR #1497 opened against main.
- Task status set to in_review. CI and the CodeRabbit review were pending at this batch.

## Batch 3 — CI and review findings (2026-11-24)

- CI `checks` failed in the degradation audit (4 unsuppressed catch sites in
  `claude-md-dedup.ts`). Fixed with reasoned `optional-capability` markers; audit reports 0.
- Review threads fixed: managed settings now turn the walk off (present or unreadable source;
  off on macOS and Windows, where MDM and the registry cannot be checked by a file read);
  linear HTML-comment scan with a size cap; fence close rule (same marker, run at least as
  long). Specs added for each fix.
- Related tests, lint/typecheck and the full gate for agent-sdk and vscode-lm-tools passed.
