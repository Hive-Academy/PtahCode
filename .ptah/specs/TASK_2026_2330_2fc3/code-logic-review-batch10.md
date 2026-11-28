# Batch 10 code-logic review — persisted skill review in the skills page

## Re-review round 1

Score: **9/10** — Verdict: **APPROVED**

Round 1 changed only `analyze-skills.page.ts` and `analyze-skills.page.spec.ts`, as the
implementer reported. Every round-0 defect is fixed at the cited site, each fix has a spec
that fails without it, and the degradation audit is back at the baseline of 0.

### Status of round-0 defects

| # | Round-0 defect | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Degradation audit fails CI (2 flagged catches) | Fixed | Honest `reported` markers at `analyze-skills.page.ts:689` and `:907` sit in each catch's leading comment lines (`check-degradation.ts:33-42`, `:106`); both catches still route the non-stale error to `applyReviewFailure` (`:691`, `:909`), which maps the code to a user-visible error or setup block — the `reported` kind is correct, `optional-capability` would not be. The pre-existing outer catch also received the marker (`:938`) and its claim is accurate (`applyLoadFailure` at `:940`). The `:809` marker already exists on `main` (line 637) and is not part of this round. Audit: exit 0, `TOTAL 0 unsuppressed site(s)` (`.ptah/tmp/b10-rr1-audit.log`) |
| 2 | `continueToGuidance` loses the analysis in the routed view | Fixed | `analyze-skills.page.ts:1280` reads `this.loadedRunId() || null`; the guidance record gets `parentId: parent?.id` and `analysisRunId: runId` (`:1287-1288`), and the skill-review record is reported `completed` (`:1293-1300`). Spec `analyze-skills.page.spec.ts:445` seeds the routed view with `loaded.set(null)`, clicks Continue, and asserts `analysisRunId: 'run-1'`, `parentId: record.id`, `status: 'completed'` and the navigation query `analysis: 'run-1'`. Without the fix `runId` is null in that view, so this spec fails — it is not a tautology |
| 3 | "Review again" unreachable in the routed view | Fixed | `canRetry` (`:476-478`) and `retry` (`:1044-1046`) both use `loadedRunId()`. Spec `:472` asserts the button is enabled and that `reviewSkills` is called with `{ force: true }` on the same record; on the old code `canRetry` was false and the assertion on `disabled` fails |
| 4 | `attachReview` inspects only the first other live review; copy misleads | Fixed | `analyze-skills.page.ts:723-728` now checks for any `running` other review first and shows "Another skill review is running. Wait for it to finish before opening this review." before the `needs-input` loop (`:729-734`). Spec `:515` orders the needs-input record first in the store and asserts the waiting record keeps `needs-input` with its selection, the running record stays `running`, and the wait message shows — on the old code the waiting record became `interrupted` and the copy said "Try again", so this spec fails |
| 5 | No specs for the routed continue/retry and the interruption decision | Fixed | Four new specs: routed Continue (`:445`), routed Review again (`:472`), interruption decision (`:493`), running-other-review refusal (`:515`). The interruption spec pins the decision (`interrupted` with the saved selection intact) rather than regressing a fix, which is what defect 5 asked for |

### New defects

None. Checks I ran additionally: the stale-version guards still wrap every await in the
revised paths (`:660`, `:690`, `:708`, `:808`, `:912`, `:943`); `continueToGuidance` resets
`leavingState` in `finally` on every early return (`:1276-1319`); when `attachReview` refuses
inside `continueToGuidance` because another review runs, the wait message is shown and the
page state is left consistent (`:1281-1282`).

Two observations, not defects:

- When Continue is refused because another review runs, the wait message renders through
  `applyLoadFailure`, so it appears in the load-error panel style. The text is accurate; the
  placement is cosmetic.
- The extra marker at `:938` documents an unflagged site. The audit ignores markers on
  unflagged catches, so this is harmless and improves the record.

### Checks run (logs in `.ptah/tmp/b10-rr1-*`)

