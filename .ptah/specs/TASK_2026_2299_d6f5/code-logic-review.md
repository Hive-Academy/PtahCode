# Code logic review (subagent notes, pass 1)

Verdict: NEEDS_REVISION, 0 blocker, 6 major, 12 minor. parameter-names.ts and specs not reviewed.

## Findings

### Major
1. nav/grep.ts:292-297 - "0 matches" hides an incomplete search. When the walk or rg stops early
   (rg 15 s timeout, 20,000-file cap in grep-engine.ts:339, output cap) and nothing matched yet,
   the reply is `0 matches (engine: node)...` with no "search stopped early" note; the `incomplete`
   footer exists only in renderGrepResult (grep.ts:222). Input: no rg on PATH, repo over 20k files
   alphabetically before the target, `pattern: "needle"`. An agent concludes the text is absent.
   Fix: append the incomplete / error footer on the zero-match path ("0 matches found before the
   search stopped (time/file limit); narrow with path/glob").
2. nav/grep-engine.ts:333 - `readdir` has no try/catch, so one unreadable directory (EACCES, broken
   mount) throws to the outer catch (line 370) and aborts the whole walk with `incomplete + error`.
   Matches in later directories are lost, and with zero matches so far the user sees "0 matches"
   (finding 1). rg skips unreadable dirs and continues. Fix: catch per directory and continue,
   optionally counting skipped dirs.
3. nav/grep-engine.ts:323 - JS regex fallback is unbounded in time. `deadline` is only checked
   between files, so `regex:true, pattern:"(a+)+$"` on a long line freezes the host event loop
   (the walk runs in the MCP server process). The fallback is exactly the path taken for patterns
   rg rejects (lookaround, backreferences: grep.ts:284). Fix: run the walk in a worker with a kill
   timer, or reject patterns with nested quantifiers, or cap line length (e.g. skip lines over 10k chars).
4. nav/read-symbol.ts:165 with nav-symbols.ts:77-130 - symbols come only from `outline.classes` and
   `outline.functions`. Interfaces, type aliases, enums and abstract classes (TS_CLASS_QUERY in
   workspace-intelligence languages/typescript.language.ts matches only class_declaration; structs,
   traits and Go types are likewise missing) are not addressable. `ptah_read_symbol {file, name:"FooOptions"}`
   returns "No declaration named ... Closest names" or "No similar names", with no hint to use
   startLine or ptah_grep. For the stated goal (replace `sed -n`/`cat`) the commonest TS declarations fail.
   Same gap means ptah_grep labels show the surrounding class/function (or none) for matches inside
   these declarations. Fix: add the missing kinds to the outline, or make the not-found text suggest
   `ptah_grep` / `startLine`+`endLine`, and fall back to the range when `name` fails and `startLine` is given.
5. VLT/namespace-builders/symbol-hit-format.ts:24-35,59-66 and :54-66 - `signature` and `extract` are read
   from the CURRENT file at the line range stored in the index, and are never checked against the
   symbol. The index counts as "quiet" for 24 h (symbol-search-answer.ts:164, CODE_INDEX_STALE_MS), so
   after any edit that shifts lines the hit shows the wrong 8 lines as `extract` with
   no staleness mark. Same when the indexer wrote the fallback range `:0-0`
   (workspace-intelligence services/code-symbol-indexer.service.ts:1589 `rows?.startLine ?? 0`):
   parseLineRange turns it into lines 1-1 and the hit shows the file's first line as its signature.
   Fix: accept the range only when the first lines contain `hit.name` (last `.` segment); otherwise
   drop `extract`, use signatureFromIndexText and count it in `extractUnavailable`/a `stale` flag.
6. memory-curator/src/lib/code-symbol.store.ts:1111-1155 (nameTokenSymbols) - the scan is
   `WHERE name LIKE w1 OR name LIKE w2 ... ORDER BY file_path LIMIT 5000`, then keeps rows that
   match at least 2 words. In a large index one common word ("get", "session") fills the 5000
   cap with file-order rows, and the real multi-word match deeper in the tree is silently never
   seen. Fix: require two matches in SQL: `(name LIKE ?) + (name LIKE ?) + ... >= 2`, then cap.

### Minor
7. nav/grep-engine.ts:134 - on win32 `rg.cmd` is accepted, but spawn of .cmd/.bat without a shell throws
   EINVAL synchronously (Node >= 18.20.2), which rejects the runRipgrep promise inside
   handleGrep (grep.ts:283) instead of falling back to the Node walk. Fix: wrap `spawn` in
   try/catch calling `finish(msg)` and drop `rg.cmd`.
8. nav/grep-engine.ts:154-173 vs :89-125 - rg and Node engines disagree: glob `!*.spec.ts` (negation) is
   honoured by rg but matched literally by globToRegExp, so the fallback returns 0 matches; rg also
   matches a bare directory glob (`src`), the walk does not; rg respects .gitignore only inside a git
   repo (so a non-git workspace searches node_modules/dist), the walk uses a fixed skip list.
   Document, or handle a leading `!` in globToRegExp.
9. nav/grep-engine.ts:326 - Node engine stores the full line text for up to 5,000 matches (cap is
   count, not bytes; rg is capped at 4 MB stdout). 5,000 matches in 1 MB single-line files = GB of
   memory. Fix: store `text.slice(0, GREP_MAX_LINE_CHARS * 2)`.
10. nav/grep.ts:132 and :191 - readLines keeps the trailing `''` element, so with `context>0` a match on
    the last line prints a phantom context line `N+1-` past EOF (fileLines.length is lines+1). read-symbol.ts
    pops it; do the same here.
11. nav/grep-engine.ts:249-251 - an rg match on a non-UTF-8 path or line carries `bytes` instead of
    `text`; the path-less record is dropped (line 243) without counting, and a line-less one renders as
    an empty line. Rare; at least count it so `totalMatches` stays honest.
12. nav/read-symbol.ts:325-332 and nav/grep.ts:123 - `toNavSymbols(await deps.analyze(...))` ignores
    `parseStatus`. A file with syntax errors gives a partial outline, so read_symbol answers "No
    declaration named X" for a symbol that exists, and grep labels are wrong, with no warning.
    Fix: when parseStatus is not complete, add a note to the not-found text.
13. nav/nav-symbols.ts:66-67 - one-line `class A { m() {} }`: the method range equals the class range
    and is excluded from `enclosingClasses`, so the method is a `function` named `m`, not `A.m`.
14. nav/read-symbol.ts:170-176 - `name` + `startLine` filter with no overlapping match returns "No
    declaration named X" although X exists elsewhere in the file; list the unfiltered candidates instead.
15. nav/read-symbol.ts:306 - no binary check; a 5 MB binary with a code extension is read as UTF-8 and
    printed (bounded by the char cap, but garbage).
16. mcp-core/protocol-dispatcher.ts:1138-1160 - the default root is `ptahAPI.workspace.getInfo()?.path`
    (process-global folder), while ptah_ast_analyze (line ~2849) also tries `getCallerWorkspaceRoot()`
    and the known folders. UNVERIFIED (I did not read getCallerWorkspaceRoot): a lane that runs in a
    git worktree and omits `workspaceRoot` may read/search the main checkout instead of its own worktree.
    Check that and pass the caller root first. Also, the caller-supplied `workspaceRoot` is used as the
    containment root unchecked, so the sandbox is only as strong as the caller's argument.
17. nav/grep-engine.ts:211-285 - no cancel path: if the MCP request is aborted, rg runs until the 15 s
    timeout. Moderate cost only.
18. nav/grep.limits.ts / read-symbol.limits.ts - the token budget (6,000) assumes 2.7 chars/token for a
    15,000-char answer; text of 2 chars/token (minified, non-ASCII) exceeds it and the budget step may then
    cut mid-line, which the handlers promise never happens.

### Blocker
None found.

