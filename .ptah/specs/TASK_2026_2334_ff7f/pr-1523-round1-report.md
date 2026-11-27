# PR #1523 Round 1 Report

## CI failure

- **Root cause**:
  - `scripts/jest.config.ts:34-47` configured three `ts-jest` entries in `transform` pointing at three different tsconfigs (`libs/shared/tsconfig.spec.json`, `scripts/agent-usage/tsconfig.json`, `scripts/tsconfig.json`) under `maxWorkers: 1` (`scripts/jest.config.ts:51`).
  - In `ts-jest` (`node_modules/ts-jest/dist/legacy/ts-jest-transformer.js:32,54-66`), `TsJestTransformer._cachedConfigSets` is a static cache keyed only by the Jest project config, not by per-transform `tsconfig` options. When `npm run test:scripts` ran specs outside `scripts/agent-usage/` first (starting with `scripts/drain-observation-queue.spec.ts`), the catch-all transform cached a `ConfigSet` using `scripts/tsconfig.json`, which had no `paths` entry for `@ptah-extension/shared`. Later suites in the same worker (`scripts/agent-usage/tool-call-share.spec.ts:10` and `scripts/agent-usage/agent-output-blob.reader.ts:10`) reused that cached `ConfigSet` and failed with `TS2307: Cannot find module '@ptah-extension/shared'`.
  - Additionally, `package.json:56` (`usage:tool-call-share`) used `-r tsconfig-paths/register`, which is not declared in `package.json` (`npm ls tsconfig-paths` showed it as extraneous), and `scripts/agent-usage/tsconfig.json:13` included `./**/*.ts`, pulling `scripts/agent-usage/probe-plan-usage.ts` into `tsc --noEmit -p scripts/agent-usage/tsconfig.json` and failing on relative `require('../../libs/...')` imports and a partial logger stub.
- **Why it passed locally**:
  - Running `npx jest --config scripts/jest.config.ts --runInBand --coverage=false --runTestsByPath <agent-usage specs>` ran only `scripts/agent-usage/*.spec.ts`, so no earlier spec populated `TsJestTransformer._cachedConfigSets` with `scripts/tsconfig.json`, and `scripts/agent-usage/tsconfig.json` initialized the static cache first.
- **Fix**:
  - `scripts/tsconfig.json:4-34`: set `"target": "ES2022"`, `"lib": ["ES2022"]`, `"baseUrl": ".."`, `"paths": { "@ptah-extension/shared": ["./libs/shared/src/index.ts"] }`, and `"noUncheckedIndexedAccess": false` so `scripts/tsconfig.json` resolves `@ptah-extension/shared` and compiles the shared barrel cleanly.
  - `scripts/jest.config.ts:34-44`: unified on a single `ts-jest` transform (`^.+\\.tsx?$`) pointing to `<rootDir>/tsconfig.json` (plus `moduleNameMapper` for `@ptah-extension/shared`), eliminating `TsJestTransformer._cachedConfigSets` collisions across `maxWorkers: 1`.
  - `scripts/agent-usage/tsconfig.json:13-14`: added `"exclude": ["./probe-plan-usage.ts"]`.
  - `package.json:56`: updated `usage:tool-call-share` to `npx cross-env SWC_NODE_PROJECT=scripts/agent-usage/tsconfig.json node -r @swc-node/register scripts/agent-usage/tool-call-share.ts` (both `cross-env` and `@swc-node/register` are declared in `package.json`).
- **Result of `npm run test:scripts -- --no-cache`**:
  - **16/18 suites passed, 233/239 tests passed** (all 7 `scripts/agent-usage/*.spec.ts` suites passed, including `scripts/agent-usage/tool-call-share.spec.ts` and `scripts/agent-usage/agent-output-blob.reader.spec.ts`).
  - Two unrelated pre-existing Windows-only failures remain in `npm run test:scripts` (both untouched by this branch and passing in Linux CI per `.ptah/tmp/ci-scripts-fail.txt:17`):
    - `scripts/nav-benchmark/nav-benchmark.spec.ts` (`runShellStep › returns stdout of echo`, `treats an rg no-match (exit 1) as ok with empty output`, `marks exit > 1 as error and keeps stderr`, `runBenchmark › scores a fixture without ptah and drops outputs from the JSON` — POSIX `echo`/redirection syntax under Windows `cmd.exe`).
    - `scripts/dev/seed-lane-outcomes.spec.ts` (`dev lane-outcome scripts without HOME › falls back to os.homedir() and still refuses the profile database`, `checker refuses the profile database with exit 2 and no stack` — `path.split('/').at(-1)` and `HOME` assumptions on Windows).

