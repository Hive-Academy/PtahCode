# B10 Electron composition report

Status: implementation complete; new composition checks pass. Existing smoke assertions pass but its Jest process exits 1 after teardown (see Checks).

## Files

- `apps/ptah-electron/src/di/phase-2-libraries.ts:523`: documents that the existing updated persistence helper binds BOT_REPOSITORY on the shared connection with the default clock; no second registration or connection.
- `apps/ptah-electron/src/di/phase-4-handlers.ts:109`: one helper call immediately after registerHarnessServices (plus its import).
- `apps/ptah-electron/src/di/register-bots-composition.ts:8`: optional small helper added; ordered adapter/application registration, cached handler factory, typed lazy application callback, host logger, eleven method registrations.
- `apps/ptah-electron/src/di/expected-resolvable.ts:72`: handler and all five bot service tokens covered.
- `apps/ptah-electron/src/di/bots-composition.spec.ts:64`: eight composition tests, including the real phase 4 registration function.
- This report was created as a skeleton before implementation and completed with evidence.

## Acceptance and carry-forward mapping

| Requirement                                                              | Evidence in bots-composition.spec.ts                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 calls the updated persistence helper                             | line 159 ordering/source assertion; line 97 exercises the real persistence helper and repository binding                            |
| Harness, adapters, services, handler order                               | line 159 source assertions; line 64 real phase 4 registration smoke                                                                 |
| Every B05 collaborator resolves                                          | lines 64 and 84 call resolve for SDK_PROVIDER_MODELS, SOURCE_RESOLVER, WORKSPACE_PROVIDER, CONFIG_MANAGER, AUTH_SECRETS_SERVICE     |
| Every BOTS_TOKENS entry and repository/handler resolve                   | lines 64, 84, 150; cached instance identity asserted                                                                                |
| One shared connection and repository                                     | line 97 asserts repository connection identity, connection singleton identity, and application repository identity                  |
| Default Date.now; no configured clock                                    | line 97 spies on SqliteBotRepository.configure and asserts no calls                                                                 |
| Lazy application/repository during handler construction and registration | line 114 spies on resolution; line 131 registers all methods with no repository, then verifies request-time PERSISTENCE_UNAVAILABLE |
| Host logger as fourth handler argument; application resolved lazily      | line 141 replaces the application after registration and verifies the supplied logger receives the failure                          |
| All eleven methods; no execution registrations                           | line 114 checks exact registration tokens and all eleven method names; line 64 checks methods from real phase 4                     |
| expected-resolvable covers all five service tokens and handler           | line 150 checks coverage and actually resolves every entry                                                                          |

## Checks

- PASS (exit 0): `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`.
- PASS (exit 0): `npx eslint apps/ptah-electron/src/di/phase-2-libraries.ts apps/ptah-electron/src/di/phase-4-handlers.ts apps/ptah-electron/src/di/expected-resolvable.ts apps/ptah-electron/src/di/register-bots-composition.ts apps/ptah-electron/src/di/bots-composition.spec.ts`. Zero errors; existing phase 2 max-lines warning remains (822 nonblank/comment-counted lines, limit 700). Repeated after final spec edits with same result.
- PASS (exit 0): exact requested new-spec Jest command, 1 suite / 8 tests passed (15.567s).
- Combined new-spec + existing `container.smoke.spec.ts` + `surface-composition.spec.ts`: all 3 suites / 89 tests passed (41.792s), but process exited 1 because container.smoke triggered an asynchronous `require('better-sqlite3')` after Jest teardown through SqliteSessionUsageSink -> SessionStatsRepository -> SessionStoreDatabase. Existing-only rerun: all 2 suites / 81 tests passed (17.52s), exit 1 with the same container.smoke teardown error. The new bot spec passes independently with exit 0.
- Initial new-spec run: 5 passed / 2 failed because list fixtures omitted required workspaceRoot; corrected fixtures and reran successfully. No production changes were needed for those failures.
- PASS: `git diff --check`.
- No nx, verify, build, serve, dev, e2e, git writes, or out-of-scope code edits were performed by this lane.

## Decisions

- The public API has four BOTS_TOKENS entries. Together with PERSISTENCE_TOKENS.BOT_REPOSITORY these are the five bot service tokens. The handler is a sixth expected-resolvable entry.
- Handler coverage lives in EXPECTED_RESOLVABLE_TOKENS rather than the shared-handler-only EXPECTED_RESOLVABLE list: the existing minimal shared container does not run host phase 4. The new spec resolves the actual host handler.
- Keep phase files to one helper call/import and one persistence comment. The optional helper keeps all bot-specific wiring outside the phase files.
- Stripped DI smoke containers may omit RPC transport/workspace ports: bindings remain available, while immediate method registration requires both ports. Production phases 0-1 bind both. Missing persistence does not suppress methods or startup.
- Resolution smoke follows the existing container.smoke pattern: host collaborator fixtures, real persistence/harness/adapter/application registration and real phase 4. It does not launch Electron or open a native database. Shared connection evidence is object identity, without starting SQLite workers.
- Native CLI skill invocation/discovery is unavailable in this session. Read `.claude/skills/nx-workspace-architect/SKILL.md` directly as a fallback and retained public entry-point imports and application composition boundaries.
- Used Ptah dependency/AST inspection and file search; zero matching indexed harness helper results were followed by native rg/Get-Content searches. Requested direct TypeScript, ESLint, and Jest commands provide diagnostics.
- Remaining check limitation: teardown failure in the existing smoke suite is outside the allowed write scope; do not claim a clean existing-suite process exit.