| Check | Command | Result |
| --- | --- | --- |
| Onboarding Jest (both changed specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath …` | 2 suites, 56 tests passed |
| Onboarding TypeScript | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | Exit 0 |
| ESLint on the 5 changed files | `npx eslint <files>` | Exit 0; the 2 pre-existing `max-lines` warnings remain |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | Exit 0, `TOTAL 0 unsuppressed site(s)` |

Why 9 and not 10: the fixes and their evidence are exemplary, but the continue-path refusal
reuses the load-error panel for a non-load condition, and the interruption spec validates the
decision without discriminating old from new behaviour.

---

Review family: ollama-cloud (implementer: codex)
Scope: `git diff -- libs/frontend/onboarding libs/frontend/webview-e2e-harness`
Files reviewed: `analyze-skills.page.ts` (+spec), `stack-skill.store.ts` (+spec),
`onboarding-analyze.fixtures.ts`. `setup-run.store.ts` read for contracts only (another lane
edits it).

## Score: 6/10 — Verdict: REVISE

The store delegation is sound and the specs assert real behaviour. The persisted-revisit view
that this batch adds cannot complete its own two actions: "Continue to guidance" starts a
guidance record with no analysis link, and "Review again" stays disabled. CI is red on the
degradation audit. Evidence separating the bands: no Blocker-class logic failure (races,
stale promises and lost selections are genuinely handled), but two Major defects, one of which
fails CI.

## Five logic questions

1. **How the code fails, not whether it runs.** The revisit path holds its main promise
   (zero recommendation calls), but the same entry point leaves the page's `runId` source split
   in two: `loadedRunId()` (new, routed-aware) in `enterReview`, `attachReview`, selection
   save and `confirmDirtyDraftAction`, versus `analysis.loaded()` (old) in `continueToGuidance`,
   `retry` and `canRetry`. In the routed view the second source is empty, so the page's
   downstream actions silently degrade (defects 2, 3).
2. **Races.** Leaving during a review: `destroyRef.onDestroy` and the identity effect call
   `releaseReview()`; the record, promise and status stay in the root store and a revisit
   re-attaches (`analyze-skills.page.ts:758-765`, `setup-run.store.ts:611-653`, spec
   "attaches a new page"). Duplicate clicks: `reviewSkills` dedupes on the in-flight map and
   `reviewSkills(id, {force})` re-joins the same promise; `retry()` also gates on
   `selectionBusy()`. Stale promises: every await is followed by a
   `version !== this.version || destroyRef.destroyed` guard, including both catch blocks
   (`:666, :698, :910, :914`). Workspace switch: `loadedRunId` re-checks
   `routedReview.workspaceRoot` against the live workspace config, and `AnalysisStepStore.
   resetForWorkspace()` clears the fallback, so no cross-workspace review opens. No race found.
3. **Silent failures.** `applyReviewFailure` maps `WizardRpcError.code` to the user error
   state and the setup block; `reviewSkills` rejects with that code
   (`setup-run.store.ts:609, 636-649`). The two flagged catches do report to the user; they
   fail only the audit marker requirement (defect 1). Warning-only responses keep the prior
   result and selection (`:919-927`, spec 3). Selection edits flush on every toggle
   (effect `:561-566`), on record switch and on destroy (`:750-754, :758-765`) — not lost.
4. **One live skill review per workspace.** Interrupting a prior awaiting-input review marks
   it `interrupted` and `markSeen`s it but leaves `selection` on the record; a revisit of that
   analysis restores status to `needs-input` and re-applies the saved selection
   (`:686-695`, `:734-737`). No data is lost. Two smaller gaps: order-dependent handling of
   multiple live reviews (defect 4) and no page spec for this decision (defect 5).
5. **Requirements vs implementation.** The acceptance items hold mechanically (table below),
   except that "Continue to guidance" works only when `AnalysisStepStore.loaded()` happens to
   be populated — exactly the state the persisted-revisit path does not guarantee (defect 2).

## Defects

1. **Major — degradation audit fails CI (known, confirmed by me).**
   `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` reports
   `analyze-skills.page.ts:697` and `:909` `[catch-return-sentinel] "catch swallows error and
   returns a literal"`; the onboarding baseline is 0, so CI fails.
   Both catches route the error to `applyReviewFailure` → user-visible error state or setup
   block, and the bare `return;` inside each catch is a correct stale-version drop. The errors
   are therefore *reported*, not swallowed — but nothing marks them so.
   Fix: inside each catch body (the marker must sit in the catch's own leading comment lines,
   `check-degradation.ts:33-42`), add
   `// degradation-audit: reported - applyReviewFailure surfaces the RPC error to the user
   // (load error or setup block); the bare return drops a stale view only`.
   That is the honest kind: the same pattern is already used at
   `setup-run-attempt.ts:422` and `setup-run.store.ts:545`. Do not use `optional-capability`
   here — a failed review load is not optional for the user.

2. **Major — `continueToGuidance` breaks the guidance chain in the persisted-revisit view.**
   `analyze-skills.page.ts:1281` reads
   `const runId = this.analysis.loaded()?.manifest.runId;`. In the routed view this batch adds
   (`?analysis=<runId>&tab=<recordId>`, handler `:578-597`, `routedReview`), the route branch
   returns before `loadSaved`, so after a reload — the exact scenario persisted records exist
   for — `analysis.loaded()` is null. Then:
   - `parent` is null, so `setupRuns.start('project-guidance', …)` runs with
     `parentId: undefined, analysisRunId: undefined` (`:1283-1291`); the new record carries
     neither parent nor analysis, and `queryOf` (`setup-run-steps.ts:131-141`) omits the
     `analysis` query param. The guidance page's two fallbacks — the route's `analysis` param
     and the parent's `analysisRunId` (`project-guidance.page.ts:845, 851-853`) — both miss.
   - The skill-review record is never reported `completed` (`:1293-1300` guarded on `parent`),
     so it stays `needs-input` and keeps blocking new reviews of other analyses.
   Fix: `const runId = this.loadedRunId() || null;` — the page's own routed-aware id source,
   already used by `confirmDirtyDraftAction` (`:982`).

3. **Minor — "Review again" is unreachable in the routed view.**
   `canRetry` (`analyze-skills.page.ts:476-481`) and `retry()` (`:1046`) also read
   `analysis.loaded()?.manifest.runId`. In the routed view the run id lives only in
   `routedReview`, so `canRetry` is false: the button hides, and the disabled title wrongly
   says "Choose a completed analysis first." A reopened persisted review can be read but
   never re-reviewed. Fix: same as defect 2 — use `this.loadedRunId()` in both places.

4. **Minor — `attachReview` inspects only the first "other" live review, and the copy misleads.**
   `analyze-skills.page.ts:727-737` uses a single `records.find(...)` for any other live
   skill-review. `runsFor` is newest-first, so when one workspace holds both a `running` review
   (analysis A) and a `needs-input` review (analysis B), opening B's page may pick the
   needs-input record first, mark it `interrupted` unnecessarily, and only then fail on the
   running one via `start()`'s live-record return (`record.analysisRunId !== runId` → null,
   `:749`). The failure copy "Could not open the skill review. Try again." (`:660, :683, :903`)
   tells the user to retry, but retry cannot succeed until the running review finishes.
   Fix: search for a `running` other-review first and return null; then search `needs-input`.
   Consider copy that names the running review, or an attach-to-running instead of a refusal.

