# Code logic re-review for TASK_2026_2325_899d, batch CR-C

## Verdict: REVISE  Score: 7/10

Both scenarios from the first review are fixed, and all nine previously closed items remain closed. Show all still overcounts when a per-item search exposes the same selectable candidate as a filtered-out card.

## Prior finding closure

Paths in the table are relative to `libs/frontend/onboarding/src/lib/`, except the Electron driver.

| Prior finding | Closed | Evidence |
| --- | --- | --- |
| Moderate 1 / Minor 3 — late saved-list response | Yes | `analyze/analysis-step.store.ts:119` only publishes the latest list response for the current workspace. `analyze/analyze-workspace.page.ts:829` checks the latest request on both success and rejection before touching the error signal or pending selection. Initial, post-run and Retry loads use this same entry point. Workspace reset invalidates data publication, and page destruction blocks page-side commits. Saved-list loads have no busy flag to strand, and Setup clears its own refreshing flag independently of the list. |
| Moderate 2 / Minor 8 — pinned Install card | Yes for the pinned-draft case | `proposal/stack-skill.store.ts:390,453` passes the actual visible rows after draft pinning and the rendered residual candidates. `proposal/stack-coverage.ts:638` now counts the pinned row's Install card. The unscoped All early return and the unpinned rejection/residual behavior still hold. See the remaining Minor 8 visibility case below. |
| CR5 — Stop recovery | Yes | `analyze/analyze-workspace.page.ts:185,269,290,619` retains one Setup card plus the independent read-error alert when applicable. The repair and Retry specs passed. |
| Minor 1 — function mocks | Yes | `apps/ptah-electron-e2e/src/support/ui-driver.ts:148,180,296` still uses the shared function/static lookup for Setup and RPC dispatch. The driver diff is unchanged from the first review. |
| Minor 2 — Skip skills navigation failure | Yes | `analyze/analyze-skills.page.ts:254` still renders the error in the Setup-blocked branch. Its click regression passed. |
| Minor 4 — configured vs. attempted | Yes | `proposal/skill-method-banner.component.ts:122` still distinguishes the two pair records. The skipped and pre-dispatch label assertions passed. |
| Minor 5 — Show all under All | Yes | `proposal/skill-verdict-filter.component.ts:101` still shows the control for positive counts. The integration spec at `proposal/stack-skill-review.component.spec.ts:516` still clears the item filter through the control. |
| Minor 6 — duplicate-name item search | Yes | `proposal/stack-skill-review.component.html:208,560` retains item-ID dispatch in judged review and name-based search for legacy rows. Both duplicate-name click specs passed. |
| Minor 7 — inert legacy manual draft | Yes | `proposal/unmatched-stack-list.component.html:56` still requires an item ID to render the opener. The judged opener and legacy search remain covered. |
| Trivial 1 — badge merge documentation | Yes | `shell/onboarding-run-pill.service.ts:47,123,130` still describes and requires both equal pair and equal status. |
| Trivial 2 — evidence parsing and deduplication | Yes | `proposal/stack-coverage.ts:273` still indexes each recommendation's evidence before mapping rows. The case-insensitive deduplication and failure-precedence test passed. |

## New findings

1. **Moderate — Show all counts a pool candidate already visible in per-item search results.** `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:620`. In the existing two-item fixture, A rejects the only pool candidate and B recommends it for Install. Select A under All, then search for A and return that same skill from the registry. The page stores the result against A (`analyze-skills.page.ts:912`), and the visible row renders a selectable card from `row.manualCandidates` regardless of verdict (`stack-skill-review.component.html:274`). The count reads Install outcomes, registry cards from not-judged rows, and residual cards. It ignores the manual cards even though they use the same canonical selection identity. The user sees “1 more candidate” while the sole candidate is selectable, and adding or clearing that search result never changes the count. Include the manual candidates of each visible row, intersected with the existing canonical pool, and cover the search-result arrival and removal. This is another visibility case in Minor 8. The pinned-draft fix itself works.

## Five logic questions

1. **Silent failure.** An older reply can no longer move the saved list or its error state backward in the reported rerun flow. The remaining count can misreport an already selectable candidate.
2. **Unexpected user action.** Search for the focused item after filtering out the other item's Install card. Returning the same skill should remove the Show all prompt for that candidate.
3. **Wrong data result.** A search result whose canonical identity matches a pool entry must count once among visible pool candidates. Search results outside the pool should leave the count unchanged.
4. **Dependency failure.** A stale list rejection is swallowed by the page sequence check. The newest rejection still displays Retry. Setup readiness remains based on its own settled read or write.
5. **Unspecified interaction.** The finding described a candidate visible through another Install card. The same visibility rule also applies when per-item search or a retained result exposes that candidate.

## Verification Evidence

- Ran the eight changed onboarding Jest specs and the existing Analyze render spec. All nine suites and 148 tests passed. Log at `.ptah/tmp/review-cr-c2-jest.log`.
- The prior-code check was by inspection of the assertions and prior implementation. The deferred success test with the real store (`analyze-workspace.page.spec.ts:264`) and the isolated store test (`analysis-step.store.spec.ts:54`) would publish the old snapshot before the fix. The delayed rejection test (`analyze-workspace.page.spec.ts:363`) would set the stale error. The reset test at `analysis-step.store.spec.ts:80` also passes before the revision because the pre-existing workspace check already invalidated that reply.
- The pinned-draft store and DOM tests (`proposal/stack-coverage.spec.ts:788`, `proposal/stack-skill-review.component.spec.ts:553`) would return one while the draft is pinned before the fix. The DOM test shows the sole card, then closes the draft and verifies that the card disappears and Show all returns.
- Scoped `git diff --check` passed. The Ptah symbol index returned zero hits, so repository search verified the list and hidden-count call sites. The remaining search-card case and the unchanged Electron mock path were checked by tracing source.
- Scoped onboarding TypeScript exited zero. ESLint for all 21 scoped diff paths exited zero with 23 warnings and no errors. Logs at `.ptah/tmp/review-cr-c2-tsc.log` and `.ptah/tmp/review-cr-c2-eslint.log`.
