# Skills step redesign — design spec

Task: `TASK_2026_2269_0334`. Status: proposal. No production code changes until the user approves.
Host: Electron desktop window first. Themes: `ptah-glass` (dark) and `ptah-glass-light`. The
`anubis` and `anubis-light` themes must also work, because the design uses only theme tokens.

Prototype: `prototype/skills-step.html` (one static file, inline CSS and JS, no network).
Screenshots (headless Chromium, `ptah_browser_screenshot`):
`prototype/skills-step-dark-1280.png`, `prototype/skills-step-light-1280.png`,
`prototype/skills-step-dark-900-loading.png`.
The prototype accepts URL parameters: `?theme=ptah-glass-light&width=900&state=empty`.

---

## Current state

The page is `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`. It wraps the shared
`StackSkillReviewComponent` (`proposal/stack-skill-review.component.html`), which the team-builder
flow also uses (`proposal/team-builder-start.page.html:99`).

### Problem 1 — layout and density

| Evidence | Problem |
| --- | --- |
| `analyze-skills.page.ts:22` `mx-auto max-w-[760px] space-y-5 p-4` | The page uses 760 px of a 1280–1600 px window. More than 40% of the width is empty. |
| `analyze-skills.page.ts:27-29` one bordered `<p>` per detected stack item | The stack list is a tall column of boxes before the first skill. On a project with 8 items, the first skill is below the fold. |
| `stack-skill-review.component.html:29-58` one full-width card per skill, `space-y-3` | 8–10 skills make a long single column. The user must scroll to compare skills. |
| `analyze-skills.page.ts:38-45` unmatched items are a separate list after search failures | The stack items that have no match are far from the skills. The user cannot see coverage. |

### Problem 2 — skill cards

| Evidence | Problem |
| --- | --- |
| `stack-skill-review.component.html:40-43` name, then `source/skillId` in `break-all text-xs` | The key `owner/repo/skill-id` is a long technical string. It breaks at any character and is the second most visible text. |
| `stack-skill-review.component.html:44` `{{ row.skill.description }}` | A blank description gives an empty line. There is no fallback text. |
| no `installs` binding in the template | The install count is not shown. The user has no signal of trust. |
| `stack-skill-review.component.html:45-48` `Why: {{ row.evidence }}` as muted text | The covered stack items are plain muted text. A skill that covers "Angular, Playwright" does not look different. |
| `stack-skill-review.component.html:50-54` `Relevance score: {{ row.score }}` | A raw number with no scale. It adds noise. |
| `stack-skill-review.component.html:32-37` checkbox only, no selected style on the card | A selected card looks the same as an unselected card, except for the small checkbox. |
| `SkillShEntry.isInstalled` (`libs/shared/src/lib/types/rpc/rpc-agents.types.ts:98`) not shown | A skill that is already installed looks like a new skill. |

### Problem 3 — actions and hierarchy

| Evidence | Problem |
| --- | --- |
| `analyze-skills.page.ts:47` "Re-run skill search" sits between the stack list and the skill list | It is a ghost button with no group. It looks like part of the stack list. |
| `stack-skill-review.component.html:172-201` primary action at the end of the component | The primary action is below the search results. On a long list it is off screen. The "always visible" rule is not met in practice. |
| `stack-skill-review.component.html:183-190` "Skip skills" beside "Continue without skills" | When no skill is selected, two buttons do the same thing (`skip` and `continueRequested` → `continueToGuidance`). |
| `stack-skill-review.component.html:61-113` search form after the recommendations | Search results appear at the bottom of the page. The user does not see them appear. |
| `stack-skill-review.component.html:3` a second "Review skills" heading (h2) below the page h1 "Review skills" (`analyze-skills.page.ts:23`) | The same title shows two times. |

### Problem 4 — page concept

The page is a stack of five unrelated blocks: stack list, failures, unmatched items, a button, and
the review component. There is no model of "my stack ↔ the skills that cover it", and there is no
summary of the selection. The user cannot answer "what does my selection cover?" without reading
every card.

### Other behaviour found in the code (input for the Preserve list)

- `preview()` sets `state.loading` (`analyze-skills.page.ts:180`). The review component then
  replaces the full list with the "Finding recommended skills" panel
  (`stack-skill-review.component.html:13-16`). The list disappears while the consent preview loads.
- All recommended skills are selected by default after a load (`analyze-skills.page.ts:141`).
- Search results hide the skills that are already in the recommendations
  (`stack-skill-review.component.html:92`).
- The search button is disabled when the query is blank or a search runs
  (`stack-skill-review.component.html:80`).

---

## Concept

### Recommended: "Coverage board"

The page shows the project stack and the skills as one model. The question that the page answers is:
**"Which of my stack items do the selected skills cover?"**

1. **Header band.** Title "Choose skills for your stack", a one-line description, and Back. The
   secondary actions "Re-run skill search" and the analysis name sit at the right of the header.
2. **Coverage strip.** One chip for each detected stack item. Each chip shows the item name and a
   state: covered by a selected skill (done ink), covered only by unselected skills (idle), or no
   match (need ink). A click on a chip filters the grid to the skills for that item. A second click
   or "Show all" removes the filter. The coverage strip replaces the tall stack list.
