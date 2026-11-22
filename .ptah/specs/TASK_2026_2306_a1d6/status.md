# Status (batch 2, not pushed yet)

Commits: 7adb12d43, a5ea78fce, 078280208, c7795d248.

Gate 1 (shared, agent-sdk, cli-agent-runtime, vscode-lm-tools, agent-generation):
lint + typecheck 10/10 passed. Tests passed for shared, agent-sdk, agent-generation.

Findings:
1. vscode-lm-tools: the per-tool description budget spec and the schema-hash snapshot failed
   because of the description edits (ptah_grep cue, ptah_workspace_analyze reword, new `regex`
   parameter text). Fixed in c7795d248: ptah_workspace_analyze is 200 chars (budget 231),
   ptah_grep budget 534 -> 608, snapshot updated (ptah_grep hash only). The nav work will hit the
   same budget line and snapshot hash for ptah_grep: expect a small merge conflict, re-measure
   (budget = ceil(len * 1.1) + 10). `mcp-contract.sweep.spec.ts` times out (30 s) under load when
   run with other suites; it passes alone (77/77).
2. cli-agent-runtime: `agent-process-manager.account-binding.spec.ts` "stays ambient when the
   stored lane selection is the default route" fails (readStoredSelection called 2 times, expected
   1). It also fails with this task's two cli-agent-runtime files reverted to 569011f8e, so it is
   pre-existing on the feat/ptah-nav-tools base. Not touched here.

Next: vscode-lm-tools tests again, Electron + renderer scoped gate, push in background, stacked PR
(body: degradation-audit:lint at nav/grep-engine.ts:352 is fixed on feat/ptah-nav-tools, item 7
open, the account-binding failure is pre-existing).

# Status (batch 3)

Pushed refactor/tool-guidance-single-source and opened PR #1475
(https://github.com/Hive-Academy/PtahCode/pull/1475), base feat/ptah-nav-tools, head c7795d248.
The body records: degradation-audit:lint item (fixed on the nav branch), item 7 open, the
pre-existing account-binding failure, and the expected ptah_grep budget/snapshot merge conflict.
CI watch is running (`gh pr checks 1475 --watch`, log .ptah/tmp/ci-watch.log).
