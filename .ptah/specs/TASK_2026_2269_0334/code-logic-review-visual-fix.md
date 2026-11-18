# Code logic review — visual fix V1-V4 (TASK_2026_2269_0334)

Reviewer: independent lane (a different vendor than the implementer). Scope: only the V1-V4
correction in `visual-fix-report.md`. R1-R3 from round 3 stay open and are not repeated here.
Paths are relative to `libs/frontend/onboarding/src/lib/proposal/` unless shown in full.

## Verdict: APPROVED

Score: **8/10**.

The correction does not break behaviour. The page has one rail component, one primary button and
one set of event handlers in both layouts and both hosts. Selection toggle, remove, skip, the
primary label and its disabled states, the consent modal and the focus target of N1 are not
changed. The coverage header count is correct for 0 items, for all items covered and for loading.
The Electron images agree with the code: a right rail at 1280 px, an opaque pinned bar at 900 px,
and a bar in the team builder.

Why not 9: the header can say that an item is covered while the chip for that item shows
"search failed" (finding 1). The loading badge shows "0" (finding 2). The new spec for bar layout
does not test the layout that the product uses (finding 4).
Why not 7: I found no defect that blocks a user action, hides the primary, or gives a wrong
count in the normal path.

## Findings

### 1 — minor — the header counts a "search failed" item as covered

- Location: `stack-coverage-strip.component.ts:28-30` (`coveredCount` uses `selectedCount > 0`).
  `stack-coverage.ts:87-93` gives `state: 'failed'` priority over `'covered'`. The strip chip
  shows `summary()` = "search failed" (`stack-coverage-strip.component.ts:55-56`) and the
  accessible name "<name>, search failed" (`:63-66`).
- Scenario: the user selects "Angular patterns" (Angular is covered). Then a re-run of the skill
  search fails for Angular, and the user keeps the selection. The header says
  "1 of 1 stack items covered". The only chip has a warning dot and says "Angular, search failed".
  The legend maps the warning dot to "No match or search failed". The header and the chip
  contradict each other on the same panel.
- The report says that this count agrees with the rail on purpose. That is correct
  (`stack-skill-review.component.ts:139-141`). But the chip state is the one place that does not
  agree. Make the chip show covered when `selectedCount > 0`, or show both states
  (for example "1 selected · search failed"). Then add a strip spec with
  `state: 'failed', selectedCount: 1`. The current spec (`stack-coverage-strip.component.spec.ts:9-14`)
  sets `selectedCount: 0` for the failed item, so it cannot find this case.

### 2 — low — the recommendation badge shows "0" while recommendations load

- Location: `stack-skill-review.component.html:197-202`. The badge is outside the
  `@if (initialLoading())` block at `:203`.
- Scenario: the analysis page opens and the search runs. The heading says
  "Recommended for this workspace 0" above the skeleton cards. Also, the section name from
  `aria-labelledby="recommended-title"` (`:190`) becomes "Recommended for this workspace 0" for a
  screen reader. After a re-run (`loading()` true, not initial) the badge shows the old count over
  dimmed cards. This is correct for a re-run.
- Fix: show the badge only when `!initialLoading()`.

### 3 — low — the 140 px space below the cards is not necessary in bar layout

- Location: `stack-skill-review.component.css:24-26`.
- The bar host is `position: sticky; bottom: 0` (`skill-selection-rail.component.css:9-15`) and it
  stays in normal flow after `.skills-main` (`stack-skill-review.component.html:325`). At the end
  of the scroll the bar is at its own position below the last card. Thus the bar never covers the
  last card, and the padding only adds a 140 px empty gap between the last section and the bar.
- Scenario: at 900 px, the user scrolls to the end. The user sees the last card, then about 140 px
  of empty space, then the bar. Nothing is hidden, so this is not a defect of access. The answer
  to question 2 ("does the bar hide the last cards") is no, with or without this padding.

### 4 — low (test) — the bar spec does not test the bar that the product uses

- Location: `skill-selection-rail.component.spec.ts:96-119`. The spec sets `layout = 'bar'` with
  `responsive` false. Both hosts use `[responsive]="true"` with the default `layout = 'rail'`
  (`stack-skill-review.component.html:325-328`). The product bar comes from the CSS rules for
  `:host(.responsive)` and the 960 px container query. jsdom does not apply container queries.
- Effect: the spec checks one primary and no `data-sticky`. These are true. But a change to the
  responsive CSS (for example a footer that is not `display: contents`) cannot fail any Jest
  test. Only the Electron capture (`.ptah/tmp/skills-shots/skills.shot.ts:95-134`) checks the
  geometry. Keep that capture as a required gate for each change to these CSS files.

