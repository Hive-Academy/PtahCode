# Merge review (logic)

**Verdict: CHANGES REQUESTED** (no blocker, two Major items, three Minor items)

Scope: the handler `wizard:recommend-analysis-skills`, the onboarding conflict resolutions, the gallery file. I read the code and searched for retired symbols. I ran no check myself and relied on the lane's reported results.

## Findings

### Major 1 - Constructor injection of two services (setup-rpc.handlers.ts:149-152)

Every other use in this file resolves these tokens lazily with `resolveService`. The constructor change makes every `SetupRpcHandlers` construction depend on both tokens.

- Electron: safe. `registerAgentGenerationServices` runs in phase 2 (`phase-2-libraries.ts:434`) and `registerSharedRpcHandlers` (which registers the skill service, `register-shared-rpc-handlers.ts:90`) runs in phase 4. `SetupRpcHandlers` is a singleton that the container builds on first resolve.
- CLI engine: safe by order. Agent generation is registered at `container.ts:903` and shared handlers at `container.ts:1020`.
- No VS Code host exists in this repository (`apps/` has no `ptah-extension-vscode`), so I could not check that root.
- Risk: the CLI engine registers agent generation inside a try-block region. A failure there now makes `SetupRpcHandlers` fail to build. All `wizard:*` and setup methods then fail, not only the new one. Also, `constructor-signatures.typecheck.ts` does not cover the two new parameters.

Fix: remove the two constructor parameters. Use `this.resolveService<AnalysisStorageService>(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, ...)` and `this.resolveService<SkillRecommendationService>(SKILL_RECOMMENDATION_SERVICE, ...)` inside the handler. Inside the existing `try`, a resolve error then returns the safe empty result. Update `setup-rpc.handlers.spec.ts:262` (the `new SetupRpcHandlers(...)` call) to match.

### Major 2 - Lookup by `runId` loads every saved run (setup-rpc.handlers.ts:655-661)

`AnalysisStorageService` has no load-by-id method. `list()` returns metadata without `runId`. The loop calls `loadMultiPhase` for each run, and each call reads all phase files. The cost grows with the number of saved runs. One failing candidate (for example, an unreadable phase file) throws and is caught by the outer `catch`. The user then gets "Could not read the saved analysis" even when the target run is valid.

Fix: add `loadByRunId(workspacePath, runId)` to `AnalysisStorageService`. It can use the private `listValidRuns`, which already holds the manifests, and load only the matching run. Otherwise, wrap each `loadMultiPhase` call in its own try/catch and continue to the next run.

### Minor 1 - Stale comment (libs/frontend/core/src/lib/routing/onboarding-routes.ts:106-108)

The comment says generation opens on "Choose agents, which forwards to Generate agents". The code now returns `analyze/skills`. Update the comment.

### Minor 2 - Handler formatting (setup-rpc.handlers.ts:641-676)

The new handler has long lines that do not follow the Prettier style of the rest of the file. Run Prettier on the file.

### Minor 3 - No spec for the error branches

The spec covers a matching run, a missing run and invalid params. It has no test for a missing `stackSummary`, no open workspace, or a storage error. Add one test for each. Each must assert that the result is empty and has no raw error text.

## Checks that passed

- Workspace authorization: the handler uses only the active workspace root. The schema is `strictObject`, so it accepts no `workspacePath`. Correct and safe.
- `runId` validation: trimmed, 1 to 200 characters, and used only for comparison (no path use). Safe.
- Error paths: the catch logs the error and returns fixed copy. No raw error reaches the client.
- Missing `stackSummary` or no items: returns empty with explanatory copy (`:663-664`).
- Routes: `analyze/agents` and `analyze/generate` redirect to `analyze/skills` and keep the query params (`onboarding.routes.ts:27-31, 70-75`). No Choose agents or Generate agents page is registered.
- No non-spec source references any of the five removed RPC method names. The remaining "Generate agents" strings are UI labels or doc comments in chat libraries and fixtures, not links to the retired URL.
- Done page: the lane reports no retired generate link, and my search found none in `libs/frontend/onboarding` non-spec code.
- Gallery file: no conflict markers remain. `git diff origin/main` shows only the removal of the one stray line. The imports and component decorator are valid.

## Decisions

- Treated the missing VS Code host as "not present in this repository". Reversible: re-check if a VS Code root is added.
