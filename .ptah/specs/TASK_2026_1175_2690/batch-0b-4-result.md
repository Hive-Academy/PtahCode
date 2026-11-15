# Batch 0b-4 result

## Changed files

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts`, `user-layer-skill-phase-writer.ts`: phase write and one-file restore methods, slug lock, folder snapshots, sidecar refresh, path checks. The logic is in the small helper because the service already exceeds the file-size limit.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: phase write, one-file revert, invalid path, missing snapshot coverage.
- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts`, `src/index.ts`, `phase-definition-file.reader.spec.ts`, and `route-decide.gate.spec.ts`: platform file system reader with clone precedence, plugin fallback, and shipped visual-review gate coverage.
- `apps/ptah-electron/src/di/phase-2-libraries.ts`, `expected-resolvable.ts`, `container.smoke.spec.ts`, `surface-composition.spec.ts`: reader and writer bindings, UsageRpcHandlers guard, DI assertions.
- `libs/backend/cli-engine/src/lib/container.ts`, `thoth/register-thoth-libraries.ts`: reader and writer bindings.
- `libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.spec.ts`: add machineCapabilities to phase literal.

## Decisions and assumptions

- `skill-synthesis` imports `agent-generation`, so the mirror implements the writer structurally; host roots bind the public token.
- The writer verifies exact membership in the shared skill-clone file list before resolving a phase kind; a malformed prefix otherwise could have passed the shared kind-slicing helper.
- The reader treats an existing user orchestration clone as active; otherwise it uses `ptah-core` under ContentDownloadService.getPluginsPath(). An active clone with a missing phase throws.
- No VS Code registration was found for either registerSkillSynthesisServices or registerLaneRoutingServices in apps; Electron and CLI are the registering hosts.
- `scenario-sanitizer.ts` has a curated default RPC allowlist and accepts an explicit `allowedRpcMethods` override; it does not require every RPC method, so `usage:getDimensionTotals` was not added to the default replay surface.
- Skill discovery returned no local invocable matching skill; workspace guidance and source contracts were used.

## Checks

- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`: exit 0 after the final exact-file guard.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.spec.json`: exit 0 after the final exact-file test.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: exit 0 after the DI guard edit.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.spec.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: first attempt stopped when free physical memory fell below 250 MB; retry exit 0.
- `npx eslint <changed files>`: exit 0, warnings for pre-existing large files and unused CLI import; unused import removed afterward.
- `node scripts/verify.mjs --exec --task batch-0b-4-writer-regression -- npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: 16/16 passed after writer helper extraction.
- `node scripts/verify.mjs --exec --task batch-0b-4-writer-exact-file -- npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: 16/16 passed after the final exact-file guard.
- Reader Jest first run: failed because the test double did not implement the full file system port; narrowed the reader dependency. Retry: 3/3 passed.
- `node scripts/verify.mjs --exec --task <reader-check> -- npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/phase-definition-file.reader.spec.ts`: 4/4 passed after shipped visual-review coverage.
- `node scripts/verify.mjs --exec --task <gate-check> -- npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`: 54/54 passed, including the bound file reader at gate-0.1.
- `node scripts/verify.mjs --exec --task batch-0b-4-rpc-guards -- npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.spec.ts`: 83/83 passed.
- `node scripts/verify.mjs --exec --task batch-0b-4-cli-rpc-surface -- npx jest --config libs/backend/cli-engine/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: failed because `.ts` config does not exist. The corrected `.cjs` command was interrupted once while prioritizing the final writer regression.
- `node scripts/verify.mjs --exec --task batch-0b-4-cli-rpc-surface-final -- npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: 19/19 passed.
- `node scripts/verify.mjs --exec --task <electron-di-check> -- npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/container.smoke.spec.ts apps/ptah-electron/src/di/surface-composition.spec.ts apps/ptah-electron/src/di/rpc-surface.spec.ts`: 94/95 passed on first run. The one failure was an existing positional assertion on `EXPECTED_RESOLVABLE_TOKENS[0]`; new tokens were moved after the original entries. Targeted retry of that assertion passed (1/1, 64 skipped). The first run also emitted a Jest teardown error from asynchronous SQLite usage work.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`, `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`, `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0, no baseline changes.
- `npx eslint` on the final reader, gate, DI guard, and CLI files: exit 0; only existing unused-import and file-size warnings.
- `npx eslint` on the extracted writer helper, mirror, and expected-resolvable after refactor: exit 0; only pre-existing mirror file-size warning.
- `npx eslint` on the exact-file writer helper and updated writer spec: exit 0.
- `git diff --check`: exit 0; Git printed CRLF normalization warnings for earlier batch files.

## Not done

- The three Electron DI/RPC specs were not rerun together after the token-order fix; the formerly failing assertion passed in a targeted retry. The coordinator's full gate remains outside this lane's scope.

## Risks for the coordinator

- The reader currently tests clone presence by directory existence; a disabled clone, if retained on disk, may need host policy input to select the plugin copy.
- Ptah dependency graph stayed in `building`; project tags and source imports show the skill-synthesis to agent-generation dependency, so the mirror uses a structural implementation.
- Ptah diagnostics timed out twice after 45 seconds on the changed files; direct focused `tsc` is the fallback.
- The coordinator should run its full gate before merging.
