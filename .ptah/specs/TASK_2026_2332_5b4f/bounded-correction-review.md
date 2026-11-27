## Verdict

**REVISE** — Items 1, 3, and 4 are fixed, but Item 2 (`validateWorkspaceGlob`) is only partly fixed: it checks static base containment only lexically (leaving symlinked subdirectories unchecked in `walkGlobMatches`), breaks valid escaped-metacharacter `ptah_search_files` globs from `main`, and lets NUL bytes and `{..,src}` / `[.][.]` pass validation.

Review family: antigravity (implementer family: codex)

## Item status

| Item | Status | Evidence |
| --- | --- | --- |
| 1. `ptah_inspect` `list` bounded walk & excludes | FIXED | `nav/inspect.ts:45-55,111-122,140-154`; removes `findRawFiles`, delegates to `collectBounded(walkGlobMatches(..., { exclude: [...DEFAULT_WORKSPACE_EXCLUDES], dot: false, onFailure: () => undefined }), limit)`, normalizes relative `/` paths, preserves limit+1 footer / `'No files matched.'`, uses validated/second roots, and ignores child dir failures. |
| 2. Shared glob containment (`validateWorkspaceGlob`) | PARTLY | `glob-pattern-validation.ts:10-28`, `protocol-dispatcher.ts:1182,1199`, `nav/inspect.ts:113`; blocks `.\./`, `..`, drive/UNC/`/` prefixes, but checks `resolvedBase` only lexically, rewrites `\[` -> `/[` (breaking valid `main` globs), and passes NUL / `{..,src}` / `[.][.]`. |
| 3. `nav/grep.ts` `type` handling | FIXED | `nav/grep.ts:506-516`; uses `input['glob'] === undefined`, rejects non-string `type` and non-extension items (`/^(?:\*\.|\.)?[A-Za-z0-9]+$/`), maps `ts`, `ts,md`, `.ts`, `*.ts` consistently for `node`, `rg`, and `git` (`grep-engine.ts:557-559,783,803,887`). |
| 4. `PTAH_LANE_POLICY` `workspaceRoot` wording | FIXED | `cli-adapter.utils.ts:451`; lists `ptah_read_symbol`, `ptah_grep`, `ptah_inspect`, `ptah_ast_analyze` (all have `workspaceRoot` in `tool-description.builder.ts:545,616,636,2182`), matches `tool-guidance.render.ts:65-70`, passes `<= 3,400` UTF-8 bytes (`cli-adapter.utils.spec.ts:159`). |

## Pattern replay

| Pattern | Result |
| --- | --- |
| `.\./outside/*.ts` | Pass (rejected: `.. segment`) |
| `sub/../../x` | Pass (rejected: `.. segment`) |
| `..\x` | Pass (rejected: `.. segment`) |
| `..` | Pass (rejected: `.. segment`) |
| `./../x` | Pass (rejected: `.. segment`) |
| `C:/x/*.ts`, `C:\x\*.ts`, `c:x` | Pass (rejected: `relative glob`) |
| `\\server\share\*`, `//server/share/*`, `/etc/*` | Pass (rejected: `relative glob`) |
| `**/../../x`, `src/**/..` | Pass (rejected: `.. segment`) |
| `{..,src}/*.ts` | Bypass in `validateWorkspaceGlob` (passes with `base: ''`; `walkGlobMatches` mitigates by walking only `cwd` children) |
| `[.][.]/x` | Bypass in `validateWorkspaceGlob` (passes with `base: ''`; `walkGlobMatches` mitigates by walking only `cwd` children) |
| `a\0b/*.ts` (NUL byte) | Bypass in `validateWorkspaceGlob` (`fs` throws `ERR_INVALID_ARG_VALUE` in `walkGlobMatches`) |
| `**/*.ts`, `src/**/auth*`, `*.spec.ts`, `src\lib\*.ts`, `{a,b}/**/*.md` | Pass (valid globs work; `src\lib\*.ts` -> `src/lib/*.ts`) |
| `app/\[id\]/*.tsx` (valid escaped glob from `main`) | Regression (rewritten to `app//[id/]/*.tsx`; fails to match `app/[id]/page.tsx`) |

## Open defects

1. **Serious** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/glob-pattern-validation.ts:21-26`, `libs/backend/platform-core/src/utils/bounded-glob-walk.ts:236,255`:
   `validateWorkspaceGlob` checks `path.resolve(root, base)` only lexically against `path.resolve(root)`, and `walkGlobMatches` does not check `canonicalPathInsideRoot` on `start` or literal `absolute` before `stat`/`walk`.
   Trigger: a workspace symlink `link -> /outside` with `ptah_search_files { pattern: 'link/**/*.ts' }` or `ptah_inspect { ops: [{ op: 'list', pattern: 'link/**/*.ts' }] }` walks outside `root`.
   Smallest fix: resolve real paths and enforce `canonicalPathInsideRoot` on `start` and literal `absolute` inside `walkGlobMatches` before `stat`/`walk`.

2. **Serious** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/glob-pattern-validation.ts:11-13`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1199`:
   `validateWorkspaceGlob` converts every `\X` (except `\.`) into `/X` and `protocol-dispatcher.ts:1199` forwards `validatedPattern.pattern` to `ptahAPI.search.findFiles`, corrupting valid `main` globs with escaped metacharacters or spaces (confirmed via `picomatch`: `src/\[id\]/*.ts` becomes `src//[id/]/*.ts`, returning no match for `src/[id]/a.ts`).
   Trigger: `ptah_search_files { pattern: 'app/\\[id\\]/*.tsx' }`.
   Smallest fix: preserve `\` before glob metacharacters (`[](){}*?+! `) instead of replacing `\X` with `/X`, and run containment checks on the unescaped path.

3. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/glob-pattern-validation.ts:10-27`:
   `validateWorkspaceGlob` does not reject NUL bytes or brace/bracket-encoded `..` segments (`{..,src}/*.ts`, `[.][.]/x`). A NUL byte reaches `fs.promises.stat`/`realpath` in `walkGlobMatches` and fails with `ERR_INVALID_ARG_VALUE` / `IncompleteFileSearchError` instead of a clean validation error.
   Trigger: `ptah_search_files { pattern: 'a\u0000b/*.ts' }` or `{ pattern: '{..,src}/*.ts' }`.
   Smallest fix: reject `pattern.includes('\0')` and split brace/bracket alternatives when checking for `'..'` segments.

## Not reviewed

- Focused Jest runs executed here: `nav/inspect.spec.ts` (all passed), `cli-adapter.utils.spec.ts` (119 passed), `protocol-dispatcher.spec.ts -t "ptah_search_files"` (28 passed, 432 skipped), and `nav/grep.spec.ts` (passed except the pre-existing Windows symlink `EPERM` at `grep.spec.ts:284`). `ptah_get_diagnostics` timed out at 45s; `tsc` and ESLint were not re-run.
- `grep.spec.ts` only exercises `type` directly on the `node` engine (and `'.ts'`/`'*.ts'` are not explicitly in the test table, though verified in `grep.ts:511-513` and `grep-engine.ts`).
- `inspect.spec.ts:160` and `protocol-dispatcher.spec.ts:2018` do not cover `..`, `./../x`, `c:x`, `//server/share/*`, `{..,src}/*.ts`, `[.][.]/x`, NUL bytes, symlinked bases, or escaped-bracket globs.
