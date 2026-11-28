## Verdict

**REVISE** — Several defects block acceptance across `ptah_inspect`, `server-instructions`, and alias handling: `ptah_inspect`'s `list` operation wraps `ptahAPI.search.findFiles` in `formatSearchFiles(...).split('\n')` (corrupting output, breaking `limit` and zero-match handling) and ignores `workspaceRoot`; `server-instructions.ts` silently drops the reworded `FALLBACK_LINE` from `initialize.instructions` because its regex still requires `^Fall back to\b`; and `handleInspect` rejects valid multi-root `workspaceRoot` folders that `protocol-dispatcher.ts` allows. Note: the initial `TOOL_SUBSTITUTIONS` table additions were authored by Antigravity (same family as this reviewer), which is a same-family read and weaker evidence for those rows.

Review family: antigravity (implementer families: codex, antigravity)

## Defects

1. **Blocking** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1250`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/inspect.ts:90-95`, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/core-namespace.builders.ts:151-162`, `libs/backend/platform-core/src/utils/bounded-glob-walk.ts:236,255`:
   `protocol-dispatcher.ts:1250` passes `formatSearchFiles(await ptahAPI.search.findFiles(pattern, limit), false).split('\n')` as `listFiles`. Because `formatSearchFiles` (`mcp-response-formatter.ts:453-473`) prepends Markdown headers (`## File Search`, blank line, `Found: N files`), `inspect.ts:92-94` treats header lines as matched files, slicing off real paths, making `'No files matched.'` unreachable, and emitting false `… more files` truncation warnings even on 0 matches. Additionally, `ptahAPI.search.findFiles` resolves `resolveRootPerCall(workspaceProvider)` and ignores `workspaceRoot`, and `walkGlobMatches` does not verify `start` stays inside `cwd` (same gap as `ptah_search_files`).
   Trigger: `{ workspaceRoot: "/repo/sub", ops: [{ op: "list", pattern: "**/*.ts", limit: 2 }] }` (returns `## File Search\n\n… more files…` with no paths, searches `/repo` instead of `/repo/sub`; `pattern: "../outside/*.txt"` walks outside `cwd`).
   Smallest fix: Wire `listFiles` to run `fileSystemProvider.findFiles` (or a root-scoped raw path finder) against `workspaceRoot` directly without `formatSearchFiles`, and validate `start` containment inside `cwd` before walking.

2. **Serious** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/server-instructions.ts:52`, `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts:62-63`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/server-instructions.spec.ts:127-132,245-252`:
   `FALLBACK_LINE` in `tool-guidance.render.ts:62` changed from `'Fall back to ...'` to `'Fall back only after one targeted Ptah attempt errors/returns zero hits...'`, while `server-instructions.ts:52` still filters with `/^Fall back to\b/`. `parseFallbackLine` returns `''`, so `buildServerInstructions()` silently omits the fallback rule from MCP `initialize.instructions`. `server-instructions.spec.ts:127-132` was changed to assert `UNLISTED_FALLBACK` instead, masking the drop.
   Trigger: Calling `buildServerInstructions()` (or MCP `initialize`) with the shipped `PTAH_MCP_SUBSTITUTION_SECTION`.
   Smallest fix: Change `FALLBACK_LINE` in `server-instructions.ts:52` to `/^Fall back\b/` and assert in `server-instructions.spec.ts` that `buildServerInstructions()` includes the fallback line (while staying within 512 chars/bytes).

3. **Serious** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/inspect.ts:111-116`, `inspect.ts:83`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1228-1248`:
   In a multi-root workspace (`getInfo().path = rootA`, `knownWorkspaceFolders = [rootA, rootB]`), `protocol-dispatcher.ts:1228-1248` permits `workspaceRoot: rootB`, but `inspect.ts:111-115` calls `resolveNavWorkspacePath(root, allowedRoot)` with `allowedRoot = rootA` and rejects `rootB` as outside `rootA` (unlike `ptah_grep` and `ptah_read_symbol`). Separately, `inspect.ts:83` formats the `## <n> read` header from `op.startLine`/`op.maxLines` rather than the normalized `offset`/`limit` aliases.
   Trigger: Multi-root `{ workspaceRoot: rootB, ops: [{ op: "git", action: "status" }] }` errors with `resolves outside the workspace root`; `{ ops: [{ op: "read", file_path: "src/note.txt", offset: 2, limit: 1 }] }` prints header `## 1 read src/note.txt:1-120`.
   Smallest fix: Let `handleInspect` resolve `resolveNavWorkspacePath('.', root)` once the dispatcher validates `workspaceRoot` against `allowedRoots`, and compute the `read` header range from the normalized `startLine`/`maxLines`.

4. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts:492,499-517`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:288`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/inspect.ts:77,87`:
   - `grep.ts:509`: `input['-i'] === true ? false : input['-i'] === false` silently maps non-boolean `'-i'` (`'yes'`, `1`, `null`) to `caseSensitive: false` instead of failing validation.
   - `grep.ts:514`: `Number(input[key]) || 0` coerces invalid `'-C'`/`'-A'`/`'-B'` (`'abc'`, `true`, `null`) to `0`/`1` and clamps > 5 instead of rejecting invalid values like `context`.
   - `grep.ts:517`: silently clamps canonical `maxMatches` > 200 without note or schema validation error.
   - `grep.ts:502-504`: mixed `type: "ts,*.md"` produces `"*.ts,*.md"`, which `globToRegExpBody` (`grep-engine.ts:279`) and `rg` treat as a literal comma in the filename.
   - `grep.ts:492` and `read-symbol.ts:288`: `!Object.hasOwn(input, to)` drops aliases when the canonical key is present with value `undefined`.
   - `inspect.ts:77,87`: `typeof value['limit'] === 'number'` accepts `Infinity`, clamping it to `400`/`100` instead of rejecting non-finite numbers.
   Trigger: `handleGrep({ pattern: 'LIMIT', '-i': 'yes' }, deps)` or `handleGrep({ pattern: 'LIMIT', type: 'ts,*.md' }, deps)`.
   Smallest fix: Check `input[to] === undefined`; validate strict boolean/finite-integer types for aliases before mapping; clamp `head_limit` only (leaving canonical `maxMatches` to Zod); normalize every entry in `type` inside `*.{...}` when comma-separated.

5. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts:392-398`:
   `renderGrepResult` returns early for `output_mode: 'files_with_matches'` and `'count'`, omitting the summary header, `+ N more matches not shown` footer, `incomplete` warning, `skippedNote`, and `Engine note`, and formats 1 match as `(1 matches)`.
   Trigger: `handleGrep({ pattern: 'x', maxMatches: 1, output_mode: 'files_with_matches' }, deps)` across many files returns a single line with no truncation notice.
   Smallest fix: Append the standard truncation/incomplete/engine-note footer lines and use `plural(matches.length, 'match')`.

6. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:640-648`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-result-budget.ts:128-131`:
   (a) `buildInspectTool()` sets `additionalProperties: false` on `ops.items` while omitting the alias keys (`offset`, `file_path`, `head_limit`, `type`, `output_mode`, `-i`, `-n`, `-C`, `-A`, `-B`) that `inspect.ts:62-66` accepts, so strict MCP schema validators reject those aliases.
   (b) `TOOL_RESULT_BUDGET_OVERRIDES['ptah_inspect']` sets `{ chars: 24_000, tokens: 6_000 }`. Because numbered code averages ~2.7 chars/token (`tool-result-budget.ts:118`), 17,000–24,000-char results (~6,300–8,900 tokens) are truncated and spooled by `applyToolResultBudget`, dropping `inspect.ts:132`'s `… result cut` footer despite advertising `maxResultSizeChars: 24_000`.
   Trigger: Schema-validated `{ ops: [{ op: 'read', file_path: 'a.ts', offset: 1 }] }`, or a 20,000-char code `ptah_inspect` reply.
   Smallest fix: Set `additionalProperties: true` on `ops.items` (or drop alias support in `inspect.ts`); align `ptah_inspect` token budget to `9_000` (or cap `INSPECT_MAX_RESULT_CHARS` at `15_000`).

7. **Minor** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:354,373`, `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts:66`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:451`:
   `read-symbol.ts:354,373` prepends `leadNote` onto `isError: true` replies (`note: ...\nError: ...`); `WORKTREE_ROOT_RULE` / `PTAH_LANE_POLICY:451` tells agents to pass `workspaceRoot` to "Ptah read/search tools", though `ptah_search_files` (`protocol-dispatcher.ts:1174`) ignores `workspaceRoot` and silently searches the outer root.
   Trigger: `handleReadSymbol({ file: 'notes.txt', offset: 999 }, deps)` or `ptah_search_files { pattern: '*', workspaceRoot: '/wt' }`.
   Smallest fix: Prepend `leadNote` only when `!reply.isError`; name the tools that accept `workspaceRoot` (`ptah_read_symbol`, `ptah_grep`, `ptah_inspect`, `ptah_ast_analyze`).

## Checked and sound