## Review comments

- **B1** (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:2566`): **Valid — Yes**
  - Fix: Added `PersistedAgentOutputHeader` (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:712-720`, exported via `libs/backend/agent-sdk/src/index.ts:70`), `AGENT_OUTPUT_HEADER_KEY_PREFIX` (`ptah.agentOutputHeader:`) in `SESSION_METADATA_WORKER_CACHE_EXCLUSIONS` (`:821-825`) and `LEGACY_SESSION_STORAGE_KEYS` (`:871-876`), persisted header metadata beside the sequence in the `isAsyncStateStorage(this.storage)` branch of `saveAgentOutput` (`:2627-2647`, including summary-only saves), added `getAgentOutputHeader` reading across all three storage branches (`:2828-2851`), cleared the header key in `deleteAgentOutput` (`:2861-2864`), and updated `LegacySessionStoreMigrator` (`libs/backend/agent-sdk/src/lib/session-store-migrator.ts:255-290`) to restore header metadata and summary-only async outputs.
  - Tests:
    - `libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts`: `persists and reads header metadata across sync, async-sequence, and session-blob branches for structured and summary-only outputs`
    - `libs/backend/agent-sdk/src/lib/session-store-migrator.spec.ts`: `copies async agent output header metadata including summary-only outputs`
- **B2** (`libs/shared/src/lib/tool-guidance/tool-call-classify.ts:53`): **Valid — Yes**
  - Fix: Added quoted-string stripping (`stripQuotedStrings`, `libs/shared/src/lib/tool-guidance/tool-call-classify.ts:71-75`), output redirection and mutating-pipeline detection (`>`/`>>` excluding fd duplication like `2>&1`, plus `tee`, `Out-File`, `Set-Content`, `Add-Content` in `hasOutputRedirection` at `:108-119`), argument-aware mutating checks `isMutatingSed` (`:121-128`, rejecting `-i`/`--in-place` while keeping `sed -n`), `isMutatingFind` (`:140-142`, rejecting `-delete`/`-exec`/`-execdir`/`-ok`/`-okdir`/etc.), and `isMutatingGitBranch` (`:144-173`, rejecting `-d`/`-D`/`-m`/`-M`/`-c`/`-C`/`-f`/`--delete`/`--move`/etc. and positional `<new-name>` while keeping bare `git branch`, `--list`/`-l`, `-a`, `-vv`, `--show-current`, `--merged`), and removed duplicate fallback checks in `nativeClass` (`:185-210`). `git stash` remains `native-other` and `git show` remains `git-read`.
  - Tests:
    - `libs/shared/src/lib/tool-guidance/tool-call-classify.spec.ts`: `reads shell command class from read-only command: %s` and `excludes mutating shell command from read categories: %s`
- **B3** (`libs/shared/src/lib/tool-guidance/tool-call-classify.ts:82`): **Valid — Yes**
  - Fix: Replaced the combined regex with `parseMcpServer` (`libs/shared/src/lib/tool-guidance/tool-call-classify.ts:175-183`), splitting `mcp__<server>__<tool>` on the `__` delimiter so underscores in `<server>` (such as `mcp__my_server__do_thing` and `mcp__team_one__read`) are preserved, while handling `MCP(...)` separately and keeping all Ptah forms (`ptah_x`, `ptah__x`, `mcp__ptah__ptah_grep`, `mcp_ptah_lane_ptah_grep`) classified as `'ptah'`.
  - Tests:
    - `libs/shared/src/lib/tool-guidance/tool-call-classify.spec.ts`: `recognizes Ptah call form %s` and `preserves MCP server name for %s as %s`
