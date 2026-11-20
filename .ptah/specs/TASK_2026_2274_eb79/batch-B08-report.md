# Batch B08 report

Status: complete. All requested lane-only checks pass; ESLint has only three pre-existing central-file warnings.

## Files

- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts:10`: typed lazy resolver and eleven thin shared-schema validated methods; safe DI errors; host workspace context.
- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts:137`: twelve RPC cases (including two unbound-token cases) with real application service and typed repository fake.
- `libs/backend/rpc-handlers/src/lib/handlers/index.ts:107`: handler/resolver barrel export.
- `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:127`: library-owned bots entry, `requires: []`.
- `libs/backend/rpc-handlers/src/index.ts:204`: public adapter helper, handler and resolver exports.
- `libs/shared/src/lib/types/rpc.types.ts:175`: imports existing `BotsRpcMethods`; registry extends it at :1168; runtime entries at :3733 include all eleven names.
- Carry-forward extra: `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts:154`: duplicate registry IDs retain first lane and add `LANE_ENTRY_DUPLICATE` diagnostic.
- Carry-forward extra test: `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts:89`.
- This report was written as a skeleton before implementation.

## Acceptance and carry-forward evidence

| Requirement                                                                               | Evidence                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All eleven methods activated atomically in typed registry, runtime catalogue and manifest | Handler spec :194 compares schemas/METHODS/registry, exactly once; manifest invariant and allowlist suites pass. Includes upload/get-avatar.                                                                                                          |
| Available on both hosts, `requires: []`                                                   | Manifest :127; CLI surface suite passes (20 tests). Availability derives from the existing registry/manifest machinery; this revision has no separate availability map in rpc.types.ts.                                                               |
| Strict shared schema input and output validation; thin delegates                          | Handler :46 and :111; spec :137, :170, :349 cover dispatch, avatars, preview, malformed/extra fields, newer schema version.                                                                                                                           |
| Typed conflict and retention refusals                                                     | Spec :311 and :325 assert RpcUserError.errorCode; no repository deletion on refusal.                                                                                                                                                                  |
| Lazy typed root resolver; safe repository/application resolution errors                   | Handler :10, :27; spec :194 asserts no resolution at registration; :206 uses real tsyringe child containers with repository/application tokens unbound and requires exact safe message plus RpcUserError.                                             |
| Public registerBotAdapters export                                                         | Package index :204.                                                                                                                                                                                                                                   |
| Carry 1: V1 stored/historical snapshots upgraded for get                                  | Spec :236 uses real B06 application upgrade helper through RPC for current V1 and historical V1. No duplicate upgrade code in handler.                                                                                                                |
| Carry 2: deleted bots hidden even for revision read                                       | Spec :274 creates/deletes then requests current and historical revision; both BOT_NOT_FOUND.                                                                                                                                                          |
| Carry 3: ID methods use host workspace argument                                           | Handler :27, :74 onward; spec :224 rejects renderer workspaceRoot before resolution and verifies host root authorization. Avatar get context covered at :137.                                                                                         |
| Carry 4: list retains unreadable/unidentified fields                                      | Spec :290 checks unreadable ID/version and unidentifiedRowCount, alongside summaries.                                                                                                                                                                 |
| Carry 5: malformed updatedAt                                                              | No source-reader change needed: `libs/shared/src/lib/types/rpc/rpc-harness.schemas.ts:486` already uses `z.iso.datetime()`; source reader :135 validates before Date.parse. This row is satisfied by the existing schema guard, statically inspected. |
| Carry 6: repeated lane ID                                                                 | Catalog spec :89 asserts only the first lane remains and duplicate diagnostic is returned. Existing bounded async catalog tests still pass.                                                                                                           |

## Checks

- PASS: `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`.
- PASS (final): `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`.
- PASS (final): `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`.
- PASS: requested rpc-handlers Jest command with handler, manifest, allowlist and changed catalog specs: **4 suites, 66 tests**, 26.924 seconds.
- PASS: requested CLI surface Jest command: **1 suite, 20 tests**, 93.478 seconds.
- PASS: `npx eslint` over all eight changed TypeScript files: zero errors, three pre-existing warnings in rpc.types.ts (two unused skill-synthesis imports and max-lines). No new warnings.
- PASS: `git diff --check`.

