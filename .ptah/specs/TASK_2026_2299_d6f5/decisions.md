# Decisions

| # | Decision | Evidence / reason |
| --- | --- | --- |
| D1 | Task type FEATURE, depth Full; no user wait gates | User gave full authority in the request. |
| D2 | Benchmark baseline recorded on unchanged code before any tool edit; tool edits start only after the P0 commit | Request: "Record the before numbers on `main` first". |
| D3 | New tools: `ptah_read_symbol` (symbol body or line range) and `ptah_grep` (free text). Both read-only. | Request items 1 and 2. Names follow the `ptah_*` pattern. |
| D4 | `ptah_grep` uses `rg` when found on PATH, else a bounded Node walk fallback. | No ripgrep dependency exists in package.json; Electron users may lack `rg`. A tool that fails without `rg` would not be adopted. |
| D5 | Item 7 is decided in this repo: `markEagerTools` / `ALWAYS_EAGER_TOOLS` in `protocol-dispatcher.ts`. Core navigation tools join the eager set. | `mcp-core/protocol-dispatcher.ts` ~line 617. |
| D6 | Live paid benchmark runs: only `modelTier: "haiku"`, or none. Offline numbers do not prove adoption. | Request. |
| D7 | One pull request for items 1 to 8 and the benchmark. | The code is one coherent change; the guidance copies must ship with the tools they name. |
| D8 | Core navigation tools eager (`ALWAYS_EAGER_TOOLS`): `ptah_read_symbol`, `ptah_grep`, `ptah_get_dependents`, `ptah_get_symbol_index`, `ptah_relevance_rank_files`. Decided in this repository. | `protocol-dispatcher.ts` stamps `anthropic/alwaysLoad`. Whether a client honours it is the client's decision; Claude Code does. |
| D9 | `ptah_read_symbol` name form covers classes, functions and methods (the tree-sitter outline). Interfaces, types, enums and constants are found with `ptah_grep`, then read by line range. The not-found text says so. | The outline extractors do not return those kinds; adding them needs a grammar change in every language. |
| D10 | Token ceiling of the two new tools is 6,000 (not 4 chars/token). | Numbered code measures about 2.7 chars per token; the char cap of 15,000 must not be cut by the budget step. |
| D11 | Core prompt grows by about 250 tokens; `ptah-core-prompt.spec.ts` limit raised from 3380 to 3645. | Two table rows plus two sentences; the server instructions (512 chars) still name both tools. |
| D12 | Style finding 1 (move `describeZodIssues` out of `route-tool-handlers.ts`) not applied. | That file documents itself as the one Zod formatter that the other tools import. |
| D13 | `ptah_grep` falls back to a Node walk when `rg` is not on PATH (it is not on PATH here). | Electron users may lack `rg`. |
| D14 | PR review round 1 (head cb1130640 and 35efefc2d): fixed the regex time limit (vm timeout), the skipped-content note, literal search on long lines, root `.gitignore` in the Node walk, directory real-path check, pattern and glob length bounds. Not done: nested `.gitignore` files and `!` rules in the Node walk (documented in `loadRootIgnore`); a no-follow directory API (Node has none; the real-path check narrows the window). | `rg` is the main engine and handles both; the Node walk is the fallback. |
| D15 | PR review round 2 (head 53fa7db97): fixed FIFO and device rejection in `resolveWorkspacePath`. Not done: a root-confined open that binds check and access (Node has no `openat`; same limit as D14); a `workspaceRoot` argument equal to the bound root (the tool contract takes any root, and the agent has a shell with the same reach); a bounded glob matcher (star runs are collapsed, glob and path lengths are bounded); nested `.gitignore` (D14). | Each item needs an API that Node lacks, or it changes the tool contract. |
