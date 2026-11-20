# B08 logic review: bots RPC handlers and manifest

Verdict: **REVISE**. Score: **6.5 / 10**.

The wiring, the registry, the manifest and the carry-forward rows are sound. The workspace-root rule for ID-based methods is not. It breaks user-scope bots when no folder is open. It also breaks bots of a second open root.

## Defects

1. **High. `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts:66-74`. No open folder blocks user-scope bots.**
   `workspaceRoot()` throws `UNAUTHORIZED_WORKSPACE` when no folder is open. This happens for `get`, `update`, `set-enabled`, `archive`, `restore`, `delete` and `get-avatar`. The application service only needs a root to find workspace-scope bots. Its `find` (`bot-application.service.ts:444-451`) always checks the user scope too. A user-scope bot can be listed (the list call with `scopeFilter: 'user'` still needs a `workspaceRoot` string, so it is odd, but it works) and then cannot be opened, edited or deleted. Fix: pass `undefined` when no folder is open, and let the service search only the user scope. Add a no-folder test.

2. **High. `bots-rpc.handlers.ts:66`. `getWorkspaceFolders()[0]` is wrong for multi-root workspaces.**
   Only the first folder is searched. A bot in the scope of folder 2 gets `BOT_NOT_FOUND` on every ID-based call. The renderer can still list that bot, because `bots:list` takes `workspaceRoot` from params and the service authorizes it. List and get therefore disagree. The first folder is also not the active folder. Fix: search all open folders (the service needs a list of roots or a loop in the handler). Or add a documented, host-checked `scope` selector. Do not take a root from the renderer without a host check.

3. **Medium. `bots-rpc.handlers.ts:116-119`. Every non-domain error becomes `PERSISTENCE_UNAVAILABLE`.**
   A bug, a result-schema failure (`:112`) or a thrown `RpcUserError` all show as "Bot storage is unavailable." Nothing is logged. The real cause is lost. The service already maps repository failures to domain errors. Fix: map only known infrastructure errors. Log the rest through the injected logger (or the RPC handler report path). Return a generic internal-error code for them.

4. **Medium. `bots-rpc.handlers.spec.ts:125` (whole file). Missing tests for the root rule.**
   The workspace provider always returns one root. There is no test for zero folders, for two folders, or for a bot whose scope is another open root. Defects 1 and 2 are therefore not caught. The error-mapping tests cover conflict and retention refusal only. There are no cases for `BOT_ARCHIVED`, `BOT_ACTIVE_WORK`, `BOT_SCHEMA_UNSUPPORTED` or `UNAUTHORIZED_WORKSPACE`.

5. **Low. `bots-rpc.handlers.ts:57`. Unused `error` binding with an eslint-disable.**
   Use an optional catch binding (`catch {`). The disable comment is not needed.

6. **Low. `bots-rpc.handlers.ts:114-115`. The handler sends `error.message` of every domain error to the renderer.**
   Current service messages are fixed text, so this is safe now. A future domain message with a path would leak. Consider a short comment or a test that pins this rule.

## Checked and correct

- Eleven methods exist once in `RpcMethodRegistry` (`rpc.types.ts:1168`), in the runtime map (`:3733`) and in the manifest (`manifest.ts:126`). `requires: []`. `registerBotAdapters` is exported (`index.ts:204`).
- The resolver is lazy and is called per request. There is no eager injection. A resolver failure gives `RpcUserError("Bot storage is unavailable.", "PERSISTENCE_UNAVAILABLE")` with no DI text (`:54-64`). The spec covers unbound repository and unbound application.
- Handlers are thin: validate, delegate, parse result, map errors.
- Error mapping: all `BotDomainError` codes pass through with `error.code` as the RPC code (typed by `RpcUserErrorCode`, tsc passes). `BotRepositoryError` already maps to domain codes in the service (`:609-621`).
- Both hosts can be wired: the constructor takes a plain callback and a `Pick<IWorkspaceProvider, 'getWorkspaceFolders'>`. Nothing is tied to Electron.

## Carry-forward rows

1. V1 upgrade before `bots:get` reply: **confirmed** (service uses `upgradeBotDefinition`; spec :236).
2. Revision read after delete gives `BOT_NOT_FOUND`: **confirmed** (`find` runs first; spec :274).
3. ID methods take the root from the host: **confirmed for the source of the root** (strict schemas reject `workspaceRoot`; spec :224). The choice of root is defective (defects 1 and 2). Note that `bots:list`, `preview-import` and `upload-avatar` still take a root or scope from the renderer. The service authorizes them. This follows the contract.
4. `bots:list` keeps `unreadable` and `unidentifiedRowCount`: **confirmed** (spec :290).
5. `HarnessProposalSchema` has an ISO `updatedAt` at `rpc-harness.schemas.ts:486`: **confirmed** by reading the file (`z.iso.datetime()`, as the report states).
6. Duplicate lane IDs keep the first and add `LANE_ENTRY_DUPLICATE` (`bot-catalog-adapter.ts:165-172`): **confirmed**, with a spec. Note: the diagnostic names the registry index only. This is acceptable.

