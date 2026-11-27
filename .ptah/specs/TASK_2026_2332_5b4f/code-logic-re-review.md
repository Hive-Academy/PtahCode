## Verdict

**REVISE** — Defects 1–3, 5, and 6 are fixed, and Defects 4 and 7 are partly fixed, but the new raw `list` walker in `nav/inspect.ts` introduces a blocking unbounded/unfiltered walk across `node_modules` and `.git`, and `ptah_search_files` pattern validation can still be bypassed via backslash-escaped dot segments.

Review family: antigravity (implementer family: codex)

## Defect status

| # | Status | Evidence |
| --- | --- | --- |
| 1 | FIXED | `protocol-dispatcher.ts:1258-1262` drops the `formatSearchFiles` wrapper so `inspect.ts:122-127` walks raw paths against resolved `workspaceRoot`; `protocol-dispatcher.ts:1181-1183` guards `ptah_search_files` patterns. Regression specs (`inspect.spec.ts:158-182`, `protocol-dispatcher.spec.ts:2018-2036`) assert raw output, empty/continuation lines, and basic `/`/`..` rejection. |
| 2 | FIXED | `server-instructions.ts:52` now matches `/^Fall back\b/i` against `tool-guidance.render.ts:62-63`; `buildServerInstructions()` stays 478 chars (<= 512) and is host-invariant (`server-instructions.spec.ts:101-133,245-255`). |
| 3 | FIXED | `inspect.ts:146-153` checks all `allowedWorkspaceRoots` (`protocol-dispatcher.ts:1223-1228`), keeping git `cwd` on `resolved.value.rootReal` (`inspect.ts:131-133`); `inspect.ts:109-111` computes the `read` header from normalized aliases (`inspect.spec.ts:167-170,184-193`). |
| 4 | PARTLY FIXED | `grep.ts:496-542` validates `-i`/`-A`/`-B`/`-C`/`head_limit` types, checks `input[to] === undefined` in `alias()`, clamps `head_limit` only, and handles `type: 'ts,md'` / `'ts,*.md'` (`globToRegExp`, `git grep`, and `rg --glob`). `inspect.ts:100,115` rejects non-finite `limit`/`head_limit`. Gaps remain for `glob: undefined` + `type` (`grep.ts:508`) and canonical `read-symbol` `maxLines > 400` clamping (New defects 3–4). |
| 5 | FIXED | `grep.ts:397-409` preserves header, `plural(..., 'match')`, `+ N more matches`, `incomplete`, `skippedNote`, and `Engine note` (`grep.spec.ts:686-701`). |
| 6 | FIXED | `tool-description.builder.ts:647` sets `additionalProperties: true` on `ops.items` (`eager-tool-definitions.budget.spec.ts:73-78`). `tool-result-budget.ts:128-131` sets `ptah_inspect` to `{ chars: 24_000, tokens: 9_000 }`, matching the 2.67 chars/token ratio of `ptah_read_symbol` (`16_000 / 6_000`) and `ptah_grep` (`16_000 / 6_000`), and scaling 1.5x for an 8-op batch (vs `ptah_browser_content` `33_792 / 8_448`, `ptah_session_read` `40_960 / 10_240`). Normal ~2.7 chars/token code keeps `inspect.ts:169`'s `… result cut` footer once (note: `inspect.spec.ts:218` uses `'x'.repeat(90)` at ~8 chars/token, and denser text < 2.67 chars/token still gets a second cut in `applyToolResultBudget`). |
| 7 | PARTLY FIXED | `read-symbol.ts:354,373` adds `leadNote` only when `!reply.isError` (`read-symbol.spec.ts:285-290`), and `tool-guidance.render.ts:65-70` restricts `worktreeRootRule` to `ptah_read_symbol`, `ptah_grep`, `ptah_inspect`, `ptah_ast_analyze`. However, `cli-adapter.utils.ts:451` (`PTAH_LANE_POLICY`) still instructs lanes to pass `workspaceRoot` to generic `Ptah read/search tools` without excluding `ptah_search_files`. |

## New defects

