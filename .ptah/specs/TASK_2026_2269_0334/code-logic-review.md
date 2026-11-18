# Code Logic Review — TASK_2026_2269_0334 (skills step redesign)

Reviewer: independent code-logic lane (different vendor from the implementer).
Scope: all uncommitted changes in `libs/frontend/onboarding/src/lib/{analyze,proposal}` at
2026-11-18, read in full (11 changed files, 18 new files). Contract: `design-spec.md`,
`parity-inventory.md`, `batch-a-report.md`, `batch-b-report.md`. Backend contract read for
the coverage function: `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts`.

## Verdict

**NEEDS_REVISION — 6/10.**

No blocker was found. The primary action is in the DOM in every state. The full path
primary → consent → install → next step is correct in both hosts. All C1–C47 and P1–P27 rows
are present or are approved changes. Two major defects remain: the coverage function gives
wrong results for stack names that contain a comma (D4), and a selected manual-search skill
becomes invisible and is still installed. Some acceptance points also have no test.

Why not 7: the two majors give the user wrong information on the summary that the design is
built on ("what does my selection cover", "N of M selected"). Why not 5: the state machine,
the stale-response guards and the install/consent path are correct, and the defects have a
small, local fix.

---

## Findings

### F1 — major — coverage is wrong for stack names that contain a comma

- Location: `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:16-34`
  (`splitStackEvidence`), used by `buildStackCoverage` at `stack-coverage.ts:63-65` and by the
  cards at `stack-skill-review.component.html:238-239`.
- What is wrong: the backend writes `evidence = item.name` and appends `, ${item.name}` for
  each further covered item (`skill-recommendation.service.ts:146,170`). The backend expects
  names with commas: `technologyName()` splits names on `,` (`skill-recommendation.service.ts:57`).
  The frontend splits the evidence on every `,` and then needs an exact part match, so a name
  that contains a comma never matches.
- Failing scenario: detected item `{ name: 'Jest, Vitest' }`, skill evidence `'Jest, Vitest'`.
  Parts are `jest` and `vitest`. The item gets state `none` ("no match") although the backend
  recommended a skill for it. The card shows the raw text, not a chip. If the stack also has a
  separate item `Jest`, that item is wrongly counted as covered by this skill.
- Correction: match each detected name against the evidence as a list of known names, not as
  free parts. For example, lower-case both, then accept a name when the evidence equals it,
  starts with `name + ', '`, ends with `', ' + name`, or contains `', ' + name + ', '`. Prefer
  the longest names first so that `Jest, Vitest` wins over `Jest`. Add spec cases for a name
  with a comma, a name with spaces, and a case difference.

### F2 — major — a selected manual-search skill disappears from the page but is still installed

- Location: `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts:323-341`
  (`selectedSkills`, `totalSkills`); hosts `team-builder-start.page.ts:244` (each new search
  empties `searchResults`), `analyze-skills.page.ts:243-249` (`clearSearch`); rail list hidden
  below 1100 px at `skill-selection-rail.component.css:248-251`.
- What is wrong: `totalSkills` and the rail names come only from the current
  `recommendations` + `searchResults`. `selectedIds` keeps the key of a search result after the
  result list changes.
- Failing scenario (team builder, 760 px card, bar layout): search "playwright", select one
  result, search "vitest". The first result card is gone. The rail says "2 of 1 selected"
  (N > M). The rail list is hidden in bar layout, so the user cannot see or remove the hidden
  skill. The primary says "Install 2 skills and continue" and the consent modal installs a
  skill that the page no longer shows. In rail layout the row shows the raw key
  `owner/repo/id` instead of the name (`stack-skill-review.component.ts:332`).
- Correction: keep a map of the `SkillShEntry` for each selected key (store or shell, update
  it in `toggle`). Count `total` as the union of visible skills and selected skills. Also show
  selected skills that are not in the current results, for example as a "Selected from earlier
  searches" group above the results, so that the user can deselect them in bar layout.

### F3 — minor — error text shows two times, and the error panel offers a wrong action

- Location: `stack-skill-review.component.html:94-96` and `:211-226`.
- What is wrong: when there are no recommendations and `error()` is set, the alert (assertive)
  and the error state panel both render the same text. The panel action is "Re-run skill
  search" for every error except one fixed string compare (`:216`, `:221`).
- Failing scenario: the user selects only manual-search skills (no recommendations), then the
  preview fails ("Could not preview skills. Try again.") or the install fails. Two copies of
  the error show. The panel proposes "Re-run skill search", which reloads the recommendations
  and replaces the user's selection (`analyze-skills.page.ts:208-214`).
- Correction: render the state panel only for load errors (pass a separate `loadError` or an
  error kind from the host), and show preview/install errors only in the alert. Do not compare
  the display text to choose the action.

### F4 — minor — a `navigate()` that resolves `false` leaves the consent modal busy