- **B4** (`scripts/agent-usage/tool-call-share.ts:85`): **Valid — Yes**
  - Fix: Extracted `addOtherMcpCount` (`scripts/agent-usage/tool-call-share.ts:71-76`) and called it in the `classification.operation === 'discovery'` branch when `classification.server !== 'native'` (`:90-93`), matching the shared counting core in `libs/shared/src/lib/tool-guidance/tool-call-summary.ts:177-194` so `total === ptah + native + sum(otherMcp)` holds while discovery calls are also counted in `discovery`.
  - Tests:
    - `scripts/agent-usage/tool-call-share.spec.ts`: `preserves total = ptah + native + sum(otherMcp) across discovery, underscore MCP servers, summary, and fallback paths`
    - `libs/shared/src/lib/tool-guidance/tool-call-summary.spec.ts`: `maintains totalCalls === ptahCalls + nativeCalls + otherMcpCalls across mixed discovery and mutating calls`
- **B5** (`scripts/agent-usage/tool-call-share.ts:277`): **Valid — Yes**
  - Fix: Added `claudeTranscriptFullId` (`scripts/agent-usage/tool-call-share.ts:263-267`) and `selectClaudeSessionRows` (`:269-280`) so `--session` compares against the full transcript filename ID before keeping the truncated 24-character `summary.id` for display on `ShareRow`.
  - Tests:
    - `scripts/agent-usage/tool-call-share.spec.ts`: `matches --session against the full Claude transcript UUID before display truncation`

## Verification

- `npm run test:scripts -- --no-cache`: 16/18 suites passed (233/239 tests passed); all 7 `scripts/agent-usage/*.spec.ts` suites passed; 2 pre-existing Windows-only failures in untouched `scripts/nav-benchmark/nav-benchmark.spec.ts` and `scripts/dev/seed-lane-outcomes.spec.ts` (detailed above).
- `npx.cmd jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/tool-guidance/tool-call-classify.spec.ts libs/shared/src/lib/tool-guidance/tool-call-summary.spec.ts`: **2/2 suites passed, 75/75 tests passed**.
- `npx.cmd jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts libs/backend/agent-sdk/src/lib/session-metadata-store.account-binding.spec.ts libs/backend/agent-sdk/src/lib/session-metadata-store.global-store.spec.ts libs/backend/agent-sdk/src/lib/session-metadata-store.lineage.spec.ts libs/backend/agent-sdk/src/lib/session-metadata-store.provider-session.spec.ts libs/backend/agent-sdk/src/lib/session-store-migrator.spec.ts`: **6/6 suites passed, 265/265 tests passed**.
- `npx.cmd jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-output-buffer.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts`: **4/4 suites passed, 420/420 tests passed**.
- `npx.cmd tsc --noEmit -p` (exit `0` on all 7 tsconfigs):
  - `libs/shared/tsconfig.lib.json`
  - `libs/shared/tsconfig.spec.json`
  - `libs/backend/cli-agent-runtime/tsconfig.lib.json`
  - `libs/backend/cli-agent-runtime/tsconfig.spec.json`
  - `libs/backend/agent-sdk/tsconfig.lib.json`
  - `libs/backend/agent-sdk/tsconfig.spec.json`
  - `scripts/agent-usage/tsconfig.json`
- `npx.cmd eslint <changed files>`: exit `0`, 0 errors, 0 warnings on added lines (2 pre-existing warnings in untouched lines of `session-metadata-store.ts:983` and `session-metadata-store.spec.ts:3739`).
- `node scripts/check-home-paths.mjs <changed and new files>`: exit `0`.
- `npm run usage:tool-call-share -- --since 12h --json`: exit `0`.
- `ptah_get_diagnostics` on all changed TypeScript files: no diagnostics in the requested files.

## Not done

- Linux CI execution of `npm run test:scripts` (expected to pass 18/18 once pushed, as the remaining 2 local failures in `scripts/nav-benchmark/nav-benchmark.spec.ts` and `scripts/dev/seed-lane-outcomes.spec.ts` are pre-existing Windows shell/path incompatibilities that already passed on Linux CI).
