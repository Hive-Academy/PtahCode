# Index audit — TASK_2026_2312_c3ef (Part A)

Scope: the workspace code symbol index (`code_symbols`, its FTS and vector tables) and every path
that selects files for it. Base: `main` at `467a1ddb6`. All line numbers refer to that commit.
No source file was changed for this audit.

## Summary

1. Every full run re-parses and re-embeds every eligible file. Nothing in the indexer or the
   store compares a file with its previous state. A restart, a workspace open, a task-end census
   and a lazy tool run each pay the full cost again (A1, A5).
2. The 3741 `unchecked` files are not parse defects. During a run, coverage counts every
   selected file that the run has not written yet as `unchecked`
   (`code-symbol-indexer.service.ts:686-688`). Because a run rewrites all files, `unchecked`
   starts at the full eligible count after each start and drains at parse speed (A5).
3. The 115 `unsupported` JavaScript files are 107 `.mjs` and 8 `.cjs` files (measured, A5). JavaScript declares these
   two extensions as recognition-only (`ast/languages/javascript.language.ts:298`), so
   `classifyFileForCoverage` returns `unsupported` for them (`ast/language-registry.ts:410-421`).
4. Full runs and the watcher do not index nested worktrees from the main checkout. Two
   independent guards stop them: the glob excludes from `NESTED_WORKSPACE_PATH_RULES` and the
   `.git` probe in discovery (A3). The direct `reindexFile` path has no such guard (item 7).
5. The exclude source is shared by the full-run discovery, the watcher, the `@` file index and
   the MCP builders. Three gaps exist: the watcher-driven per-file reindex skips the `.gitignore`
   matcher, the `ptah_grep` Node walk has its own list, and the ignore matcher only approximates
   git semantics (A2).
6. A worktree opened as its own workspace gets its own rows (scoped by `workspace_root`) but
   re-embeds content that is identical to main. A second defect: linked worktrees with the same
   `package.json` identity derive the SAME `indexing_state` fingerprint, because `.git` is a
   file in a worktree (A3).
7. A direct `reindexFile` (watcher or `ptah_code_reindex { filePath }`) checks only the
   basename skip patterns. It does not apply the default excludes, the ignore files or the
   nested `.git` probe (A2, A3).

## A1. Entry points and triggers

| # | Trigger | Where | Run kind | Governor |
| - | ------- | ----- | -------- | -------- |
| 1 | App start / workspace open (Electron) | `apps/ptah-electron/src/activation/boot-heavy-services.ts:217` → `bootThothRuntime` → `WorkspaceIndexLifecycleService.start()` (`libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts:518-530`) | Full census, not awaited | Yes (no `userInitiated`) |
| 2 | Each further workspace root opened in the same app session | `boot-heavy-services.ts:575-590` (`startOrJoin`, once per normalized root) | Full census for that root | Yes |
| 3 | File watcher: create / change / supported delete | `workspace-index-lifecycle.ts:359` (`reindexFile`, 500 ms debounce) | Per file | No |
| 4 | Watcher storm, overflow, truncated batch, directory delete | `workspace-index-lifecycle.ts:376` | Full census (one queued follow-up at most) | Yes |
| 5 | Indexing panel `indexing:start` / `indexing:resume` (user click) | `rpc-handlers/.../indexing-rpc.handlers.ts:205,225` → `IndexingControlService.start` (`memory-curator/.../indexing-control.service.ts:519-598`) → `boot-thoth-runtime.ts:488-497` | Full census, `userInitiated: true` | No |
| 6 | Task-end hook census (Electron) | `apps/ptah-electron/src/di/task-end-hook-composition.ts:283-297` | Full census through the control service | Yes |
| 7 | `ptah.code` lazy run: empty index or rows older than 24 h | `vscode-lm-tools/.../code-namespace.builder.ts:255-257`, `CODE_INDEX_STALE_MS` at `:51` | Full census, `userInitiated: false` | Yes |
| 8 | `ptah_code_reindex` (no `filePath`) | `code-namespace.builder.ts:276-281` | Full census, `userInitiated: true` | No |
| 9 | `ptah_code_reindex { filePath }` | `code-namespace.builder.ts` → `reindexFile` | Per file, awaited | No |
| 10 | Headless CLI | `cli-engine/src/lib/bootstrap/cli-workspace-index.ts:110-140` | Same lifecycle as 1, 3, 4 | Yes |