3. **Skill grid.** The recommended skills in a responsive grid (1, 2 or 3 columns). Each card shows
   name, source, installs, description and the stack items that it covers as chips. The whole card
   is the selection target.
4. **No match panel.** Below the grid, one row for each unmatched stack item. Framework and pattern
   items keep the existing `ptah-project-skill-draft`. The row also has "Search for <item>", which
   puts the item name in the search field and runs a search.
5. **Selection rail (right).** Sticky. It shows "N of M selected", a coverage meter "Covers 5 of 7
   stack items", the list of selected skill names (each with a remove button), the primary action,
   and "Skip skills". At narrow width the rail becomes a sticky bottom action bar.
6. **Find more skills.** The manual search field sits in the toolbar above the grid. Results show
   in their own section **above** the recommendations, with the query in the heading and "Clear".
   The user sees the results without a scroll.
7. **Consent.** No change in flow: the primary action opens the existing consent modal
   (`ptah-stack-skill-consent`). The design of the modal is out of scope, except that it keeps the
   new card tokens for its file sections and its confirm label becomes "Install N skills and
   continue" (D10). See `## Flow to the next step`.

Flow: land (all recommended skills selected) → read coverage strip → deselect or filter → optional
search → "Install N skills and continue" → consent modal → "Install N skills and continue" →
install → next step (guidance step or chat).

### Alternative: "Grouped by stack item"

One collapsible section for each stack item (`ptah-disclosure`), with the skills for that item
inside. A skill that covers two items shows in both groups, and a selection in one group also
selects it in the other group. Unmatched items are empty groups with the search and draft actions.

Why it is not the recommendation: a skill that covers several items shows two or more times, so the
list gets longer, not shorter (problem 1). The count of cards on screen also no longer equals the
count of skills, which makes "N selected" confusing. The coverage board gets the same grouping by
the chip filter, without duplicates.

---

## Layout

Widths are the width of the Electron window content area (the onboarding route has no app sidebar).
The component uses a CSS container (`container-type: inline-size`) on its root, so that the same
component also works in the 760 px team-builder card (see Decisions D3).

### Regions

```text
┌───────────────────────────────────────────────┬──────────────────────────┐
│ Header band: Back · title · description       │ Selection rail (sticky,  │
│ Re-run skill search                           │ top 24 px, max-height =  │
├───────────────────────────────────────────────┤ viewport − 48 px)        │
│ Coverage strip: [Angular ✓] [Nx ✓] [Jest !]   │ Your selection           │
│ status line (reset / warning / failures)      │ 6 of 9 selected          │
├───────────────────────────────────────────────┤ Covers 6 of 8 items  ▬▬░ │
│ Toolbar: [Search the skill registry ][Search] │ ┌ selected list ───────┐ │
│ Search results (only when present)            │ │ (only part that      │ │
│ Recommended for this workspace  (9)           │ │  scrolls)            │ │
│ ┌──────────┐ ┌──────────┐                     │ │ angular-best-pra…  × │ │
│ │ card     │ │ card     │                     │ │ playwright-e2e     × │ │
│ └──────────┘ └──────────┘                     │ └──────────────────────┘ │
│ No match in the registry (1)                  │ ── pinned footer ─────── │
│   Electron · framework [Search for Electron]  │ [Install 6 skills and    │
│                                               │           continue]      │
│                                               │  Skip skills             │
│                                               │  Installs the selected   │
│                                               │  skills in this work-    │
│                                               │  space, then opens the   │
│                                               │  next step.              │
│                                               │  ! You approve skills    │
│                                               │  that contain scripts    │
│                                               │  before the install.     │
└───────────────────────────────────────────────┴──────────────────────────┘
```

**Rail frame (amendment A2).** The primary must be visible at all times without a scroll.

- At ≥ 1100 px the page is a CSS grid with two columns. The rail is in the right column and
  starts at the top of the page, beside the header band (`grid-template-areas: "header rail"
  "cov rail" "body rail"`). At scroll 0 the rail top is 24 px below the top of the scroll
  container, so the full rail fits in the viewport before any scroll.
- The rail is `display: flex; flex-direction: column; position: sticky; top: var(--ptah-space-6);
  max-height: calc(<scroll container height> - 2 * var(--ptah-space-6)); overflow: hidden`.
  In the implementation, use `100dvh` minus the top offset of the onboarding scroll container
  (measure it once in the Electron window), or a `ResizeObserver` on the scroll container.
- The rail head (title, count, meter, coverage line) is `flex: none`. The list of selected skills
  is `flex: 1 1 auto; min-height: 0; overflow: auto`. It is the only part of the rail that
  scrolls. The old `max-height: min(184px, 30vh)` limit goes away.
- The rail footer (primary, "Skip skills", helper lines) is `flex: none` and has a top border.
  It is pinned at the bottom of the rail.
- Measured in the prototype at 1280 × 720 (content 688 px): primary at y 515–555, last helper
  line ends at y 669. At 900 × 700 the bottom bar primary is at y 608–648.
