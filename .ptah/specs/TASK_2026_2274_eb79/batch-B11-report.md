# Batch B11 report

Status: CLI composition implemented and verified with the limitation below. Required platform Jest command remains blocked by an unowned shared-schema type error; parent action required.

## Files

- libs/backend/cli-engine/src/lib/container.ts:186,941 � one helper import/call after Thoth; removed the optional-branch harness registration (two insertions/two deletions).
- libs/backend/cli-engine/src/lib/register-bots-composition.ts:19 � ordered harness ? bot adapters ? bot services wiring for both modes; optional cached handler factory supplies a request-time application resolver and host logger.
- libs/backend/cli-engine/src/lib/bots-composition.spec.ts:48 � seven composition tests.
- libs/backend/platform-cli/src/bots-host-compatibility.spec.ts:64 � temporary shared-database integration and CLI port compatibility test.

## Acceptance and carry-forward coverage

| Requirement                                                                                           | Evidence                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing persistence helper binds BOT_REPOSITORY                                                      | bots-composition.spec.ts:48 uses registerPersistenceSqliteServices and resolves SqliteBotRepository. No parallel repository registration in production.                                                                                                              |
| Ordered domain composition outside optional RPC branch                                                | register-bots-composition.ts:24; bots-composition.spec.ts:120 checks the root call occurs once after Thoth and before optional RPC registration.                                                                                                                     |
| APPLICATION/SOURCE_READER/CATALOG/WORKSPACE_AUTHORIZATION with RPC disabled                           | bots-composition.spec.ts:48 resolves every BOTS_TOKENS entry and verifies no bot methods or handler binding.                                                                                                                                                         |
| SDK_PROVIDER_MODELS/SOURCE_RESOLVER/WORKSPACE_PROVIDER/CONFIG_MANAGER/AUTH_SECRETS_SERVICE resolution | bots-composition.spec.ts:48 explicitly resolves each prerequisite in a composition fixture with host dependency doubles. This is not a full CliDIContainer.setup process bootstrap.                                                                                  |
| Shared CLI/Electron persistence                                                                       | bots-host-compatibility.spec.ts:64 uses a temporary WAL database, production migration and persistence registration; CLI application creates/updates a bot, then a fresh Electron-equivalent SqliteBotRepository/connection reads the definition and both revisions. |
| Ports/startup compatibility and no command                                                            | Same test registers real CLI platform services, resolves workspace and bounded filesystem ports, and checks command IDs remain unchanged. Required with-engine/attention/shutdown/RPC regression suites also pass.                                                   |
| Missing repository/application remains lazy, returns PERSISTENCE_UNAVAILABLE                          | bots-composition.spec.ts:67 registers handler methods with either missing repository or missing application; asserts RpcUserError.errorCode on invocation.                                                                                                           |
| No double harness subscription/disposal                                                               | bots-composition.spec.ts:86 resolves real harness health singleton twice for both RPC modes and observes one reconciler subscription and one disposable owner teardown.                                                                                              |
| Default repository Date.now; no configure({ now }) override                                           | Production composition does not configure the repository clock. Shared DB test bounds staged-avatar expiry against Date.now + one day.                                                                                                                               |
| Host logger fourth argument; application resolved lazily                                              | register-bots-composition.ts handler factory; bots-composition.spec.ts:105 replaces application after registration and asserts host logger receives its failure.                                                                                                     |

## Checks

- CLI library tsc: PASS (exit 0), including final constructor-factory wiring.
- platform-cli library tsc: PASS (exit 0).
- Four-file eslint: PASS (exit 0), existing container.ts max-lines warning only (863/700).
- CLI bots composition Jest: PASS, 7 tests (exit 0), including final missing-application registration ordering.
- Required platform-cli Jest: FAIL before tests on final rerun (exit 1), TS2322 in libs/shared/src/lib/types/provider-account.schemas.ts:119. Under platform-cli tsconfig.spec.json (inherits non-strict root), Zod output marks identity optional but ProviderAccountBinding requires it. Production library strict typecheck passes. No unowned configuration/schema edits made.
- Supplemental same shared DB spec under CLI strict Jest config: PASS, 1 test (exit 0). Command: npx jest --config libs/backend/cli-engine/jest.config.cjs --roots ../platform-cli/src --runInBand --coverage=false --runTestsByPath libs/backend/platform-cli/src/bots-host-compatibility.spec.ts. Final rerun PASS after tightening default-clock bounds (exit 0).
- Required CLI regressions: PASS, 4 suites / 81 tests. Existing fixture migration warnings were non-fatal.
- Ptah scoped diagnostics: unavailable twice after 45s; no clean diagnostic result claimed. Native prescribed checks are the fallback evidence.
- git diff --check for container.ts: PASS.

## Decisions

- Shared manifest already owns BotsRpcHandlers. Bind its cached constructor factory in full mode and let registerRpcSurface invoke register once; direct early register would duplicate exposure and leave manifest resolution unconfigured.
- Keep Electron DI untouched (B10 ownership); preserve existing shared persistence registration and default repository clock. No new command or public export.
- Test uses Node SQLite through the same structural database port to avoid Electron/native-addon ABI coupling. Uses production static migration SQL and a fresh connection/repository rather than pretending to launch Electron.
- CLI platform output channel is registered as a value; fixture explicitly disposes it and awaits captured write streams before deleting temporary paths.
- Native CLI skill loading/discovery is unavailable in this session. Available repository DDD skill was inspected and does not cover this fixed-scope composition change; no design/UI skill applies. Ptah partial dependency graph was supplemented with native rg reads.
- Parent action: repair strictness/type compatibility in the platform-cli test configuration or shared schema in its owning lane, then rerun the required platform-cli Jest command. Supplemental strict-config success does not replace that required check.
- Only four authorized source files and this report written. No git writes, nx, npm run verify, build, serve or e2e commands.

Parent notification: ptah_agent_report called once with the blocker and evidence; delivery refused with parent-inbox-full. Not retried. Completion/report file is the handoff.
