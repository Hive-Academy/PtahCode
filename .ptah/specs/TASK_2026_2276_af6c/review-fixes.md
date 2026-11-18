# Review fixes

All three review findings are addressed. Paths beginning `D/` below mean `libs/frontend/dashboard/src/lib/components/provider-account-card/`.

## 1. Disclosure state survives group changes

- `D/provider-account-card.component.ts:116`, `:136`, `:167`: both row loops and the feature receive expansion from the same owner-keyed state and emit toggle intent back to the card.
- `D/provider-account-card.component.ts:222`: private writable `ReadonlySet` signal, public readonly presentation, and methods as the only writers. Snapshot changes prune departed keys; clock, readings, selection, and null/loading snapshots do not clear retained owners. The quiet-group toggle remains unchanged.
- `D/provider-account-feature.component.ts:59` and `D/provider-account-summary-row.component.ts:34`: `expanded` input and `toggleExpanded` output replace local signals. Their HTML binds disclosure visibility and ARIA to the supplied state.
- Added card regressions at `D/provider-account-card.component.spec.ts:215`, `:229`, `:248`: cooldown expiry into quiet group, reading arrival/removal, actual departure/reappearance, and row-to-feature-to-row selection changes.
- Updated both child component specs to verify toggle output plus parent-controlled expansion and retained state across view replacement.

## 2. Finite amount survives an unusable denominator

- `D/plan-window.model.ts:76`: finite source amount display is independent of percentage normalization. An amount such as 120 requests remains `120 requests used` with `Allowance unknown`, no percentage and no meter. The ratio-only Usage unknown badge is suppressed for that known amount.
- `D/plan-window.model.ts:225`: reset-passage invalidation still emits `Usage unknown`, removes the allowance qualifier and hides the meter. The existing primary selector still requires a finite ratio and future reset.
- `D/provider-account-grouping.model.ts:33`: finite amounts count as readings even without an eligible percentage, keeping their owners in Other.
- Added mapping/grouping cases in `D/provider-account-grouping.model.spec.ts:191` for zero, negative and NaN denominators, plus reset-passage invalidation.
- Added rendered component cases in `D/provider-quota-window.component.spec.ts:28` and `:39` for visible amount/allowance qualifier, absent meter and reset invalidation. Existing shared types still require a numeric denominator; no shared/RPC changes were made. The display path also tolerates an absent runtime denominator through existing normalization.

## 3. Remove legacy tile representation

- `D/plan-tile.types.ts:1` and `D/plan-tile-view.model.ts:1`: removed headerTitle, readingSource, bar, primaryValue, primaryTone, compactWindows, shortReset, accessibleLabel, chips, secondary, statusChip, statusNoticeTone, statusNoticeTitle, hiddenWindowNotes and noUsageSource. Removed their exclusive interfaces and icon type. Status pill is computed directly from primary eligibility (`plan-tile-view.model.ts:61`).
- Removed exclusive compact-label/reset/tooltip/hidden-weekly helpers from `D/plan-window.model.ts`, old reading-source/status-chip helpers from `D/plan-owner.model.ts`, and secondary-line/model-tooltip/range helpers from `D/plan-accounting.model.ts`.
- Removed unconsumed fieldProvenance from the window view and mapper. Visible provenance strings still expose used/reset source and observation time independently. Preserved the coordinator's facts.limitLine-first resetText and absence of limitLine in provenance (`D/plan-window.model.ts:240`).
- Migrated assertions in `D/plan-tile-view.model.spec.ts`, `D/plan-tile-details.model.spec.ts`, and `D/provider-account-grouping.model.spec.ts` to primaryWindow/secondaryWindows, accounting, modelUsage, provenance, evidence and statusPill. Retained selection/tie-breaks, reset/exhaustion-only reset, thresholds, aged/estimated/unconfirmed state, source age, accounting and evidence coverage.
- Removed obsolete assertions about compact abbreviations, hidden-window tooltips, capped window/model chips and redundant footer status chips. Replaced them with assertions that every window/model remains available in the new disclosure and that invalidated weekly data remains unknown.
- Before deletion, searched the entire libs/ and apps/ trees for every removed field, including bar/chips/secondary, and for exclusive helper/type consumers. No external legacy-view consumers were found. The final targeted search includes webview-e2e-harness and apps/ptah-electron-e2e and has no matches. Whole-tree residual headerTitle/readingSourceText matches belong to unrelated autocomplete/backend implementations and were retained.
- The coordinator's harness scenario file was not edited. Its exhaustion-only reset assertion in plan-tile-view.model.spec.ts remains on secondaryWindows[0].resetText.

