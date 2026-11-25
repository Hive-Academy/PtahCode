# CR-C final code logic re-review — TASK_2026_2325_899d

## Verdict: APPROVED  Score: 8/10

The remaining Moderate finding is closed. The store and component tests exercise the change from search-result state through the rendered card and Show all control. That evidence supports approval for this batch. Confidence is highest from the store onward because the new regression tests inject registry results at the store boundary.

## Closure table

Source paths are relative to `libs/frontend/onboarding/src/lib/`.

| Item | Status | Evidence |
| --- | --- | --- |
| Moderate, matching per-item result | Closed | With A selected under All, A rejecting the sole candidate and B recommending Install, A's matching search result renders one card, lowers the count from 1 to 0, and hides Show all. `proposal/stack-skill-review.component.spec.ts:623`, `proposal/stack-skill-review.component.spec.ts:683`. |
| Result outside the pool | Confirmed | The outside-pool card renders and the count remains 1. The visibility set admits only identities in the canonical pool. `proposal/stack-skill-review.component.spec.ts:676`, `proposal/stack-coverage.ts:629`. |
| Clearing the search result | Confirmed | Clearing A's unselected result removes its card, restores count 1, and brings back Show all. `proposal/stack-skill-review.component.spec.ts:690`. |
| Canonical identity | Confirmed | Both the pool ID and the result's `source/skillId` pass through the same trim and lowercase function. The store fixture returns `ACME/REPO/ONE` for the lowercase pool ID and asserts zero. `proposal/stack-coverage.ts:167`, `proposal/stack-coverage.ts:629`, `proposal/stack-coverage.spec.ts:910`. |
| Pinned draft row | Remains closed | B's pinned row keeps the Install card visible under All with count 0. Closing the draft restores count 1. The store spec also verifies count 1 when Build hides Install while B stays pinned. `proposal/stack-skill-review.component.spec.ts:599`, `proposal/stack-coverage.spec.ts:836`. |
| Minor 8 base case | Remains closed | Unscoped All has count 0. Selecting A hides B's Install card and yields 1. A separate card still visible under Other candidates leaves that count at 1. `proposal/stack-coverage.spec.ts:720`, `proposal/stack-coverage.spec.ts:767`. |
| Trivial 2 | Remains closed | The evidence index calls the parser once per recommendation and deduplicates by canonical candidate ID. The test confirms multi-item evidence, case-insensitive deduplication, and precedence for covered items with a recorded search failure. `proposal/stack-coverage.ts:274`, `proposal/stack-coverage.spec.ts:322`. |

## New findings

None in the CR-C proposal diff under review.

## Five logic questions

1. **Silent failure.** A missing or duplicate visibility entry could make Show all give a plausible but incorrect number. The count now uses the same visible rows as the template and counts each matching pool identity once. `proposal/stack-skill.store.ts:453`, `proposal/stack-skill-review.component.html:214`, `proposal/stack-coverage.ts:629`.
2. **Unexpected user action.** Searching on A while B is filtered out now removes the prompt when the matching card appears. Clearing the unselected result restores the prompt. `proposal/stack-skill-review.component.spec.ts:683`.
3. **Wrong answer from valid input.** An outside-pool result leaves the count unchanged. A case variant of an in-pool result reduces it. Multiple visible cards with the same identity contribute one set entry. `proposal/stack-coverage.spec.ts:906`, `proposal/stack-coverage.ts:632`.
4. **Dependency failure.** An RPC error follows the existing error path and leaves the previously published results in place. A superseded response exits before publishing. The count continues to reflect the cards that remain visible. This path was traced by inspection. `analyze/analyze-skills.page.ts:912`.
5. **Unspecified interaction.** Retained per-item results and current results share the same render list. If a retained card stays visible after the current results are cleared, it still contributes its canonical ID. `proposal/stack-coverage.ts:528`, `proposal/stack-coverage.ts:658`, `proposal/stack-skill.store.ts:547`.

## Verification Evidence

- Focused Jest run passed all 51 tests across `stack-coverage.spec.ts`, `stack-skill-review.component.spec.ts`, and `skill-verdict-filter.component.spec.ts`. Log is `.ptah/tmp/review-cr-c-rereview2-jest.log`.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` exited 0. Log is `.ptah/tmp/review-cr-c-rereview2-tsc.log`.
- ESLint on the three round-two TypeScript files exited 0 under the verify lock. Log is `.ptah/tmp/review-cr-c-rereview2-eslint.log`.
- `git diff --check -- libs/frontend/onboarding/src/lib/proposal` exited 0.
- Ptah workspace and AST checks identified the relevant paths. Ptah file search returned zero results for the task folder, so `rg` located the review inputs. The scope was the proposal diff and the supporting search publication path. Electron and live registry execution were outside this focused review.
