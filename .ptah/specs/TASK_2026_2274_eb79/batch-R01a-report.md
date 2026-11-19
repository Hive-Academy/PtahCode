# Batch R01a report

## Change summary

Replaced the source-text inspection of container.ts with two behaviour cases that call the exported CliDIContainer.setup using bootstrapMode minimal and full. Each case asserts that every BOTS_TOKENS and HARNESS_TOKENS entry is registered and resolves to an object instance, checks the concrete BotApplicationService and SqliteBotRepository instances, and checks that BotsRpcHandlers is bound only in full mode.

Replaced the unbound-application reset model with a separately created child container supplied through the handler's lazy application resolver. The test explicitly asserts that this child has no inherited application registration while the composed host still has its binding. No container.reset calls remain. The final test file is 381 lines (below 700).

Only bots-composition.spec.ts and this required report were written. No production code, platform-cli files, or configuration files were modified.

## Tests (names)

Eight parameter-expanded cases are defined:

- resolves all bot tokens and catalog prerequisites with RPC disabled
- starts and registers methods with an unbound repository; resolution fails only on invocation
- starts and registers methods with an unbound application; resolution fails only on invocation
- keeps one harness health subscription and one owner disposal (RPC=false)
- keeps one harness health subscription and one owner disposal (RPC=true)
- resolves the application at request time and forwards failures to the host logger
- resolves bots and harness services from the minimal CLI container
- resolves bots and harness services from the full CLI container

## Decisions

- Use the existing exported setup API and mode option; retain real bots, harness, platform, and persistence registration.
- Mock only unrelated job starters, legacy session migration, and content downloading. New module fakes use typed requireActual, parameter types, and return types. Session-store registration is a typed call-through spy so its database handle can be closed explicitly.
- Create a unique os.tmpdir/mkdtemp directory for each bootstrap case. Set explicit PTAH_DB_PATH, PTAH_SESSIONS_DB_PATH, and PTAH_SETTINGS_DIR; supply temporary user-data, workspace, and log paths; temporarily redirect os.homedir for other host caches. Restore environment and spies and recursively remove only that generated directory after teardown.
- Disable the session usage finalizer and unrelated indexing/outcome/backfill startup. Dispose host runtime and child container, flush settings, and explicitly close SQLite and session-store databases before deleting the directory.
- Preserve the accepted B11 behaviour: lazy harness registrations are available in minimal mode as well as full mode.
- No matching CLI-native skill discovery mechanism was available. The inspected DDD skill does not cover this test-only change and was not applied.
- Ptah get_dependents returned an incomplete graph with the spec absent; native PowerShell reads and rg were used for targeted inspection. No visual or UI work applies.

## Follow-up decisions

- Confirmed ts-jest uses libs/backend/cli-engine/jest.config.cjs:6 with tsconfig.spec.json:8 (emitDecoratorMetadata: true). SkillsShSourceRootService has an undecorated defaulted homeDir argument at libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.ts:218. Its own spec constructs it directly with a temporary home (skills-sh-source-root.service.spec.ts:161), as does skills-sh-rpc.handlers.spec.ts:1048. The composition spec uses that construction pattern with the real logger and per-case temporary home through a child-scoped factory before setup resolves handlers. No metadata or production configuration is changed. tools/di-lint/check-injects.ts:450 also documents that esbuild omits decorator metadata in shipped bundles.
- Full-mode RPC setup exposed the same test-metadata class of issue for the optional probe argument of PeerSessionDirectory (peer-session-directory.service.ts:90). The test child binds a real new ProcessStartTimeProbe before setup. A one-call spy on rootContainer.createChildContainer supplies that child to the real setup; registry state is never reset or changed on the global container.
- SkillsShSourceRootService is not publicly exported. Its test-only relative constructor import has a narrowly scoped eslint-disable-next-line for @nx/enforce-module-boundaries, with an inline explanation. Expanding production exports is outside this batch's allowed scope.
- The full production RPC profile remains enabled; no handler plan was reduced to make the test pass.
- The CLI workspace provider's fileSettings.disposeCrossProcessWatch() is called before flushing settings and deleting the directory, closing the real settings watcher and cancelling its debounce timer.
- Output streams created during these tests are tracked through a typed call-through spy and ended/awaited with node:stream/promises.finished before deleting the temporary directory. This fixes an observed asynchronous ENOENT from the real CLI log stream after teardown.

