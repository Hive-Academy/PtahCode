# B05 review - bots trusted adapters

**Verdict: REVISE** (small fixes, no redesign). **Score: 7/10.**

Evidence for the score: read-only behavior, path derivation, privacy and host wiring are sound. One plan requirement (explicit timeouts on every new external call) is only partly met, and two drift risks need a guard. Checks pass.

## Findings

1. **Medium - `fetchModels` has no explicit timeout and runs in series.**
   `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts:71`. `bounded()` wraps only `getProviderKey` (line 67). The `fetchModels` call relies on the timers inside `ProviderModelsService` (10 s and 15 s at `provider-models.service.ts:532`, `:1249`), and the OpenCode live-route path at `:310` has no visible timer. The loop at line 60 runs the providers one after the other, so one slow provider delays the whole catalog.
   Fix: wrap `fetchModels` in `this.bounded(...)` and run the providers with limited concurrency (for example 4). Keep the per-provider diagnostic on timeout.

2. **Medium - proposal reader ignores the retention rule of the store.**
   `bot-source-reader.ts:~117-125`. `HarnessProposalStore.get` prunes records older than `RETENTION_MS` (`harness-proposal-store.service.ts:~172`, prune at `:~265`). The reader skips prune on purpose (correct, no write) but also never checks `updatedAt`. An expired proposal that the store has not yet deleted is importable. The two readers disagree.
   Fix: apply the same cutoff test on `parsed.data.updatedAt` and return `SOURCE_MISSING` (or `SOURCE_CHANGED`) for an expired record. Do not delete the file.

3. **Low - duplicated store paths have no drift guard.**
   `bot-source-reader.ts:~58-66` and `:~71-76`. Decision 1 check: the preset path equals `getHarnessesDir()` + `${id}.json` (`harness-config-store.service.ts:~25-27`, `:~222`), the id regex matches `sanitizeFileName` output (`:305-312`), and the proposal path equals `directory()` + SHA-256 `file()` (`harness-proposal-store.service.ts:~205-209`). They are identical today. No write, no prune, no migration occurs. But both helpers are private, so a store change breaks the reader silently.
   Fix: export small path helpers from the two stores (or a shared `harness-store-paths.ts`) and import them in the reader. At minimum add a spec that writes with the real store and reads with the reader.

4. **Low - session identifier trim is inconsistent.**
   `bot-source-reader.ts:~58` hashes `source.sessionId.trim()`, but line `~117` compares `parsed.data.sessionId !== source.sessionId` without trim. The store schema trims (`rpc-harness.schemas.ts:462`). If the bots schema does not trim, a padded identifier gives a false `SOURCE_CHANGED`.
   Fix: compute `const sessionId = source.sessionId.trim()` once and use it in both places.

5. **Low - ptah-cli key is a string literal.**
   `bot-catalog-adapter.ts:~132`. Decision 2 check: key and shape match `PtahCliConfigPersistence.loadConfigs` (`ptah-cli-config-persistence.service.ts:~37`). The DTO holds only `id`, `name`, `enabled`. No credential value is exposed and no migration runs. Risks: the literal `'ptahCliAgents'` can drift from `PTAH_CLI_AGENTS_CONFIG_KEY`, and the strict `z.array` parse (line 34) drops every lane if one entry is malformed.
   Fix: import the constant if it is exported. Parse each entry with `safeParse` and emit a per-entry diagnostic.

6. **Low - type cast hides the dependency.**
   `bot-workspace-authorizer.ts:~38` casts `Pick<IWorkspaceProvider,'getWorkspaceFolders'>` to `IWorkspaceProvider`. Fix: change `findOpenWorkspaceRoot` to accept the `Pick`, or build a local helper over `getWorkspaceFolders()` and `sameWorkspaceRoot`.

7. **Info - `which.sync` and "without spawning".**
   `bot-catalog-adapter.ts:106`. `which.sync` scans PATH with file-system calls. It does not start a process, so it meets the plan's "without spawning". It blocks the event loop for up to six lookups and has no timeout. Acceptable. Cursor is reported as available without a lookup (bundled SDK), which matches the adapter comment.

## Other checks (no defect)

