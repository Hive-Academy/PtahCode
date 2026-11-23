# Code Style Review - TASK_2026_2299_d6f5 (nav tools)

Read in full: nav/{grep,read-symbol,nav-symbols,nav-workspace-path,*.limits}.ts, ast-analyze-output.ts,
symbol-search-answer.ts, merge-import-rows.ts, plus the dispatcher/builder/budget diffs. By head or
outline only: grep-engine.ts, parameter-names.ts, symbol-hit-format.ts, scripts/nav-benchmark.
No `any`, `@ts-ignore` or `eslint-disable` in the scoped files; no lib-to-lib deep import inside libs.
Score 7/10. Verdict: REVISE (4 major, none blocking).

## Major

1. Shared helper imported from an unrelated handler. `nav/grep.ts:11` and `nav/read-symbol.ts:11`
   import `describeZodIssues` from `../route-tool-handlers` (defined at `route-tool-handlers.ts:49`).
   Nav code now depends on the route handler module and its imports. Fix: move it to a neutral
   `mcp-core/zod-issues.ts`, re-export from `route-tool-handlers.ts` for current callers, import the
   neutral file in `nav/*`.

2. Limit duplicated as a literal. The `buildGrepTool` description in `tool-description.builder.ts`
   hardcodes "40 files" while `GREP_MAX_FILES` (`grep.limits.ts:8`, used at `grep.ts:97`) exists and the
   other limits in that description are interpolated. Fix: import it and write `${GREP_MAX_FILES} files`.

3. Dangling doc reference. `scripts/nav-benchmark/jest.bench.config.ts:4` and `ptah-runner.bench.ts:9,127`
   refer to `RUNNER.md`; it does not exist (`ls scripts/nav-benchmark`). Fix: add it, or move the
   "approximated offline" list into the `ptah-runner.bench.ts` header and drop the references.

4. Benchmark runner imports lib/app internals by relative path. `ptah-runner.bench.ts:57-81`:
   `memory-curator/src/lib/symbol-sink.adapter` (not in that barrel; `index.ts` exports only
   `CodeSymbolStore`), `apps/ptah-electron/src/services/electron-ide-capabilities`, and
   `vscode-lm-tools/src/lib/...` (`protocol-dispatcher`, `namespace-builders`, `types`). `scripts/` is not an
   Nx project, so lint does not catch it, but the repo rule is barrel or declared entry point. Fix: export
   `MemoryStoreSymbolSink` and the MCP request handler from their barrels and import via `@ptah-extension/*`;
   keep the Electron-service import with a comment. The file is 499 lines of DI wiring plus the step loop;
   move wiring to `bench-container.ts`.

## Minor

5. `protocol-dispatcher.ts:1138-1165`: the read_symbol and grep cases carry the same dep literal and
   worktree comment; `getCallerWorkspaceRoot() ?? workspace.getInfo()` is a third copy at `:2866`.
   Fix: one local `navDeps()` builder so the worktree rule has one home.

6. `GrepReply` (`grep.ts:64`) and `ReadSymbolReply` (`read-symbol.ts:51`) are the same `{isError, text}`
   shape, and so are the `fail`/`ok` helpers (`grep.ts:69-70`, `read-symbol.ts:56-57`). Fix: one
   `NavToolReply` with `navFail`/`navOk` in a shared nav file.

7. Loose result types. `ast-analyze-output.ts:65` returns `Record<string, unknown>` built by string key,
   so the documented key order (file header) is enforced by a comment only. Fix: an `AstAnalyzeShape`
   interface in key order. `symbol-search-answer.ts:26` types `kind: string`; reuse the `SymbolHit` field
   type (`Pick<SymbolHit, ...>`).

8. Exports with no non-spec importer: `shapeAstAnalyzeResult`, `relativeToWorkspace`,
   `AST_ANALYZE_TRUNCATION_HINT` (`ast-analyze-output.ts`), `isIndexQuiet`, `SymbolSearchWireAnswer`,
   `SymbolSearchWireHit` (`symbol-search-answer.ts`), `GrepArgsSchema`, `ReadSymbolArgsSchema`,
   `renderGrepResult`, `toPosixRelative` (used only by `grep-engine.ts`, fine) and `innermostSymbolAt`
   (grep only, fine). Un-export the first nine, or test through the public function.

9. `ast-analyze-output.ts:22` `TOOL_NAME = 'ptah_ast_analyze'` is a fourth spelling of the name; the nav
   tools got `*_TOOL_NAME` constants, the old tool did not. Export one constant next to
   `buildAstAnalyzeTool` if you touch it.

10. Placement. Tool families keep definitions in `<family>-tools.ts` and handlers in
    `<family>-tool-handlers.ts` (route, session, surface, artifact). The two new builders add about 120
    lines to `tool-description.builder.ts` (already over 2,100 lines), and `*.limits.ts` has no sibling
    (`agent-limit.formatter.ts`, `bounded-limit-lookup.ts`). Fix: `nav/nav-tools.ts` for the builders,
    `*-limits.ts` naming.

11. Size. `grep-engine.ts` (425: rg spawn, Node walker, matcher), `parameter-names.ts` (468: scanner plus
    three name readers), `symbol-hit-format.ts` (336: ranges, signatures, source IO, ranking). Each is
    cohesive today; split on those seams at the next change (move `readSourceFiles` out of the formatter).

12. `merge-import-rows.ts:82` `groups.get(...) as MergeGroup` has no justification (the `as T` at `:90`
    does). Store the group object in the slot instead of the source key; the cast goes away.

## Pattern compliance
| Rule | Status | Evidence |
| --- | --- | --- |
| Barrel imports across libs | PASS in libs, FAIL in scripts | `grep.ts:9`; finding 4 |
| Dependency-free limits/name constants | PASS | `grep.limits.ts:1-4` |
| Eager list, budget, content hint registered | PASS | dispatcher `ALWAYS_EAGER_TOOLS`; `tool-result-budget.ts:116-146` |
| No `any` / suppressions | PASS | grep over scoped files |
| Header comments carry the task id | PASS | file headers |
