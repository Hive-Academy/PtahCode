# Review fix report

| Defect # | Confirmed | Fix | Regression test |
|---|---|---|---|
| 1 | Yes — `protocol-dispatcher.ts:1182` and `nav/inspect.ts:121-128` matched the reviewed formatted/global search and traversal gaps. | `protocol-dispatcher.ts:1182` validates `ptah_search_files` patterns before provider calls; `nav/inspect.ts:31-49,121-128` validates list globs and walks raw paths under the resolved call root. | `protocol-dispatcher.spec.ts` — “rejects unsafe search pattern %s before walking” (absolute and `..` cases) and “passes valid search pattern %s through to the provider” (`**/*.ts`, `src/**/auth*`); `inspect.spec.ts` — “rejects absolute and parent traversal list patterns before listing”, “lists raw root relative paths with correct empty and continuation output”. |
| 2 | Yes — `server-instructions.ts:52` matched only the obsolete fallback wording. | `server-instructions.ts:52,143-144` parses the shared fallback line robustly; `tool-guidance.render.ts:62` shortens the shared line while retaining it in rendered audiences. | `server-instructions.spec.ts` — “carries the fallback line from the section, without Markdown emphasis”; “reflects a reworded fallback line”. |
| 3 | Yes — `nav/inspect.ts:146-153` rejected valid secondary roots and `:101-111` needed normalized alias values for the read heading. | `nav/inspect.ts:146-153` resolves against registered roots; `:101-111` derives the read range from normalized `offset`/`limit`/`file_path` values. | `inspect.spec.ts` — “accepts a second registered workspace root”; “uses the normalized read alias values in the section header”. |
| 4 | Yes — the reviewed aliases were coerced or accepted with invalid numeric values. | `nav/grep.ts:496-524` validates aliases, applies aliases over `undefined`, expands type lists to supported globs, and clamps `head_limit`; canonical `maxMatches` remains schema validated. Inspect alias validation remains per-operation in `nav/inspect.ts:101-117`. | `grep.spec.ts` — “rejects invalid %s alias values” (`-i`, `-C`, `-A`, `-B`); “rejects a non-finite head_limit alias”; “clamps an oversized head_limit alias to the supported maximum”; “rejects canonical maxMatches above the schema maximum”; “applies head_limit when canonical maxMatches is undefined”; “searches node-engine files for type glob %s” (`ts`, `ts,md`, `ts,*.md`). `inspect.spec.ts` — “fails only the operation with a non-finite %s alias” (read and grep). |
| 5 | Yes — file/count output returned before the standard summary and continuation notes. | `nav/grep.ts:384-406` keeps summary and footer metadata in both output modes and uses pluralized file counts. | `grep.spec.ts` — “keeps summaries, truncation footers and singular/plural counts in file and count modes”. |
| 6 | Yes — the schema rejected aliases accepted by the handler, and the old 6,000-token budget could truncate the handler’s 24,000-character result. | `tool-description.builder.ts:647` permits the operation aliases; `tool-result-budget.ts:129-130` now uses 24,000 chars / 9,000 tokens; `mcp-contract.sweep.spec.ts` uses the same pinned budget. | `eager-tool-definitions.budget.spec.ts` — “advertises the aliases accepted by ptah_inspect”; `inspect.spec.ts` — “keeps the inspect continuation footer through the result budget near the total cap” (numbered-code output through `applyToolResultBudget`). |
| 7 | Yes — `read-symbol.ts:354,373` prefixed error replies with alias notes, and the workspace guidance named tools that do not honor `workspaceRoot`. | `read-symbol.ts:354,373` adds notes only on successful replies; `tool-guidance.render.ts:65-69` names the enabled tools that accept a workspace root and filters disabled namespaces. | `read-symbol.spec.ts` — “does not prefix an errored aliased read with the accepted-alias note”; `tool-substitutions.spec.ts` — “teaches the text search and read tools, not the native free-text search” checks the workspace-root tool names. |

## Verification

- Focused vscode-lm-tools command: `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the 12 requested specs (`nav/inspect`, `nav/grep`, `nav/read-symbol`, `protocol-dispatcher`, `effective-tool-list`, `eager-tool-definitions.budget`, `server-instructions`, `mcp-mandate-manifest`, `mcp-contract.sweep`, `tool-result-budget`, `tool-guidance-drift`, `lane-policy-sync`) — **9 suites passed; 853 tests passed, 21 skipped, 3 failed**. All three failures are the documented Windows symlink-creation `EPERM` tests in protocol-dispatcher, grep and read-symbol. Log: `.ptah/tmp/fix2-vscode-lm-tools.log`.
- Shared: `npx.cmd jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts` — **1 suite, 76 passed, 0 failed**. Log: `.ptah/tmp/fix2-shared.log`.
- cli-agent-runtime: `npx.cmd jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts` — **1 suite, 119 passed, 0 failed**. Log: `.ptah/tmp/fix2-cli-agent-runtime.log`.
- agent-sdk: `npx.cmd jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts` — **1 suite, 7 passed, 0 failed**. Log: `.ptah/tmp/fix2-agent-sdk.log`.
- TypeScript: `npx.cmd tsc --noEmit -p` passed for each of the lib and spec configs of vscode-lm-tools, shared, cli-agent-runtime and agent-sdk (**8 commands, 0 errors**). Logs: `.ptah/tmp/fix2-tsc-*.log`.
- ESLint: `npx.cmd eslint <git diff main --name-only plus the three untracked inspect*.ts files> --format json` — **29 files, 0 errors, 105 warnings; 0 warnings on added lines** (added ranges from `git diff main -U0`; untracked inspect files counted entirely as added). No new unused imports were reported.
- Scoped `ptah_get_diagnostics` was attempted twice for all changed TypeScript files; it remained unavailable after its 45-second compiler timeout. The requested project lib/spec `tsc` commands above passed.

## Caps

| Cap | Measurement | Limit |
|---|---:|---:|
| `buildServerInstructions()` | 478 chars | 512 chars |
| Eager tool definitions | 25,515 chars | 26,792 chars (baseline 25,516 plus 5%) |
| `ptah_inspect` eager definition | 1,242 chars | Included in eager total |
| `PTAH_LANE_POLICY` | 3,157 UTF-8 bytes | 3,500 bytes |
| Lane table | 1,615 UTF-8 bytes | 1,750 bytes (half the lane-policy byte cap) |
| Agent tooling rules | 2,280 UTF-8 bytes | 3,000 bytes |
| Core prompt | 3,648 tokens | 3,652 tokens |
| Inspect section output | 8,000 chars | 8,000 chars |
| Inspect total and result-budget override | 24,000 chars / 9,000 tokens | 24,000 chars / 9,000 tokens |

## Not done

- The three Windows symlink tests cannot reach their assertions in this environment because symlink creation fails with `EPERM`; all other named focused tests pass.
- `ptah_get_diagnostics` timed out twice; the explicitly requested TypeScript lib/spec checks passed for all four libraries.
