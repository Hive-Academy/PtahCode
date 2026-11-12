# PR1-A result: agent card elapsed time

## Files changed (2 non-spec, 1 spec)
- `agent-card-header.component.ts`: renders `<ptah-timer format="compact">` (startedAt, endedAt) in place of the span text. Same classes (`text-[10px] text-base-content-muted flex-shrink-0`, conditional `ml-auto`) now sit on the `ptah-timer` host. Removed the `elapsedDisplay` input. New `timerEndedAt` computed: `null` while running, `completedAt` once finished, `undefined` (no timer) if startedAt or completedAt is missing.
- `agent-card.component.ts`: removed `injectWallClock`, the private `now`, `elapsedDisplay`, the `agentRunDurationMs`/`formatAgentDuration` imports and the `[elapsedDisplay]` binding.
- `agent-card-header.component.spec.ts`: removed the `elapsedDisplay` input, added the `PTAH_CLOCK` provider, added 3 timer tests (frozen, live, no timer without completedAt).

Dead code: `elapsedDisplay` existed only in these two files (grep). `injectWallClock`, `agentRunDurationMs` and `formatAgentDuration` are still used elsewhere in chat, so they stay.

## Visible text changes
- Minutes format: `5m 03s` became `5m 3s` (owner 'compact' does not pad seconds).
- Hours format: `1h 02m` becomes `1h 2m` (owner does not pad minutes).
- Under one second: old text was empty; owner shows `0s`.
- Days now format as `2d 3h` above 24 h (old: hours only).
- `<ptah-timer>` adds `title="Started <time>"`, `role="timer"` and a silent "Stopped" live region once frozen.
- No data-testid existed on the elapsed span; none added.

## Verification
- `npm run verify -- -p chat`: typecheck ran (passed); lint passed per the run summary; test target FAILED: environment issue (below).
- Targeted `-t test -p chat -- --testPathPatterns=agent-card`: 3 suites passed, 7 suites failed to run, 45 tests passed, 0 failed.
  The 7 suites fail with "Could not locate module marked ... node_modules\marked\lib\marked.umd.js". The worktree has no `node_modules` folder, so the Jest `moduleNameMapper` for `marked` resolves to a missing path. These suites do not run in this worktree for any change. The header spec (my spec) ran and passed.
- The full chat run also showed `WorkspaceCoordinatorService git regression` failures. I did not prove they fail on main. The header spec failures in that first run were the missing `PTAH_CLOCK` provider, fixed in the spec.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: passed (1 succeeded, served from cache).

## Exceptions and open points
- No owner gap: `ptah-timer` with `startedAt`/`endedAt` covers the freeze.
- Other specs that mount `ptah-agent-card-header` or `ptah-agent-card` (the 7 suites that could not run here, for example `agent-card-flat-header.spec.ts`, `agent-card-unified.spec.ts`) now need a `PTAH_CLOCK` provider if they do not already inherit one. Run them in a checkout with `node_modules` to confirm.
- The worktree has other modified files in chat-ui and core from other lanes. This lane did not touch them.
