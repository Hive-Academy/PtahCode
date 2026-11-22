# PR #1465 review-thread triage (round 6, head 4c0689842)

Source: threads-r6.json (28 unresolved of 32). Classes checked against the head code.
Letters: E = nav/grep-engine.ts, G = nav/grep.ts, PD = mcp-core/protocol-dispatcher.ts, HS = mcp-http/http-server.handler.ts.

| # | thread id | path:line | title | class | evidence / fix |
|---|---|---|---|---|---|
| 0 | PRRT_kwDOPngTds66eT1A | E:358 (outdated) | Fallback regex blocks host | FIXED | buildLineTester runs the user regex under a vm timeout (E:186-205), D14. sha not looked up |
| 1 | PRRT_kwDOPngTds66ef9M | E:386 (outdated) | Skipped content reported complete | FIXED | skippedNote lists large files and long lines (E:432-448), D14 |
| 2 | PRRT_kwDOPngTds66ef9N | E:433 | Fallback ignores ignore rules | DISPUTE (partly fixed) | The root .gitignore is applied with `!` rules (E:311-351, D14/D17). The git engine applies nested rules inside work trees (D19). Nested rules in the Node walk were declined in D14 |
| 3 | PRRT_kwDOPngTds66ef9O | E:393 (outdated) | Long lines report 0 matches | FIXED | A literal search reads long lines. A regex search counts the skipped lines in the note (E:804-810, E:436-437), D14 |
| 4 | PRRT_kwDOPngTds66ekb5 | E:381 (now E:789) | Bound glob matching | VALID (medium, confirm by test) | globMatcher.test runs synchronously outside the vm timeout. Star runs are collapsed and the glob is capped at 200 chars (G:47), but `*a*a*a...*b` still backtracks polynomially on a long name. The .gitignore regexes have the same issue. Fix: run glob/ignore tests through buildLineTester (vm timeout), or use a linear matcher. Test: glob `'*a'.repeat(30)+'b'` against a file named 'a'*200 finishes within the deadline |
| 5 | PRRT_kwDOPngTds66ekb8 | E:437 | Descent race outside workspace | DISPUTE | Node has no openat or no-follow dir open (D14/D15). The realpath check per directory (E:368-372) narrows the window. This is the fallback engine |
| 6 | PRRT_kwDOPngTds66ekb- | G:133 (now G:148-162) | Context read outside workspace | DISPUTE | Only the TOCTOU residual remains (D15). No engine emits symlinks: rg does not follow them, Node skips non-isFile Dirents, and git grep skips symlinks (checked in a temp repo, no output) |
| 7 | PRRT_kwDOPngTds66ekcC | nav-workspace-path.ts:84 | Containment at the fs operation | DISPUTE | D15: no root-confined open exists in Node |
| 8 | PRRT_kwDOPngTds66ekcK | PD:1152 | Restrict to the caller's bound root | VALID (high, pending one check) | See the security note |
| 9 | PRRT_kwDOPngTds66evby | E:224 (outdated) | Negations dropped | FIXED | Last match wins (E:339-350), D17 |
| 10 | PRRT_kwDOPngTds66fDBv | read-symbol.ts:295 | Caller-controlled root | DUPLICATE of #8 | The earlier "Disputed" reply misses that the caller root comes from the URL. Reconsider the reply |
| 11 | PRRT_kwDOPngTds66fOwy | E:429 (outdated) | rg errors with matches | FIXED 3c06fc9f7 | E:574-583 |
| 12 | PRRT_kwDOPngTds66fOw2 | PD:4461 | No known root allows any root | FIXED 3c06fc9f7 | PD:1163-1168, PD:4471-4473 return false, D18 |
| 13 | PRRT_kwDOPngTds66fOw5 | E:219 (outdated) | Nested .gitignore | DISPUTE | D14, plus D19: the git engine covers work trees, and the Node walk runs only outside them |
| 14 | PRRT_kwDOPngTds66fbkm | E:429 (outdated) | Partial rg errors | DUPLICATE of #11 | FIXED 3c06fc9f7 |
| 15 | PRRT_kwDOPngTds66fbkp | read-symbol.ts:295 | Caller root bypass | DUPLICATE of #8 | |
| 16 | PRRT_kwDOPngTds66iuaH | E:550 (now E:373-377, E:411) | Unreadable dirs/files silent | VALID (low) | Count unreadable dirs and files and add them to skippedNote. Test: in a temp root, a chmod 000 dir gives a note that names it (skip when running as root) |
| 17 | PRRT_kwDOPngTds66jXRy | E:617 (now E:676-700) | Git searches hidden files | VALID (low) | The comment at E:704-708 says this is deliberate, but rg and Node skip hidden files. Fix: add exclude pathspecs `:(exclude,glob)**/.*` and `:(exclude,glob)**/.*/**` when !includeIgnored. Test: buildGitGrepArgs spec, plus a temp repo with .hidden/x |
| 18 | PRRT_kwDOPngTds66jXR3 | E:243 | Nested git rules in Node walk | DUPLICATE of #13 | |
| 19 | PRRT_kwDOPngTds66jXR8 | E:624 | Git hidden by default | DUPLICATE of #17 | |
| 20 | PRRT_kwDOPngTds66jXR- | E:488 (now E:552-557) | UTF-8 chunk decode | VALID (low) | `chunk.toString('utf8')` runs per chunk. Fix: StringDecoder (or stdout.setEncoding('utf8')) and flush on close; stderr likewise. Test: a fake binary that writes a multibyte char split across two writes |
| 21 | PRRT_kwDOPngTds66jXYh | E:346 (now E:399-421) | Negative probe cached forever | VALID (low) | Delete the cache key when the probe resolves false (keep in-flight sharing). Test: probe false, then git init, then probe true |
| 22 | PRRT_kwDOPngTds66jXYi | E:414 (now E:552-557, E:734-741) | NUL framing for git | VALID (low) | LF framing splits a filename that contains LF. Fix: a git-specific framer (path NUL line NUL text LF). Test: a file named "a\nb.txt" |
| 23 | PRRT_kwDOPngTds66jXYk | E:557 (now E:623) | Signal-killed rg seen as success | VALID (low) | The rg isErrorExit is `code === 2`, so null counts as success. Fix: `code !== 0 && code !== 1`. Intentional stops already set incomplete before kill, and the guard is `!incomplete` at E:574. Test: a fake binary that SIGKILLs itself |
| 24 | PRRT_kwDOPngTds66jXYo | E:594 (now E:658-660, E:553, E:725-728) | Out-of-scope bytes use the budget | VALID (medium) | A slash glob replaces the target pathspec, and sibling output counts toward GREP_MAX_ENGINE_BYTES before inTarget filters it. Fix: for a scoped target, keep `:(literal)target` and filter the slash glob after parsing, as with braces. Test: a scoped target plus a slash glob while siblings emit >4 MB |
| 25 | PRRT_kwDOPngTds66jXYw | E:599 (now E:648, E:248) | Bracket glob semantics | VALID (low) | globToRegExp escapes `[`, but git :(glob) reads it as a class. Fix: route globs that contain `[` like braces (literal target plus post-filter). Test: file1.ts and file[0-9].ts |
| 26 | PRRT_kwDOPngTds66jXY0 | E:625 (now E:676-691, G:148-162) | (a) submodule.recurse; (b) oversized files on the git path and in readLines | (a) VALID (low), checked in a temp repo; (b) VALID (low) | (a) `git -c submodule.recurse=true grep --untracked` gives fatal exit 128. Fix: add `-c submodule.recurse=false` or `--no-recurse-submodules`. (b) readLines has no stat: return [] above GREP_MAX_FILE_BYTES. git grep has no max-filesize option, so the git side can only be filtered after the scan |
| 27 | PRRT_kwDOPngTds66jXY6 | E:632 (now E:698) | LF literal split by git | VALID (low-medium), checked | rg rejects LF (exit 2, 0 matches), so G:509-511 falls through to git, which splits the pattern and returns "alpha only". Fix: reject `\n`/`\r` in GrepArgsSchema.pattern (G:45). Test: handleGrep('alpha\nbeta') returns isError |

