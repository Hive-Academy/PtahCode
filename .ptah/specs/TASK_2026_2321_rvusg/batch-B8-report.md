# Batch 8 report — Run detail usage and drawer blocked default (review-runs-ui)

Tasks: 8.1, 8.2, 8.3 (implemented; batch state is the team-leader's to set).

## Files

- CREATED `libs/frontend/review-runs-ui/src/lib/components/review-usage-format.ts` — pure `tokensDisplay` / `costDisplay` returning `{ text, srText, partial }`; `USAGE_UNKNOWN = '—'`.
- CREATED `libs/frontend/review-runs-ui/src/lib/components/review-usage-format.spec.ts` — exact, partial, unknown (null / undefined / null total even with partial flag), known zero, decimals, independent markers.
- MODIFIED `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts` — Coverage `data-testid="review-detail-usage"` line; `data-testid="review-stage-usage"` line on pipeline stage and lens cards with non-null `usage` ("· N runs" when `runs > 1`); one `<ng-template #usageFigure>` renders each figure (title on partial, sr-only sentence for partial or unknown, visible symbol `aria-hidden` then). Added `NgTemplateOutlet` import and `tokens()` / `cost()` methods.
- MODIFIED `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.spec.ts` — `usage` describe: stage + lens usage and run total, "≥ $X" beside exact tokens with title + sr text, "— · —" for unknown (no `$0`), older run without usage renders "Usage: —" (sr "unknown") and no stage lines.
- MODIFIED `libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.ts` — `REASONS.defaultModelBlocked`; `unavailableReason` check after at-limit (`entry.model === null && lane.defaultModelBlocked === true`); `modelOptions` first option "Lane default (blocked)" when the lane's flag is true; doc comments updated.
- MODIFIED `libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.spec.ts` — `blocked lane default model` describe: pool and pin entry unavailable with reason text, "(blocked)" option, saved entry blocked once the listing loads, at-limit still first, explicit model not blocked, absent/false field not blocked.

## Angular template changed

Yes — the inline template of `review-run-detail.component.ts`. The coordinator must run
`npm run verify -- -t typecheck-templates -p ptah-extension-webview` (not run here: ngc is excluded
for this executor). Pool and pin templates unchanged.

## Checks (focused only)

- `npx jest --config libs/frontend/review-runs-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath` usage-format, run-detail, lane-options, lane-pool, lane-pins specs → 5 suites passed, 69 tests passed.
- `npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.lib.json` → exit 0.
- `npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.spec.json` → exit 2, 7 errors, all TS2737 (BigInt literals vs es2016 target) in `libs/shared/src/lib/types/capability-id-codec.ts` and `libs/shared/src/lib/types/messages/attention-identity.ts`; none in batch files. Pre-existing, untouched by this batch (the Nx `typecheck` target may use a different config).
- `npx eslint <6 changed files>` → 0 errors, 27 warnings, all `explicit-member-accessibility` in `review-run-detail.component.ts`; 2 are the new `tokens`/`cost` methods, matching the file's existing style (no member there has a modifier).
- Not run (not permitted for this executor): `npm run verify` inner loop / lint,typecheck / typecheck-templates / P3 gate.

## Decisions

- Number grouping uses `Intl.NumberFormat('en-US')` for deterministic output ("1,234"). Options: locale default vs fixed; fixed keeps specs stable and matches the plan's example. Reversible.
- A known $0 shows `$0.00` (two decimals) even though it is below $1, per the contract ("known 0 → $0.00").
- Unknown figures inside a present usage object also get an sr-only sentence ("Token usage unknown" / "Cost unknown") with the dash `aria-hidden`; `title` is set only on partial values, per contract.
- Run total with absent `usage` shows a single "—" (sr "unknown"), not "— · —"; a present usage with both values null shows "— · —".
- Shared `<ng-template>` + `NgTemplateOutlet` instead of repeating figure markup three times (six figures).

## Deviations

None from the plan. Usage line uses `mt-2` spacing alongside the `text-xs text-base-content-muted` classes, as sibling lines in the Coverage section do. Lines are plain block `<p>` (no `truncate`), so they wrap at phone width.

## Out-of-scope observations

- `tsconfig.spec.json` of review-runs-ui (target es2016) fails on BigInt literals from `libs/shared`; not touched.
