# Implementation plan — ptah navigation tools

Worktree: `/home/amun/ptah-extension/.claude-worktrees/feat-ptah-nav-tools-20cadd9c194c`. MCP code:
`libs/backend/vscode-lm-tools/src/lib/code-execution/`.

## Tool contracts (fixed; the benchmark task list `scripts/nav-benchmark/tasks.ts` calls them)

### `ptah_read_symbol` (new, read-only)

Args: `{ file: string, name?: string, startLine?: number, endLine?: number, workspaceRoot?: string, maxLines?: number, kind?: string }`.

- `name` form: find the declaration of `name` in `file` from the tree-sitter ranges of the same
  extractors `ptah_ast_analyze` uses (functions, methods, arrow functions, classes). Return the whole
  declaration with 1-based line numbers (`  123| code`), preceded by one header line
  `file:start-end kind name`. Doc comment / decorator lines directly above the declaration are included.
- Ambiguous name (several matches, for example overloads or same method in two classes): return a
  short list `file:start-end kind qualified-name signature` and say "pass startLine/endLine or kind to choose";
  do NOT dump all bodies. Same-name overloads of one declaration: return all of them (bounded).
- Missing name: a clear result (not an exception) that lists the closest declared names (prefix/substring, max 10).
- Range form: `startLine`+`endLine` (1-based, inclusive). Clamp to file length; say so when clamped.
  `endLine` omitted = `startLine`+`maxLines`-1. Reject `startLine > endLine` and non-positive values with a tool error.
- Bounded: default `maxLines` 200, hard maximum 400; when cut, say "N more lines; call again with startLine=X".
- Works for every language the tree-sitter service supports; for an unsupported language the name form
  returns a clear message and the range form still works (plain text).
- Output is plain text, not JSON. Paths workspace-relative. The `file` argument accepts relative or absolute.

### `ptah_grep` (new, read-only)

Args: `{ pattern: string, path?: string, glob?: string, regex?: boolean, caseSensitive?: boolean, context?: number, maxMatches?: number, includeIgnored?: boolean, workspaceRoot?: string }`.

- Backed by `rg --json` when `rg` is found on PATH (spawn with `execFile`, no shell, args array,
  `--` before pattern/path, timeout 15 s, stdout cap 4 MB). Else a bounded Node fallback walk
  (skip `node_modules`, `.git`, `dist`, `coverage`; text files only; same output shape) and say
  which engine ran.
- `pattern` is a literal string unless `regex: true`. Smart case unless `caseSensitive` is given.
- `path` is a workspace-relative (or absolute inside the workspace) file or directory; default = workspace root.
  A path that escapes the workspace root is refused (tool error).
- `includeIgnored: true` adds `--no-ignore --hidden` (so `node_modules` and ignored paths are searched) and is
  only honoured when `path` is given and is not the workspace root (scoped path), else a tool error that says so.
- Output (plain text), grouped by file, files ordered by path:
  ```
  libs/x/y.ts (3 matches)
    120| [fnName] const a = ABORT_REASON_SUPERSEDED;
  ```
  Each match line: 1-based line, then `[enclosing symbol]` (innermost function/method/class from the
  tree-sitter ranges, omitted when none or when the language is unsupported), then the line text trimmed to 200 chars.
  `context: N` (0..5, default 0) adds N lines before and after.
- Bounded: default `maxMatches` 60 (max 200), max 40 files shown; footer line says what was cut
  (`+ N more matches in M files; narrow with path/glob`). Header line: `N matches in M files (engine: rg)`.
- No match = `0 matches` plus a hint line (check `includeIgnored`, `regex`).

## Output changes of existing tools

1. `ptah_ast_analyze`: relative `file`; imports merged per source (one row, all symbols; no empty rows);
   parameter parser handles comments, decorators, destructuring, generics and default values; output bounded
   so the tool-result budget never cuts it mid-record: key order `parseStatus`, `coverage` (only when not clean),
   `file`, `language`, `classes`, `exports`, `imports`, then `functions`; functions are cut at a record
   boundary and the result carries `"truncated":{"functions":{"shown":N,"total":M}}`.
2. `ptah_code_search_symbols`: hit = `{ file (relative, once), name, kind, startLine, endLine, signature, extract?, score }`;
   `extract` = first up to 8 lines of the declaration (signature to the first body line) for the top hits;
   the `index` and `coverage` blocks appear only when the index is not clean/fresh (stale, reindexing, partial, empty);
   no `subject`/`text` fields that repeat the path. Ranking: exact/prefix name match above doc/body-text match.
3. `tools/list`: add the new tools to the eager set (`ALWAYS_EAGER_TOOLS`), and make the symbol/memory
   and dependency navigation tools eager on runtimes that serve them (decision recorded in `decisions.md`).

## Registration pattern (follow it exactly)

Tool definition: `mcp-core/tool-description.builder.ts` (`buildXTool()` + list in `buildToolDefinitions`).
Handler: `case` in `mcp-core/protocol-dispatcher.ts`. Privilege class: `READ_TOOLS` in `mcp-core/mcp-caller-policy.ts`.
Eager set: `ALWAYS_EAGER_TOOLS`. Budget content kind: `TOOL_CONTENT_HINTS` in `mcp-core/tool-result-budget.ts`
(`preformatted` for the two new tools; they bound their own output). Namespace: add `grep`/`readSymbol`
methods where the pattern needs it, or implement the logic in new files under `mcp-core/` and call from the case.

## Guidance (second step, after the tools exist)

`libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts`, `PTAH_LANE_POLICY` in
`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts` (argv byte limit pinned
by `cli-adapter.utils.spec.ts`), MCP server instructions (`mcp-core/server-instructions.ts`),
`.claude/skills/agent-lanes/SKILL.md`, plan-lane/read-only allowlists. Keep the sync specs green.
