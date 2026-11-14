# B11 report

## Files changed

- `libs/shared/src/lib/types/rpc/rpc-analytics.types.ts`
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts` and `.spec.ts`
- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts` and `.spec.ts`
- `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.ts` and new `.spec.ts`
- `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html` and `.spec.ts`

## Contract change

`UsageSummary.repositories` is optional, preserving older RPC payloads. Each row carries repository ID, worktree paths, nullable token fields, nullable known cost in micro USD, and `hasUnknownTokens`. The analytics service lists up to 100 repository IDs observed in the requested workspace and window, then obtains repository-wide totals for that window. The existing `analytics:spendSummary` RPC and allowlist are unchanged.

I inspected both Electron and CLI RPC surface guards. They derive the registry/manifest surface, and this batch adds no method, so neither guard needs an edit.

## UI

The existing Angular dashboard template changed. It shows recorded repository tokens, worktree paths, unknown token coverage, and a cost caption explicitly identifying the partial, known priced subtotal. The store already retains the whole typed summary, so no store change was needed. Vitals consumers continue to read the same optional-compatible summary contract.

## Tests added

- Repository identity lookup is scoped by workspace and window.
- Summary service includes repository totals.
- View model handles repository totals and older payloads without the field.
- Dashboard component displays repository totals, paths, partial cost and unknown coverage.

## Focused checks

- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.spec.ts` — passed, 2 tests.
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts` — passed, 27 tests.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts` — passed, 20 tests.
- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.spec.ts` — passed, 38 tests.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — passed; vitals consumer compiles.
- `npx eslint libs/shared/src/lib/types/rpc/rpc-analytics.types.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/usage-analytics/src/lib/usage-summary.service.ts libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.ts libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.spec.ts libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.spec.ts libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html` — passed with 0 errors and 15 existing warnings in touched files.

## Decisions

- Query repository identities from billable usage rows in the workspace and requested window, capped at 100. The other option was a global repository list, which could expose unrelated repositories. The existing workspace key and date window provide the appropriate scope. Reversible.
- Keep the new field optional because existing producers and cached payloads omit it. Reversible.

## Open issues

- No browser screenshot was captured because serving the Angular app is prohibited for this lane; the rendered component test passed. The Angular skill-loading tool is unavailable in this lane, so repository patterns and task guidance were applied directly. ESLint reports 15 existing warnings in touched files, with no errors.
- `ptah_get_diagnostics` was attempted after editing but its TypeScript worker timed out three times; the five focused `tsc` commands above passed instead.
