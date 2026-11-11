# Batch R1 report

## Files changed

- `ranking/score.ts` - restrict system CLI promotion to reported catalog rows.
- `ranking/score.spec.ts` - pin the new system CLI rule and unchanged Ptah CLI fallback behavior.
- `routing-constants.ts` - add the two alternate limit and invariant.
- `pipeline/phase-plan.ts` - generate reported alternates after primary options and retain their matrix scores for selection.
- `pipeline/phase-plan.spec.ts` - cover ordering, cap, sendability, valid alternate, and invalid answer fallback.
- `pipeline/phase-resolve.ts` - ask based on option count and carry a chosen alternate's scored model.
- `pipeline/assemble-gate.ts` - use the chosen model, score, cell, and provenance in the reason and roster.

## Decisions

| Decision | Options | Evidence |
| --- | --- | --- |
| Keep alternates separate from ranked lanes | Duplicate ranked rows or separate option records | `spread`, reviewer constraints, and roster resolution operate on unique lane candidates; separate options preserve those rules. |
| Retain the alternate's resolved matrix cell in the phase plan | Re-resolve during assembly or carry score through resolution | Assembly has no matrix; carrying `CandidateScore` keeps reason score and cell consistent with the chosen id. |
| Leave `decision-payload.ts` unchanged | Add model rows to `availableExecutors` or use existing criteria labels | The map is keyed by lane id and intentionally keeps first appearance; `oN` criteria identify each offered model. Pinned fields are unchanged. |
| Keep the existing option width and request limits | Expand provider width or let shrinking drop alternates | Primary options are first, so existing slicing drops alternates before lanes. |

## Pinned expectations changed

- `ranking/score.spec.ts`: the former highest fallback row for a system CLI is now skipped, so the highest reported row wins (R1 item 1).
- No other pinned expectation was changed.

## Verification

- Ran exactly once: `npm run verify -- -p @ptah-extension/lane-routing | Select-Object -Last 60` (PowerShell equivalent of `tail -60`). Exit code 1. Nx reported one successful task and a failed `lane-routing:typecheck`; its saved log named two TS18048 errors in `phase-resolve.ts` at line 76.
- Fixed the undefined option guard. Scoped `ptah_get_diagnostics` then reported zero TypeScript errors, including the changed spec. The verifier was not rerun, so a green test result is unconfirmed.
- The acceptance cases for timeout/no decision model byte identity and implementer/reviewer hard constraints were not added as explicit new tests; the code keeps the existing ranking fallback and lane-based constraint paths.

## Extra files read

- `.ptah/specs/TASK_2026_896_9339/implementation-plan.md` (R1, scope items 1-2, acceptance)
- `.claude/skills/nestjs-backend-patterns/SKILL.md`
- `ranking/candidate.types.ts`, `pipeline/gather.ts`, `pipeline/model-refine.ts`, `pipeline/answer-validation.ts`, `decision-model/decision-payload.ts`, `reasons/compile-reasons.ts`, and existing score/phase-plan specs.

## Round 2

### Tests added

1. `ranking/score.spec.ts` checks that Claude still promotes a fallback row. `pipeline/live-model-options.spec.ts` checks that Claude and Ptah CLI get no alternates.
2. `pipeline/live-model-options.spec.ts` checks ranking mode, unsent request, timeout cause, invalid label, and valid primary label. Each resolution has no `selectedScore`; each assembled row keeps the primary model and provenance.
3. The same spec checks that a valid alternate label assembles the exact reported model id and alternate score, and that the reason names the model.
4. The same spec plans implement and review phases and checks reviewer-family exclusion after primary and alternate choices of the implementer lane.
5. The same spec checks that both primaries precede alternates and remain when option width is sliced to two.
6. The same spec checks that an alternate outside the top score band is not offered.

### Defect found

No production defect was found. The first verify run found an invalid test fixture: an unknown matrix cell carried score 70, but unknown cells must score 50. The fixture now uses a value cell. No production code was changed in Round 2. The coordinator's `isSystemCliLane` helper and its use in scoring and alternate generation were retained.

### Verification

`npm run verify -- -p @ptah-extension/lane-routing 2>&1 | Select-Object -Last 60; exit $LASTEXITCODE`

- First run: exit 1, lint and typecheck passed, tests failed on the fixture invariant (7 failures in the new suite).
- Second run after fixing the fixture: exit 0. Nx lint and typecheck: 2 tasks succeeded. Nx test: 1 task succeeded. No remaining known verification failure.
## Round 3 (review fixes)

- A - `ranking/score.ts`: system CLI rows now use configured or lane-default scoring; reported ids require a valid model choice. `ranking/score.spec.ts` pins the default family cell.
- B - `pipeline/phase-plan.ts`: reported alternates are deduplicated, scored, band filtered, sorted by score with catalog-order ties, then capped. `pipeline/phase-plan.spec.ts` covers order and band-before-cap; `pipeline/live-model-options.spec.ts` pins the selected alternate row.
- C - `pipeline/model-refine.ts`, `pipeline/model-call.ts`, `route-decide.service.ts`: track primary counts, retry all phases without alternates before reducing width, omit unsendable phases, keep offered options aligned with the payload, and prioritize phases with two primaries. `pipeline/model-refine.spec.ts` covers the byte-cap path.
- D - `pipeline/phase-resolve.ts`: one-primary phases fall back with null cause and proposal for blocked, limited, unsent, timeout and invalid answers. `pipeline/phase-plan.spec.ts` covers these cases.
- E - Updated pinned expectations in `ranking/score.spec.ts` (promotion and tie tests now use Ptah CLI; system CLI uses the family cell) and `pipeline/live-model-options.spec.ts` (the higher-scoring alternate is selected first). The existing Cursor fallback-only planning behavior remains covered by the routing specs.

Verification: `npm run verify -- -p @ptah-extension/lane-routing` exited 0. Nx lint and typecheck: 2 tasks succeeded. Nx test: 1 task succeeded. The first run failed on stale expectations and a test TypeScript access; those were corrected before the green rerun.
