# Batch E report

## Files changed

- `libs/shared/src/lib/types/advanced-settings.types.ts`: absent idle minimum defaults to 150,000; stored values and bounds stay unchanged.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.types.ts`: adds session boundary state, diagnostic reasons, and the growth constant.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.ts`: captures the first valid post-compact reading as baseline without arming; resets on later post-compact, rekey, release, and a new run.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-fire-gate.ts`: enforces the effective SDK window and 50,000-token post-boundary growth.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.ts`: resolves the effective window using the existing resolver and logs an inactive configuration once per distinct min/window pair.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts`, `idle-fire-gate.spec.ts`: cover baseline lifecycle, window bounds, growth, unknown baseline/window, and inactive explicit minimum.

## Exported signatures/constants

- `IDLE_MIN_TOKENS_DEFAULT = 150_000`.
- `IDLE_POST_BOUNDARY_GROWTH_TOKENS = 50_000`.
- `IdleSessionState.compactBoundaryObserved?: boolean` and `postBoundaryBaseline?: number | null`.
- `FireGateLookups.settings.effectiveSdkWindow: number | null`.
- `IdleSkipReason` gains `at-sdk-window`, `min-at-sdk-window`, `post-boundary-baseline-unknown`, and `below-post-boundary-growth`.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-fire-gate.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.coalesce.spec.ts`: **pass, 4 suites / 86 tests**. Node emitted a nonfatal ES-module config warning.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **pass**.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: **pass**.
- `npx eslint libs/shared/src/lib/types/advanced-settings.types.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.types.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-fire-gate.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-fire-gate.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.ts`: **pass, 0 errors / 18 pre-existing non-null assertion warnings**.
- `git diff --check -- libs/backend/agent-sdk/src/lib/helpers/compaction/idle libs/shared/src/lib/types/advanced-settings.types.ts`: **pass**.

## Decisions

1. **Window resolution:** use `resolveAutoCompactControl` with the session's native Anthropic classification and `CompactionConfigProvider` values. Alternatives: hard-code 200k or add a setting. Evidence: the resolver already applies environment, setting, first-party default, and unknown proxied behavior. Reversible: yes.
2. **Baseline state:** optional fields in `IdleSessionState`, with absent values treated as no boundary/no baseline. Alternative: edit `idle-compaction.helpers.ts` initial state. Evidence: that file is outside the authorized write set. Reversible: yes.
3. **Diagnostic frequency:** log inactive min/window once per distinct pair and suppress per-attempt skip logs for that reason. Alternative: log every due attempt. Evidence: the requirement forbids per-tick diagnostics. Reversible: yes.

## Anything not done

- No out-of-scope source changes. `idle-compaction.helpers.ts` may show a working-tree metadata/line-ending modification after inspection; `git diff` shows no content difference, and it is not part of the deliverable.