- Below 1100 px the bottom bar does not move (`position: sticky; bottom: 0`). Below 720 px the
  bar is also sticky (before, it was an inline row at the end); the actions wrap to a column.

### Grid by container width

| Container width | Page frame | Main grid | Rail | Action position |
| --- | --- | --- | --- | --- |
| < 720 px (team-builder card, narrow) | full width, `p-4` | 1 column | none | `ptah-form-actions sticky` bottom bar, actions in one column (A2) |
| 720–1099 px (window 900 px) | max 1040 px, padding `--ptah-page-gutter` (16 px at this width) | 2 columns, gap `--ptah-gap-field` (16 px) | none | `ptah-form-actions sticky` bottom bar with summary text + primary + Skip |
| 1100–1439 px (window 1280 px) | max 1240 px, padding 24 px, page grid with rail column | 2 columns, gap 16 px | 296 px, right column from the page top, `position: sticky; top: 24px`, max-height viewport − 48 px | Primary in the pinned rail footer |
| ≥ 1440 px (window 1600 px) | max 1440 px, padding 24 px | 3 columns, gap 16 px | 320 px, same frame | Primary in the pinned rail footer |

- Main column and rail gap: `--ptah-gap-group` (24 px).
- Vertical rhythm: header → coverage strip `--ptah-gap-group` (24 px); section title → grid
  `--ptah-gap-heading` (12 px); section → section `--ptah-gap-section` (32 px).
- Grid rows use `grid-auto-rows: 1fr` inside a section so that cards in a row have equal height.
- The coverage strip wraps. Over 12 chips, it shows the first 11 and a "+N more" chip that opens
  the full list in place.

---

## Skill card

New component `ptah-skill-pick-card`. It is a `<label>` that contains the existing `ptahCheckbox`
input, so the native checkbox keeps the keyboard and screen reader behaviour.

### Anatomy (top to bottom)

```text
┌───────────────────────────────────────────────┐
│ [☑]  angular-best-practices        [Installed]│  row 1: checkbox · name · state badge
│      vercel-labs/agent-skills · ⤓ 12.4k       │  row 2: source (mono) · installs
│                                               │
│      Signals, standalone components and OnPush│  row 3: description, max 3 lines
│      rules for modern Angular projects.       │
│                                               │
│      Covers  [Angular] [Playwright]           │  row 4: covered stack items
│                                   View ↗      │  row 5: link to skills.sh (when url)
└───────────────────────────────────────────────┘
```

| Part | Content | Classes / tokens |
| --- | --- | --- |
| Root | `<label>` grid `grid-template-columns: auto 1fr`, column gap `--ptah-gap-heading` (12 px) | `rounded-[var(--glass-radius-inner,var(--ptah-radius-surface))]` (14 px glass), `border border-[var(--ptah-border-color)]`, `bg-[var(--glass-fill-tile,var(--surface-1))]`, `p-[var(--ptah-surface-pad)]` (16 px), `cursor-pointer`, `transition-colors duration-ptah-fast ease-ptah-standard` |
| Checkbox | existing `input[type=checkbox][ptahCheckbox]` | top aligned with the name line (`mt-0.5`) |
| Name | `skill.name` | type role section-title: 1rem / 1.5rem / 600, `text-base-content`, `truncate`, `title` attribute = full name |
| State badge | "Installed" when `skill.isInstalled` | `span[ptahBadge] tone="ok" size="xs"` |
| Source | `skill.source` | `font-mono`, type role caption 0.6875rem / 1rem / 500, `text-base-content-muted`, `truncate` with `title`. The `skillId` part of the key is not shown (the name shows it). |
| Installs | compact number: `1,240` → `1.2k`, `12,400` → `12.4k`, `0` → "New" | type role hint 0.75rem / 1rem, `text-base-content-muted`, lucide `download` icon `size-ptah-icon-xs`. `aria-label="12,400 installs"` |
| Description | `skill.description`, `line-clamp-3` | type role body 0.875rem / 1.25rem, `text-base-content`. Full text in `title`. |
| No description | text `"{source} - {installs} installs"`, for example "acme/qa-skills - 312 installs" | same body role, but `text-base-content-muted` and italic off. No empty line. |
| Covers | label "Covers" + one chip per stack item | label: type role label 0.75rem / 500 muted. Chips: `span[ptahBadge] tone="neutral" appearance="outline" size="xs"`. A chip for the item that the coverage filter shows uses `tone="accent"`. Max 3 chips, then "+N". |
| Link | "View on skills.sh" when `skill.url` is present | `ptahButton variant="link" size="xs"`, opens through the existing external-link path. `(click)` stops propagation so the card selection does not change. |

`evidence` format: the backend sends one string, for example "Angular, Playwright". The card splits
it on `,` and trims each part. A part that matches a `detectedItems[].name` (case-insensitive)
becomes a chip. When no part matches, the card shows the raw string after "Covers" as hint text.
See Decision D4.

### States