1. **Blocking** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/inspect.ts:32,35-50`:
   `findRawFiles` walks every directory under `root` via `readdir(directory, { withFileTypes: true })` with **no exclude/ignore rules and no visited-entry or depth bound**: it descends into `.git`, `node_modules`, `dist`, `build`, `.nx`, `.ptah/specs`, and `.gitignore`d folders, returns ignored files in `list` results (unlike `ptah_search_files`'s `DEFAULT_WORKSPACE_EXCLUDES` and `ptah_grep`), stalls/scans the full tree when fewer than `limit` files match, silently skips symlinks, and aborts the whole `list` op if any subdirectory throws `EACCES`/`EPERM`. In addition, `isSafeListPattern` permits backslashes (`[\\/]+`), while `globToRegExp(pattern)` (`grep-engine.ts:279,286`) escapes `\` as a literal backslash rather than a path separator, causing backslash globs to match nothing.
   Trigger: `{ ops: [{ op: 'list', pattern: 'missing/*.ts' }] }` or `{ ops: [{ op: 'list', pattern: '**/*.ts' }] }` on a repo with `node_modules`/`.git`, or `{ ops: [{ op: 'list', pattern: 'src\\*.txt' }] }`.
   Smallest fix: Normalize `\` to `/` before `globToRegExp`, skip `.git` / hidden entries / `isCodeIndexExcluded` (or `DEFAULT_WORKSPACE_EXCLUDES`), catch unreadable directories, and bound visited entries (or reuse `walkGlobMatches` with `DEFAULT_WORKSPACE_EXCLUDES` and relative paths).

2. **Serious** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1181`, `libs/backend/platform-core/src/utils/bounded-glob-walk.ts:233,236,255`:
   `protocol-dispatcher.ts:1181` checks `pattern.split(/[\\/]+/).includes('..')` before calling `ptahAPI.search.findFiles`, which runs `walkGlobMatches`. Because `picomatch.scan` keeps backslash escapes in `scan.base` and `bounded-glob-walk.ts:233` strips backslashes via `scan.base.replace(/\\(.)/g, '$1')`, an escaped dot segment bypasses `split` and resolves outside `cwd` (verified with `picomatch.scan('.\\./outside/*.ts')` -> `base: '.\\./outside'`). Also `path.isAbsolute('\\\\server\\share\\x')` is `false` on POSIX hosts (`protocol-dispatcher.ts:1181`, `inspect.ts:32`).
   Trigger: `ptah_search_files { pattern: '.\\./outside/*.ts' }` walks `path.resolve(cwd, '../outside')`.
   Smallest fix: Unescape `\\(.)` before checking for `'..'` and UNC prefixes, and enforce `canonicalPathInsideRoot` on `start` inside `walkGlobMatches` before `stat`/`walk`.

3. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts:508-515`:
   In `handleGrep`, `!Object.hasOwn(input, 'glob')` treats `glob: undefined` as overriding `type`; `String(input['type'])` coerces non-string `type` (`123`, `null`) into `*.123` / `*.null` instead of rejecting; and mixed `type` entries containing non-prefix wildcards (e.g. `'ts,foo*.md'`) yield `'**/*.{ts,foo*.md}'` via `item.replace(/^\*?\./, '')`, mis-matching `foo*.md` as `*.foo*.md`.
   Trigger: `handleGrep({ pattern: 'LIMIT', glob: undefined, type: 'ts' }, deps)` (ignores `type` and prints `type->glob (glob wins)`).
   Smallest fix: Check `input['glob'] === undefined`, fail when `typeof input['type'] !== 'string'`, and reject or expand wildcard entries without wrapping them in `**/*.{...}`.

4. **Moderate** — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:296-297`:
   Unlike `grep.ts:529` (which clamps only `head_limit`), `read-symbol.ts:296-297` clamps canonical `maxLines > 400` to `400` and returns `isError: false`, changing `main`'s validation behavior where `handleReadSymbol({ file: 'notes.txt', startLine: 1, maxLines: 401 })` returned an error (its `main` test case was removed from `read-symbol.spec.ts:252`).
   Trigger: `handleReadSymbol({ file: 'notes.txt', startLine: 1, maxLines: 401 }, deps)`.
   Smallest fix: Clamp `maxLines` only when `limit` provided it (`Object.hasOwn(input, 'limit')` and `input['maxLines'] === undefined`), leaving canonical `maxLines > 400` to `ReadSymbolArgsSchema`.

## Not reviewed

- No Jest suites or `tsc` / `ptah_get_diagnostics` runs were re-executed during this re-review; verification counts rely on `review-fix-report.md` (with `picomatch.scan` confirmed directly via `node`).
- Pre-existing Windows symlink `EPERM` failures (`grep.spec.ts:284`, `read-symbol.spec.ts:304`, `protocol-dispatcher.spec.ts:10958`) remain unexercised on this host.
- Non-list/non-grep/non-budget changes outside the 7 fixes (agent descriptions, snapshot counts) were not re-audited.