- Location: `analyze-skills.page.ts:344` and `:353-368`.
- What is wrong: after a successful install, `continueToGuidance()` runs while the stage is
  still `installing`. If `router.navigate` resolves `false` (guard or a newer navigation), the
  stage stays `installing`, the modal stays open with "Installing…", and no control can close
  it (`stack-skill-consent` reopens a busy dialog). The old code had the same behaviour; the
  redesign did not change it, but the spec flow ("Success: the Project guidance step opens")
  depends on it.
- Correction: after `continueToGuidance()` returns without leaving the page, set the stage to
  `review` (or `consent` closed) and keep the selection.

### F5 — minor — focus does not return to the primary after the analysis consent modal closes

- Location: `analyze-skills.page.ts:93` (`cancelRequested` only sets the stage) and
  `:337-349` (install failure).
- What is wrong: the primary is disabled while `previewing` is true, so the browser moves focus
  away from it before the modal opens. The team host saves and restores the trigger
  (`team-builder-start.page.ts:332,388,398`); the analysis host does not. After "Back" in the
  modal or after an install failure, focus goes to the document body. The task asks for focus
  return after the modal closes.
- Correction: in the analysis host, after the stage returns to `review`, focus
  `[data-testid="skill-install-primary"]` in a microtask (or after render).

### F6 — minor — formatter split a string literal in the launch status

- Location: `proposal/team-builder-start.page.html:98-99`.
- What is wrong: `'Launching chat…'` is now `'Launching\n      chat…'`. The rendered text
  collapses the white space, so the visible label is correct, but `textContent` and any exact
  text assertion get a newline and six spaces (C40).
- Correction: write the ternary on one line or move the label to a `computed` in the class.

### F7 — minor — copy and live-region details differ from the spec

- `skill-selection-rail.component.html:123-131`: the live region holds only "N of M selected".
  The spec (Accessibility, Roles) wants "N of M selected · covers X of Y stack items" in one
  polite region. The coverage line text is "Covers X of Y items", the spec says "stack items".
- `stack-skill-review.component.html:103-113`: the search input has no placeholder. The spec
  (Actions, Search) says placeholder "Search the skill registry".
- `stack-coverage-strip.component.html:265`: two stack items with the same name and different
  kinds (for example `TypeScript` as language and library) are both pressed together, because
  the filter compares only `item.name`. Use `kind:name` as the filter key.

### F8 — minor — the store keeps public writable signals

- Location: `stack-skill.store.ts:14-35`.
- The new `previewing` signal follows the rule (private writable, public read-only, one
  writer). All other store signals are still public and writable from any host. This is
  pre-existing and not a regression, but the project rule asks for read-only public state.
  Record it as follow-up, not as a fix for this task.

---

## Specific checks requested

| Check | Result | Evidence |
| --- | --- | --- |
| Manual search generation | Correct. Re-run and Clear increment `searchVersion`; stale responses are dropped and `searching` is cleared | `analyze-skills.page.ts:237-268` |
| Re-run during preview or navigation | Blocked: Re-run is disabled while `previewing`/`leaving`; `retry()` returns while leaving | `analyze-skills.page.ts:77-79,236` |
| Double click on the primary | Guarded: `previewing` is set before the first `await`; the rail disables the primary; `continueToGuidance` has a `leaving` guard | `analyze-skills.page.ts:271-278,354`; `team-builder-start.page.ts:284-292` |
| `previewing` reset on error paths | Correct. `finally` resets it for the same version; every version change (reset, Back, launch, workspace change) also resets it | `analyze-skills.page.ts:302`, `stack-skill.store.ts:50`, `team-builder-start.page.ts:137,419,471` |
| `previewScriptCount` after a selection change | Correct. `toggle` clears `preview` and `approvedIds`; the computed also requires the same key set | `stack-skill.store.ts:37-47,70-79` |
| Primary always reachable | Yes. One instance, always rendered; labels match D10 (`Install N skills and continue`, `Install 1 skill and continue`, `Continue without skills`, busy `Preparing install…`) | `skill-selection-rail.component.ts:93-99`, `.html:185-198` |
| Consent confirm label | `Install N skills and continue` / `Installing…` | `stack-skill-consent.component.html:90-97` |
| Analysis path to guidance | Correct: 0 selected → guidance without preview; N > 0 → preview → consent → install → guidance | `analyze-skills.page.ts:270-351` |
| Team path to chat | Correct: 0 selected and Skip → `launchChat()`; success → `launchChat(true)` | `team-builder-start.page.ts:277-283`, `.html:138-139` |
| Install failure / partial install | Returns to `review`, shows the error alert, keeps `selectedIds` (both hosts) | `analyze-skills.page.ts:337-349`; `team-builder-start.page.ts` (unchanged path, C32) |
| Ellipsis encoding | All new labels use U+2026. No `?` used as an ellipsis. All changed files are valid UTF-8. `Installing skills...` (three dots) is the old text of C39 and is unchanged | grep over all changed files |
| `aria-pressed` on chips | Yes, through `ptahButton [selected]` | `libs/frontend/ui/src/lib/button/button-host.ts:88-116` |
| Focus target | The new `h1#skill-review-title tabindex=-1` is found by `OnboardingFocusService` (`h1[tabindex="-1"]`). This is an improvement: the old analysis h1 had no `tabindex` | `stack-skill-review.component.html:17-24`; `shell/onboarding-focus.service.ts:15-21` |
| Keyboard order | Back → Re-run → chips → search → results → recommended → no-match rows → rail. Rail is last in the DOM | `stack-skill-review.component.html` order |
| Project rules | No `$index` track, no `[innerHTML]`, no `any`, no `as unknown as`, no non-null `!`, no `console.*`. All files under 700 lines (max 515). Members have explicit accessibility. ESLint on all changed `.ts`/`.html` files: exit 0 | grep; `.ptah/tmp/logic-review-eslint.log` |