| State | Visual change | Tokens |
| --- | --- | --- |
| Default | as above | border `--ptah-border-color` |
| Hover | border stronger, fill one step up | `hover:border-[var(--ptah-border-color-strong)] hover:bg-[var(--surface-2)]` |
| Focus (keyboard) | focus ring on the card, not only the box | `has-[:focus-visible]:outline has-[:focus-visible]:outline-ptah-focus-width has-[:focus-visible]:outline-ptah-focus has-[:focus-visible]:outline-offset-ptah-focus` (`--ptah-focus-ring-*`) |
| Selected | primary edge, faint primary fill, checkbox checked | `border-[color-mix(in_oklch,oklch(var(--p))_70%,transparent)]`, `bg-[color-mix(in_oklch,oklch(var(--p))_8%,var(--glass-fill-tile,var(--surface-1)))]`, `data-selected` attribute for tests |
| Selected + hover | selected edge at 100% | `oklch(var(--p))` |
| No description | fallback text "source - installs", muted | see table above |
| Covers several stack items | two or more chips in row 4 | no extra style; the coverage strip counts the skill for each item |
| Installed already | "Installed" badge (ok tone) in row 1; hint under the link row: "Select to reinstall this version." | `tone="ok"`; the card stays selectable (Decision D5) |
| Disabled (busy navigation or install) | `opacity: var(--ptah-btn-disabled-opacity)` (0.48), `cursor-not-allowed`, checkbox `disabled` | from `busy` input |
| Filtered out | not rendered (the grid shows only cards for the active chip) | — |

---

## Actions

| Action | Position | Variant | Label | Disabled / busy |
| --- | --- | --- | --- | --- |
| Install and continue (primary) | Pinned rail footer, full width (≥ 1100 px). Sticky bottom bar (< 1100 px). Always visible without a scroll (A2). | `ptahButton variant="primary"`, size md, `data-testid="skill-install-primary"`, `aria-describedby` = the helper lines | `Install N skills and continue` when N > 1, `Install 1 skill and continue` when N = 1, `Continue without skills` when N = 0 (D10) | Disabled while recommendations load or while `busy` (navigation). While the consent preview loads: busy spinner and label "Preparing install…" (D6, D10). |
| Skip skills | Directly under the primary in the rail footer; left of the primary in the bar | `ptahButton variant="ghost"` size sm | `Skip skills` | Shown **only when N > 0** (when N = 0 the primary already continues; see Proposed Removals R1). Disabled while `busy` or loading. |
| Helper line 1 (text, not a control) | Under the primary and Skip, in the rail footer and the bar | `text-xs text-base-content-muted` | N > 0: "Installs the selected skills in this workspace, then opens the next step." N = 0: "Opens the next step. No skill is installed." | Hidden while recommendations load. Replaces "Next: review files and approve scripts before install." |
| Helper line 2 (text, not a control) | Under helper line 1, with the `need` glyph `!` | `text-xs text-base-content-muted` | Before preview: "You approve skills that contain scripts before the install." After a preview of the same selection (back from the consent modal): "N selected skills contain scripts. You approve them before the install." ("1 selected skill contains scripts. You approve it before the install."), or no line when no selected skill contains scripts. | Shown only when N > 0. A selection change after a preview returns to the before-preview text. |
| Re-run skill search | Header band, right | `ptahButton variant="secondary"` size sm, lucide `refresh-cw` icon | `Re-run skill search` | Disabled when there is no completed analysis (`!canRetry()`), while recommendations load, and while navigation runs (`leaving()`). Tooltip when disabled: "Choose a completed analysis first." |
| Back | Header band, left of title (`ptah-page-header backLabel="Back"`) | ghost | `Back` | Disabled while `busy` |
| Search | Toolbar above the grid, field + button | field `ptah-field` + `ptahInput`, button `variant="secondary"` | placeholder "Search the skill registry", button `Search` | Disabled when query is blank or a search runs. Button shows spinner while it runs. |
| Clear search results | Search results heading, right | `variant="ghost"` size xs | `Clear` | — |
| Search for <item> | No match panel row | `variant="secondary"` size xs | `Search for Jest` | Disabled while a search runs |
| Remove from selection | Rail list, each row | icon button `variant="ghost"` size xs, lucide `x` | `aria-label="Remove angular-best-practices"` | Disabled while `busy` |
| Coverage chip filter | Coverage strip | toggle buttons (`aria-pressed`) | item name + state glyph | — |

Hierarchy rule: one primary per surface. The rail or the bar is the only place with the primary.
Sticky: the rail is `position: sticky; top: var(--ptah-space-6)` inside the scroll container, with
the max-height and the pinned footer of "Rail frame (amendment A2)". The bottom bar is
`ptah-form-actions sticky` and adds a top border and the glass raised fill.

---

## Flow to the next step

The primary installs the selected skills in the workspace and opens the next step. The consent
modal stays between the two as a security step. Its flow and behaviour do not change.

**Analysis page host** (`analyze-skills.page.ts`, Electron setup route):

1. Page primary **"Install N skills and continue"** (N = selected count). On click the button
   shows a spinner and **"Preparing install…"** while `wizard:preview-skills-for-consent` runs.
   The grid stays (D6).