## Changed files and line counts

- `D/plan-tile-view.model.ts`: 110 lines.
- `D/plan-tile.types.ts`: 79 lines.
- `D/plan-window.model.ts`: 272 lines.
- `D/plan-owner.model.ts`: 333 lines.
- `D/plan-accounting.model.ts`: 152 lines.
- `D/provider-account-grouping.model.ts`: 70 lines.
- `D/provider-account-card.component.ts`: 298 lines.
- `D/provider-account-feature.component.ts`: 67 lines.
- `D/provider-account-summary-row.component.ts`: 42 lines.
- `D/provider-account-feature.component.html`: 115 lines.
- `D/provider-account-summary-row.component.html`: 105 lines.
- `D/plan-tile-view.model.spec.ts`: 538 lines.
- `D/plan-tile-details.model.spec.ts`: 682 lines.
- `D/provider-account-grouping.model.spec.ts`: 200 lines.
- `D/provider-account-card.component.spec.ts`: 263 lines.
- `D/provider-account-feature.component.spec.ts`: 59 lines.
- `D/provider-account-summary-row.component.spec.ts`: 59 lines.
- `D/provider-quota-window.component.spec.ts`: 48 lines.

No files added or removed outside this report. Every affected source/spec file remains below 700 lines. No baseline edits, backend/shared changes or git operations.

## Commands and results

All checks used native execution in this worktree. No Jest, nx, npm run verify, build, serve or e2e commands were run. Tests require coordinator execution because Jest's esbuild helper cannot start in this sandbox. No screenshots/rendering were performed, as requested.

- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json`: PASS (exit 0); repeated after production changes.
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`: PASS (exit 0).
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: PASS (exit 0), 1440 files scanned, 0 counts over baseline; baseline unchanged.
- Initial changed-file ESLint with `--fix`: exit 0 with one unused formatRelative import warning; removed the import.
- Final full changed-file ESLint below: PASS (exit 0, no warnings):

```powershell
npx eslint libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile.types.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-window.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-owner.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-accounting.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-grouping.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.html libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.html libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-details.model.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-grouping.model.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-feature.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-summary-row.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.spec.ts
```

- Follow-up after the final amount-label and fixture adjustments: PASS (exit 0):

```powershell
npx eslint libs/frontend/dashboard/src/lib/components/provider-account-card/plan-window.model.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-quota-window.component.spec.ts libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.spec.ts
```

- Required scoped ptah_get_diagnostics requested plan-tile-view.model.ts: no errors in that file. Its broader compiler coverage reported one primaryValue reference subsequently migrated, and six unrelated existing sibling diagnostics (skill-selection-card boolean/void, five shared BigInt target errors). The permitted native dashboard library typecheck passes. No unrelated files were changed.
- Native search fallback: ptah_ast_analyze returned ENOENT for plan-tile-view.types.ts (actual file is plan-tile.types.ts); native reads/searches used the actual file. No skill discovery/loading tool is exposed, so angular-frontend-patterns could not be loaded; repository Angular guidance was followed directly.

Search performed before removal (all fields, whole trees):

```powershell
rg -n 'headerTitle|readingSource|\bbar\b|primaryValue|primaryTone|compactWindows|shortReset|accessibleLabel|\bchips\b|\bsecondary\b|statusChip|statusNoticeTone|statusNoticeTitle|hiddenWindowNotes|noUsageSource|fieldProvenance' libs apps
```

## Decisions

- Remove fieldProvenance rather than introduce another display: no template consumes it; visible provenance already carries the actual field source/time detail. Reversible presentation-only choice, consistent with finding 3.
- Retain expanded keys while snapshot is null; only a concrete snapshot can establish that an owner departed. Reversible local state decision.

## Open verification

Coordinator must run the changed dashboard Jest specs and renderer template typecheck. This lane did not claim tests or visual inspection passed.
