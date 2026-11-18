# Idle compaction default: 750,000 tokens

## Files changed
- `libs/shared/src/lib/types/advanced-settings.types.ts`: set only the idle minimum default to `750_000`; idle enabled remains `true`, with bounds `100_000` to `5_000_000`.
- `libs/shared/src/lib/types/advanced-settings.types.spec.ts`: pin both idle defaults.
- `libs/backend/platform-core/src/file-settings-keys.spec.ts`: restore enabled-default expectations to `true` and update both token-default assertions.
- `libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts`: restore enabled-default expectations to `true`; update unset, null and invalid-value fallback expectations to `750_000`; retain explicit stored boolean coverage.
- `apps/ptah-docs/src/content/docs/settings/context-management.md`: update the Smallest idle chat to compact default to `750,000` tokens.
- This report.

## Checks
- Focused Jest commands used `--runInBand --coverage=false --runTestsByPath` with each project's `jest.config.ts` and its changed spec: shared 85 passed; platform-core 153 passed; agent-sdk 53 passed (291 total).
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.spec.json`: passed.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed.
- `npx eslint libs/shared/src/lib/types/advanced-settings.types.ts libs/shared/src/lib/types/advanced-settings.types.spec.ts libs/backend/platform-core/src/file-settings-keys.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts`: passed with zero errors and two existing unused-import warnings for `ENHANCE_TIMEOUT_MAX_MS` and `ENHANCE_TIMEOUT_MIN_MS` in the unchanged imports of the platform-core spec.
- `git diff --check`: passed.

## Scope and tooling
Production fallback already reads `FILE_BASED_SETTINGS_DEFAULTS`, derived from `ADVANCED_SETTINGS`, so no provider change is needed. Electron, renderer, platform-cli and cli-engine continue sharing the same default. Searches found no old-default assertions in the webview or Electron e2e harnesses. Unrelated 150,000 settings and explicit test inputs remain unchanged, including idle gate fixtures with explicit minimums. Labels, help text, keys, ids and accessibility attributes are unchanged. No UI or template changes were made.

No Nx, verify, build, serve, dev, e2e or package target was run. The known Windows session-driver-lock tests were not run. No commit, push, merge, stash or branch switch was performed.

CLI skill loading was unavailable; skill discovery found no installed matching skill for this focused settings change. The Ptah dependency lookup produced no usable output; native rg searches traced references, and focused compiler checks provide diagnostics.
