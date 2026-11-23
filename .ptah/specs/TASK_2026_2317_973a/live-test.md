# Live test: nav-tools follow-ups (TASK_2026_2317_973a)

Build: `node scripts/verify.mjs --exec --task nav-live-build -- npm run electron:build:dev` from this
worktree (dist built after the last source edit; exit 0, 3m 42s).
Run: `node scripts/verify.mjs --exec --task nav-live-run -- bash .ptah/tmp/live/run.sh`, exit 0.

## Isolation
- Temporary `HOME`, `USERPROFILE`, `XDG_*`, `PTAH_SETTINGS_DIR`, `PTAH_DB_PATH` under `/tmp/ptah-live-nav`.
  Workspace: `/tmp/ptah-live-nav/ws` (scratch git repository).
- `/opt/Ptah` (pid 915832) kept running and kept port 51820. The test instance took port 51821 (the
  `mcpPort` setting I wrote was not read; the app fell back by itself, as its log says).
- sha256 of `~/.codex/config.toml` and `~/.gemini/config/mcp_config.json` equal before, after launch
  and after run. The test instance process group was stopped by its own script; no other process was killed.

## (i) ptah_ast_analyze on a class that is cut
Fixture `src/big.ts`: `BigService` with 400 methods, plus 40 small classes (41 classes).
Real MCP HTTP call (`tools/call ptah_ast_analyze`), result (excerpt, full text in `live-ast.json`):
- `truncated.classes = {shown:0, total:41, omittedNames:"BigService,Helper0,...,Helper39,BigService.handleRequest0,...,BigService.handleRequest52,…", omittedMembers:480}`
  (480 = 400 + 40 x 2). All 41 cut class names come first; the method names follow, cut by the
  1800-character cap with a closing `…`.
- `hint`: "…omittedNames lists the cut records by name when names exist and fit; the named methods of cut
  classes follow as Class.method, and omittedMembers counts them. A name list that ends with … is cut
  again. Read a declaration or a class with ptah_read_symbol (name, or Class.method; for a method of a
  nested class use its plain name; a long read says where to continue)."
Result: the dropped class and its members are named, counted, and the way to read them is given.

## (ii) ptah_grep with the unspaced pattern `alpha|beta`
Fixture `src/search.ts`: `export const alpha = 1;`, `export function betaCall() {...}`, `const gamma = 3;`.
Call `ptah_grep {pattern:"alpha|beta", path:"src"}` returned:
`2 matches in 1 file (engine: git) (pattern read as regex; pass regex:false for a literal search)`
with line 1 (alpha) and line 2 (betaCall, enclosing function shown). `gamma` is not matched.
Result: the inference ran, the note is in the header, the matches are correct.

## Not run
Renderer UI (build-dev has no renderer; not needed for MCP tool calls). No other host was started.
