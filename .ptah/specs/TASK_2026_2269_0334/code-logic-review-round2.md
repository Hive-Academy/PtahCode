# Code logic review, round 2 — TASK_2026_2269_0334

Reviewer: independent code-logic lane (read-only). Date: 2026-11-18.
Scope: the uncommitted changes in `libs/frontend/onboarding/src/lib/{analyze,proposal}` after
the review-fix revision (`review-fix-report.md`). I read the fix report as a claim and checked
each correction in the code. Paths below are relative to `libs/frontend/onboarding/src/lib/`
unless they start with `libs/`.

## Verdict

**APPROVED — 8/10.**

All eight round-1 findings are corrected or partly corrected. No blocker and no major defect
remains. Three minor defects remain (N1–N3). Two of them are residual gaps in F4 and F5 on the
analysis host. They do not block the primary path.

Why not 9: focus return after a failed install on the analysis host does not work in a real
browser (N1), and the regression test cannot detect it. Why not 7: the coverage function and
the selection counts are now correct for every case I traced, and the primary path works in
both hosts.

## F1–F8 status

| # | Status | Evidence (`file:line`) | Regression test |
| --- | --- | --- | --- |
| F1 comma names | Corrected | `proposal/stack-coverage.ts:16-39`: longest detected name first, anchored match `(^\|,\s*)name(?=\s*,\|$)`, case-insensitive, regex-escaped, matched part removed. `buildStackCoverage` uses the full item list (`:64-70`). Raw-text fallback only when no item matches (`:37`). | `proposal/stack-coverage.spec.ts:99-106` (`Jest, Vitest`, `Angular Material` vs `Angular`). The old comma split gives `['Jest','Vitest']`, so this test fails on the old code. |
| F2 selected search results | Corrected | `proposal/stack-skill.store.ts:91-103` keeps selected entries in `searchResults` on each new search and on Clear. `proposal/stack-skill-review.component.ts:154-173`: names and `total` include them. Team host `loadReview` clears `selectedIds` before `setSearchResults([])` (`proposal/team-builder-start.page.ts:150,154`), so a re-run drops them. Analysis `reset()` drops them (`stack-skill.store.ts:153`). | `analyze/analyze-skills.page.spec.ts:415-461` (bar layout, `1 of 2`, then Clear gives `1 of 1`, card removes the skill). This fails on the old code (card gone after Clear). |
| F3 double error / wrong action | Corrected | `proposal/stack-skill-review.component.html:94` (alert only for action errors), `:212-218` (panel only for load errors, `Back` or `Re-run skill search` from `backOnLoadError`). Hosts set `loadError` (`analyze/analyze-skills.page.ts:198,221,285`; `proposal/team-builder-start.page.ts:140,223,301`). | `analyze/analyze-skills.page.spec.ts:507-524`; `team-builder-skill-review.component.spec.ts` (fix report). |
| F4 `navigate` resolves `false` | Partly corrected | `analyze/analyze-skills.page.ts:386` closes the modal when `navigate` returns `false`. A rejected `navigate` is still handled wrongly (N2). | `analyze/analyze-skills.page.spec.ts:463-505` (`navigation` case). |
| F5 focus return (analysis) | Partly corrected | `analyze/analyze-skills.page.ts:361-369` focuses the primary in a microtask. Works for Cancel and Escape. Does not work in a browser for install failure and `navigate` false (N1). | `analyze/analyze-skills.page.spec.ts:463-505` spies on `focus()`. It does not check `document.activeElement`, and jsdom does not apply `inert`, so it passes when the real focus fails. |
| F6 split string | Corrected | `proposal/team-builder-start.page.ts:133-137` (`launchStatus` computed, one literal `'Launching chat…'` with U+2026); bound at `proposal/team-builder-start.page.html:93`. | `team-builder-start.page.spec.ts` (exact `textContent`, per fix report). |
| F7 copy and live region | Corrected | `proposal/skill-selection-rail.component.html:11-29` (one polite region for count and coverage, "stack items"); `proposal/stack-skill-review.component.html:111` (placeholder); `proposal/stack-coverage-strip.component.html:30-44` (`kind:name` key); `proposal/stack-skill-review.component.ts:101-114` (`activeItemName` for display and highlight). | Rail, review and strip specs (fix report). |
| F8 store writable signals | Corrected | `proposal/stack-skill.store.ts:14-53`: 18 private writable signals, public `asReadonly()`, methods are the only writers. Only two hosts and `team-builder-start.page.spec.ts` use the store. No spec casts to write private state (no `as unknown as`, no `as any`, no `['…State']` access in the changed specs). | `analyze/analyze-skills.page.spec.ts:525-535`. |

## Regression checks requested

| Check | Result | Evidence |
| --- | --- | --- |
| F1: names with commas | Correct. `'Jest, Vitest'` matches only the comma item. A separate `Jest` item is not marked covered by that evidence. | `stack-coverage.ts:22-33` |
| F1: prefix names | Correct. `Angular` does not match `Angular Material` (lookahead needs `,` or end). | `stack-coverage.ts:29` |
| F1: case and spaces | Correct. Trim and lower case on both sides. The original spelling is returned for display. | `stack-coverage.ts:20,26,31` |
| F1: no item matches | Raw text is shown (`rawEvidence`). If some items match, the unknown rest of the text is not shown. This is acceptable: the card shows the matched chips. | `stack-coverage.ts:35-38` |
| F1: regex metacharacters (`C++`, `Node.js`) | Escaped. | `stack-coverage.ts:28` |
| F2: rail count = label N = install payload | Equal. Rail count is `selectedIds().size` (`stack-skill-review.component.ts:161`). Preview and install send `selectedIds` (`analyze/analyze-skills.page.ts:291`, `team-builder-start.page.ts:306`). Install sends the previewed names, and the preview is checked against `selectedIds` (`analyze/analyze-skills.page.ts:294-302`). | |
| F2: remove from rail and from card | Both call `toggle` (`stack-skill-review.component.html:175,236,327`). A deselected retained card stays visible until the next search, then it is dropped. | `stack-skill.store.ts:92-94` |
| F2: new search, Clear, re-run | New search and Clear keep selected entries. Team re-run clears them (`team-builder-start.page.ts:150,154`). Analysis re-run replaces the selection with the new recommendations and shows "Skill selection was reset" (P-list behaviour); the old search cards stay as unselected cards. | `analyze/analyze-skills.page.ts:211-220` |
| F8: no writable signal leaks from the store | Confirmed. Host components still have public writable signals (N3). | |