### Coverage function (D4)

| Case | Result |
| --- | --- |
| Case difference, extra spaces around parts | Correct (`toLowerCase`, `trim`) |
| Name with spaces (`Angular Material`) | Correct when the name has no comma |
| Name with a comma | **Wrong** (F1) |
| Item with no match | `none`, chip "no match", row in the no-match list |
| Failed search | `failed` wins over every other state; chip "search failed". Backend never puts a failed item in `unmatchedItems` (`skill-recommendation.service.ts:173-177`) |
| One skill covers several items | Counted once for each item; duplicates removed by key |
| Selected vs available counts | Correct for recommendations. Manual-search skills do not count for coverage (acceptable; the spec defines coverage from recommendations). Total count wrong after a search change (F2) |

---

## Parity result

I checked every C1–C47 and P1–P27 row against the code.

- **Confirmed:** C1–C47 and P1–P27. All capabilities are present, or are changed only by
  R1–R4 or D1–D10. No capability is lost without approval.
- **Rows of the implementer's mapping table that are imprecise (not wrong in outcome):**
  - C14: "busy disabling added per card States". The cards are also disabled while
    recommendations load and while the preview runs (`stack-skill-review.component.ts:289-291`).
    The spec lists only `busy`. This is acceptable, but the row does not say it.
  - C20: the owner-decision fieldset is now disabled while loading and previewing, not only
    while busy (`stack-skill-review.component.html:283`). The row says "retained".
  - C32: "unchanged" is true, but the analysis host has no test for the partial or thrown
    install failure (see test gaps).
- **Note on the spec:** the design asks to add the new ink pairs to
  `apps/ptah-extension-webview/src/app/state-ink-contrast.spec.ts` (Accessibility, Contrast).
  That file is not changed.

---

## Tests

Run: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
--runTestsByPath` with the 9 new and changed specs → 9 suites, 75 tests passed, exit 0
(`.ptah/tmp/logic-review-jest.log`).

The new specs test behaviour, not only presence: preview keeps the grid, helper reset after a
toggle, search ordering and deduplication, Skip hidden at zero, label counts, filter and
expansion, rerun stale search. Removed old assertions were reformatted or replaced; no old
assertion is lost without a replacement (checked: `createTab` once, owner decision `raise`,
75 000 ms timeout, no-analysis error, guidance navigation, no preview at zero).

Gaps (no test today):

1. Coverage with a comma in a stack name (F1).
2. Selection that survives a new search or Clear; total and rail names (F2).
3. Analysis host: preview failure ("Could not preview skills. Try again.") keeps the
   selection and resets `previewing`.
4. Analysis host: partial install (`success: false`) and thrown install return to `review`
   with the error and the selection (team host has this test, analysis host does not).
5. Consent confirm label "Install N skills and continue" with N from the previews.
6. Focus return after the analysis consent modal closes (F5).
7. Unmatched list: draft editor rendered only for `framework` and `pattern`.
8. New contrast pairs in `state-ink-contrast.spec.ts`.

---

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Rate F1 major, not blocker | blocker; major | The path to install still works; the defect gives a wrong coverage display only for names with commas, which the backend expects | Yes |
| Rate F2 major, not blocker | blocker; major | The consent modal lists every skill before the install, so the user can still see the hidden skill there and go Back; but on the page it cannot be removed in bar layout | Yes |
| Did not run `tsc` | run; skip | The coordinator runs `npm run verify` (typecheck) for onboarding at the same time; the brief forbids a second heavy run | Yes |

## Not checked

- `npx tsc --noEmit` and `typecheck-templates` (coordinator gate). I saw that
  `stack-skill-review.component.html:95` changed on disk during the review (`tone="err"` to
  `tone="error"`); I reviewed the current file.
- Rendered layout, sticky rail and bar geometry, container queries, contrast and themes in a
  real Electron window. No visual check was run.
- Behaviour of `ptah-alert`, `ptah-state-panel`, `ptah-native-modal` focus restore and
  `ptah-form-actions` internals beyond their inputs.
- e2e specs that may select old texts or selectors.
