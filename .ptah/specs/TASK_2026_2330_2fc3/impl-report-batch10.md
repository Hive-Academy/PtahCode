# Batch 10 implementation report

## Changed files

- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts`

## Acceptance

| Requirement | Implementation and evidence |
| --- | --- |
| Reopen a persisted review with zero new recommendation calls | `analyze-skills.page.ts:595` resolves Setup record links by analysis run ID. `analyze-skills.page.ts:653` reads the saved review and applies it before the model preflight path for a fresh review. `analyze-skills.page.spec.ts:400` verifies the saved result, an explicitly empty selection, and zero recommendation calls. |
| Attach to an in-flight review | `analyze-skills.page.ts:664` joins `SetupRunStore.reviewSkills` for the existing running record. `analyze-skills.page.ts:752` attaches the view and `analyze-skills.page.ts:763` releases it when leaving. `analyze-skills.page.spec.ts:441` verifies that two views use the same record and held promise. |
| Replace the review only after successful Review again | `analyze-skills.page.ts:908` requests a forced review through SetupRunStore and applies the replacement only after a successful result. `analyze-skills.page.ts:922` preserves the current review when the backend returns a warning-only response that it does not persist. `analyze-skills.page.spec.ts:469` covers a rejected request, a warning-only response, and a successful replacement. The backend owns the successful overwrite of `skill-review.json`. |
| Save the selection on the review record | `analyze-skills.page.ts:566` observes selection changes and `analyze-skills.page.ts:767` writes changed keys through `SetupRunStore.setSelection`. The page also flushes edits when releasing the record. `stack-skill.store.ts:659` restores saved keys, including manual selections and an empty selection. Covered at `analyze-skills.page.spec.ts:400` and `stack-skill.store.spec.ts:73`. |
| Continue to guidance through SetupRunStore | `analyze-skills.page.ts:1283` starts or reuses the project-guidance record. The review is completed at `analyze-skills.page.ts:1296` and the record's target supplies the navigation at `analyze-skills.page.ts:1301`. The tab dependency and pending tab state are removed. Install, skip, duplicate clicks, and navigation retry are covered in `analyze-skills.page.spec.ts`. |
| Match the harness RPC shape | `onboarding-analyze.fixtures.ts:358` supplies the typed `wizard:get-skill-review` response with `review` and `reviewedAt` both null for the fresh-review fixture. |

## Checks

| Check | Result | Log |
| --- | --- | --- |
| Focused onboarding Jest | 2 suites passed, 52 tests passed, 0 failed | `.ptah/tmp/batch10-jest.log` |
| Onboarding library TypeScript | Exit 0, 0 errors | `.ptah/tmp/batch10-tsc.log` |
| ESLint on 5 changed files | Exit 0, 0 errors, 2 max-lines warnings. Both files already exceeded the line limit. | `.ptah/tmp/batch10-eslint.log` |
| Ptah diagnostics on 5 changed files | 0 diagnostics in changed files. The compiler additionally reported 20 errors in sibling files outside the write set. | `.ptah/tmp/batch10-ptah-diagnostics.log` |

## Template and callers

The batch changes page and store logic. Template edits total zero. The Jest suites render the page. Electron screenshots and e2e runs total zero.

- `onboarding.routes.ts` registers `AnalyzeSkillsPage`. `onboarding.routes.spec.ts` stubs it.
- `team-builder-start.page.ts` and its spec use `StackSkillStore`. The optional selection input preserves existing callers' default selection behavior. `stack-skill-review.component.ts` consumes the store, and `stack-coverage.spec.ts` and `stack-skill-review.component.spec.ts` exercise its existing API.
- `project-guidance.page.ts` receives the project-guidance record ID through the route query.
- `onboarding-analyze-visual.e2e.spec.ts`, `onboarding-generate.fixtures.ts`, and `onboarding-proposal.fixtures.ts` import the harness fixture module.

## Decisions

- Preserve the setup-model preflight on fresh review and explicit retry. The page can show a persisted review or join a running one independently of model availability. Using the combined store API alone on first entry would also start judging on a miss, before preflight. The page's initial lookup preserves that gate, and the store rechecks a miss before starting judged work. Reversible.
- Resolve Setup record links with the recorded analysis run ID. The step table supplies that ID and the saved-analysis loader expects a directory slug. The existing slug and generation-resume entry points remain available. Reversible.
- Keep one live skill review per workspace. When the user moves to a different analysis, a prior selection awaiting input becomes interrupted with its choices intact. A prior review still running keeps its record and promise. This follows the one-live-run rule while allowing users to return to a saved selection. Reversible.

## Clarifications Needed

None.

## Revise round 1

Only `analyze-skills.page.ts` and `analyze-skills.page.spec.ts` changed in this round.

| Review defect | Fix and evidence |
| --- | --- |
| Degradation audit flagged two reported catches | Added the `reported` marker inside the catches at `analyze-skills.page.ts:689` and `:907`. The existing outer catch received the same marker at `:938`, as suggested by the review. Existing behavior is covered by “ANALYSIS_LOAD_FAILED and SKILLS_RECOMMEND_FAILED open loadError panel with Try again and Back” at `analyze-skills.page.spec.ts:1925` and “retains the saved review and selection when Review again fails and resets them on success” at `:566`. |
| Routed Continue lost the analysis and review parent | `continueToGuidance` uses `loadedRunId()` at `analyze-skills.page.ts:1280` and converts an empty ID to `null`. “continues from a routed review with its analysis and completes the parent record” at `analyze-skills.page.spec.ts:445` clicks Continue and verifies the guidance record, navigation target, and completed parent. |
| Routed Review again was unavailable | Both `canRetry` at `analyze-skills.page.ts:476` and `retry` at `:1044` use the routed-aware ID. “enables and runs Review again from a routed review” at `analyze-skills.page.spec.ts:472` clicks the enabled button and verifies a forced review on the same record. |
| Another running review could be missed and the error implied an immediate retry | `attachReview` checks for a running review before interrupting any awaiting-input records and tells the user to wait at `analyze-skills.page.ts:719`. “leaves a waiting selection alone when another review is still running” at `analyze-skills.page.spec.ts:515` puts the waiting record first and verifies both records and the message. |
| The interruption decision lacked coverage | “keeps the prior selection when opening a different analysis interrupts it” at `analyze-skills.page.spec.ts:493` verifies the prior record becomes interrupted with its saved selection intact while the new analysis receives its own review. |

| Check | Result | Log |
| --- | --- | --- |
| Focused onboarding Jest | 2 suites passed, 56 tests passed | `.ptah/tmp/b10r1-jest.log` |
| Onboarding library TypeScript | Exit 0, 0 errors | `.ptah/tmp/b10r1-tsc.log` |
| ESLint on the five Batch 10 files | Exit 0, 0 errors, 2 existing max-lines warnings | `.ptah/tmp/b10r1-eslint.log` |
| Degradation audit filtered for onboarding and TOTAL | Exit 0, no onboarding sites, TOTAL 0 unsuppressed sites | `.ptah/tmp/b10r1-audit.log` |
| Ptah diagnostics on the two revised files | 0 diagnostics in the revised files, 14 errors in sibling files outside the write set | `.ptah/tmp/b10r1-ptah-diagnostics.log` |
