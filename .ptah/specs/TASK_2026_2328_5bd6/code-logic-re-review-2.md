# Code Logic Re-Review — `TASK_2026_2328_5bd6` (Round 2 of 2)

- **Reviewer role**: `code-logic-reviewer` (independent family `antigravity`; implementer `codex`)
- **Worktree (read-only)**: `/home/amun/ptah-extension/.claude-worktrees/performance-backed-routing`
- **Scope**: Round-2 diff `.ptah/tmp/review/fix-round-2.diff` (commit `bdd714853`, `libs/backend/lane-routing` only) plus full current source of `outcome-figures.ts`, `decision-payload.ts`, `model-refine.ts`, `phase-plan.ts`, `score.ts`, `choice-evidence.ts`, `capability-matrix.store.ts`, `system-one.schema.ts`, and affected spec files.
- **Score**: **8 / 10**
- **Verdict**: **APPROVED**

> **Double-counting & off-mode audit**:
> - **No System One double counting**: In `outcome-figures.ts:70-78`, native-resolved `LANE_DEFAULT_MODEL` runs dual-bucket into `[model, FAMILY_PROFILE_MODEL]` only when `model !== FAMILY_PROFILE_MODEL`, and `ANY_EFFORT` (`'*'`) is added only when `effort !== ANY_EFFORT`. In `model-refine.ts:421-441`, `offeredFigures` emits at most one figure per option and deduplicates by `outcomeFigureLabel`. In `decision-payload.ts:144-164`, each option selects strictly one bucket via nullish coalescing (`exact?.get(taskKind) ?? anyEffort?.get(taskKind) ?? lane?.get(taskKind)` on the live `taskKind !== undefined` path, and `exact ?? anyEffort ?? lane` when `taskKind === undefined`), so an exact bucket and the `'*'` model aggregate are never summed for one option.
> - **Off-mode (`byModelEffort: false`) unchanged**: `outcome-figures.ts:59, 64-67, 81` preserves the legacy `verdict === 'failed'` exclusion predicate, `[laneId, taskKind]` keying, and model/effort-less figure shape. `decision-payload.ts:99-108, 140-163` emits the identical 3-tuple `availableExecutors`, legacy `legend`, and `${laneId}/${taskKind}` `pastOutcomes` via the `lane` group. `score.ts:129` bypasses `scoreChoice` when `input.choice === undefined`. `route-off-golden.spec.ts` and its fixture are untouched (not in `fix-round-2.diff`).
> - **Diagnostics**: Scoped `ptah_get_diagnostics` across all 7 files in `fix-round-2.diff` returned `Errors: 0 | Warnings: 0` (clean coverage).

---

## Status

| ID | Status | Evidence |
| --- | --- | --- |
| New defect 1 (MAJOR — F1 any-effort fallback & `lane-default` dual-bucketing) | **RESOLVED** | `libs/backend/lane-routing/src/lib/matrix/outcome-figures.ts:27-46, 64-85` now mirrors `choice-evidence.ts:255-265`: in `on` mode (`byModelEffort: true`), each run accumulates into `(model, effort)` and (when `effort !== ANY_EFFORT`) `(model, '*')`, native-resolved `LANE_DEFAULT_MODEL` runs also accumulate into `FAMILY_PROFILE_MODEL` (`'*'`), and lookup falls back from `[laneId, taskKind, model, effort]` to `[laneId, taskKind, model, ANY_EFFORT]`. `libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts:144-163` resolves `exact`, `anyEffort`, and `lane` groups and performs per-`taskKind` fallback (`exact?.get(question.taskKind) ?? anyEffort?.get(question.taskKind) ?? lane?.get(question.taskKind)`), which also prevents an exact figure from one phase from masking an any-effort fallback in another phase. Covered at `libs/backend/lane-routing/src/lib/matrix/outcome-figures.spec.ts:123-295`, `libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts:272-302` (aligned to full-model `'*'` aggregate and `'max'` → `'*'` fallback), and `libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts:155-212` (concrete-effort options, `effort: null` pre-v2/`ptah-cli` history, native-resolved `lane-default`, and cross-phase exact-vs-`'*'` isolation). |
| New defect 2 (MINOR — `score.ts:222` inherited family user cell) | **RESOLVED** | `libs/backend/lane-routing/src/lib/ranking/score.ts:222-224` restricts prior-only `user` promotion to explicit overrides owned by that model (`pair.resolved.profileModel === model.id`, matching legacy `promotedModel` at `score.ts:365`) or effort overrides on `fallback` (`model === fallback`), preventing an unprofiled listed challenger from promoting via an inherited `'*'` family `user` cell. Covered at `libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts:229-254` for both the unprofiled challenger rejection and the `fallback` family effort override. |

---

## New defects

None.

- **Scope examined**: All 7 files in `.ptah/tmp/review/fix-round-2.diff` plus surrounding pipeline, matrix, and schema files (`model-refine.ts`, `phase-plan.ts`, `choice-evidence.ts`, `capability-matrix.store.ts`, `local-derivation.ts`, `system-one.schema.ts`, `decision-payload.spec.ts`, `route-off-golden.spec.ts`).
- **Checks run / verified**: Static end-to-end trace of on-mode/off-mode System One payloads, bucketing invariants, and `scoreChoice` promotion rules; scoped `ptah_get_diagnostics` on all 7 changed files (0 errors, 0 warnings); lane report `fix-A2-lane-routing-report.md:20-25` (57 tests in 4 suites including `route-off-golden.spec.ts`, `tsc`, and `eslint` passing).
- **Remaining uncertainty**: This review lane is read-only and did not execute Jest or `npm run verify`. On the legacy direct-caller branch `question.taskKind === undefined` (`decision-payload.ts:149-154`), `exact ?? anyEffort ?? lane` chooses one group rather than merging per task kind, so non-overlapping tasks present only in `anyEffort` would be omitted if a direct caller ever mixes exact and `'*'` figures without `taskKind` (unreachable from live `model-refine.ts:335`, where `LaneQuestion.taskKind` is required).

---

## Verdict rationale

**Verdict: APPROVED (8 / 10).**

- **Why not 5–6 / REVISE**: Both remaining defects from Round 1 (MAJOR **New defect 1 / F1** and MINOR **New defect 2**) are resolved cleanly with focused unit and pipeline regression tests, zero open BLOCKER or MAJOR defects remain, no System One double counting was introduced, and off-mode (`byModelEffort: false`) behavior and golden tests remain intact. Notably, `decision-payload.ts:156-158` improves on the Round 1 sketch by falling back per `taskKind`, avoiding cross-phase masking when one phase has exact-effort history and another phase only has `'*'` history.
- **Why not 9–10**: Four minor items from Round 1 (`F11`, `F12`, `F14`, `F16`) remain deferred as PR follow-ups, the direct-API `taskKind === undefined` branch at `decision-payload.ts:150` does not merge non-overlapping `anyEffort` tasks, and full scoped `npm run verify` across all changed projects in this task branch (including the Round 1 `cli-agent-runtime` suites noted in `code-logic-re-review.md:92`) still needs to be confirmed by the coordinator before merge.
