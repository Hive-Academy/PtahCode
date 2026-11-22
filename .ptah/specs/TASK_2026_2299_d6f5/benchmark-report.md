# Benchmark report: ptah navigation tools (TASK_2026_2299_d6f5)

## Summary

- Offline benchmark, 27 real navigation tasks, no model call and no paid call.
- Three strategies per task: `shell` (what agents run today: `rg`, `sed -n`, `cat`), `before` (the best chain of ptah tools on `main`) and `after` (the best chain with this change).
- Totals (calls, output tokens, correct answers):

| strategy | calls | output tokens | correct |
|---|---|---|---|
| shell | 27 | 10,609 | 27/27 |
| before (main) | 36 | 25,875 | 25/27 |
| after (this change) | 27 | 14,063 | 27/27 |

- Against the old ptah tools: 25% fewer calls, 46% fewer tokens, and 2 wrong answers fixed.
- Against the shell: the same number of calls, but 33% more tokens (14,063 against 10,609). The shell commands in the set are hand-tuned (`rg -n -A18 'private statusOf\('`), so they are small. The ptah output adds line numbers, a header and the enclosing-symbol label.
- The goal of the change is that ptah can answer in one call with a correct, bounded result. The numbers show this. They do not show that agents will choose it.

## How it was measured

- Task set: `scripts/nav-benchmark/tasks.ts` (27 tasks in 7 kinds). Each task comes from a pattern in the agent transcripts of this repository (shell `rg`/`grep`, `sed -n 'A,Bp'`, `cat`, `Read` with a range, Codex `exec`).
- Runner: `scripts/nav-benchmark/nav-benchmark.ts`. Shell steps run with bash at the repository root. Tool steps run in one Jest process through the real MCP dispatcher (`handleMCPRequest`, `tools/call`).
- Tokens: `countTokens` of `@ptah-extension/tool-output-reducers` (`gpt-tokenizer (countTokens from @ptah-extension/tool-output-reducers)`) on the text the agent would receive.
- Correctness: every task lists literal strings that the output must contain. A task is correct only if all of them are present. This checks the content, not only the size.
- BEFORE numbers: recorded on `main` (commit `60b632fb2`, date 2026-11-21), in a separate worktree, before any tool edit.
- AFTER numbers: recorded on this branch (base `60b632fb2` plus the uncommitted change), date 2026-11-22. The `shell` column is from the AFTER run (same commands, run again).
- The AFTER chain is the best chain that exists after the change: `ptah_read_symbol`, `ptah_grep` and `ptah_code_search_symbols` with extracts, `ptah_ast_analyze` for `outline-indexing-control`, and `ptah_grep` for `usages-symbol-session-spawner-service`. The `before` chain is unchanged.

Commands to repeat it (repository root, `rg` must be on PATH):

```
# BEFORE: run on a checkout of main
npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
  scripts/nav-benchmark/nav-benchmark.ts --strategies shell,before --out .ptah/tmp/bench-before.json
# AFTER: run on this branch
npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
  scripts/nav-benchmark/nav-benchmark.ts --strategies shell,after --out .ptah/tmp/bench-after.json
# Merge into one table
npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
  scripts/nav-benchmark/merge-runs.ts --before .ptah/tmp/bench-before.json --after .ptah/tmp/bench-after.json
```

Run each under `node scripts/verify.mjs --exec --task <name> -- <command>`. The tool part needs about 12 minutes on a loaded machine.

## Result per task

| task | kind | shell calls | shell tokens | shell correct | before calls | before tokens | before correct | after calls | after tokens | after correct |
|---|---|---|---|---|---|---|---|---|---|---|
| read-symbol-spawner-status-of | read-symbol | 1 | 202 | yes | 2 | 2122 | yes | 1 | 228 | yes |
| read-symbol-spawner-sdk-id-of | read-symbol | 1 | 194 | yes | 2 | 2120 | yes | 1 | 221 | yes |
| read-symbol-spawner-active-id-of | read-symbol | 1 | 103 | yes | 2 | 2074 | yes | 1 | 155 | yes |
| read-symbol-registry-find-unbound-by-cwd | read-symbol | 1 | 129 | yes | 2 | 908 | yes | 1 | 179 | yes |
| read-symbol-tab-manager-find-by-session | read-symbol | 1 | 138 | yes | 2 | 2089 | yes | 1 | 349 | yes |
| read-range-spawner-pending-record | read-range | 1 | 193 | yes | 1 | 193 | yes | 1 | 259 | yes |
| read-range-spawner-can-start | read-range | 1 | 192 | yes | 1 | 192 | yes | 1 | 250 | yes |
| read-range-permission-handler-levels | read-range | 1 | 159 | yes | 1 | 159 | yes | 1 | 234 | yes |
| read-range-plugin-loader-workspace-state | read-range | 1 | 98 | yes | 1 | 98 | yes | 1 | 152 | yes |
| usages-text-abort-reason-superseded | find-usages-text | 1 | 181 | yes | 1 | 181 | yes | 1 | 193 | yes |
| usages-text-carry-over-start-failed | find-usages-text | 1 | 325 | yes | 1 | 325 | yes | 1 | 287 | yes |
| usages-text-read-session-child-settings | find-usages-text | 1 | 423 | yes | 1 | 423 | yes | 1 | 310 | yes |
| usages-text-find-unbound-by-cwd | find-usages-text | 1 | 977 | yes | 1 | 977 | yes | 1 | 582 | yes |
| concept-release-attach-claim | find-by-concept | 1 | 324 | yes | 2 | 1057 | yes | 1 | 634 | yes |
| concept-clamp-read-tail | find-by-concept | 1 | 725 | yes | 2 | 1084 | yes | 1 | 593 | yes |
| concept-count-pending-permissions | find-by-concept | 1 | 187 | yes | 2 | 982 | yes | 1 | 586 | yes |
| concept-bind-sdk-session-id | find-by-concept | 1 | 150 | yes | 2 | 1118 | yes | 1 | 662 | yes |
| outline-session-spawner | outline | 1 | 1137 | yes | 1 | 1978 | yes | 1 | 1796 | yes |
| outline-indexing-control | outline | 1 | 441 | yes | 1 | 1979 | no | 1 | 1056 | yes |
| outline-permission-handler | outline | 1 | 379 | yes | 1 | 1795 | yes | 1 | 1212 | yes |
| usages-symbol-session-spawner-service | find-usages-symbol | 1 | 1194 | yes | 1 | 581 | no | 1 | 797 | yes |
| usages-symbol-bind-sdk-session-id | find-usages-symbol | 1 | 345 | yes | 1 | 656 | yes | 1 | 576 | yes |
| usages-symbol-pending-permission-count | find-usages-symbol | 1 | 123 | yes | 1 | 280 | yes | 1 | 248 | yes |
| usages-symbol-find-tab-by-session-id | find-usages-symbol | 1 | 1821 | yes | 1 | 1927 | yes | 1 | 1927 | yes |
| files-session-handoff | find-files | 1 | 300 | yes | 1 | 358 | yes | 1 | 358 | yes |
| files-session-spawner | find-files | 1 | 132 | yes | 1 | 163 | yes | 1 | 163 | yes |
| files-agent-usage-readers | find-files | 1 | 37 | yes | 1 | 56 | yes | 1 | 56 | yes |
| **total** | 27 tasks | 27 | 10609 | 27/27 | 36 | 25875 | 25/27 | 27 | 14063 | 27/27 |