### 5 — low — keyboard order is the reverse of the visual order of Skip and the primary

- Location: `skill-selection-rail.component.html:76-108` (DOM order: primary, then Skip).
  `skill-selection-rail.component.css:52-55` (`order: -1` puts Skip on the left in the bar).
  In the rail, `ptah-form-actions` applies `flex-col-reverse` below a 320 px container
  (`libs/frontend/ui/src/lib/patterns/form-actions/form-actions.component.ts:89`), so Skip is
  shown above the primary (see `gate/skills-analysis-dark-1280.jpg`).
- Scenario: a keyboard user tabs into the actions. Focus goes to "Install 2 skills and continue"
  (right or bottom) first, and then to "Skip skills" (left or top). Both buttons can be reached
  and both have names, so the content is accessible. The order is the same convention as the
  shared `ptah-form-actions` component, so I do not ask for a change in this task.

## Answers to the questions

1. **Behaviour.** Not broken. One `ptah-skill-selection-rail` per page
   (`stack-skill-review.component.html:325`). The event bindings (`removed`, `primary`, `skip`)
   did not change (`:337-339`). `blocked()` disables remove, Skip and the primary
   (`skill-selection-rail.component.ts`, `blocked`). The primary label covers 0, 1 and n
   selections, loading and preview. The consent modal button has no `skill-install-primary` test
   ID, so the N1 focus query at `analyze/analyze-skills.page.ts:405` finds the one primary. The
   reset notice keeps its dismiss output (`stack-skill-review.component.html:83-97`). In the team
   builder, the review stays in a 760 px card (`team-builder-start.page.html:2`) and shows the
   bar, as the image `skills-team-builder-dark-1280.jpg` shows.
2. **Layout.** The page container (`.skills-container`, `stack-skill-review.component.css:4-6`)
   is the query container for both components. Both use the same 960 px threshold
   (`stack-skill-review.component.css:32`, `skill-selection-rail.component.css:61`, and the
   Tailwind variant at `skill-selection-rail.component.html:72`). The coverage messages template
   is rendered in exactly one place: the two conditions at `stack-skill-review.component.html:43`
   and `:58` are complements. The footer uses `display: contents` only in bar layout. It has no
   landmark role inside a `section`, and the `role="group"` of `ptah-form-actions` keeps its name.
   The rail height uses the real top and bottom and removes its listeners on destroy
   (`skill-selection-rail.component.ts:44-81`). The bar does not hide the last card (finding 3).
3. **Specs.** No assertion was removed or made weaker by V1-V4. The heading-order test now
   compares IDs because the heading contains the badge. This is equal in strength. The gaps are
   findings 1 and 4.
4. **Header count.** With 0 items the strip is not rendered, unless the stack is loading. During
   loading the count is hidden (`stack-coverage-strip.component.html:75-79`). With all items
   covered it says "N of N". With a search failure the count can disagree with the chip
   (finding 1).

## Checks

- Read: `visual-fix-report.md`; `skill-selection-rail.component.{ts,html,css,spec.ts}`;
  `stack-skill-review.component.{html,css}` and the computed values in `.ts`;
  `stack-coverage-strip.component.{ts,html,spec.ts}`; `stack-coverage.ts:55-95`;
  `team-builder-start.page.html:1-175`; the V4 parts of
  `team-builder-skill-review.component.spec.ts`; `ptah-form-actions` and `ptahBadge` in
  `libs/frontend/ui`; N1 in `code-logic-review-round2.md` and R1-R3 in round 3.
- Images examined: `gate/skills-analysis-dark-1280.jpg`, `skills-analysis-dark-900.jpg`,
  `skills-none-dark-900.jpg`, `skills-team-builder-dark-1280.jpg`, `skills-consent-dark-1280.jpg`.
- Jest: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` with 7 specs in `proposal/` (rail, strip, review, team-builder start,
  stack-coverage, pick card, consent). Log: `.ptah/tmp/visual-review-jest.log`.
  **Result: 7 suites passed, 69 tests passed, 0 failed.**

## Not checked

- `skills-analysis-light-1280.jpg` and `skills-empty-dark-1280.jpg`: not examined.
- No new Electron capture. I did not measure the real bar height at narrow widths below 720 px.
  There, `ptah-form-actions` can stack its buttons and the bar can be taller than 106 px.
- `typecheck-templates` and lint did not run (not permitted for this lane).
- The Tailwind arbitrary variant `[@container_skills(min-width:960px)]` at
  `skill-selection-rail.component.html:72`: I did not confirm that the build generates it. The
  component CSS at `skill-selection-rail.component.css:93-95` sets the same button width, so a
  missing class has a small effect.
- `analyze/analyze-skills.page.spec.ts` was not run in this lane.