5. **Minor — the two defects above have no spec, and neither does the interruption decision.**
   The new specs cover the routed open, the in-flight attach and the replace-only-on-success
   rule well. Not covered: `continueToGuidance` and `retry` from the routed view (both would
   have caught defects 2 and 3), and the one-live-review interruption path
   (`attachReview`'s `needs-input` → `interrupted`, `:734-737`). Fix: add a routed-view spec
   that clicks Continue and asserts the guidance record carries `analysisRunId` and the review
   record becomes `completed`; add a spec for the interruption decision once defect 4's
   ordering is fixed.

## Acceptance table

| Acceptance item | Holds? | Evidence |
| --- | --- | --- |
| Revisit shows persisted review, zero new `wizard:recommend-analysis-skills` calls | Yes | `enterReview` `:653-704` reads `getSkillReview` before the judged path; spec "opens a saved Setup review by run id…" asserts `call` and `reviewSkills` were never called |
| Attach to the in-flight review held by `SetupRunStore`, not re-requested | Yes | `:658-665` + `setup-run.store.ts:615-616`; spec "attaches a new page to the review that is already in flight" |
| "Review again" overwrites only after success | Yes | `:906-927` + `setup-run.store.ts:622-652`; spec 3 (rejected request, warning-only, success). Backend owns the file write (Batch on rpc-handlers) |
| `selection` saved on the record, including empty selection | Yes | Effect `:561-566`, `releaseReview` `:758-765`, `saveSelection` writes `[]` (`saved?.length` is undefined, comparison fails, `setSelection` runs); spec 1 and `stack-skill.store.spec.ts:73-92` |
| Continue to guidance through `SetupRunStore.start('project-guidance', …)`; no `tabs.createTab`, `setWorkflow`, `pendingGuidanceTab` | Partly | Tab code fully removed (grep: no `TabManager`/`createTab`/`setWorkflow`/`pendingGuidanceTab` left) and specs assert the single start. But in the routed view the record is created without `analysisRunId`/`parentId` (defect 2) |
| Harness fixture matches the typed RPC shape | Yes | `onboarding-analyze.fixtures.ts:358-361` `satisfies WizardGetSkillReviewResult` with both fields null |

## Decisions (reviewer, reversible)

- Both audit sites warrant the `reported` marker, not `optional-capability` (defect 1): each
  catch ends in `applyReviewFailure`, a real user-facing report path.
- Defects 2 and 3 share one root cause and one fix (`loadedRunId()`); I kept them separate
  because the impacts differ (broken record chain vs hidden button).
- I did not count the pre-existing outer `catch {}` at `analyze-skills.page.ts:939` as a new
  defect: it predates this batch and the audit does not flag it. It does swallow unexpected
  errors into a generic message; worth a follow-up marker.

## Checks run (logs in `.ptah/tmp/b10-review-*`)

| Check | Command | Result |
| --- | --- | --- |
| Onboarding Jest (both changed specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath …` | 2 suites, 52 tests passed (`.ptah/tmp/b10-review-jest.log`) |
| Onboarding TypeScript | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | Exit 0 |
| ESLint on the 5 changed files | `npx eslint <files>` | Exit 0; 2 pre-existing `max-lines` warnings |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | **2 FAIL** (`:697`, `:909`, baseline 0) |

Electron-first: no host-specific code introduced; the page runs in the Electron renderer, the
fixture serves the harness RPC shape, and no VS Code-only API was added. Screenshots were not
taken (logic-only batch, template unchanged).