2. The consent modal opens: title **"Review skill installation"**, text "Review the files and
   approve each skill that contains scripts." Each skill has a section with the name, the content
   hash, "No scripts detected" or "Contains scripts", "Scripts (N)" and "All files (N)".
3. Each skill with scripts has the checkbox **"I approve installing this exact version of
   [skillName] with its scripts."** A skill without scripts needs no approval.
4. Modal confirm **"Install N skills and continue"** (N = preview count). It stays disabled until
   each skill with scripts is approved. On click: spinner and **"Installing…"** while
   `wizard:install-skills-with-consent` runs. Modal **"Back"** returns to the page with the
   selection kept.
5. Success: the Project guidance step opens (router navigation, as today). Failure: the modal
   closes, the page shows the error alert, and the selection stays.

Other paths on the analysis page:

- N = 0: page primary **"Continue without skills"** opens the guidance step. No preview, no modal.
- N > 0: **"Skip skills"** opens the guidance step. No preview, no install.

**Team-builder host** (`team-builder-start.page.ts`, 760 px card): steps 1–4 are the same, with
the same labels. Step 5: success starts the chat through the launcher (stage `launching`), and the
live status "Installing skills..." shows during the install, as today. "Continue without skills"
and "Skip skills" start the chat without an install.

The prototype shows the full path: page primary → "Preparing install…" → consent modal (state
button "Consent") → approve → "Installing…" → a "Next step: Project guidance" panel.

---

## States

| State | Trigger (existing signal) | Display |
| --- | --- | --- |
| Loading recommendations | `state.loading()` and no recommendations yet | Coverage strip: 6 skeleton chips (`ptah-skeleton`). Grid: 6 skeleton cards with the card size. Rail: "Finding skills…" and the primary disabled with label `Continue without skills`. Live region text: "Finding recommended skills". |
| Re-run in progress | `state.loading()` after a load | The old grid stays, with `opacity: 0.48` and `aria-busy="true"`. "Re-run skill search" shows a spinner. |
| Preview in progress | `preview()` runs | The grid stays. The primary shows busy "Preparing install…". (Today the grid disappears; see D6.) |
| Consent open | stage `consent` | The existing consent modal over the page. Confirm label "Install N skills and continue", disabled until each skill with scripts is approved. |
| Installing | stage `installing` | Consent modal stays open. Confirm shows spinner and "Installing…"; "Back" and the approval checkboxes are disabled. |
| Populated | recommendations > 0 | as in Layout |
| Empty (no recommendations) | recommendations = 0, not loading | `ptah-state-panel state="empty"` title "No skills match your stack yet", body "Search the registry, or continue without skills." The search field gets focus from the "Search the registry" action of the panel. Coverage strip still shows all items as "No match". |
| No match for one item | `summary().unmatchedItems` | Coverage chip in need ink with `!` glyph and text "no match". A row in the No match panel: item name, kind, "Search for <item>", and `ptah-project-skill-draft` for `framework` and `pattern` kinds. |
| No stack summary | `summarySource === 'none'` | Coverage strip is replaced by one hint line: "No stack summary was found for this analysis." |
| Analysis warning | `summary().warning` | `ptah-alert` tone warn under the coverage strip, `role="status"`. |
| Registry search failures | `summary().searchFailures` | `ptah-alert` tone warn: "Search failed for 2 stack items" + list "Nx: timeout". The chips of those items show the need glyph. |
| Load error | `state.error()` | `ptah-state-panel state="error"` in the grid region with "Re-run skill search" as its action; `role="alert"`. When there is no analysis: text "Choose a completed analysis first." and action "Back". |
| Manual search running | `state.searching()` | Search button busy, results section shows 2 skeleton cards, live region "Searching skills…". |
| Manual search error | `state.searchError()` | Inline under the field: `text-state-err` with lucide `alert-circle`, `role="alert"`, text "Skill search failed. Try again." The field keeps the query. |
| Manual search no results | search done, 0 new results | Hint in the results section: "No other skills found for "<query>"." |
| Re-run reset message | `selectionReset()` | `ptah-alert` tone info, under the coverage strip, `role="status"`: "Skill selection was reset to the new recommendations." Dismiss button. It goes away at the next selection change. |
| Install failed (back from consent) | `state.error()` with stage `review` | Alert tone err above the grid with the existing message; the selection stays. |

---

## Accessibility

- **Landmarks and headings.** One `h1` "Choose skills for your stack" (`tabindex="-1"`, focus on
  load, as `skill-review-title` today). `h2` for "Stack coverage", "Search results",
  "Recommended for this workspace", "No match in the registry", "Your selection". The duplicate
  "Review skills" h2 goes away.
- **Keyboard order.** Back → Re-run → coverage chips (left to right) → search field → Search →
  search results cards → recommended cards (row by row) → No match rows → rail (remove buttons,
  primary, Skip). At narrow width the bottom bar is last in the DOM, so the order is the same.
  Space toggles a card (native checkbox). Enter in the search field submits the search.
