# Dashboard code-logic review fixes

Implemented findings 1-7 in the dashboard-provider-hierarchy worktree. Existing redesign work was retained. No git commands, commits, RPC changes, new CSS classes, or audit-baseline changes were made.

## Findings and regression coverage

Paths in the first six rows are relative to `libs/frontend/dashboard/src/lib/`.

| Finding | Change and evidence | Focused spec |
| --- | --- | --- |
| 1. Comparable source coverage | `services/kpi-delta.ts:71`: require matching, nonempty source sets with complete status and explicit coverage starts spanning each compared period; reject facts without matching source metadata. Requested summary boundaries alone cannot establish coverage. | `services/kpi-delta.spec.ts`: partial/unavailable sources in either period; late ledger start; absent coverage; mismatched/missing sources; valid full coverage. |
| 2. Unknown spend | `services/kpi-delta.ts:101` and `:132`: preserve unknown spend as null, including unpriced facts with a known subtotal. Token totals remain independently comparable. | `services/kpi-delta.spec.ts`: wholly unpriced and mixed priced/unpriced facts in either period, with/without known subtotals; independently available token deltas. |
| 3. Matched generations | `services/analytics-usage.store.ts:67`, `:85`, `:147`, `:169`: clear comparison and summary-generation eligibility on every load; expose comparison only once that generation's main response succeeds. Wider responses retain the existing generation guard. | `services/analytics-usage.store.spec.ts`: refresh after a successful pair in both completion orders; main/wider failure; superseded wider response. |
| 4. Complete Details | `components/plan-limits/provider-limit-card.view-model.ts:188`: enumerate every window, allowance/reset information, scope, provenance, all accounting items, all model readings, and uncapped scoped owner evidence. `:243` keeps active owner-only hits visible without a percentage. `components/plan-limits/provider-limit-card.component.ts:153`: add the missing `content` projection attribute so the popover actually renders Details. | `provider-limit-card.view-model.spec.ts` and `provider-limit-card.component.spec.ts` beside the mapper: four-window fixtures, tokens and cost, two models, four evidence scopes, and actual rendered popover text; owner-only hit with no ring. |
| 5. Qualified readings | `components/plan-limits/provider-limit-card.view-model.ts:100`, `:165`: explicit Not confirmed / Estimate only states, neutral rings, estimated provenance marker even without an exhaustion record, and mini-row qualifiers. `components/plan-limits/plan-limits-panel.component.ts:36`: qualified cards sort with unknown readings. | `components/plan-limits/provider-limit-card.view-model.spec.ts`: missing last-reset confirmation and estimated 100% usage without exhaustion evidence. |
| 6. Relative card notices | `components/plan-limits/provider-limit-card.view-model.ts:243`, `:324`: generate relative cooldown and stale-since notices on cards; preserve absolute notices in Details. Both notices survive when present together. | `components/plan-limits/provider-limit-card.view-model.spec.ts`: simultaneous cooldown/stale-owner fixture asserts relative card text and absolute Details times. |
| 7. Docs privacy | `apps/ptah-electron-e2e/src/docs-screenshots/sessions.shot.ts:46`: mask `ptah-plan-limits-panel` inside the usage crop. `_harness/shooter.ts:100`, `:122`: forward optional Playwright masks to both element and page screenshots. | No e2e execution, as instructed; changed screenshot files checked by ESLint and the Electron e2e TypeScript project. |

## Decisions

- Require explicit source coverage evidence, including complete status for each matched source. Options: infer from requested dates, or suppress unsupported comparisons. The review and fixed product decision require no delta for missing comparison data. Reversible frontend-only choice.
- Invalidate comparison eligibility during refresh while preserving the stale current summary. Options: atomic pair publication, or clear comparisons until the matching main/wider answers succeed. The request explicitly permits the latter; existing generation guards and stale-summary behavior support it. Reversible.
- Keep qualified states explicit and sort them with unknown readings. Plain Available would contradict the review; no estimated percentage becomes an authoritative limit hit. Reversible.
- Extend the existing screenshot helper with optional masks because its crop-only API did not forward Playwright masks. This preserves the usage crop and implements the requested privacy boundary. Reversible.