## Decisions

- Composition API: `new BotsRpcHandlers(rpcHandler, () => container.resolve<BotApplicationService>(BOTS_TOKENS.APPLICATION), workspaceProvider).register()`. No decorator injection of application service. Both Electron and CLI roots supply the typed callback and workspace provider; their composition is B10/B11 scope.
- ID-based calls use the first currently open workspace folder, matching host provider context. Strict schemas reject renderer-supplied workspaceRoot on these operations. Explicit scopes/list roots are authorized by the application service.
- Reused existing `rpc-bots.types.ts` mapped method contract; only 14 lines added to the pre-existing 4,311-line central rpc.types.ts. New/other changed files remain under 700 lines. Splitting the pre-existing central file is outside this lane.
- HarnessProposalSchema requires ISO updatedAt, so no Number.isNaN guard or source-reader production change is necessary.
- Kept existing catalog deadlines; optional deadline restructuring was unnecessary for the duplicate fix.
- No pinned fixture changes needed. Only extra production/spec files are the expressly authorized catalog carry-forward fix and its regression test.
- CLI skill discovery was unavailable. Inspected local skill catalog; no matching RPC-only skill was exposed. No design/UI work performed.
- Ptah dependency tool initially rejected `filePath`; retry with `file` reported a building index. Used targeted native rg/Get-Content reads as fallback. Ptah diagnostics returned unchecked because its compiler exceeded 45 seconds; direct requested compiler checks provide evidence instead.
- Called ptah_agent_report once to notify the parent about the composition signature; tool refused delivery with `parent-inbox-full`. No retry sent.
- No git write operations, Nx, verify, build, serve, dev, e2e, or package targets used. Other lanes' files were left intact.

## Remaining scope

No unmet B08 implementation requirements. Electron/CLI composition calls remain owned by B10/B11. The parent report delivery failed because its inbox was full; the composition API is recorded above for integration.

## Revision 1

Status: complete. All six defects fixed; requested checks pass. This section supersedes the first-folder and error-message decisions from the initial batch.

### Defects and evidence

| Defect                                            | Fix                                                                                                                                                                                                                                                                           | Regression evidence                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. No-folder user bots blocked                    | `libs/backend/bots/src/lib/bot-application.service.ts:147`, `:447`: ID methods accept an empty list/default, which searches only user scope. Handler passes the host list without requiring a folder.                                                                         | `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts:144` gets/updates/deletes a user bot with zero folders; :176 verifies workspace bot is not found.                                                                                                        |
| 2. Only first folder searched                     | Service :447 authorizes every supplied root, retains the authorizer's exact spelling, deduplicates canonical roots, searches all scopes, and refuses ambiguous identity. Handler :66 obtains all host roots, passed to every ID-based call.                                   | Handler spec :187 tests get/update in each of two open roots; :228 checks exact canonical spelling and deduplication; :245 pins ambiguity refusal without a write. Existing application spec now passes `[ROOT]` to ID-based methods, including mutation/history/avatar cases. |
| 3. Unknown failures mislabeled as storage outages | `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts:36` injects plain Logger-like parameter; :114 logs unexpected errors then throws a sanitized generic Error. Resolution failures at :58 and typed domain persistence failures retain PERSISTENCE_UNAVAILABLE. | Handler spec :283 covers Error, RpcUserError and non-Error rejection, verifies logging and absence of RpcUserError/PERSISTENCE_UNAVAILABLE; :302 covers result-schema failure. Existing :391 covers unbound repository/application resolution.                                 |
| 4. Missing root and error mapping tests           | Extended RPC setup to model host root lists; preserved real application delegation and strict repository scope matching.                                                                                                                                                      | Handler spec :144-317 covers zero/two folders, both roots, canonical spelling, collisions, requested domain codes, malformed results and unknown errors; :264 preserves BOT_ARCHIVED, BOT_ACTIVE_WORK, BOT_SCHEMA_UNSUPPORTED and UNAUTHORIZED_WORKSPACE.                      |
| 5. Unused catch binding/suppression               | Handler :58 uses `catch {` for resolution; removed eslint-disable.                                                                                                                                                                                                            | Lint passes with zero warnings. Unbound DI tests retain exact safe message.                                                                                                                                                                                                    |
| 6. Domain messages could leak paths               | Handler :107 uses only fixed path-free message text while preserving typed codes.                                                                                                                                                                                             | Handler spec :264 injects domain messages containing Windows/POSIX private paths and pins exact safe reply text for all requested codes.                                                                                                                                       |