## Security note (#8 / #10 / #15)

- The guard at PD:1155-1175 accepts a supplied workspaceRoot that lies inside any of these:
  - getCallerWorkspaceRoot()
  - the host workspace (getInfo().path)
  - any open folder

  It does not restrict a bound caller to its own root. A worktree lane can therefore name the main checkout.
- getCallerWorkspaceRoot() is the URL segment `/workspace/<root>` (HS:348-356, HS:582). PD's own comment near PD:4215 calls it "a URL segment, so caller input".
- The nav path uses it raw, both as the default root (PD:1148-1150) and as an allowed root (PD:1159). resolveSpoolRoot (PD:4225-4235) and resolveRunCheckRoot (PD:4329-4345) instead validate it with findKnownWorkspaceFolder / findDirectoryInsideKnownFolder.
- So if the URL path is not bound by the auth token, URL `/workspace/%2F` makes `/` the allowed and default root, and both nav tools can read anywhere.
- Fix: resolve the caller root like resolveRunCheckRoot before using it. When a validated caller root exists, accept a supplied root only inside it.
- Test: dispatcher spec with _callerWorkspaceRoot '/' or an outside dir: refused. A worktree caller that supplies the main root: refused.

- Checked: HS stamps `_callerWorkspaceRoot` from the URL only; the token binding does not tie the segment (HS:311-316 "Do not treat the path alone as a credential"). So #8 is high: fixed in round 6 by `resolveNavCallerRoot` (PD).