`folder-index-live-sync.ts` does not feed the symbol index. It keeps the in-memory `@` file
index (`WorkspaceFileIndexService`) current. It uses the same exclude globs and segment rules
(`folder-index-live-sync.ts:101-103,148-150`).

Cost consequence: triggers 1, 2, 4, 5, 6, 7 and 8 all call `runIndex`
(`code-symbol-indexer.service.ts:1013-1233`). `runIndex` calls `indexFileRecorded` for every
eligible file (`:1147`). `indexFileRecorded` → `_indexFile` reads, parses, extracts and calls
`writeFileSymbols` → `ISymbolSink.replaceFileSymbols`. The store embeds every row text in that
call (`memory-curator/src/lib/code-symbol.store.ts:540-550`) before it deletes and re-inserts
the rows. No step compares mtime, size or content with the stored state.

`force` today: `IndexingControlService.start` has a `force` option, but it only bypasses the
`symbols_enabled` / `memory_enabled` switches (`indexing-control.service.ts:564-565,602-603`).
It does not reach the indexer, and the indexer has no `force` option
(`CodeSymbolIndexerOptions`, `code-symbol-indexer.service.ts:46-80`).

## A2. File selection and the exclude source

### Pipeline of one full run

1. `runIndex` asks `WorkspaceIndexerService.indexWorkspaceStream` for every file with a
   recognised source extension (`DISCOVERY_PATTERNS`, `code-symbol-indexer.service.ts:105-107`;
   call at `:1064-1075`).
2. `discoverFiles` → `discoverFilesOutsideNestedRepos` calls `IFileSystemProvider.findFiles`
   with `DEFAULT_WORKSPACE_EXCLUDES` (`workspace-indexer.service.ts:645-660`). Electron uses
   fast-glob with `dot: true` (`platform-electron/.../electron-file-system-provider.ts:202-249`).
3. It then probes each directory for a `.git` entry, depth by depth, and drops every file below
   a nested repository or worktree root (`workspace-indexer.service.ts:661-680,691-750`).
4. `compilePathFilter` applies the root ignore files (`.gitignore`, `.vscodeignore`,
   `.prettierignore`, `.eslintignore`, `.npmignore`;
   `ignore-pattern-resolver.service.ts:189-197`) and any caller `excludePatterns`.
