# Batch A lane-routing review fixes

Paths in the finding entries are relative to `libs/backend/lane-routing/src/lib/` unless fully qualified.

## F1

- **Confirmed yes.** `matrix/capability-matrix.store.ts:234` enables choice figures, and `matrix/outcome-figures.ts:59` indexes those figures by lane, task kind, model, and effort. Before the fix, the lookup in `pipeline/model-refine.ts:432` omitted the model and effort. Both request renderers also grouped results by lane and task kind alone.
- `pipeline/phase-plan.ts:333` and `:753` carry effort on on-mode alternate and primary options. `pipeline/model-refine.ts:431` looks up the offered choice and deduplicates by the returned figure's identity. `decision-model/decision-payload.ts:86` and `:142` key figures and sample counts by choice and identify option effort. `decision-model/system-one.schema.ts:71` accepts the corresponding executor tuple.
- `pipeline/model-refine.spec.ts:154` uses the real figure index and tests distinct figures for two efforts of one model, an alternate model, and a lane-default bucket. It also validates the wire schema. `pipeline/route-choice.spec.ts:221` checks that the route planner carries the selected effort into its decision question.

## F3

- **Confirmed yes.** `pipeline/assemble-gate.ts:628` computes list membership for native and fallback lists. The warning in `reasons/compile-reasons.ts:638` previously depended only on membership.
- The warning now follows the explicit `not-in-native-list` disposition. `pipeline/route-choice.spec.ts:186` proves an off-mode fallback list can omit the requested effort without triggering that warning. The adjacent native-list case still expects the warning.

## F4

- **Confirmed yes.** Before the fix, `pipeline/gather.ts:514–528` called `refreshIfDue` and then requested a refresh even when the catalog had suppressed a retry after a recent failure.
- `catalog/lane-catalog.types.ts:34` supplies one due check for `catalog/lane-catalog.store.ts:42` and `pipeline/gather.ts:517`. Gather uses the saved failure status during backoff and waits within budget for a due first-success refresh.
- `pipeline/route-choice.spec.ts:232` proves a recent failed snapshot causes no refresh and retains the error reason and lane-default eligibility. The surrounding tests cover a never-read lane and its timeout. The catalog-store test covers the retry boundary.

## F5

- **Confirmed yes.** `ranking/score.ts:222` previously skipped every prior-only pair. Its legacy promotion path also rebuilt the model without the listing's effort support metadata.
- `ranking/score.ts:222–238` admits user-scored prior pairs under the existing closeness rule and carries listing effort support through legacy promotion. The fallback remains available when there is no local evidence and the baseline still leads.
- `ranking/score-choice.spec.ts:212` exercises an unsampled system CLI model/effort with an explicit user score. The legacy fallback's metadata is internal and has no separate public assertion.

## F6

- **Confirmed yes.** Before the fix, `matrix/capability-matrix.store.ts:557` and `matrix/local-derivation.ts:306` selected an effort profile before checking the task cell. An unknown cell in that profile masked a model-wide value.
- Both lookups now fall back at the task-cell level. `matrix/capability-matrix.store.spec.ts:443` covers user profile fallback. `matrix/choice-evidence.spec.ts:188` covers the seed fallback in the local blend.

## M1

- **Confirmed yes.** `matrix/local-derivation.ts:49–55` defines caller stops as rate-ineligible. Choice evidence previously put any non-capacity run in its scoring array. The reducer already excluded a stopped failed run, but a stopped row with a recorded deliverable still contributed to the delivery rate through `matrix/local-derivation.ts:200–205`.
- `matrix/choice-evidence.ts:209` uses `isExcludedFromRates` for scoring. `matrix/choice-evidence.ts:129–143` counts a caller stop as spawned, completed, and unverified.
- `matrix/choice-evidence.spec.ts:152` covers a failed stop and a stop with recorded delivery/review. It checks exact-effort and model-wide scoring and funnel counts.

## Checks

Unavailable — `ptah_get_diagnostics({ files: <absolute paths of the 17 changed source and spec files listed in the ESLint command below> })` reported its 45-second TypeScript worker timeout on both attempts. The native library and spec typechecks below passed.

PASS — 429 tests in 18 suites, including the unchanged OFF-mode golden.

```sh
npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.spec.ts libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts libs/backend/lane-routing/src/lib/pipeline/live-model-options.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/decision-model/system-one.client.spec.ts libs/backend/lane-routing/src/lib/catalog/lane-catalog.store.spec.ts libs/backend/lane-routing/src/lib/evidence/routing-evidence.service.spec.ts libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-deadline.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts libs/backend/lane-routing/src/lib/ranking/score.spec.ts libs/backend/lane-routing/src/lib/matrix/local-derivation.spec.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts
```

PASS — library typecheck.

```sh
npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json
```

PASS — spec typecheck.

```sh
npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json
```

PASS — 0 errors. Two existing `max-lines` warnings in `pipeline/gather.ts` and `reasons/compile-reasons.ts`.

```sh
npx eslint libs/backend/lane-routing/src/lib/catalog/lane-catalog.store.ts libs/backend/lane-routing/src/lib/catalog/lane-catalog.types.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts libs/backend/lane-routing/src/lib/decision-model/system-one.schema.ts libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.ts libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts libs/backend/lane-routing/src/lib/matrix/local-derivation.ts libs/backend/lane-routing/src/lib/pipeline/gather.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts libs/backend/lane-routing/src/lib/ranking/score.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.spec.ts libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts
```

Expected pre-fix failure — reproduced F3, F4, F5, both F6 paths, M1, and planner effort propagation. The new F1 request assertion initially hit a TypeScript index-signature error.

```sh
npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.spec.ts libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts
```

Expected pre-fix failure — System One received zero choice figures after correcting the test's index access.

```sh
npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts
```

## Decisions

- F1 uses exact choice figures for the offered effort. The lane-default and automatic model IDs resolve through the existing family bucket. The compact request keeps its original three-field tuples and lane/task keys for off-mode callers. An alternate option carries the phase policy effort that the route would use if that option won.
- F4 shares the catalog due policy between background refresh and the budgeted first-success read. An alternative was to make the refresher return a promise and change its interface. The shared predicate keeps the interface and deadline behavior intact.
- M1 treats caller stops as unverified in the historical funnel. The shared outcome contract excludes caller stops from failure tallies (`libs/shared/src/lib/types/lane-outcome.types.ts:51–57`), while the shared funnel reserves capacity drops for capacity failures and defines completed as spawned minus those drops (`libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts:5–15`). Counting stopped runs as unverified preserves both funnel identities with the existing response shape. A dedicated stop count would require a shared contract change. This classification is reversible within lane routing.

## Not done

Coordinator-owned verification and independent review remain outside this lane. The off-mode golden spec and fixture were left as supplied.