### Files in this revision

- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts:27` - constructor/error mapping and all-root delegation.
- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts:144` - regression cases and host-root-aware setup.
- `libs/backend/bots/src/lib/bot-application.service.ts:447` - explicitly authorized additional production file, root-list lookup.
- `libs/backend/bots/src/lib/bot-application.service.spec.ts:232` - explicitly authorized additional spec, existing cases exercise list arguments.
- This report. No helper file, composition change, or other revision file added. Pre-existing initial B08 changes remain intact.
- File lengths respectively: 122, 563, 654 and 694 lines; all below 700.

### Final constructor for B10/B11

```ts
new BotsRpcHandlers(
  rpcHandler: {
    registerMethod(name: string, handler: (params: unknown) => Promise<unknown>): void;
  },
  resolveApplication: () => BotApplicationService,
  workspace: Pick<IWorkspaceProvider, 'getWorkspaceFolders'>,
  logger: Pick<Logger, 'error'>,
)
```

The composition root supplies its existing host logger as the fourth parameter; application resolution remains lazy. Electron B10 and CLI B11 wiring is outside this revision scope.

### Revision checks

- PASS: `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`.
- PASS: `npx tsc --noEmit --project libs/backend/bots/tsconfig.spec.json`.
- PASS: `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`.
- PASS: `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`.
- PASS: `npx eslint` over all four revision TypeScript files, zero errors/warnings.
- PASS: requested bots Jest command (application, retention, import-preview, schema upgrades): **4 suites, 56 tests**, 13.911 seconds.
- PASS: requested rpc-handlers Jest command (handler, manifest, allowlist): **3 suites, 71 tests**, 50.519 seconds.
- PASS: `git diff --check`.

### Revision decisions

- ID-based application methods accept `readonly string[] | string = []`. Lists are the new host contract; string support preserves existing internal/CLI callers. Missing context means user scope only. Create/list keep their existing explicitly authorized scope contracts.
- Every supplied root passes the existing workspace authorization port. Only its returned exact spelling reaches repository scope comparisons. Canonical duplicates are searched once.
- Ambiguous IDs reuse `BOT_REVISION_CONFLICT`: the client's ID/revision cannot identify one current bot across open scopes, so no match is preferred and no mutation proceeds. No new shared error code or renderer scope parameter was introduced.
- There is no suitable generic internal RpcUserErrorCode in the current union. Unexpected non-domain failures are logged with the original Error (or unknown-value context), then replaced by `Error('Bot request failed.', { cause: error })`, retaining cause for host diagnostics. Existing RpcHandler logs/reports the generic internal failure and replies without an errorCode; original text/stack never crosses RPC. Resolution failures are mapped at the known lazy DI boundary; repository infrastructure failures arrive as typed domain errors from the service.
- Domain errors retain their typed code but use fixed text (`Bot storage is unavailable.` for persistence, `Bot request was refused.` otherwise), avoiding future path leaks.
- Called ptah_agent_report once during revision to notify the parent of the required fourth logger argument; delivery was refused with `parent-inbox-full`. No retry sent.
- Ptah dependency inspection returned a partial graph; targeted native reads supplemented it. CLI skill discovery remains unavailable; no applicable RPC-only skill is exposed. Requested direct tsc checks provide diagnostics evidence.
- No git writes, Nx, verify, builds or host-composition edits performed.

Revision 1 remaining work: no unmet revision requirements. B10/B11 must supply the fourth constructor logger argument; their files were not edited.