5. `consider` classifies each path with `classifyFileForCoverage(path, 'codeIndex')`
   (`code-symbol-indexer.service.ts:1054`). `unsupported` is counted. `eligible` paths that
   match `DEFAULT_SKIP_PATTERNS` (`:127-169`: tests, configs, barrels, `*.d.ts`, generated C#)
   are dropped without a count.
6. Eligible files sort with `.ptah/**` and `.github/skills/**` last (`DEFERRED_DISCOVERY`,
   `:115`). The comment says these paths are indexed on purpose, after source.

### Who uses which exclude source

| Path | Exclude source | Same as full run? |
| ---- | -------------- | ----------------- |
| Symbol full run (discovery) | `DEFAULT_WORKSPACE_EXCLUDES` + `.git` probe + root ignore files + skip patterns | Reference |
| Symbol watcher (lifecycle) | `DEFAULT_WORKSPACE_EXCLUDES` + `NESTED_WORKSPACE_PATH_RULES` + nested repo detection (`workspace-index-lifecycle.ts:156-165`), then extension check (`isIndexerSourcePath`, `:106-108`) | **No**: no ignore-file matcher |
| Per-file `reindexFile` | Skip patterns only (`code-symbol-indexer.service.ts:1306-1318`) | **No**: no ignore files, no default excludes |
| `@` file index + live sync | `DEFAULT_WORKSPACE_EXCLUDES` + nested rules (`folder-index-live-sync.ts:101-103,145-150`); ignore files through the file index build (`discoverWorkspacePaths`, `workspace-indexer.service.ts:508-560`) | Yes for excludes |
| Context gathering, TS diagnostics, census diagnostics | `DEFAULT_WORKSPACE_EXCLUDES` (+ vendor list) (`context.service.ts:813`, `type-script-diagnostics-provider.ts:378`, `language-aware-diagnostics-provider.ts:1232`) | Yes |
| MCP `findFiles`, graph builders | `DEFAULT_WORKSPACE_EXCLUDES` (+ `GRAPH_VENDOR_EXCLUDES`) (`core-namespace.builders.ts:155`, `analysis-namespace.builders.ts:674`) | Yes |
| Electron IDE capabilities walk | `DEFAULT_WORKSPACE_EXCLUDES` + ignore walk excludes (`electron-ide-capabilities.ts:1008`) | Yes |
| Git watcher | `WATCH_IGNORED_DIRS` + nested rules (`git-watcher.service.ts:689,940-943`) | Different question (git refresh); correct by design |
| `ptah_grep` Node walk | Own `NODE_SKIPPED_DIRS` (`node_modules`, `.git`, `dist`, `coverage`) + root `.gitignore` (`mcp-core/nav/grep-engine.ts:71-76,286-360`); `rg` path uses rg's own ignore handling | **No** (Part C owns nav tools; noted only) |
| Embeddings | Same rows as the symbol run: no separate selection | Follows the symbol run |
| Memory curator | Reads session JSONL (`memory-curator/src/lib/triggers/boot-scan-runner.ts:178-197`), not workspace files | Not a workspace walker |

Gap 1 (watcher ignores `.gitignore`): a change to a gitignored source file outside the default
excludes (for example `.agents/**`, or any path that only `.gitignore` names) is indexed by the
watcher. The next complete full run purges it again, because discovery does not list it
(`code-symbol-indexer.service.ts:1213-1215`). The rows flap between runs.

Gap 2 (ignore semantics): the matcher is picomatch with `bash: true`
(`IGNORE_PICOMATCH_OPTIONS`, `ignore-pattern-resolver.service.ts:41-47`), not git rules.
Tested with the repository's picomatch: `bash: true` makes a single `*` cross `/`, so
`.claude/*` matches `.claude/skills/a/b.js` and `*.log` matches `a/b.log`. A bare name such as
`tmp` matches no file at all (`tmp/a.ts` and `x/tmp/a.ts` are both false), and `skills/**`
matches only at the root. `parsePattern` (`:406-435`) only rewrites a trailing `/` to `/**`.
Nested `.gitignore` files are not read. On this repository the effect is small, because
`DEFAULT_WORKSPACE_EXCLUDES` already names the bare directories (`dist`, `tmp`, `out`); the
measured numbers are in A5.

## A3. Duplication: nested worktrees and worktree workspaces

### From the main checkout

- `DEFAULT_WORKSPACE_EXCLUDES` ends with globs derived from `NESTED_WORKSPACE_PATH_RULES`
  (`workspace-default-excludes.ts:42`; rules at `libs/shared/src/lib/constants/workspace-scan.constants.ts:132-135`):
  `**/.claude-worktrees/**` and `**/.claude/worktrees/**`, ASCII case-insensitive.
- Any other agent worktree directory (for example a `.codex` or `.cursor` worktree) holds a
  `.git` file. The `.git` probe drops it (`workspace-indexer.service.ts:733-750`).
- The watcher uses the same rules plus `nestedRepoDetection: true`
  (`workspace-index-lifecycle.ts:156-165`).
- Result: a full run and the watcher write no row of a nested worktree under the main checkout
  root. A direct `reindexFile` of a file inside a nested checkout does write one, because it
  only checks basename skip patterns (`code-symbol-indexer.service.ts:1306-1318`), and a
  concurrent census then keeps it through `keptPaths` (`:949-960`). The measured file counts
  are in A5. No spec pins this for the symbol indexer today; specs pin it for the
  file index (`workspace-default-excludes.spec.ts`, `workspace-exclusion-drift.spec.ts`).

### A worktree opened as its own workspace

- Rows are keyed by `(workspace_root, subject)` (`code-symbol.store.ts:565-573`). A worktree
  root gets its own rows. Search is scoped by root. This is correct isolation.
- Cost: the worktree run parses every file and embeds every symbol text again, even when the
  text is byte-identical to a row of main. Rows of a removed worktree are purged by
  `purgeStaleRoots`, at most once each 6 h (`code-symbol.store.ts:246-272`).
- Defect: `deriveWorkspaceFingerprint` reads `<root>/.git/config`
  (`memory-curator/src/lib/workspace-fingerprint.ts:38`). In a linked worktree `.git` is a file,
  so the read fails and the function falls back to `package.json` `name + repository`
  (`:44-63`). All worktrees whose `package.json` has the same `name` and `repository` get the
  same `pkg:` fingerprint (a branch that changes those fields gets another one), which differs
  from main's `git-remote:` fingerprint. `IndexingControlService` keys its `indexing_state` row
  (enable switches, cursor, last error, last run) by that fingerprint
  (`indexing-control.service.ts:545-570`). So worktree A can show worktree B's state.
  `deriveGitHeadSha` has the same `.git`-is-a-file gap, so the head SHA in a worktree is null.

### Decision A3: share by content hash, or accept a separate index

| Option | What it shares | Cost |
| ------ | -------------- | ---- |
| A. Separate index, no sharing (today) | Nothing | Each worktree open = full parse + full embed of about the same symbol set as main (numbers in A5). Rows and vectors duplicated per root until the stale purge. |
| B. Share rows across roots | Rows | Breaks per-root scoping of search, purge and coverage; every query and purge must resolve aliases. High risk, large change. Rejected. |
| C. Separate rows, shared vectors by text hash | Embeddings only | One migration column + index (`text_hash`), one lookup per row text before the embed call. Parse still runs per root (cheap next to embed). Also reuses vectors for unchanged symbols inside a changed file. |

**Proposed: C, together with the skip-unchanged fingerprint.** The fingerprint removes the
repeat cost per root (restart, reopen). Option C removes the first-open embed cost of a new
worktree and of a changed file. Rows stay per root, so isolation and purge stay as they are.

The fingerprint collision of `indexing_state` is a real defect, but its fix changes the
memory fingerprint scope (the same `fp` is in memory seed prefixes). That is a scope decision
for the user. Proposed as a separate follow-up, not in Part B (see the plan, "Reserved").

## A4. Config and generated folders

Two indexes need two answers. The **code symbol index** takes only recognised source
extensions, so markdown, JSON, YAML, lockfiles and snapshots never reach it. **Memory** reads
session transcripts and curated entries, not a workspace walk, so skills and agent definitions
reach memory only through their own harness paths. The table is for the code symbol index and
the shared walkers.

| Path | Code symbol index | Shared walkers (`@` picker, context, MCP) | Reason |
| ---- | ----------------- | ---------------------------------------- | ------ |
| `.ptah/specs/**` | Exclude (already) | Exclude (already) | Task history, not product code |
| `.ptah/tmp/**`, `.ptah/tmp/mcp-out/**` | Exclude (already, via `**/tmp/**`) | Exclude (already) | Scratch output |
| `.ptah/analysis/**`, other `.ptah/**` | **Exclude (new)** | Keep | Markdown and harness state; a user may `@`-mention analysis docs |
| `.claude/worktrees/**`, `.claude-worktrees/**` | Exclude (already) | Exclude (already) | Nested checkouts |
| `.claude/skills/**`, `.claude/agents/**`, `.claude/commands/**` | **Exclude (new)** | Keep | Harness copies; skill scripts duplicate across vendor folders; not product code |
| `.agents/**`, `.codex/**`, `.github/skills/**`, `.github/agents/**`, `.opencode/**`, `.cursor/**` and the other agent folders in `.gitignore:173-186` | **Exclude (new)** | Keep (most are gitignored anyway) | Same as above |
| `.github/workflows/**`, `.husky/**`, `.mcp.json` | No effect (no source extension) | Keep | Config the user edits |
| Lockfiles, `*.snap`, large JSON | No effect (not source) | Keep | Not source; `@` picker may still want JSON |
| `*.d.ts` | Skip (already, `DEFAULT_SKIP_PATTERNS`) | Keep | Declarations duplicate the source |
| `dist/**`, `out/**`, `build/**` | Exclude (already) | Exclude (already) | Build output |

Decision: add one `CODE_INDEX_EXCLUDES` list = `DEFAULT_WORKSPACE_EXCLUDES` + the agent and
harness folders + `.ptah/**`. Every symbol-index path (full-run discovery, watcher filter,
per-file `reindexFile`) uses it. The shared walkers keep `DEFAULT_WORKSPACE_EXCLUDES`, so the
`@` picker still shows skills and analysis documents. `DEFERRED_DISCOVERY` becomes dead and is
removed.

## A5. Freshness and cost (measured)

### Method

A temporary Jest harness (not committed; kept at
`.ptah/tmp/index-measure/harness/index-measure.local.spec.ts`) ran the REAL chain:
`WorkspaceIndexerService.indexWorkspaceStream` with the same options as `runIndex`, a Node
file-system provider with the same fast-glob options as Electron, the real `CodeSymbolIndexer`
and real tree-sitter WASM. The sink was in-memory and counted what the store would receive. No
SQLite file, no embedder, no app instance, no write under the real HOME. The main checkout got
a read-only discovery walk only. Run through `npm run verify` (the machine-wide lock).

### Discovery

| Measure | Main checkout (`/home/amun/ptah-extension`) | This worktree |
| ------- | ------------------------------------------- | ------------- |
| Files walked, `**/*` with `DEFAULT_WORKSPACE_EXCLUDES` | 16,224 (4.3 s) | 10,859 (0.5 s) |
| Same walk without the nested-worktree globs | 91,998 (20.3 s): **75,774 files in nested worktree folders** that the globs keep out | 10,859 (no nested folders) |
| Recognised source extensions after default excludes | 9,490 | 9,008 |
| Dropped by root ignore files or the `.git` probe | 497: `.agents/skills` 165, `.claude/skills` 165, `.ptah/plugins` 153, `.github/skills` 12, other 2 | 14: `.claude/skills` 12 (`.claude/skills/stitch-loop/` is gitignored), other 2 |
| Discovered (stream output) | 8,993 | 8,994 |
| Unreadable | 0 | 0 |
| Eligible by extension | 8,874 | 8,875 |
| `unsupported` | 119: `.mjs` 107, `.cjs` 8, `.cts` 4 | 119: same |
| Eligible files under `.ptah`, `.claude`, `.agents`, `.codex`, `.github/skills` | 0 | 0 |
| Discovery time (stream) | 7.3 s | 6.6 s |

### Full run (this worktree)

| Measure | Run 1 (first start) | Run 2 (same tree, a restart) |
| ------- | ------------------- | ---------------------------- |
| Selected after `DEFAULT_SKIP_PATTERNS` | 4,769 (4,106 tests, configs, barrels, `*.d.ts` dropped) | 4,769 |
| Files read, parsed and written | 4,769 | every file (stopped at 320; per-file cost the same) |
| Symbol texts sent to the store, so to the embedder | 50,287 (4.99 MB of text) | same 50,287 by code (no skip exists) |
| Files with zero symbols | 82 | — |
| Coverage after the run | `current`, `complete`: analyzed 4,739, failed 30 (`parse` 23, `unsupported-syntax` 7), unchecked 0, unsupported 119 (javascript 115, typescript 4) | — |
| Time in the harness | 1,547 s for 4,769 files (about 0.32 s per file) | first 300 files: 164 s (run 1: 126 s) |

The harness time is Jest, in-band, on a machine shared with other checks, without embedding.
App timing differs, but the shape is the same: a full run costs about 4.8k parses and 50k
embeddings, and a restart pays all of it again.

### The live numbers explained

- **115 `unsupported` javascript**: exactly the 107 `.mjs` + 8 `.cjs` files outside the
  excludes. JavaScript declares both as recognition-only
  (`ast/languages/javascript.language.ts:298`). The 4 TypeScript ones are `.cts`
  (`typescript.language.ts:111`, `.mts`/`.cts` are recognition-only).
- **3,741 `unchecked` with `state: updating`**: a run in progress counts every selected file
  that it has not written yet as `unchecked`
  (`code-symbol-indexer.service.ts:686-688`). The main checkout selects about 4.77k files, so
  the live read came about 1,030 files into a run. After a complete run the harness shows
  `unchecked` 0. Each start (trigger 1), each other root opened (2), each task-end census (6)
  and each lazy run (7) re-selects all files, so the panel shows thousands of `unchecked`
  files for most of each run. With the skip in Part B, unchanged files are recorded at stat
  speed and `unchecked` drains in seconds.
- **Unchanged files on restart**: re-parsed and re-embedded. Evidence: no comparison exists in
  `runIndex` or `replaceFileSymbols` (A1), and run 2 took the same per-file time.

### Expected after Part B (to confirm with the G7 measurement)

| Case | Parses | Embedder inputs |
| ---- | ------ | --------------- |
| Restart, nothing changed | 30 (the failed files are not cacheable) | 0 for cached files |
| One file edited | 1 + 30 | that file's misses only |
| New worktree with the same content | 4,769 | about 0 (texts hold root-relative paths, so donors from main match) |

Consequence for A4: on this repository the new code-index excludes remove 0 files today,
because `.gitignore` already keeps those folders out of full runs. They protect other
repositories and the watcher and `reindexFile` paths (audit gaps 1 and item 7).
