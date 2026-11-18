# P2 fix report

## Design

The compact-boundary tap records the runtime's last known auto-compaction threshold for the budget policy when no explicit window is available. Precedence is session tighten override, configured effective window (including the existing environment resolution), then cached runtime `autoCompactThreshold`, then null. `maxTokens` is context capacity and is deliberately not substituted for the auto-compaction threshold.

`SessionLifecycleManager.getLastContextUsage` exposes its already injected context-usage port. It checks the requested ID and the registry's canonical/tab IDs. The tap checks both the boundary's session ID and its owner ID, so readings remain discoverable before or after the PostCompact hook rekeys the cache. This uses an existing successful per-turn reading synchronously; no control request or asynchronous work is added to the stream. No reading means null, without throwing. A first compaction without any prior reading retains the existing behavior.

No outgoing SDK option was added. `A1_DEFAULT_WINDOW` remains `{ claude: null, proxied: null }`. Existing SDK argv tests confirm the default window stays absent. Electron and CLI both use `registerSdkServices`, which already registers the context-usage port and lifecycle manager; no constructor dependency or composition-root edit was needed.

## Files changed by this fix

- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts`: supply explicit/session/runtime threshold precedence when capturing a budget compaction sample.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts`: expose the cached runtime reading through existing lifecycle DI, resolving session aliases.
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts`: correct the obsolete default assertion; cover configured/environment/session precedence and a default Claude session promoting to handoff through the real budget service after the configured number of compact boundaries. The runtime threshold is 300,000, capacity is 1,000,000, and the post-compaction count is exactly half the threshold.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts`: cover absent context readers and cache lookup under tab, old, and new IDs.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`: remove only the obsolete `autoCompactWindow: 200_000` member from the exact settings assertion; retain all remaining settings and no-notice assertions.
- `.ptah/specs/TASK_2026_2264_5414/p2-fix-report.md`: this report.

Existing uncommitted work was preserved. No commit, push, stash, PR, install, Nx target, build, serve, e2e, or `npm run verify` was performed.

## Verification

Commands were run from the requested worktree root.

1. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`
   - Initial run: 1 suite passed, 1 failed to compile; 24 tests passed, 0 tests failed. Corrected the new regression fixture's cost/model fields to match `SessionStatsEntry`.
2. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts libs/backend/agent-sdk/src/lib/helpers/auto-compact-control.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts`
   - First run: 4 suites passed, 1 failed to compile; 136 tests passed, 0 tests failed. Corrected the new environment-window test input to the already parsed numeric type.
   - Final run: **5 suites passed; 301 tests passed, 0 failed**.
3. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`
   - Passed, exit 0, no diagnostics.
4. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`
   - Passed, exit 0, no diagnostics.
5. `npx eslint libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`
   - Passed, exit 0; **0 errors, 9 warnings**. Seven warnings concern existing non-null assertions/unused variable lines in the lifecycle spec; two concern an existing unused assignment and the oversized adapter file. No warning is on newly added statements. The existing file-length warning remains (the adapter grows by six lines).
6. `git diff --check`
   - Passed, exit 0; only Git CRLF normalization warnings.

## Tool and verification limits

Read the independent `code-review.md`. Ptah AST and dependent inspection succeeded after correcting the argument name from `filePath` to `file`; targeted native reads and `rg` supplemented the partial dependent index. The scoped Ptah diagnostics request returned unchecked because its compiler exceeded 45 seconds; direct TypeScript checks are used as evidence instead. Native CLI skill discovery/loading is unavailable, and the local skill catalog has no matching skill for this small backend correction (the DDD skill inspected covers domain modeling, which this fix does not do).

No rendered UI changed. Neither Electron nor CLI was launched, and host-level integration/build/e2e checks were not run, per the task's focused-check restrictions.

All requested focused checks passed after correcting the test fixtures. No functional requirement remains open. A runtime threshold that has never been observed remains unknown by design; host launch verification remains outside this run.