## What the table shows

- `read-symbol` and `read-range`: before, one symbol read took 2 calls (`ptah_ast_analyze` for the line range, then `sed -n`) and about 2,100 tokens, or a plain shell call. After, 1 call and 150 to 350 tokens. The shell is still 25 to 50 tokens smaller, because it has no header and no line numbers.
- `find-usages-text`: before, ptah had no tool and the chain ended with the shell. After, `ptah_grep` answers in 1 call and is smaller than `rg -C3` on the one task with context (582 against 977 tokens).
- `find-by-concept`: 2 calls before (search, then a read). 1 call after, because the symbol hit carries a signature and extract. 36% to 40% fewer tokens than before.
- `outline`: the outline of a 3,119-line file is cut at a record boundary and names the cut records (`omittedNames`), so all expected names are present. Before, `ptah_context_enrich_file` on `indexing-control.service.ts` lost the names (wrong answer).
- `find-usages-symbol`: unchanged for 3 tasks (LSP references). The class-name task was wrong before (truncated list) and is correct after with `ptah_grep`.
- `find-files`: unchanged. `ptah_search_files` was not edited.

## Output changes that the tasks do not isolate

- `ptah_ast_analyze`: relative paths, imports merged per source, constructor parameters without comment or decorator fragments, the result never cut inside a record, and a `truncated` note with the names that were left out.
- `ptah_code_search_symbols`: no index or coverage block when the index is clean, no repeated path fields, `signature` and `extract` per hit, name matches ranked first. A stored line range that no longer names the symbol is dropped, not shown.
- `ptah_get_dependents`, `ptah_get_symbol_index` and `ptah_relevance_rank_files` are now loaded eagerly, as are the two new tools.

## What the benchmark does not prove

- It does not prove adoption. It measures one call on a fixed task set. It does not measure whether an agent picks the ptah tool instead of `rg`. That needs later transcript data (below).
- The tasks come from this repository and from the transcripts of one machine over 14 days. Other repositories and languages are not measured.
- The shell column is tuned by hand and favours the shell. A real agent often runs a broader command and reads more.
- Token counts use one tokenizer. Model cost differs per provider.
- No live agent run was made. No paid model call was used, so no cost was incurred (no `haiku` run was needed for the offline questions).
- The runner wires the real tree-sitter, file system, code-symbol index (built by the runner in a temporary database) and dependency graph, and sends each call through the real dispatcher. It does not wire the Electron workspace service, so it sends the caller workspace root with each call. A step that needs an unwired namespace is reported as `unavailable-offline`, not as a result.
- The `ptah_read_symbol` name form covers classes, functions and methods only. It does not cover interfaces, types, enums or constants. For those, the result tells the agent to use `ptah_grep` and a line range.

## Repeat the adoption measurement in two weeks

The counter reads the Claude transcripts (`~/.claude/projects/-home-amun-ptah-extension*`) and the Codex rollouts (`~/.codex/sessions`), read only. It prints counts, not command text.

```
npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
  scripts/nav-benchmark/count-nav-calls.ts --days 14
```

Counts at the start (14 days to 2026-11-21, before this change):

| source | shell grep/rg | shell sed -n | shell cat | Read | ptah navigation | other | total |
|---|---|---|---|---|---|---|---|
| Claude | 6003 | 2931 | 885 | 1640 | 112 | 3726 | 12860 |
| Codex | 632 | 628 | 74 | 0 | 0 | 1088 | 1923 |

The counts differ from the figures in the task request (a different window end and a stricter category rule). Compare new runs with this table, not with the request.

Success signal in two weeks: the share of `ptah-nav` calls rises, and the shell `grep`/`sed -n`/`cat` calls fall, in sessions that started after the change shipped. Filter the window to those sessions, because the transcripts of the old sessions stay in the 14-day window.