## Checks run

- `npx jest ... bots-rpc.handlers.spec.ts bot-catalog-adapter.spec.ts`: PASS, 2 suites, 21 tests.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: PASS.
- `npx eslint` on the five changed non-shared files: exit 0.
- Not run: manifest, allowlist and CLI surface suites (the report says they pass). `rpc.types.ts` was read, not linted.

## Decisions

- I judged the "first open folder" rule as a defect and not a valid scope decision. Evidence: the service searches the user scope without a root, and `bots:list` can show bots of any authorized root. This is reversible.

## Re-review (round 1)

Verdict: **APPROVED**. Score: **8.5 / 10**.

All six first-round defects are fixed. I found no new High or Medium defect.

### First-round defects

1. No folder blocks user-scope bots: **fixed**. `bots-rpc.handlers.ts:66` passes the host list with no folder check. `bot-application.service.ts:447-466` always searches the user scope first. Spec `bots-rpc.handlers.spec.ts:144` covers zero folders.
2. Only the first folder searched: **fixed**. The handler passes all roots (`:74-101`). `find` authorizes each root, keeps the authorizer's stored spelling, removes duplicates and searches every scope. Specs cover two roots, spelling and duplicates.
3. Unknown errors labeled as storage outage: **fixed**. `bots-rpc.handlers.ts:114-119` logs the error and throws a plain `Error` with `cause`. `RpcHandler` (`rpc-handler.ts:~263`) reports it to Sentry and replies with no `errorCode`. DI resolution failure still gives `PERSISTENCE_UNAVAILABLE` (`:58-63`).
4. Missing tests: **fixed**. Zero folders, two folders, other-root bots, archived, active work, schema and unauthorized codes, and unknown errors are now covered.
5. Unused catch binding: **fixed** (`:58`).
6. Domain messages could leak paths: **fixed**. Only two fixed texts leave the handler (`:107-112`).

### Implementer decisions

- **(a) Ambiguous ID gives `BOT_REVISION_CONFLICT`: acceptable.** The case needs a duplicate ID in two open scopes. That is very rare, so a new code is not worth it. No existing code fits better: `BOT_NOT_FOUND` is false and `INVALID_PARAMS` blames the caller. The service refuses before any write, and a spec pins that. One limit: a "refresh and retry" prompt will not clear this state.
- **(b) Log, then rethrow `Error('Bot request failed.', { cause })`: acceptable.** No raw text reaches the renderer. The reply has no `errorCode`.

### Other checks

- String roots still work: the service accepts `readonly string[] | string = []` (`bot-application.service.ts:147,450`). An unknown string root is refused by the authorizer (`bot-workspace-authorizer.ts:34-41`).
- Host roots always pass the authorizer, and the stored spelling is the one used for the repository scope.
- The constructor now needs a fourth argument (`logger`). B10 and B11 must supply it. The report states this.

### Remaining defects

1. **Low. `bots-rpc.handlers.ts:108-111`. All domain refusals show the same text.** "Bot request was refused." hides useful text such as "Archived bots are read-only" and "Bot has active work". The code is still typed, so the renderer can map it. Make sure the UI batch maps every code to its own message.
2. **Low. `bot-application.service.ts:454-458`. One bad root fails the whole call.** If one open root fails authorization, `find` throws `UNAUTHORIZED_WORKSPACE` and the user scope is not searched. Host roots pass by definition, so this only matters for a stale string argument. Consider skipping unauthorized roots in the host-list path.
3. **Low. `bots-rpc.handlers.ts:77`. `bots:create` with no scope uses `roots[0]`.** In a multi-root workspace the bot goes to the first folder. This matches the old rule but is arbitrary. Document it, or require a scope in multi-root.
4. **Low. `bots-rpc.handlers.ts:114` with `rpc-handler.ts` error path. Double logging.** The handler logs and `RpcHandler` logs the same failure again. Harmless. Remove one log if the noise matters.

### Checks run

- `bots-rpc.handlers.spec.ts`: PASS, 26 tests.
- `bot-application.service.spec.ts`: PASS, 24 tests.
- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`: PASS.
- `npx eslint` on the four changed files: exit 0.
