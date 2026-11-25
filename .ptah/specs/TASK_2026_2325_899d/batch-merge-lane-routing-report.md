# Lane-routing merge resolution

## Files and hunks resolved

D23 is scoped by the merge brief and the coordinator note in `batches.md:87`.

- `decision-model/decision-caller.ts` combines the budget-aware factory and rate admission from `origin/main` with the provider resolved by `openCaller`. The branch's blocked `configuredPair` and `noteLive` outcome shape are preserved.
- `pipeline/model-refine.ts` combines the shared `ModelPair` import with `PrunedCause`, keeps the generic request cause alongside `requestReason` and question and option metadata, and includes both `provider` and `admission` in the System One dispatch. The fixed request retains the comment and behavior for uncapped questions, the size check, and the signal overloads. Fixed System One requests pass both admission metrics and provider submission details.
- `pipeline/model-call.ts` combines the minimum timeout and model pair imports. The generic `emptyOutcome` carries the admission reason. System One retains rate admission, timeout capping, release, and token measurement, and checks the caller signal after admission before reporting the pair immediately before `decide`. Structured dispatch retains token logging, the combined abort signal, and provider submission reporting.
- `pipeline/model-call.spec.ts` keeps the prefill store import and both sides' tests. The branch's direct System One call uses the separate submission argument. The budget boundary test now checks callback suppression and ordering, and a new case checks that cancellation after admission releases the reserved target without reporting a submission.

## Checks

- `rg -n '^<<<<<<<|^>>>>>>>|^=======$' libs/backend/lane-routing/src` returned no matches.
- `git diff --check` scoped to the four paths passed. Reviewed the working-tree resolutions against both merge stages.
- Ptah diagnostics scoped to the four paths reported zero errors and warnings.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json` passed.
- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.spec.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts` passed all 51 tests across four suites.
- `npx eslint libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.ts libs/backend/lane-routing/src/lib/pipeline/model-call.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts` passed.

## Decisions

- Kept metrics in the fifth System One argument and added submission as the sixth. A combined options object would require changing all metrics callers. The existing lane path and main-side specs already use the fifth argument for metrics. This is reversible within lane-routing.
- Kept the request size check ahead of caller cancellation and checked the caller signal again after admission. Moving cancellation ahead of size validation or admission would change fallback precedence. The merge brief specifies both check positions, and the new regression test verifies release after admission. The ordering can be changed locally if that contract changes.
- Kept the narrow `FallbackCause` result for callers without a caller signal. Widening all callers would change the routing contract. The branch overloads and main's fallback consumers support the narrow default. This is reversible within lane-routing with corresponding consumer changes.

## Open items

The coordinator owns independent review, staging, and completion of the in-progress merge. All four working-tree resolutions are ready for that handoff.

## Extra reads

- Repository `CLAUDE.md` for the scoped check rules and `batches.md` for the D23 coordinator note.
- Shared RPC declarations for `ModelPair` and `DECISION_MODEL_TIMEOUT_MIN_MS` via targeted symbol text matches.
- `ptah_search_files` returned zero hits for the task batch and handoff pattern. A native `rg --files` fallback located `batches.md` and found no handoff stub.
