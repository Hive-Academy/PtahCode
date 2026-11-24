# Live test — TASK_2026_2312_c3ef (decision #22)

Date: 2026-11-23. Host: Electron dev build of this worktree (`npx nx build-dev ptah-electron`,
`copy-wasm`, `copy-renderer-dev`). Isolated profile: `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`XDG_CACHE_HOME` under `/tmp/ptah-live-2312/home`, `NODE_ENV=development`. `/opt/Ptah` not used.
`rebuild-native` not run (shared better-sqlite3 + sqlite-vec load in Electron 44).

## Fixture (`/tmp/ptah-live-2312/ws`, a git repository)

| File | Expected |
|---|---|
| `src/a.ts` | indexed |
| `src/a.js` (twin of `a.ts`) | not indexed (D6 twin rule) |
| `src/b.js` (no twin) | indexed |
| `.claude/skills/s/run.js` | not indexed (R1) |
| `.ptah/analysis/x.ts` | not indexed (R1) |
| `deep/x/.claude/agents/y.js` | not indexed (R1, any depth) |
| `nested/.git` (file) + `nested/sub/n.ts` | not indexed (G2 nested checkout) |

## Run 1 (cold)

Log: `[WorkspaceIndexer] skipping nested repositories and worktrees: {"roots":["nested"]}` and
`[CodeSymbolIndexer] Workspace indexing complete: {"filesScanned":2,"filesSkippedUnchanged":0,"symbolsIndexed":4,"errors":0}`.

`~/.ptah/state/ptah-dev.sqlite`:
- `code_symbols`: 4 rows, all under root `/tmp/ptah-live-2312/ws`: `src/a.ts` (`AlphaClass`,
  `alphaFn`, `run`) and `src/b.js` (`betaOnlyJs`). Each row has a `text_hash`.
- `code_symbol_files`: 2 rows (`src/a.ts`, `src/b.js`) with fingerprint
  `1:<mtime>:<ctime>:<size>:Xenova/bge-small-en-v1.5`.
- `code_index_roots`: 1 row for the root.
- No row for any `.claude`, `.ptah`, nested-repository or `a.js` file.

## Run 2 (restart, no file change)

Log: `{"filesScanned":2,"filesSkippedUnchanged":2,"symbolsIndexed":0,"errors":0}`.
`code_symbols` and `code_symbol_files` are byte-identical to run 1 (same `updated_at`).
Only `code_index_roots.validated_at` advanced, as designed.

## Result

PASS. G1 (agent/Ptah folders excluded at any depth), G2 (nested checkout), D6 twin rule,
B2/B3 file records and restart reuse all hold in the real Electron host.

Note: `durationMs` was 19.9 s (run 1) and 46.1 s (run 2) for 2 files. The G7 census ran on the
same machine at the same time, and the value includes startup work of the indexer, so these
numbers are not a performance measurement. G7 gives the performance numbers.