## Contract recheck

- Primary label: "Install N skills and continue" / "Install 1 skill and continue" /
  "Continue without skills" in the rail, always rendered (`proposal/skill-selection-rail.component.html`,
  unchanged since round 1).
- Analysis path: 0 selected → guidance (`analyze/analyze-skills.page.ts:280-283`); N selected →
  preview → consent → install → guidance (`:277-359`, `:371-390`). Failure and partial install
  return to `review` with the selection kept (`:345-357`).
- Team-builder path: 0 selected → `launchChat()` (`proposal/team-builder-start.page.ts:283-287`);
  N selected → preview → consent → install → chat (unchanged since round 1).
- Removals: only R1–R4. I found no other capability removed by this revision. The round-1
  parity result (C1–C47, P1–P27 confirmed) still holds for the files that changed.
- Text: no user-visible string is split by the formatter in the changed templates. New text uses
  U+2026. `Installing skills...` (`proposal/team-builder-start.page.html:99`) is the old C39 text
  and was not changed by this task.

## New findings

### N1 — minor — focus does not return to the primary after a failed install (analysis host)

- Location: `analyze/analyze-skills.page.ts:361-369` (`closeConsent`), called from `:349`, `:356`
  and `:386`. The dialog closes in an effect: `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:135-143`.
- What is wrong: `closeConsent` sets the stage and calls `focus()` in a microtask. The microtask
  runs before change detection, so the `<dialog>` is still open and the page outside it is
  inert. `focus()` on the primary does nothing. Then the effect calls `dialog.close()`, and the
  browser returns focus to the element that had focus before `showModal()`. That element is the
  primary that was disabled during the preview, so focus goes to `body`.
  Cancel and Escape work, because the modal closes the dialog before it emits `closed`.
- Failing scenario: select one skill, press the primary, press Install, the install returns
  `success: false`. The error alert shows, but keyboard focus is on `body`.
- Test gap: `analyze/analyze-skills.page.spec.ts:487,504` spies on `focus()` and does not
  check `document.activeElement`. jsdom does not apply `inert`, so the test passes.
- Correction: focus after the next render, for example `afterNextRender(() => …, { injector })`,
  or focus in a handler of the modal `closed` output. Assert `document.activeElement` in the spec.

### N2 — minor — a rejected `router.navigate` after a successful install shows "Could not install skills"

- Location: `analyze/analyze-skills.page.ts:352` and `:353-357`; `continueToGuidance` at
  `:371-390` has `try/finally` and no `catch`.
- What is wrong: when `navigate` rejects (for example a guard throws), the rejection goes to the
  `catch` of `install()`. The page shows "Could not install skills. Try again." although the
  install succeeded. On the skip path (`:70`, `(skip)="continueToGuidance()"`) the rejection is
  not handled at all.
- Failing scenario: the install succeeds, the guidance route guard throws. The user sees an
  install error and installs again.
- Correction: catch in `continueToGuidance`, call `closeConsent()`, and set a navigation error
  such as "Could not open Project guidance. Try again."

### N3 — minor — host components keep public writable signals

- Location: `analyze/analyze-skills.page.ts:103` (`loadError`);
  `proposal/team-builder-start.page.ts:63-65` (`touched`, `submitted`, `launched`), `:79`
  (`ownerDecisionError`), `:132` (`loadError`).
- What is wrong: the project rule is "private writable signal, public read-only signal". F8
  fixed the store only. `analyze/analyze-skills.page.spec.ts:517` reads `loadError()`, which a
  read-only signal also allows.
- Correction: make these signals private and expose `asReadonly()`. The template binding
  `ownerDecisionError.set(false)` (`proposal/team-builder-start.page.html:123-124`) needs a
  method.

## Checks run

- `npx jest … --runTestsByPath proposal/stack-coverage.spec.ts analyze/analyze-skills.page.spec.ts`:
  exit 0, 2 suites, 29 tests passed (`.ptah/tmp/round2-jest.log`).
- grep over the changed files: no `as unknown as`, no `as any`, no ASCII `...` in new text, no
  other `StackSkillStore` consumer.

## What I did not check

- I did not run the other 7 specs, ESLint, `tsc` or `typecheck-templates`. The coordinator runs
  the gate. The fix report claims 9 suites and 88 tests pass, `tsc` and ESLint exit 0.
- No rendered check in Electron. N1 is from the code and the HTML `<dialog>` focus rules, not
  from a run in a browser.
- I did not re-read the C1–C47 / P1–P27 rows for files that this revision did not change.
- I did not check the team-builder host focus return in a browser. It uses the same microtask
  pattern (`proposal/team-builder-start.page.ts:342,398,408`) and can have the same gap as N1 on
  its failure paths.