## Round 2 startup isolation

The coordinator observed a later run with 8 passing tests but exit 1 from OpenRouter pricing warmup logging after completion. Previous round results below do not establish isolation for that startup path. Added a typed spy on OpenRouterPricingService.prototype.fetchAndRegister resolving to [] (the method's real Promise<OpenRouterModel[]> result), plus a rejecting global fetch spy with a no-calls assertion before restoring mocks. This stops the OpenRouter catalog HTTP request and its request-timeout work, and ensures another fetch-based startup request cannot silently replace it. auth-providers/src/lib/di/register.ts:355-360 starts this pricing warmup during registration; the auth registration spec already stubs warmup for isolation.

Startup jobs stopped by the final spec: OpenRouter pricing fetch/registration; content downloading (which also prevents subsequent plugin initialization and bootHarness); task-spec indexing; session-organization startup; lane-outcome startup; repository-identity backfill; session-store legacy migration; session-usage finalizer. Real workspace creation is awaited. Real settings watchers, file streams, child containers, host runtime, diagnostics and databases are explicitly closed/disposed before temporary-directory removal. The production PromptCacheService disposal workaround remains documented below.

Normal Jest and the single detectOpenHandles run each exited 0 with 8/8 passed and no suspicious log matches. Final TypeScript, ESLint and formatting checks all exited 0.

## Command results (exit codes, test counts)

Round 2 results supersede earlier rounds. The coordinator reproduced exit 1 despite 8/8 assertions passing, due to the previously unstubbed OpenRouter startup request logging after completion.

- npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/bots-composition.spec.ts: exit 0, 1 suite passed, 8 tests passed / 0 failed, 0 snapshots; 55.846 seconds. The complete captured output was scanned for Cannot log after tests are done, open handle, did not exit, HTTP/HTTPS URLs, and fetch; zero matches. Both bootstrap cases passed the no-fetch-calls assertion.
- Focused Jest command with --detectOpenHandles (one run): exit 0, 1 suite passed, 8 tests passed / 0 failed, 0 snapshots; 368.557 seconds. The complete captured output was scanned for Cannot log after tests are done, open handle, did not exit, HTTP/HTTPS URLs, and fetch; zero matches.
- npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.spec.json: round 2 final revision exit 0, no diagnostics.
- npx eslint libs/backend/cli-engine/src/lib/bots-composition.spec.ts: round 2 final revision exit 0, no diagnostics.
- npx prettier --write libs/backend/cli-engine/src/lib/bots-composition.spec.ts: exit 0.
- npx prettier --check libs/backend/cli-engine/src/lib/bots-composition.spec.ts: round 2 final revision exit 0; all matched files use Prettier code style.
- No git, nx, npm run verify, build, serve, dev, e2e, or package commands were run.

## Clarifications Needed

None. The corrected jest.config.cjs command is authorized.

## Production finding

Existing CLI file-manager/shutdown interface mismatch, independent of test mocks:

- libs/backend/cli-engine/src/lib/container.ts:614 binds TOKENS.FILE_SYSTEM_MANAGER directly to PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER.
- libs/backend/platform-cli/src/registration.ts:95 binds that provider to the real CliFileSystemProvider, declared at libs/backend/platform-cli/src/implementations/cli-file-system-provider.ts:32. It implements IFileSystemProvider and offers createFileWatcher at line 240, but has no disposeWatcher method.
- libs/backend/agent-generation/src/lib/services/prompt-designer/prompt-cache.service.ts:144 injects FILE_SYSTEM_MANAGER while expecting the legacy file-manager interface; dispose() unconditionally calls this.fileManager.disposeWatcher at line 524. A direct CLI child-container disposal reaches this call and throws TypeError: this.fileManager.disposeWatcher is not a function.
- platform-cli, vscode-core, and agent-generation registrations are real, not replaced by this spec's module mocks. The mismatch therefore exists in production CLI wiring; the evidence does not establish that every normal CLI shutdown path currently invokes that dispose method.
- The spec never starts prompt-cache watchers or caches prompt results. It uses a typed spy on PromptCacheService.prototype.dispose to skip only this unrelated faulty disposal, while disposing other container services and explicitly closing databases and streams. Production code was not changed. A separate production fix is needed to adapt the legacy file-manager contract or make disposal compatible with the CLI provider.
