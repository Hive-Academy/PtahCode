# Table feature specs

Only the three new specs and this report were written; production and existing specs were not edited.

- `table-columns.spec.ts`: 15 cases covering required columns, priority and later-column tie order, minimum-width sums and boundaries, default 96px, collapse threshold, extra guard hides, Infinity and empty input. Also verifies input order is preserved.
- `table-reflow.spec.ts`: 9 cases covering legacy wrapper/collapse behavior, columns wrapper metadata, header/body hidden properties, visible count and detail colspan, detail enablement, full-width wideDetail, native button ARIA and click toggles (including the click activation used by Enter/Space), rendered-width overflow guard, scroll fallback/recovery and the 32/33px guard reset boundary. jsdom does not synthesize keyboard activation; tests explicitly call the native button's click method as requested.
- `table-detail-layout.spec.ts`: 8 cases covering all four projection slots, explicit list/wide, auto outside a table, partial/all optional-column hiding, legacy collapse threshold, growth and explicit overrides.

## Exact check commands

```text
npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/table/table-columns.spec.ts libs/frontend/ui/src/lib/patterns/table/table-reflow.spec.ts libs/frontend/ui/src/lib/patterns/table/table-detail-layout.spec.ts
```
PASS: 3 suites, 32 tests; 0 failures.

```text
npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/table/table.component.spec.ts libs/frontend/ui/src/lib/patterns/table/table-detail.spec.ts libs/frontend/ui/src/lib/patterns/table/table-styles.spec.ts
```
PASS: 3 suites, 11 tests; 0 failures.

```text
npx eslint libs/frontend/ui/src/lib/patterns/table/table-columns.spec.ts libs/frontend/ui/src/lib/patterns/table/table-reflow.spec.ts libs/frontend/ui/src/lib/patterns/table/table-detail-layout.spec.ts
```
PASS: exit 0, 0 lint errors. Three notices: module-boundary rule skipped because no cached ProjectGraph exists.

```text
npx tsc --noEmit --project libs/frontend/ui/tsconfig.spec.json
```
FAIL: exit 1, 16 diagnostics outside the new files; none in these specs. Existing errors: badge.a11y.spec.ts:81 (target/regex), icon-button.directive.spec.ts:100–101 (nullable button), list-detail.component.spec.ts:53,58 (observer casts), aurora-effect.component.spec.ts:33 (two observer interface errors), native-popover.component.spec.ts:528 (undefined node), surface-tile.component.spec.ts:27 (index signature), shared capability-id-codec.ts:289–290 and messages/attention-identity.ts:20,22,24 (seven BigInt/target errors). Reproduce with the exact tsc command above.

## Findings and limits

No table production defect found. All new files are below 700 lines and contain none of the forbidden code patterns. No browser visual check was performed: this lane adds Jest specs only and the design records spec-based evidence. CLI skill discovery/loading is unavailable; the local angular-frontend-patterns SKILL.md was read directly. Ptah workspace analysis and AST inspection were used; native PowerShell reads provided full source after an initial AST request rejected the filePath argument (retry with file succeeded).