- **Roles.** Coverage strip: `role="group" aria-label="Filter skills by stack item"`; each chip is a
  `<button aria-pressed>` with an accessible name such as "Angular, covered by 2 selected skills".
  Grid: `<ul role="list">` of `<li>`, each card a `<label>` with the checkbox, so the name is the
  checkbox label; `aria-describedby` points to the source, installs and covers lines.
  Selection count: `aria-live="polite"` on "6 of 9 selected · covers 6 of 8 stack items".
- **Color is never the only cue.** Coverage chips use the status glyph shapes of `ptah-status`
  (done ✓, idle ○, need !). The selected card has the checked box and a stronger edge.
- **Contrast** (values from `apps/ptah-extension-webview/tailwind.config.js` and the
  `base-content-muted.spec.ts` ladder):

  | Pair | ptah-glass (dark) | ptah-glass-light |
  | --- | --- | --- |
  | `base-content` on card tile | #f2f2f1 on ~#1a1c21 ≈ 15:1 | #1e1936 on ~#f4effb ≈ 15:1 |
  | `base-content-muted` on card tile | bcm (90% L) ≈ 12:1 | bcm (46.6% L) ≈ 6.4:1 |
  | primary button text | #1b1403 on #e4b94a ≈ 10:1 | #fff8e6 on #7c5700 ≈ 6.6:1 |
  | need ink chip text | #ffb066 on tile ≈ 9:1 | #8f5200 on tile ≈ 5.6:1 |
  | done ink chip text | #5fe0a0 on tile ≈ 10:1 | #0f6434 on tile ≈ 6.7:1 |

  Values are estimates from the hex values. The implementation must add the new pairs to the
  existing contrast specs (`apps/ptah-extension-webview/src/app/state-ink-contrast.spec.ts`).
- **Motion.** Only color transitions (`--ptah-duration-fast`). No layout animation. Respect
  `prefers-reduced-motion` (no transition).
- **Target size.** Card is the target (≥ 120 px high). Icon buttons ≥ 24 × 24 px
  (`--ptah-control-h-xs`).

---

## Component map

### Existing `ui` controls used

| Control | Use |
| --- | --- |
| `ptah-page-header` (`foundation/page-header.component.ts`) | Title, description, Back |
| `PtahButtonDirective` | All buttons (primary, secondary, ghost, link) |
| `PtahCheckboxDirective` | Card checkbox |
| `ptah-field` + `PtahInputDirective` | Search field |
| `span[ptahBadge]` (`badge/badge.directive.ts`) | Covers chips, Installed badge, counts |
| `ptah-status` (`badge/status.component.ts`) | Glyph inside coverage chips |
| `ptah-state-panel` | Empty and error states |
| `ptah-skeleton` | Loading cards and chips |
| `ptah-alert` | Reset message, warning, search failures, install error |
| `ptah-form-actions sticky` | Bottom action bar at 720–1099 px and the inline row below 720 px |
| `ptah-native-modal` (inside `ptah-stack-skill-consent`) | Consent step, no change |
| `ptah-project-skill-draft` (onboarding) | No match rows for framework and pattern items |
| lucide-angular icons | `download`, `refresh-cw`, `x`, `search`, `external-link`, `alert-circle` |

### New components (all in `libs/frontend/onboarding/src/lib/proposal/`)

| Component | Inputs | Outputs | Notes |
| --- | --- | --- | --- |
| `ptah-skill-pick-card` | `skill: SkillShEntry` (required), `coveredItems: string[]`, `rawEvidence: string \| null`, `selected: boolean`, `highlightItem: string \| null`, `disabled: boolean` | `toggled: void` | Replaces the two card blocks in `stack-skill-review.component.html:29-58` and `91-112` |
| `ptah-stack-coverage-strip` | `items: StackCoverageItem[]` (`{ name, kind, evidence, state: 'covered' \| 'available' \| 'none' \| 'failed', selectedCount, totalCount }`), `activeItem: string \| null`, `loading: boolean` | `filterChanged: string \| null` | `evidence` of the stack item shows as the chip `title` |
| `ptah-skill-selection-rail` | `selected: { key, name }[]`, `total: number`, `coveredCount: number`, `stackCount: number`, `busy: boolean`, `loading: boolean`, `previewing: boolean`, `previewScriptCount: number \| null` (null before a preview of the current selection; drives helper line 2), `layout: 'rail' \| 'bar'` | `removed: string`, `continueRequested: void`, `skip: void` | Holds the only primary action, its labels (D10) and the helper lines |
| `ptah-unmatched-stack-list` | `items: StackSummaryItem[]`, `searching: boolean` | `searchRequested: string` | Wraps `ptah-project-skill-draft` |

Changed: `ptah-stack-skill-review` becomes the layout shell. It keeps its current inputs and
outputs (so `team-builder-start.page.html:99` keeps working) and gets two new optional inputs:
`detectedItems: StackSummaryItem[] = []` and `unmatchedItems: StackSummaryItem[] = []`. When
`detectedItems` is empty (team-builder flow), the coverage strip is hidden and the cards show the
raw evidence text. The `guidanceFacts` and owner-decision blocks stay, in the main column, above
the action row. A pure function `buildStackCoverage(detected, unmatched, failures, recommendations,
selectedIds)` computes the strip and the rail counts (unit-testable, no DOM).

