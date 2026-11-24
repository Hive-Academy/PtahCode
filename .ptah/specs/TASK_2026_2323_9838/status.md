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
