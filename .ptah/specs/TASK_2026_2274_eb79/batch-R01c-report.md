# Batch R01c ? bot create stall

## Root cause

The branch gates persistence on unrelated provider model discovery. `libs/frontend/bots-ui/src/lib/bots.store.ts:423` sets saving and awaits `safe(request)` at line 431. `bots-client.ts:36` delegates create to `ClaudeRpcService.call`. `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts:82` delegates to the application service. `libs/backend/bots/src/lib/bot-application.service.ts:231` awaits diagnostics before repository.save; diagnostics at line 526 calls `catalog.read(scope, definition)`.

Before this fix, `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts:64` enumerated every Anthropic-compatible provider even for `{ kind: 'default' }`. Each worker awaited secret and model lookups, four workers at a time, each lookup bounded individually to 15 seconds (line 326). Multiple batches can exceed the renderer's 30-second RPC timeout. This includes live network catalogs and Claude SDK supportedModels discovery. It is not a deadlocked SQLite write: it has not reached the write yet.

Evidence: `.ptah/tmp/bots-shots.log:2135` records bots:create entering RpcHandler, followed immediately by provider secret lookups and network discovery; line 2146 records SDK supportedModels discovery. The snapshot `dist/apps/ptah-electron-e2e/design-preview-results/bots.shot.ts-Bots-design-review-1280-ptah-glass/error-context.md:217` shows two status nodes and disabled create/cancel buttons with Saving. New regression tests against the original adapter failed (one exceeded Jest's 5-second timeout with unresolved unrelated model requests; another fetched two providers instead of the selected one).

The renderer is awaiting backend work, not missing an already-produced reply. `apps/ptah-electron/src/ipc/ipc-bridge.ts:588` awaits RpcHandler and sends either success/error at line 606; its catch also sends a correlated failure. `ClaudeRpcService` has a 30,000 ms default (`libs/frontend/core/src/lib/services/claude-rpc.service.ts:24`). The store converts thrown transport errors into failures (`bots.store.ts:667`) and clears saving on settled results (`:436`). There is no evidence of a bot exception bypassing that cleanup. The capture's 30-second wait and renderer timeout coincide; do not interpret its final snapshot as proof of an infinite promise. A backend write can outlive that timeout, so increasing the timeout would preserve the underlying problem.

Duplicate registration is a separate branch defect: `apps/ptah-electron/src/di/phase-4-handlers.ts:109` calls `registerBotsComposition`; `register-bots-composition.ts:45` eagerly registers the handlers. Runtime activation (`apps/ptah-electron/src/activation/wire-runtime.ts:341`) calls registerRpcSurface; the shared manifest includes bots (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:127`) and `register-rpc-surface.ts:186` calls register again. Both resolve the same instanceCachingFactory handler. This explains 11 overwrites per launch, 44 across four captures. The resolver remains lazy and resolves the same cached application service; this does not swap in a different closed database.

Storage tracing: `libs/backend/bots/src/lib/register-bots-services.ts:34` resolves BOT_REPOSITORY. `libs/backend/persistence-sqlite/src/lib/di/register.ts:43` binds SqliteBotRepository as singleton and the connection as singleton. The repository retains the connection service, reads its current db property at operation time (`libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts:129`, `:424`), and does synchronous transactions with rollback/error propagation. No separate bot connection or handler-owned close exists.

Renderer state TypeError: logged chunk-K32TBCPF.js:9411 is the generic Angular error reporter, not the throwing component. Static tracing identifies the update dialog path: UiDriver responds success with namespace defaults for unmapped requests (`apps/ptah-electron-e2e/src/support/ui-driver.ts:160`); the bots fixture did not provide update:get-state. `libs/frontend/chat/src/lib/update-dialog/update-dialog.service.ts:69` sets state to result.data.state (undefined), then `update-dialog.component.ts:106` reads this.state().state in dialogOpen. The corresponding compiled service is chunk-HTJ3ECZ7.js:11888. Receipt errors map directly to `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts:342` (compiled chunk-H5YFXZCM.js): its unmapped list request returns defaults rather than a receipts array. These are independent fixture boot errors; their source paths do not traverse bots:create. The log lacks a throwing stack, so the precise state-error attribution is a static causal match, not a captured stack confirmation.

## Fix

- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts`: when validating a bot selection, fetch models only for its explicitly selected main provider. Default and lane runtimes fetch no main-provider models. Calls without selection retain full enumeration. Skill validation, selected runtime diagnostics, and existing per-dependency bounds remain intact.
- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts`: make registration idempotent on the cached handler; both host composition styles remain supported.
- `apps/ptah-electron-e2e/src/design-preview/bots.shot.ts:146`: all three status assertions and the alert assertion use `span[start][role="status"]` / `span[start][role="alert"]`, targeting BotSaveBar's projected message, excluding the foundation form-actions status. The foundation status span itself is empty in this component, so targeting it would assert the wrong message.
- `apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts`: provide actual idle update-state, empty receipts, and empty parent deliveries results, each checked with RpcMethodResult via satisfies. Bot requests continue to use real IPC listeners and real storage.
- Specs listed below. No renderer production/template/styling changes and no persistence/migration changes.

## Tests added

`libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts:89`: unresolved model discovery must not block default/lane selection diagnostics; skill candidates are still available and no provider secrets/models are fetched.

`bot-catalog-adapter.spec.ts:107`: main-provider selection fetches only that provider, excluding another installed provider.

`libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts:144`: calling register twice registers precisely the 11 methods once and never resolves the application early.

The first two tests were run before the adapter fix and both failed. After the fix both complete successfully as part of the full focused suites. Registration regression added with the guard.

## Pre-existing errors not fixed

- Session store migration S0007_usage_source_cursor: log lines 1867, 2191, 2203. `git show main:libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts` contains the same non-idempotent CREATE TABLE usage_source_cursor and version-7 descriptor (current lines 177/200). `git diff main --` for that file, sqlite-connection.service.ts, and sqlite-migration-runner.ts is empty. It is a session-store migration, not the branch's bot migration 0076. The existing table/migration-ledger inconsistency in this run was not repaired. Static comparison proves unchanged failing code, not a separate execution reproduction on main.
- Cron scheduler closed persistence: first example at log line 2218 occurs after app before-quit/window-close at 2155+ and will-quit at 2169. `git show main:libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts` contains the exact closed-connection RpcUserError text (current line 424); diff is empty. `libs/backend/cron-scheduler/src/lib/job-runner.ts:150` logs tryClaim failure; `git diff main --` for that file is empty. This is shutdown activity on existing paths, not evidence the bots handler rebound a closed connection before create.
- Other fixture fallback warnings (model/config/session/attention) were left outside scope. State and receipt consumer code also exists unchanged on main (`git diff main --` for update-dialog.service.ts and agent-delivery.store.ts is empty; `git show main:` confirms dialogOpen and receipt iteration). Their malformed mock responses in this new bots fixture are branch test setup defects, so those responses were corrected here rather than modifying the shared consumers.

## Decisions

Electron first: traced actual Electron IPC registration, lifecycle and backend, while keeping shared adapter/handler fixes compatible with CLI composition. No git mutations. Main comparison used only allowed diff/show; `git diff main --stat` reported 444 files changed, 30,440 insertions and 21,150 deletions, including substantial unrelated inherited differences. Current work was limited to the six code/spec files above plus this report.

Native skill loading is unavailable in this CLI/tool catalog. Read and applied `.claude/skills/angular-frontend-patterns/SKILL.md` for store review through native file reads; no UI design work was performed. Ptah workspace analysis and impact/dependent lookup were used; dependency index reported incomplete coverage. AST call initially used an unsupported argument and was followed by native targeted reads/rg. Ptah diagnostics reported its compiler still running after 45 seconds and three files unchecked; native scoped tsc supplied verification instead.

No production UI/template changes, so Angular template compilation and UI-class audit are not applicable. No app build/serve/dev/e2e capture was run, per the task contract. No new visual result is claimed; compared the existing error snapshot's Saving/duplicate-status behavior against the actual templates. Coordinator must rebuild and rerun all four real Electron captures to confirm saved revisions and screenshot output. Explicitly selected main providers can still take their existing bounded discovery time; the fix removes unrelated provider discovery from save validation.

## Command results

- Before fix: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts -t 'saves default|only discovers'` ? FAIL, 2 failures, 9 skipped. Default/lane case exceeded 5000 ms; selected case observed 2 calls instead of 1.
- After fix: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts` ? PASS, 2 suites / 38 tests, 43.494 seconds. Node emitted a Jest config ESM-loading warning; tests succeeded.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` ? PASS, exit 0.
- `npx eslint` on the four changed backend/spec files and bots.shot.ts ? PASS, exit 0; separate `npx eslint apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts` ? PASS, exit 0.
- `npx prettier --check` on the four backend/spec files and bots.shot.ts ? PASS. Initial fixture formatting check failed; formatted it and repeated `npx prettier --check apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts` ? PASS.
- Files changed here are all under 700 lines (adapter 334; adapter spec 350; handler 125; handler spec 578; shot 303; fixture under 120).
- Ptah diagnostics unavailable after its 45-second compiler wait; not counted as a clean diagnostic result.

## Clarifications Needed

No clarification blocks the implementation. Remaining runtime evidence belongs to the coordinator's authorized rebuild/capture. If create still stalls, instrument fixed-message debug events with the RPC correlation ID at: BotsRpcHandlers.call entry/exit; BotApplicationService.create before/after editable, diagnostics, and repository.save; BotCatalogAdapter.read start/end with runtime kind, provider count, elapsed milliseconds and diagnostic codes; Electron IpcBridge before handleMessage and before send; BotsStore.write before await and on settlement with write/selection sequence and success flag. Do not log bot instructions, secrets or model credentials. Capture the full Angular error stack (not only the generic error-handler source location) if the state error persists after the fixture correction. These would distinguish a remaining skill-source/CLI lookup delay from a transport or UI settlement issue without changing unrelated persistence code.

## Revise round 1

This section supersedes the original provider-only bound, skill-catalog refusal behavior, and eager registration decisions above.

1. HIGH: one deadline and edits on unavailable catalogs. `bot-catalog-adapter.ts` now names `BOT_CATALOG_DEADLINE_MS = 8_000`, explicitly tied to ClaudeRpcService's 30_000 ms default. Credential/model stages share the same deadline rather than restarting a timer. Provider workers, CLI lookups, registry projection and skill resolution start independently; CLI lookups are parallel. Every asynchronous dependency races the same deadline; expiry becomes the existing warning diagnostics, and the timer is cleared on completion. Queued provider workers check expiry before starting any dependency. Late dependency completion cannot mutate the returned snapshot. `bot-application.service.ts` allows unverified skill selections when discovery is unavailable/partial with SKILLS_UNAVAILABLE or SKILLS_PARTIAL, retaining the requested skills in the saved definition and returning warnings. A healthy skill catalog still rejects a genuinely missing new skill. Tests cover delayed credentials followed by a never-resolving model lookup, full parallel discovery, and real handler/application create plus update with selected skills and never-resolving skill sources; both writes complete after advancing 8 seconds.
2. MEDIUM: selection-scoped scans. Default selects neither providers nor CLIs; main selects only its provider; a system lane selects only its own CLI; a Ptah lane projects only the chosen registry ID without system CLI probes. No-selection calls retain full editor discovery. Parameterized adapter tests cover default/main/lane, plus a Ptah registry lane.
3. MEDIUM: slow lookup regression coverage. Fake-timer tests for default/main/lane selections set both executable lookup and sources.resolve to never resolve; assert still pending at 7,999 ms, settled at 8,000 ms, SKILLS_UNAVAILABLE on each, CLI_CATALOG_UNAVAILABLE/RUNTIME_UNRESOLVED only for the selected system lane, and no remaining timer. Full scan asserts all CLI and skill tasks start before time advances; queued provider failures share the same deadline.
4. LOW: Electron registration ownership. Removed eager handler resolution/register() and the smoke-container fallback warning from `apps/ptah-electron/src/di/register-bots-composition.ts`. Composition only binds the cached handler, matching CLI composition. Shared manifest/runtime surface wiring is the sole production registration owner. The idempotent guard remains unchanged. Updated Electron composition specs assert zero methods after composition/phase 4 and explicitly perform the runtime registration step before testing methods. Their duplicate-rejecting registry catches repeat registrations; source assertion rejects a reintroduced eager register call. CLI composition code remains unchanged, with its existing RPC-disabled/full-mode tests scheduled below.
5. LOW: unknown main provider pinned. The adapter test asserts RUNTIME_UNRESOLVED, no PROVIDERS_UNAVAILABLE or MODELS_UNAVAILABLE, no model request and no CLI probe.

Files changed in this revision: adapter and spec; bots RPC handler spec; bot application service and spec; Electron bots composition helper and spec. The handler guard is retained. No additional shot/fixture/UI changes in this revision.

### New command results

- PASS: rpc-handlers focused Jest command on bot-catalog-adapter.spec.ts and bots-rpc.handlers.spec.ts: 2 suites, 46 tests, 13.742 seconds.
- Earlier development runs: missing required model in the unknown-provider test was corrected; real adapter import in the handler test exposed CLI-runtime ESM-only transitive imports, isolated using the same CLI and built-in tool mocks as the adapter suite; update test fixture corrected to include the complete editable record. The final focused run passes.
- All required revision checks completed; detailed results follow.

- PASS: `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/bots-composition.spec.ts`: 1 suite / 8 tests, 34.505 seconds; full-mode binding and RPC-disabled behavior preserved.
- PASS: `npx eslint` on all seven revision files, exit 0.
- PASS: `npx prettier --check` on all seven revision files, exit 0.
- Line counts after formatting: adapter 369; adapter spec 500; handler spec 633; application service 655; application spec 696; Electron composition helper 40; Electron spec 261.

- PASS: `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/bots-composition.spec.ts`: 1 suite / 8 tests, 81.648 seconds.

- PASS: `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts`: 1 suite / 24 tests, 13.645 seconds. Total final revision Jest results: 86 passing tests across 4 suites.
- Verification uses one heavy process at a time. Application-service tests are outside the RPC Jest root, so they were run with their own project config.
- Deadline handling stops awaiting discovery, but cannot cancel underlying SDK/file operations whose ports expose no cancellation signal. Their late completion cannot update the returned catalog. No Electron capture/build was run, as instructed.

- PASS: `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`, exit 0.
- PASS: `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`, exit 0.

- PASS: `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`, exit 0.
- PASS: `npx tsc --noEmit --project libs/backend/bots/tsconfig.spec.json`, exit 0.

- PASS: `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json`, exit 0. All five requested changed-project TypeScript checks passed with no diagnostics.

Revision outcome: all five review defects addressed; 86 tests pass, all changed-project TypeScript checks pass, ESLint and Prettier pass. No unrelated failures were changed. The existing Electron capture must still be rebuilt/rerun by the coordinator; no runtime visual result is claimed.