`analyze-skills.page.ts` stops rendering the stack, failures and unmatched blocks itself
(lines 24-46) and passes the summary to the review component. The "Re-run" button moves into the
header slot of the review component through content projection (`<ng-content select="[reviewActions]">`).

---

## Preserve list

| # | Behaviour (evidence) | Result |
| --- | --- | --- |
| P1 | Select and deselect each skill (`stack-skill-review.component.html:32-37`, `state.toggle`) | Stays. Whole card is the target. Also deselect from the rail (new, same `selectionToggled` output). |
| P2 | All recommended skills selected after load (`analyze-skills.page.ts:141`) | Stays. |
| P3 | Primary label `Review selected skills (N)` / `Continue without skills` (`:198`) | Changed by D10: `Install N skills and continue` / `Continue without skills`. Moves to the pinned rail footer / sticky bar, always visible. |
| P4 | Primary disabled while `loading()` or `busy()` (`:195`) | Stays. Adds busy label "Preparing install…" during preview (D6, D10). |
| P5 | With 0 selected, primary continues to guidance (`analyze-skills.page.ts:178`) | Stays. |
| P6 | "Re-run skill search", disabled when no completed analysis, loading or leaving (`analyze-skills.page.ts:47`) | Stays, same rules. Moves to the header band, right. |
| P7 | Re-run clears manual search state (`retry()` `:153-155`) | Stays. |
| P8 | Reset message "Skill selection was reset to the new recommendations." (`:48`) | Stays, same text. Moves under the coverage strip as an info alert. |
| P9 | Manual search with loading ("Searching skills…") and error ("Skill search failed. Try again.") (`stack-skill-review.component.html:85-90`) | Stays, same texts. Moves to the toolbar above the grid; results above the recommendations. |
| P10 | Search disabled when query blank or searching (`:80`) | Stays. |
| P11 | Search results hide skills that are in the recommendations (`:92`) | Stays. |
| P12 | Detected stack items with kind and evidence (`analyze-skills.page.ts:27-29`) | Stays as the coverage strip; kind and evidence move to the chip tooltip and accessible description. |
| P13 | "No stack summary was found for this analysis." (`:30`) | Stays, same text. |
| P14 | Analysis warning, `role="status"` (`:31`) | Stays as warn alert. |
| P15 | Search failures list (`:33-37`) | Stays as warn alert + chip glyph. |
| P16 | Unmatched items, with `ptah-project-skill-draft` for framework and pattern (`:38-45`) | Stays in the No match panel. Adds "Search for <item>". |
| P17 | Error text "Choose a completed analysis first." / "Could not find skills. Try again or skip this step." / "Could not preview skills. Try again." (`analyze-skills.page.ts`) | Stays, same texts, in the error state panel or alert. |
| P18 | Loading panel "Finding recommended skills" (`stack-skill-review.component.html:15`) | Stays as skeletons + live region with the same text. |
| P19 | Empty panel when there are no recommendations (`:22-28`) | Stays; text changes to "No skills match your stack yet" / "Search the registry, or continue without skills." |
| P20 | Back button, disabled while busy (`:173-181`) | Stays, moves to the page header. |
| P21 | Skip skills button (`:183-190`) | Stays when N > 0. Hidden when N = 0 (R1, needs approval). |
| P22 | Consent / review step before install, script approval, "Installing…" (`stack-skill-consent.component.html`) | Stays: same flow, title, approvals and gating. Only the confirm label changes from "Install skills" to "Install N skills and continue" (D10). |
| P23 | Install failure returns to review with the error and the selection (`analyze-skills.page.ts:209-217`) | Stays. |
| P24 | Checkbox accessible name "Select <name>" (`:36`) | Stays. |
| P25 | Title focus target `tabindex="-1"` (`:3`) | Stays on the new h1. |
| P26 | Team-builder flow: `guidanceFacts`, owner decision fieldset, `guidanceNote`, `showOwnerDecision` (`:114-171`) | Stays in the shared component; used only by `team-builder-start`. |
| P27 | `data-testid="analyze-skills-page"` and existing test ids | Stays. New ids: `skill-pick-card`, `stack-coverage-strip`, `skill-selection-rail`. |

---

## Proposed Removals

These items need user approval. The prototype shows the proposed result.

| # | Item | Today | Proposal | Why |
| --- | --- | --- | --- | --- |
| R1 | "Skip skills" when 0 skills are selected | Shown next to "Continue without skills"; both go to guidance | Hide it when N = 0; show it when N > 0 | Two buttons with the same result. |
| R2 | "Relevance score: N" text on each card | Shown (`stack-skill-review.component.html:50-54`) | Do not show it. Keep the score as the sort order of the grid (highest first). | A raw number with no scale. The covers chips explain the match better. |
| R3 | The `source/skillId` key line on each card | Shown with `break-all` | Show `source` only; the full key goes to the `title` attribute | The name already shows the skill id. |
| R4 | Second "Review skills" heading inside the review component | h2 under the page h1 | Remove the h2 on the analysis page (keep it in the team-builder card, where there is no h1) | Same title two times. |