## Verification

All heavy checks were run sequentially. No Nx, verify, build, serve, package, workspace-wide test, or e2e target was run.

- Focused Jest, initial run: FAIL, `Test Suites: 3 failed, 1 passed, 4 total`; `Tests: 4 failed, 36 passed, 40 total`. New tests exposed the missing content projection and fixture mistakes (resolve-only fake RPC; authoritative 100% fixture). Fixed before rerun.
- Focused Jest, second run: PASS, `Test Suites: 4 passed, 4 total`; `Tests: 40 passed, 40 total`.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json`: PASS, exit 0, no diagnostics.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.spec.json`, initial run: FAIL, exit 1. Included two missing `PlanLocalUsage` fixture fields introduced by the new tests, corrected afterward, plus errors in untouched files listed below.
- `npx eslint` with the 11 changed TypeScript files listed below: PASS, exit 0, no diagnostics.
- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json`: PASS, exit 0, no diagnostics.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.spec.json`, final run: FAIL, exit 1, 11 diagnostics exclusively in untouched files. Key output: `plan-limits-panel.component.spec.ts(82,68): error TS2322: Type '"c"' is not assignable to type 'PlanWindowKey | undefined'` (also lines 98, 139); `skill-selection-card.spec.ts(378,9): error TS2322: Type 'boolean' is not assignable to type 'void'`; seven `TS2737: BigInt literals are not available when targeting lower than ES2020` diagnostics in `capability-id-codec.ts:289-290` and `attention-identity.ts:20,22,24`. No diagnostics remain in the changed specs.
- Focused Jest, final run after fixture corrections and notice text cleanup: PASS, exit 0; `Test Suites: 4 passed, 4 total`; `Tests: 40 passed, 40 total`; `Time: 15.502 s`. Same exact focused command below.
- Scoped `ptah_get_diagnostics`: UNAVAILABLE, `TypeScript check still running after 45s`; no diagnostic pass claimed. Used the permitted scoped native TypeScript checks as fallback.

Focused Jest command:

```powershell
npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/services/kpi-delta.spec.ts libs/frontend/dashboard/src/lib/services/analytics-usage.store.spec.ts libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.view-model.spec.ts libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.component.spec.ts
```

Changed files passed to ESLint:

```text
libs/frontend/dashboard/src/lib/services/kpi-delta.ts
libs/frontend/dashboard/src/lib/services/kpi-delta.spec.ts
libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts
libs/frontend/dashboard/src/lib/services/analytics-usage.store.spec.ts
libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.view-model.ts
libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.view-model.spec.ts
libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.component.ts
libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.component.spec.ts
libs/frontend/dashboard/src/lib/components/plan-limits/plan-limits-panel.component.ts
apps/ptah-electron-e2e/src/docs-screenshots/sessions.shot.ts
apps/ptah-electron-e2e/src/docs-screenshots/_harness/shooter.ts
```

## Limitations

No finding remains unimplemented. The spec-project check encounters existing errors in untouched panel fixtures (`key: 'c'`), the skill-selection-card spec's boolean return, and shared BigInt literals under the existing ES2016 spec target. These are outside the seven requested fixes; this report does not claim a clean spec-project typecheck.

Skill discovery/loading is unavailable in this lane (the only skill-related tools author/search harness content, not load skills). Read the local Angular frontend patterns instructions and repository guidance as filesystem fallback.

No live Electron rendering or screenshot inspection was performed: this lane was restricted to focused checks and prohibited build/serve/e2e targets. The Details contents were rendered and asserted under Angular Jest; no browser visual-quality claim is made. The missing projection attribute is a template change; template compilation through `npm run verify` was explicitly prohibited, so it remains a coordinator-level check.
