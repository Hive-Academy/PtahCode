# Implementation report: dashboard provider hierarchy

Task: TASK_2026_2276_af6c. Implemented in the supplied worktree against `visual-spec.md` and the final user decisions. No shared RPC types or backend files were changed. No git commands were run.

## Files

Line counts are final physical lines. Removed files have zero remaining lines. All changed and added source/spec files are below 700 lines. `provider-accent.ts` is unchanged; the existing dashboard scroll-owner spec is unchanged and was included in focused verification.

| File | Operation | Lines |
| --- | --- | ---: |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-accounting.model.ts` | Added | 249 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-owner.model.ts` | Added | 398 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-details.model.spec.ts` | Added | 695 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts` | Changed | 565 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts` | Changed | 291 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile.types.ts` | Added | 157 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-window.model.ts` | Added | 327 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.spec.ts` | Changed | 211 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.ts` | Changed | 270 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.html` | Added | 115 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.spec.ts` | Added | 55 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.ts` | Added | 68 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-grouping.model.spec.ts` | Added | 189 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-grouping.model.ts` | Added | 69 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.html` | Added | 105 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.spec.ts` | Added | 55 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.ts` | Added | 43 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-test.fixtures.ts` | Added | 39 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.html` | Added | 51 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.spec.ts` | Added | 26 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.ts` | Added | 39 |
| `libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.component.ts` | Changed | 49 |
| `libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.component.html` | Changed | 15 |
| `libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.layout.spec.ts` | Changed | 31 |
| `libs/frontend/ui/src/lib/foundation/list-row.component.ts` | Changed | 79 |
| `libs/frontend/ui/src/lib/foundation/list-row.component.spec.ts` | Changed | 110 |
| `libs/frontend/dashboard/src/lib/components/provider-account-tile/provider-account-tile.component.ts` | Removed | 0 remaining |
| `libs/frontend/dashboard/src/lib/components/provider-account-tile/provider-account-tile.component.html` | Removed | 0 remaining |
| `libs/frontend/dashboard/src/lib/components/provider-account-tile/provider-account-tile.component.spec.ts` | Removed | 0 remaining |
| `.ptah/specs/TASK_2026_2276_af6c/implementation-report.md` | Added | 137 |

This report is the only task-folder deliverable written. Machine-owned task/status files and the UI class baseline were not edited.

## Implementation against the specification

1. **Shared list-row extension.** Added optional `[body]` projection and `wrapText` signal input defaulting to false. Default title/meta truncation, current/selection behavior, and host layout remain intact. The empty body wrapper is hidden. Responsive column rules apply only to rows opting into wrapping and supplying body content. Extended compatibility/projection coverage alongside the existing Angular Aria selection test.
2. **Shared semantic owners.** Dashboard consumers use page/section headers, button directives, state panels, list rows, neutral badges, status badges, labelled meters and selected-account accounting stat cards. Meters receive the original normalized percentage; >100 text survives while the existing shared meter clamps its fill. Fresh values use automatic thresholds, confirmed active hits force error, and aged/estimated/unknown values remain neutral with explicit qualifiers. No meter internals changed.
3. **Section hierarchy and states.** The card retains store/provider effects, shared clock, refresh and navigation action routing. A pure mapper produces selected, other-reading and quiet groups from persisted `activeProviderId()`. One section action refreshes the existing store and disables during loading. State panels cover loading, successful empty, first failure and retained-data refresh failure. Retained readings/disclosure instances remain mounted. Incomplete discovery has a visible neutral explanation. Multiple selected owners remain separate featured blocks with the accounts explanation; an unmatched selected provider produces neutral context without a fabricated owner.
4. **Replacement components.** Featured selected owners are full-width, with identity/plan badges, highest eligible reading, source/reset facts, two supporting windows, distinct accounting, evidence/cooldown and disclosures. Other owners are static list rows with named quota/accounting summary and real Details buttons. Quiet owners use the same rows inside a collapsed `Without usage readings (N)` group with attention context. All supplied model counts are available in activity details. The three obsolete tile files were deleted after references migrated; no shim remains.
5. **Pure model split.** The existing model path is the composition entry. Window selection/state, owner status/actions, accounting and grouping have focused helper modules plus a type module. View data includes nullable primary window, every secondary window, identity/plan, typed independent field provenance, and discriminated allowance/balance/requests/tokens/cost/activity records. Group records carry selection, group and reason. Snapshot order is retained within groups and canonical owner keys are unique.
6. **Data semantics.** Existing classifyWindow/usedPercent/selectPrimary eligibility, reset passage, stale and evidence rules remain in use. Removed the first-window hero fallback. Ranking compares normalized allowance saturation, then nearest future reset, then stable window key. Missing source/age is explicit; fetchedAt/generatedAt are not reading age. Used and reset observations are retained independently. Suppressed generic weekly windows remain reachable as secondary records with reset-passed unknown state. Literal balances keep their units; allowance, request count, tokens, estimated USD cost, lifetime and daily activity remain separate. Per-bucket labels and reported individual allowance resets remain visible. No inferred authentication, currency, denominator, account rank or provider ordering was added.
7. **Dashboard integration and responsiveness.** Page header title/back action now use the shared page-header and existing navigateBack. Existing section order and scroll owner are unchanged. The account section owns an inline-size container: single-column below 800px, 2:1 featured internals and inline summary rows above 800px, stable identity width above 1200px, 12px surface padding and wrapping at narrow widths. Shared tokens and surfaces are used. Children are standalone/OnPush, use signal inputs/outputs, private writable disclosure signals and stable owner/window keys. No per-item timer, poll or observer was introduced.
8. **Coverage authored.** Card, feature, summary row, quota window, grouping, split model and layout specs cover selected unavailable/multiple owners, selection changes/unmatched selection, unknown identity, incomplete discovery, loading/empty/error, accounting-only/activity-only owners, active evidence without windows, missing source age, partial retained data, mixed units, tie-break, expired reset, >100 values, refresh failure with retained readings and stable disclosure state. Existing model semantic assertions were retained across two files below the size limit. Existing scroll-owner coverage remains unchanged. Runtime execution is blocked as described below.

## Decisions

- Use the persisted selected provider for every Level 1 owner; other options (fixed vendor order/pinning) were explicitly rejected by the user. Reversible presentation mapping; no persisted data change.
- Preserve snapshot order within each group and retain the first occurrence of a canonical owner key. Evidence: the specification requires stable owners, no invented primary-account ranking and key-based tracking. Reversible pure mapping.
- Reuse the single section button as Retry on first failure. Evidence: the state table requires Retry while the interaction contract requires one section refresh action. This avoids duplicate controls and is reversible.
- Keep shared row changes opt-in through wrapText plus projected body; existing callers require no migration. Evidence: additive API/default layout requirement. Reversible shared styles.
- Retain existing compact model fields/tests alongside richer records in the same composition entry while the replacement UI consumes the richer records. This preserves established semantic assertions without a legacy component or alternate model implementation.

## Deviations and limits

- The implementation follows the approved spotlight plus inline row/disclosure layout. No list-detail interface was introduced.
- A small shared type module and reusable test-fixture module accompany the named helper/component files to keep responsibilities and file sizes bounded.
- No Electron rendering, screenshots, template verification target, nx, build, serve, e2e or workspace-wide verification was run, per this lane's explicit verification restrictions. Responsive/contrast/focus behavior is implemented in source but not visually verified.
- Host skill discovery/loading was unavailable. Repository Angular guidance was consulted; no successful host skill invocation is claimed.

## Verification commands and results

Commands below are the exact focused verification invocations. Repeated identical invocations after subsequent edits are consolidated; no successful test execution is claimed.

### Library TypeScript

```powershell
npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json
```

Both exit 0. Repeated after implementation changes. These are library TypeScript checks, not Angular template compilation or test execution.

### Focused dashboard Jest

```powershell
npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-details.model.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-grouping.model.spec.ts libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.layout.spec.ts libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.scroll-owner.spec.ts
```

Exit 1: all nine suites fail to initialize at esbuild `ensureServiceIsRunning` / `startSyncServiceWorker` with `spawn EPERM`; zero tests run. A preceding invocation used the same command without the newly split `plan-tile-details.model.spec.ts` and added `provider-account-grouping.model.spec.ts`; its seven suites hit the same initialization failure. Repeated final invocation again reports nine suites / zero tests.

### Focused shared UI Jest

```powershell
npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/foundation/list-row.component.spec.ts
```

Exit 1: one suite fails at the same esbuild subprocess permission error; zero tests run. The same focused command was repeated with the same result.

### Scoped ESLint

```powershell
npx eslint libs/frontend/dashboard/src/lib/components/provider-account-card/plan-*.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-*.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-*.html libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.html libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.spec.ts libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.component.ts libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.component.html libs/frontend/dashboard/src/lib/components/dashboard-grid/dashboard-grid.layout.spec.ts libs/frontend/ui/src/lib/foundation/list-row.component.ts libs/frontend/ui/src/lib/foundation/list-row.component.spec.ts
```

Exit 0 after removing unused imports from split specs. No changed-file lint errors or warnings remain. Nx's module-boundary rule prints a warning and skips because no cached ProjectGraph is available; no nx command was run to generate one. An early broader pass also included untouched provider-accent.ts and reported its existing non-null assertion warning; that file was not edited.

The final quota presentation adjustment was additionally checked with:

```powershell
npx eslint libs/frontend/dashboard/src/lib/components/provider-account-card/plan-window.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.html
```

Exit 0; only the same missing cached ProjectGraph warning. Final dashboard library tsc was repeated after this adjustment and passed.

### UI class ratchet

```powershell
npx tsx tools/ui-class-audit/check-ui-classes.ts
```

Failed: npm ENOTCACHED while resolving unavailable tsx under the restricted/offline registry.

```powershell
npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts
```

Pass, exit 0, including the final repeat: direct ts-node script invocation scans 1440 files and reports no counts above baseline. Baseline not edited. This fallback does not use nx.

### Ptah diagnostics

Scoped `ptah_get_diagnostics` was requested for the card, window model and shared row after edits. Several requests return unavailable after the 45-second compiler deadline, with the background check continuing. Completed card-scoped and final quota-component-scoped results had no diagnostics in their requested files but reported six sibling diagnostics in unedited files: a boolean/void mismatch in skill-selection-card.spec.ts and BigInt target errors in shared/messages helpers. These are qualified diagnostics, not a clean workspace result. The allowed direct library tsc checks pass.

## Open issues

1. Focused tests must execute in an environment that permits esbuild subprocess startup. No assertion outcome is available from this lane.
2. Renderer template checking and Electron inspection at 640/1000/1400px in both glass themes, narrow zoom, keyboard focus and contrast remain unverified because the user prohibited those commands/screenshots in this lane.
3. Nx boundary validation is unverified because the cached project graph is absent; the native lint pass skipped that rule.