- **`ptah_inspect` git argument and cwd safety** (`inspect.ts:25,35-47,97-102`): `gitSchema` is `.strict()`, `action` is an enum of 4 read-only actions, `base` is restricted to `diff_stat` and `/^(?!-)[A-Za-z0-9._/-]{1,200}$/`, `log` limit clamps at 20, `gitArgs` emits fixed argument arrays with `execFile` (`shell: false`, 10s timeout, 1 MB buffer), and `cwd` is `resolved.value.rootReal`.
- **`ptah_inspect` concurrency, ordering, error isolation, and caps** (`inspect.ts:54-70,103-133`): 3-worker pool preserves input order by index, synchronous/async op throws are caught per-op, `ops` enforces 1..8, all-failed returns `isError: true`, partial failure returns `isError: false`, and section/total char caps hold at 8,000/24,000 (aside from the token budget mismatch in Defect 6).
- **Read-only caller policy & schema unknown-key guards** (`mcp-caller-policy.ts:52`, `grep.ts:518-522`, `read-symbol.ts:298-302`, `inspect.ts:67-69`): `ptah_inspect` is in `READ_TOOLS`, so `read-only`, `lane-report`, and `privileged` callers behave consistently, and `applyPhaseToolFilter` still applies. Unknown keys on `ptah_grep`, `ptah_read_symbol`, and `ptah_inspect` are rejected with valid-key lists.
- **Eager set & budgets** (`protocol-dispatcher.ts:674-694`, `effective-tool-list.ts:150,168,187-214`, `eager-tool-definitions.budget.spec.ts:21-22`): `ptah_inspect` and `ptah_session_handoff_ack` are always-on; `ptah_agent_read`/`wait`/`status` are gated on `agent` namespace and `markEagerTools` safely skips absent tools when `agent` is disabled. Focused specs passed: `eager-tool-definitions.budget.spec.ts`, `effective-tool-list.spec.ts` (with 4 snapshots), `tool-result-budget.spec.ts`, `mcp-mandate-manifest.spec.ts`, `mcp-contract.sweep.spec.ts`, `tool-guidance-drift.spec.ts`, `lane-policy-sync.spec.ts` (171/171 across the 5-suite run + `inspect.spec.ts`, `server-instructions.spec.ts`, `eager-tool-definitions.budget.spec.ts`).
- **Guidance sizes & callers outside diff** (`tool-substitutions.spec.ts`, `ptah-core-prompt.spec.ts`, `cli-adapter.utils.spec.ts`, `template-partial-resolver.spec.ts`): all four focused suites passed (`ptah-core-prompt.spec.ts` 7/7, `cli-adapter.utils.spec.ts` 119/119, `template-partial-resolver.spec.ts` 23 passed / 1 skipped, `tool-substitutions.spec.ts` passed). Exports `ToolGuidanceNamespace`, `ToolSubstitution`, `renderLaneToolTable`, `renderAgentToolingRules`, `renderCoreSubstitutionBlock`, `GrepArgsSchema`, `ReadSymbolArgsSchema`, `PTAH_LANE_POLICY` have no broken external callers in `apps/ptah-extension-webview`, `libs/frontend/**`, or `apps/ptah-electron`.
- **Missing tests**:
  1. No `protocol-dispatcher.spec.ts` integration test calling `ptah_inspect` end-to-end through `handleMCPRequest` (which would have caught Defect 1 and Defect 3).
  2. `eager-tool-definitions.budget.spec.ts` tests `hasIDECapabilities: true` without testing Electron's `hasIDECapabilities: false, hasSqliteLayer: true`.
  3. No tests for invalid non-boolean `'-i'`, non-integer `'-C'`/`'-A'`/`'-B'`, mixed `type: 'ts,*.md'`, `undefined` canonical keys alongside aliases, or truncated `output_mode: 'files_with_matches' | 'count'`.
  4. `server-instructions.spec.ts` lacks a check that `buildServerInstructions()` retains the `FALLBACK_LINE` from `PTAH_MCP_SUBSTITUTION_SECTION`.

## Not reviewed

- **TypeScript compiler check (`ptah_get_diagnostics`)**: timed out at 45s twice on the 8 changed files (`coverage: qualified — 8 files unchecked`), and per instructions `nx` / workspace-wide `tsc` was not run.
- **Three pre-existing Windows symlink tests**: `grep.spec.ts:284`, `read-symbol.spec.ts:304`, and `protocol-dispatcher.spec.ts:10958` failed at `symlink` with `EPERM` on Windows before reaching assertions.
- **Uncommitted PR-2 items in `context.md`**: `.claude/agents/*.md` regeneration and tool-call ledger are deferred to PR 2 (`decisions.md:3`) and not present in this diff.
