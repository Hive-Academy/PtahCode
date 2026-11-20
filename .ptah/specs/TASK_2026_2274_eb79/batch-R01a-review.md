# Batch R01a review

Scope: uncommitted diff of `libs/backend/cli-engine/src/lib/bots-composition.spec.ts`.

Score: 8 / 10. Verdict: APPROVED (defects below are Low or Medium and need no new batch).

Evidence: the allowed Jest command exited 0 with 8 of 8 tests passing (34 s). No `any`, `as any` or `as unknown as` appears in the file (grep).

## Acceptance check

| Item                                                              | Result                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Source-text check of `container.ts` removed                       | Yes. The new `it.each(['minimal','full'])` calls the real `CliDIContainer.setup` (`container.ts:435`).          |
| Bots and `HARNESS_TOKENS` services resolved in both modes         | Yes. Every token of `BOTS_TOKENS` and `HARNESS_TOKENS` is checked with `isRegistered` and `resolve`.            |
| "Application not bound" without `container.reset()`               | Yes. An unbound sibling child container supplies the lazy resolver.                                             |
| Temp `PTAH_DB_PATH`, `PTAH_SESSIONS_DB_PATH`, `PTAH_SETTINGS_DIR` | Yes. Values are restored in `finally`, and the temp directory is removed.                                       |
| No network and no outliving work                                  | Yes. A rejecting `fetch` spy is asserted not called. Streams, watchers and databases are closed in `afterEach`. |
| Typed fakes only                                                  | Yes.                                                                                                            |

## Answers to the four checks

(a) Stubs and leaks.

- Every spy is created in `beforeEach` and restored by `jest.restoreAllMocks()` in `finally` of `afterEach`, so it does not leak between tests.
- The four `jest.mock` module fakes at the top of the file (`persistence-sqlite`, `task-specs`, `session-organization`, `lane-outcomes`, `session-store-migration`) apply to the whole file. They only disable startup jobs. Registration stays real, because `registerSessionStoreServices` is a call-through.
- The stubs do hide one thing. The `ContentDownloadService.ensureContent` rejection stops plugin initialization and `bootHarness` (the report says this). The test therefore proves token registration and resolution, not harness boot. The test title does not claim boot, so this is acceptable.
- The prebinding of `SkillsShSourceRootService` and `ProcessStartTimeProbe` hides a possible unresolved optional constructor argument under ts-jest metadata. Production esbuild bundles omit decorator metadata (the report cites `tools/di-lint/check-injects.ts:450`), so the risk is low.

(b) `os.homedir` is spied in `beforeEach` and restored by `restoreAllMocks`. Correct.

(c) The test fails if a bots token registration is removed from `container.ts`. `registerBotsComposition` is called once at `container.ts:941`. The test resolves every `BOTS_TOKENS` entry in both modes. Removal of the call, or of one token, fails. It also asserts `BotsRpcHandlers` is bound only in full mode. I did not mutate the source, because the review is read-only.

(d) Production finding: CORRECT.

- `container.ts:614-616` registers `TOKENS.FILE_SYSTEM_MANAGER` as `useValue: fileSystemProvider` (the `PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER` instance).
- `prompt-cache.service.ts:144-145` injects it as `IFileSystemManager`.
- `prompt-cache.service.ts:524` calls `this.fileManager.disposeWatcher(...)` unconditionally.
- `cli-file-system-provider.ts` has `createFileWatcher` (line 240) and no `disposeWatcher`. Only `vscode-core/.../file-system-manager.ts:351` defines it.
- Result: `dispose()` throws `TypeError` under the CLI host. This is a real defect and needs a separate fix. The report states correctly that it does not prove every shutdown path reaches this call.

## Defects

1. Low. `bots-composition.spec.ts:261-262` (the `SkillsShSourceRootService` import): the relative cross-project import has an eslint-disable for the module-boundary rule. It couples the test to a private file path (see elevation item 2.3). Prefer an export or a testing entry later.
2. Low. In the "application unbound" case, `BotsRpcHandlers` is built by hand with `new`. The DI wiring of the handler is not exercised in that case. The wiring is covered in the other cases and in the full-mode test.
3. Low. `toBeInstanceOf(Object)` for every token is a weak assertion. It only proves that a non-null object resolves. The two concrete checks (`BotApplicationService`, `SqliteBotRepository`) partly compensate.
4. Low. The `PromptCacheService.prototype.dispose` spy masks the production defect in this test. Track the defect as its own task, and remove the spy when it is fixed.
5. Low. The `fetch` assertion in `afterEach` runs after the teardown steps. If a teardown step throws first, the assertion is skipped. The `finally` block still restores state.
6. Low. Global `jest.mock` factories at module level run for the earlier tests in the file as well. This is harmless today, but a later test that needs the real job starters must unmock them.

No High or Medium defect found.