---

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Concept "Coverage board" with chip filter, not groups | Coverage board; grouped by stack item; keep list and add a summary | Evidence is one string per skill that can name several items; groups would duplicate cards | Yes, the card and rail components work in both |
| D2 | Right rail at ≥ 1100 px, sticky bottom bar below | Rail; bar at all widths; top bar | Window 1280 px has ~500 px unused today; the rail uses it and keeps the primary visible | Yes |
| D3 | Breakpoints by CSS container query on the component root | Media queries; container queries; `layout` input | The component is also inside a 760 px card in team-builder; `@container` is already used in `chat-input.component.css`, `canvas-empty-board.component.css` | Yes |
| D4 | Split `evidence` on `,` and match to `detectedItems` names; fallback to raw text | Split; show raw; change backend to an array | Contract must not change (task brief); `SkillRecommendation.evidence: string` (`libs/shared/src/lib/types/rpc.types.ts:30`) | Yes |
| D5 | Installed skills stay selectable, with "Installed" badge and a reinstall hint | Selectable; disabled; hidden | No current rule; disabling would change behaviour | Yes |
| D6 | Preview shows busy on the primary and keeps the grid | Keep today (grid replaced); busy primary | Today `preview()` sets `loading`, which hides the list (`analyze-skills.page.ts:180`, `stack-skill-review.component.html:13`). Needs one `previewing` signal in `StackSkillStore`; no RPC change | Yes |
| D7 | Install count compact format (`12.4k`), "New" for 0 | Full number; compact | Scan speed in a grid; full number in `aria-label` | Yes |
| D8 | Glass tile fill and inner radius (14 px) for cards, 22 px for the rail and sections | Native card; glass tile | Sibling pages use `rounded-[22px] border border-base-300` sections (`analyze-done.page.ts:28`) and `--glass-radius-inner` 14 px tiles | Yes |
| D9 | Title text "Choose skills for your stack" | Keep "Review skills"; new text | The step now is a choice, the review is the consent modal | Yes |
| D10 | Primary label "Install N skills and continue" ("Install 1 skill and continue"; N = 0: "Continue without skills"); busy "Preparing install…". Consent confirm "Install N skills and continue", busy "Installing…". Helper lines under the primary. Primary pinned and always visible (A2). | Keep "Review selected skills (N)"; "Install N skills and continue" | User feedback on the approved proposal: "i still don't see the button that should be accepting the skills and installing it in the workspace and moving to the next step". The old label does not say that it installs and continues, and in the first 1280 px screenshot the primary was cut off at the bottom of the rail. Specs that assert the old text must change in the implementation: `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts:40` (regex `/Back to intent\|Skip skills\|Review selected skills/`). Still valid: `analyze-skills.page.spec.ts:109` ("Continue without skills"), `team-builder-skill-review.component.spec.ts:15` ("Skip skills"). Labels in source: `stack-skill-review.component.html:198`, `stack-skill-consent.component.html:88`. The comment at `team-builder-start.page.ts:272` keeps "Continue without skills". No spec asserts "Install skills" (C30). | Yes |

---

## Clarifications Needed

None. The user approved the concept, R1–R4 and D1–D9, and requested amendments A1–A6 (recorded in D10, the Rail frame, the Actions table and `## Flow to the next step`).

---

## Checks

- Amendment pass (A1–A6): the prototype was opened by its `file://` URL in headless Chromium with
  `?frame=0` (the window frame fills the viewport). Four screenshots were saved:
  - `prototype/skills-step-dark-1280.png`: dark, 1280 × 720, populated, scroll 0. The rail
    footer is fully visible: primary "Install 9 skills and continue" at y 515–555, both helper
    lines end at y 669 (viewport 720). The page has no scroll outside the content scroller.
  - `prototype/skills-step-light-1280.png`: light, 1280 × 720, content scrolled by 900 px. The
    primary stays at y 515–555.
  - `prototype/skills-step-consent-dark-1280.png`: dark, 1280 × 720, state "Consent" with one
    script-free skill and one skill with scripts. The confirm "Install 2 skills and continue" is
    disabled before approval. A script check confirmed: after approval it is enabled; on click it
    shows "Installing…"; then the "Next step: Project guidance" panel opens.
  - `prototype/skills-step-dark-900.png`: dark, 900 × 700, populated. The sticky bar primary is at
    y 608–648 and the helper lines end at y 688 (viewport 700).
- The stale `skills-step-dark-900-loading.png` (old label "Review selected skills (9)") was
  deleted. The loading state is still in the prototype (state button "Loading").
- Known overlap: a card with no description shows source and installs two times (meta line and
  fallback text). The task brief requires the "source - installs" fallback text. The meta line
  stays because it keeps all cards the same shape.
- Not checked: real Electron window, `anubis` themes, the 1600 × 900 screenshot (reachable with
  the Window buttons), the < 720 px bar in the 760 px team-builder card, and measured contrast
  (the values above are estimates).
- No `npm`, `nx`, build or test command ran. The task needs none.
