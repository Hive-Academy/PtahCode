# Phase 2 fix report, lane A (round 1) - TASK_2026_2285_304a

Status: the 4 items are done. All focused checks pass. No visual check (rules: no build, serve or dev target).

Paths: `CH/` = `libs/frontend/chat/src/lib/settings/`, `SL/` = `libs/frontend/ui/src/lib/patterns/settings-layout/`.

## Item 1 - Blocking 2: the membership-key warning keeps its announcement (A-10)

- `CH/license/license-status-card.component.ts:159-162`: NEW persistent region
  `<p class="sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-testid="membership-key-announcement">`.
  It is in the card for each loaded license status. Its text is empty until `keyNotActive()` is true, then it is
  "Membership key not active. " + the hint copy (the former alert title + body). A change of the license status to
  `expired` or `no_license` changes the text of an element that is already in the DOM, so assistive technology
  announces it.
- NEW constant `keyNotActiveAnnouncement` in the same file.
- Not changed: the one visible trigger `membership-key-trigger`, its `aria-describedby="membership-key-hint"`, the row hint.
- Tests (`CH/license/license-status-card.component.spec.ts`):
  - NEW "A-10: announces the key warning and the recovery instruction when the license status changes" (region is
    there and empty first; same element gets the full text for `expired` and for `no_license`; the text clears when the
    reason clears; no control in the region).
  - NEW "A-10: a member key with a reason gets no community key warning".
  - Changed "M-9: ...": it now expects exactly 1 `[role="alert"]` (the region), not 0.

## Item 2 - Minor 3: Fine-tuning to Setup gap

- `CH/advanced-settings.component.ts:108`: `pb-[var(--ptah-gap-field)]` is deleted from `[data-advanced-sections]`.
  The parent panel (`CH/settings.component.html:134`, `gap-[var(--ptah-gap-section)]`) owns the gap to Setup, so the
  gap is 2rem as between the other cards. `settings.component.html` is not changed.
- Test (`CH/advanced-settings.component.spec.ts`, in "F8/F38: ..."): the list has no `pb-`, `py-`, `mb-`, `my-` class
  and its last child is `fine-tuning-section`.
- Not measured in Electron: visual check for the coordinator.

## Item 3 - Minor 5: the Advanced nav button name

- `SL/settings-layout.component.ts`:
  - `:197` the state mark is `aria-hidden="true"`. `role="img"` and `aria-label` are removed. `title` (tooltip) stays.
    The inner `aria-hidden` attributes of the dot and the count are removed (the parent hides them).
  - `:210-212` NEW sr-only `span` per tab with a state mark (navigation mode), `id = markId(tab.id)`,
    `data-testid="settings-layout-state-mark-text"`, outside the button, next to the disabled-reason spans.
  - `:177` `aria-describedby` comes from NEW `describedBy(tab)` (`:392-398`): the disabled reason id, then the mark id.
    NEW `markId` (`:388`).
  - All other behaviour and all test ids are unchanged. `PtahSettingsTab.stateMark` type is unchanged.
- `CH/settings.component.{ts,html}`: no change needed.
- Tests:
  - `SL/settings-layout.component.spec.ts`: changed "shows a state dot and count; the mark label is the button
    description, not part of its name"; NEW "describes a disabled tab with a state mark by its reason, then the mark
    label"; NEW "adds no description for a tab without a state mark, and none in tabs mode".
  - `CH/settings.component.spec.ts`, "F36: Advanced shows a named state mark while the membership needs attention"
    (expired license): the button name is "Advanced", the button has no `aria-label` and no named image inside, the
    description is "Membership needs attention", the mark keeps `title`.
- "Computed name": `dom-accessibility-api` is not installed, so the tests compute the name from content (text and
  element children of the button, without `aria-hidden` subtrees) and the description from `aria-describedby`.

## Item 4 - Context Management group card padding

- `CH/advanced/advanced-settings-group.component.ts`: NEW constant `FLUSH_IN_GLASS_CARD` (`:41`), bound on the
  `ptah-form-section` of `headingStyle="section"` as `[class]="contentSurface() ? flushInCard : ''"` (`:182`).
  With glass on and its own card, the form section has no block padding. Without the card the padding stays.
- Test (`CH/advanced/advanced-settings-group.component.spec.ts`): NEW "'section' with its own glass card has no stacked
  block padding; without the card it keeps the padding".

## Checks (from the worktree root)

| Command | Exit |
|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` settings, advanced-settings, license-status-card, advanced-settings-group specs | 0 (172 tests) |
| `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath SL/settings-layout.component.spec.ts` | 0 (26 tests) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` | 0 |
| `npx eslint` on the 9 changed files | 0 |

The 2 `tsc` runs were before the last edit, which changed only 2 spec files (one filter line in each). Jest and ESLint
ran after it. Logs: `.ptah/tmp/lane-a-fix-*.log`.

## Not done

- No visual check and no template typecheck (`typecheck-templates`) by this lane.
- No other user of `settings-layout-state-mark` reads `aria-label` or `role="img"` (grep in `apps` and `libs`).

## Visual checks for the coordinator

1. Fine-tuning to Setup: 2rem between card edges, glass on and off. The Advanced page now ends at Setup with no extra
   bottom space from the list.
2. Advanced nav item with an expired license: the dot and its tooltip show as before.
3. Context Management, glass on: the 2 group cards (context budgets, background queries) have one 1.25rem inset.
   Their block padding is 1.5rem smaller at the top and at the bottom than before.

## Decisions

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| F-1 | A persistent sr-only region in the card, not a live region on the hint | (a) sr-only region; (b) live hint paragraph | The hint paragraph is rendered by `setting-row.component.ts:41-43`, which is outside the write set and has no live input. The review names (a) as a valid fix | yes |
| F-2 | `role="alert"` with `aria-live="assertive"`, the title "Membership key not active." before the copy | (a) assertive; (b) polite status | The removed alert was `live="assertive"` with the title "Membership Key Not Active" (A-10). With a reason already set at first render, the region is inserted with its text, as the old alert was | yes |
| F-3 | The mark label is a sr-only span outside the button, referenced by `aria-describedby` | (a) this; (b) `aria-description` on the button | Review fix text. The layout already uses the same pattern for `disabledReason` (`settings-layout.component.ts:207`). A screen reader user who reads the nav in browse mode also finds the sr-only text after the list | yes |
| F-4 | The description applies in navigation mode only | (a) navigation only; (b) both modes | The mark renders only in navigation mode (`:196`). Tabs mode stays as it was | yes |
| F-5 | Item 2: delete the bottom padding of the list | (a) delete `pb`; (b) keep it and remove the parent gap | Review: "Let the parent own the space between these sections" | yes |
