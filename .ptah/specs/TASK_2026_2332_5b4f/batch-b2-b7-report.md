# Batch B2+B7 final report

## Changed files

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/inspect.ts`, `nav/inspect.limits.ts`, `nav/inspect.spec.ts`
- `tool-description.builder.ts`, `effective-tool-list.ts`, `protocol-dispatcher.ts`, `mcp-caller-policy.ts`, `tool-result-budget.ts`
- `eager-tool-definitions.budget.spec.ts`, `protocol-dispatcher.spec.ts`, `effective-tool-list.spec.ts.snap`, `mcp-contract.sweep.spec.ts`, `mcp-mandate-manifest.spec.ts`, `tool-result-budget.spec.ts`, `server-instructions.spec.ts`
- `nav/grep.ts`, `nav/grep.spec.ts`, `nav/read-symbol.ts`, `nav/read-symbol.spec.ts`, `agent-wait.tool.ts`, `session-handoff-ack.tool.ts`
- `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts`, `tool-substitutions.ts`, `tool-substitutions.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts` and its spec
- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts` and its spec

## ptah_inspect

Final input is strict `{ workspaceRoot?: string, ops: [...] }`; 1–8 operations, each `read`, `grep`, `list`, or `git`. Read/grep accept the existing alias normalization. Unknown op/keys fail only that operation; an all-failed batch returns an error. Independent operations run with concurrency 3 and results retain input order. The first line reports root/counts, followed by ordered `## <n> <op> ...` sections. Partial failures render `ERROR op #n: ...`.

Limits: read defaults to 120 lines/max 400; grep defaults to 30/max 100 (inlineBody disabled); list defaults to 50/max 200; log limit is clamped at 20; each section max 8,000 chars and whole result max 24,000 chars. Truncation includes continuation footers. Git uses `execFile` with fixed argument arrays, validated root cwd, and 10-second timeout. `base` is limited to `diff_stat` and `^(?!-)[A-Za-z0-9._/-]{1,200}$`. File/path containment uses `nav-workspace-path.ts`; operations compose existing grep, read-symbol and search-files handlers.

Registered in `tool-description.builder.ts`, `effective-tool-list.ts`, and `protocol-dispatcher.ts` for main chat and CLI lanes. Updated/asserted in dispatcher and effective-list specs/snapshot, `mcp-caller-policy.ts`, `mcp-contract.sweep.spec.ts`, `mcp-mandate-manifest.spec.ts`, `tool-result-budget.ts` and its spec, and tool-guidance drift assertions. `ptah_inspect` is EAGER.

## Eager budget

Definition size is name + description + JSON schema characters. Baseline: 15 tools, 21,029 chars, cap 22,080. Final: 20 tools, 25,516 chars, cap 26,792 (measured total + 5%, rounded up).

Final per-tool sizes (chars): `ptah_workspace_analyze` 255; `ptah_search_files` 581; `ptah_read_symbol` 1,355; `ptah_grep` 2,276; `ptah_inspect` 1,243; `ptah_get_diagnostics` 1,081; `ptah_session_handoff_ack` 374; `ptah_lsp_references` 798; `ptah_lsp_definitions` 897; `ptah_dirty_files` 202; `ptah_agent_spawn` 8,621; `ptah_agent_status` 441; `ptah_agent_read` 693; `ptah_agent_list` 333; `ptah_agent_wait` 871; `ptah_ast_analyze` 1,057; `ptah_context_enrich_file` 1,553; `ptah_get_dependents` 871; `ptah_get_symbol_index` 1,536; `ptah_relevance_rank_files` 478.

## Substitution row to add

Added in `libs/shared/src/lib/tool-guidance/tool-substitutions.ts` at priority/order 3 (the tool-guidance drift spec consumes the core mapping; the lane policy sync consumes the lane mapping):

- Core: instead of `Chained reads / grep / git status, diff, log`; call `ptah_inspect { workspaceRoot?, ops }`; why: `One bounded call; supports worktrees`.
- Lane: need `Batch reads/search and read-only git status/diff/log`; prefer `ptah_inspect { workspaceRoot?, ops }`; order 17.

The row does not displace the five priority-1 core entries. The two existing log rows were shortened to keep the prompt within its cap. Prompt token cap changed from 3,645 to 3,652 after the new prompt measured 3,652 tokens.

## Verification

Focused Jest commands used `npx.cmd jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>` with plain module resolution. Logs are under `.ptah/tmp/b2b7-<project>.log`.

- vscode-lm-tools: 12 suites; 9 passed, 3 failed only when Windows rejected symlink creation with `EPERM`; 827 passed, 21 skipped, 3 failed (851 total); 4 snapshots passed. The three blocked tests are `protocol-handlers › navigation tools bind workspaceRoot to a known root › (D15) a read-only caller cannot read outside its root with ptah_read_symbol or ptah_grep`, `handleGrep (node engine) › refuses a path outside the workspace, also through a symlink`, and `handleReadSymbol › refuses a symlink that points outside the workspace root`.
- shared tool-guidance: 1 suite passed, 76/76 tests.
- cli-agent-runtime: 1 suite passed, 119/119 tests.
- agent-sdk prompt harness: 1 suite passed, 7/7 tests.
- `tsc --noEmit` passed for lib and spec projects of vscode-lm-tools, shared, cli-agent-runtime, and agent-sdk.
- ESLint on changed files: 0 errors, 105 warnings (including existing project-graph and file-size/unused-import warnings).

## Decisions

- `ptah_inspect` is eager to remove the discovery turn. Its short definition and schema keep the operation shapes clear while meeting the measured eager cap.
- `ptah_run_check` mandate mapping was added in `mcp-mandate-manifest.spec.ts` against `run-check.tool.spec.ts`, guard `advertises the name, the targets and the 900 s ceiling`; its non-suite classification documents the process-runner behavior.
- Lane policy explicitly routes read-only git status/diff --stat/log through `ptah_inspect` and reserves native git for state-changing commands. `PTAH_LANE_POLICY` measures 3,157 UTF-8 bytes; lane table measures 1,615 bytes, both within caps.
- Prompt cap is 3,652 tokens (old 3,645); actual final prompt is at the new cap.

## Not done

No implementation item remains. The three listed symlink tests could not reach their assertions because this Windows environment returned `EPERM` creating the symlinks; the neighboring specs' skip guard does not cover these existing cases. No commits, pushes, or git state-changing commands were run.
