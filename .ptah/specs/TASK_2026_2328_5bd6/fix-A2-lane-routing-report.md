# Batch A round 2 lane-routing report

Paths below are relative to `libs/backend/lane-routing/src/lib/`.

## System One outcome figures

- Confirmed. Before the fix, `matrix/outcome-figures.ts:41–61` built only exact buckets and `decision-model/decision-payload.ts:144–158` could only match the exact effort or a lane aggregate. `pipeline/model-refine.ts:431–437` already passed the concrete option effort and preserved the returned figure label. `matrix/choice-evidence.ts:255–265` showed the existing model and lane-default grouping rules.
- `matrix/outcome-figures.ts:64–85` now records each eligible run once per applicable bucket in on mode. Concrete effort lookups prefer exact figures, then the model aggregate. Native-resolved lane-default rows also contribute to the lane-default model bucket.
- `decision-model/decision-payload.ts:144–162` selects figures in exact, any-effort, then lane order. For a named task kind, the fallback happens within that task so an exact figure from another phase cannot hide it.
- `matrix/outcome-figures.spec.ts:123–294` covers exact precedence, effort-null rows, cross-effort totals, native lane defaults, and deduplication. `pipeline/model-refine.spec.ts:155–211` exercises concrete-effort System One requests with native-resolved defaults, effort-null history and an exact bucket for a different task. It checks per-option counts when exact and aggregate figures are both present.

## Prior-only user promotion

- Confirmed. Before the fix, `ranking/score.ts:222` treated all user priors as promotion candidates. `matrix/capability-matrix.store.ts:485–508` and `:520–528` show that an unprofiled model can inherit the family profile and its user value.
- `ranking/score.ts:222–224` now requires a model-specific user profile for a prior-only challenger. The fallback can still use family effort overrides.
- `ranking/score-choice.spec.ts:212–254` covers a configured model with score 40 against an unprofiled challenger inheriting 80, retains coverage for explicit challenger overrides, and checks that the fallback can still use a family effort override.

## Checks

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/matrix/outcome-figures.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts` passed. 57 tests in 4 suites, including the unchanged OFF-mode golden test and fixture. Before the fixes, 7 regression assertions failed and the golden suite passed.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` passed with exit 0.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json` passed with exit 0.
- `npx eslint libs/backend/lane-routing/src/lib/matrix/outcome-figures.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts libs/backend/lane-routing/src/lib/ranking/score.ts libs/backend/lane-routing/src/lib/matrix/outcome-figures.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts` passed with exit 0 and no warnings.

- Scoped `ptah_get_diagnostics` passed with zero errors and warnings across the six changed source and spec files.

## Decisions

- Select one figure per option and task, with exact effort taking precedence. Combining the exact and model-aggregate figures would recount the exact runs. The selection follows the choice evidence buckets in `matrix/choice-evidence.ts:255–265` and can be changed locally if the payload contract changes.
- For questions without a task kind, retain the existing single-group behavior and extend its precedence to include the any-effort group. The live lane pipeline supplies the task kind at `pipeline/model-refine.ts:335`.
- Preserve family user priors for the fallback's effort selection, while requiring ownership of the user cell for another model's prior-only promotion. The existing legacy promotion guard at `ranking/score.ts:365` already requires an exact profile. The change is local to the on-mode scorer.

The coordinator owns broader verification and integration. The lane host listed the orchestration skill but exposed no skill-loading tool.