- Reader never writes, never accepts a path, authorizes `workspaceRoot` before any file access, and distinguishes missing, malformed, unsupported and changed (`bot-source-reader.ts:~84-150`). `stamp` before and after read detects change.
- Authorizer uses `findOpenWorkspaceRoot`, rejects relative, padded, NUL and `..` roots, and returns the open-folder spelling. Descendants fail because the match is exact (`workspace-authorization.ts:26-33`).
- Catalog turns every failure into a diagnostic and a `partial` or `unavailable` status. No silent empty list.
- Registration is lazy (`register-bot-adapters.ts`). Nothing resolves at register time.
- **Host parity.** `WORKSPACE_PROVIDER`, `CONFIG_MANAGER`, `LOGGER` and `AUTH_SECRETS_SERVICE` come from the platform and vscode-core registration that both hosts call. `SDK_PROVIDER_MODELS` comes from `registerAuthProvidersServices` (`phase-2-libraries.ts:262`, `container.ts:746`). `SOURCE_RESOLVER` comes from `registerHarnessSyncServices` (`container.ts:828`; Electron at `phase-2-libraries.ts:385`). I found no collaborator that only one host has. I did not boot either container, so B10 and B11 must prove it with a resolve test.

## Checks run

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` - exit 0.
- `npx jest ... bot-source-reader.spec.ts bot-catalog-adapter.spec.ts` - 2 suites, 22 tests passed.
- `npx eslint libs/backend/rpc-handlers/src/lib/bots/*.ts` - exit 0.

## Re-review (round 1)

**Verdict: APPROVED.** **Score: 9/10.** No blocking defect.

### Findings 1-7 - status

1. Fixed. `bot-catalog-adapter.ts:64-99` uses four workers. `:78-80` bounds `fetchModels` (15 s). Order is kept by index. Each failure gives a `MODELS_UNAVAILABLE` diagnostic that names the provider and holds no exception text. Test: `bot-catalog-adapter.spec.ts:97`.
2. Fixed. `bot-source-reader.ts:148-152` applies the retention cutoff and returns `SOURCE_MISSING`. No write or prune. Real-store test at `bot-source-reader.spec.ts:305`.
3. Fixed by test. `bot-source-reader.spec.ts:221` writes with the real stores and reads with the reader. Drift now fails a test.
4. Fixed. `bot-source-reader.ts:61-62` trims once. The trimmed id is used for the hash (`:72`), the identity check (`:143`) and the returned ref (`:178`).
5. Fixed. The shared key `PTAH_CLI_AGENTS_CONFIG_KEY` is imported (`:3`, `:150`). Each entry uses `safeParse` (`:155`). A bad entry gives `LANE_ENTRY_INVALID` and valid entries stay.
6. Fixed. `bot-workspace-authorizer.ts:34-42` has no cast. It returns the open-folder spelling.
7. Fixed. `resolveCliPath` (`cli-adapter.utils.ts:85`) uses the `which` library. The file comment says "no subprocess". `which` scans PATH with file-system calls. It meets "without spawning". `bot-catalog-adapter.ts:121` bounds it. The package is the same in the Electron host and the cli-engine host. Both hosts load `cli-agent-runtime`, and the helper has no host dependency. The `which` line in `libs/backend/rpc-handlers/package.json` is removed, as the coordinator said. `git diff` of that file is empty, and eslint on it exits 0.

### Carry-forward rows

- V1 snapshot upgrade before a `bots:get` reply: not in B05 (B08). The reader does not touch a reply. Open for B08.
- Authorizer returns the open-folder spelling: met (`bot-workspace-authorizer.ts:42`). The changed-case Windows test exists (`bot-source-reader.spec.ts:179` and after).

### New defects (all Low, none block)

1. **Low** - `bot-source-reader.ts:148-151`. If `updatedAt` is not a date, `Date.parse` gives `NaN`. The test `NaN < x` is false, so the proposal is not treated as expired. Fix: check `Number.isNaN` and return `SOURCE_MALFORMED`. Check first whether `HarnessProposalSchema` already requires an ISO date. If it does, no change is needed.
2. **Low** - `bot-catalog-adapter.ts:75-80`. `getProviderKey` and `fetchModels` each have a 15 s bound. One provider can wait 30 s. With four workers and about ten providers, the worst case is large. Fix: use one shared deadline for each provider, or lower the bound. This is an optional improvement.
3. **Info** - `bot-catalog-adapter.ts:154-170`. A lane id that two registry entries repeat gives two lane choices. No data loss. Consider a duplicate check in B08.

### Checks run

- `npx jest ... bot-source-reader.spec.ts bot-catalog-adapter.spec.ts` - 2 suites, 25 tests passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` - exit 0.
- `npx eslint libs/backend/rpc-handlers/src/lib/bots/*.ts libs/backend/rpc-handlers/package.json` - exit 0.
- I did not boot either host container. B10 and B11 must prove token resolution with a resolve test.
