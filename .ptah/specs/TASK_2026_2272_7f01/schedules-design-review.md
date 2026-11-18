# Schedules page: design review and redesign specification

Reference: `docs/design-system/settings/gate/1417/advanced-dark-1824-after.jpg` (Settings, rev 2) and
`docs/design-system/settings/README.md` ("User decisions after rev 2"). Screens reviewed: the six
`.ptah/tmp/schedules-shots/*-after.jpg` files. Spacing below uses `var(--ptah-gap-*)`; take the step
the Settings sections use (the reference uses one step between a section title and its body, one
larger step between sections). I did not verify token step names; use the names that exist.

## 1. Verdict per region

| Region | Verdict | What I see |
| --- | --- | --- |
| Header band | Partly matches | Surface, icon tile, title and description match Settings. At 1920 px the actions fit on one row. At 1024 px the actions wrap onto a second row under the description and "Review runs" renders as bare text left of the scope switch, so the row looks unaligned. |
| Instrument band | Matches | Coloured top rules, label / value / caption, same density as the six-tile band in Settings. Two issues: "Next run" shows seconds (6:47:40 PM), and at 1024 px the 2x2 wrap is fine but the long date is the widest item. |
| Job list (cards) | Differs | The list sits on the page background with only a bare "Scheduled jobs" title: no section surface, no description, no count. Settings lists are rows inside one section card. 5 jobs leave an empty cell in the 3-column grid (1920) and 2-column grid (1024). The schedule line truncates at 1024 ("At 09:00, Monday..."). The footer holds four unlabeled icon buttons; pause and resume differ only by glyph. Labels ("Schedule", "Next run", "Last run") repeat on every card. |
| Form | Differs | Renders below the grid, so the user must scroll to it (the screenshots are scrolled). It fills only the left ~50% of a wide surface; the right half is empty. Fields are `ptah-field` with true floating labels (good). The Enabled control is a toggle with an inline sentence, not a setting row. No schedule presets, no next-run preview. The invalid summary banner and per-field errors are clear and should be kept. |
| Drawer | Mostly matches | Right drawer, dark surface, facts grid, prompt, workspace, run history, sticky footer with Run now / Edit / Disable / Delete. Good. Issues: timestamps with seconds, the full session id runs within ~20 px of the edge, fact labels are very small, "Edit" leaves the drawer to open the form under the grid. |
| Light theme (1440) | Matches, weak separation | Same structure and tokens. Cards are beige on beige with a faint border, so the grid reads flat. Rows in one section card with hairlines fix this. |
| 1024 px | Differs | Header actions wrap (above). Cards truncate the schedule and the job name. The app shell nav labels are clipped at 1024 px; that is outside this page and not part of this spec. |

## 2. Decisions

- **A. Form location: choose (1), the right-side drawer shared with job detail.** The form no longer
  needs scrolling, matches the Edit flow, and a create/edit flow is a task, not a persistent setting, so a
  Settings-style section would add a permanent block to a page that is mostly a list.
- **B. Enabled control: yes, a `ptah-setting-row`.** It is the Settings pattern for a labelled switch
  with explanation; the row title is the label, so no floating label.
- **C. Next-runs preview and presets: yes, both.** The hint under the cron field already shows a human
  description, so an expression is already interpreted; showing the next 3 run times and 5 preset chips
  removes guesswork and cron syntax errors.
- **D. Seconds in timestamps: remove them.** Jobs run at minute granularity; seconds are noise. Use
  `Nov 18, 6:47 PM` (add the year only when it is not the current year) and relative text second; keep the
  exact value in a native `title` attribute.
- **E. List: replace the card grid with rows in one section card.** Rows scan faster, never leave an
  empty cell, never truncate the schedule (it wraps), and match the Settings lists. Replace the four bare
  icons by one labelled primary action plus two named icon buttons (see section 3).

## 3. Build specification

### 3.1 Shared rules

- Time format helper: `Nov 18, 6:47 PM` (12 h or 24 h as the locale gives); year shown only if not the
  current year. Apply to instrument band, rows, drawer facts and run history. Durations keep "4m 00s".
  Set the full locale string with seconds as `title` on the time element.
- Header band at 1024 px: keep title and description in one block; put the actions in a
  `flex flex-wrap items-center justify-end gap-[var(--ptah-gap-2)]` group that starts a new row but
  right-aligns (`ml-auto`), and render "Review runs" as `ptahButton` ghost (not bare text).
- All strings below are final copy.

### 3.2 Job list (replaces the grid; keep what works)

- Wrap the list in one `ptah-surface-card` with a `ptah-section-header`: title "Scheduled jobs",
  description "Each job starts a headless session with its prompt. Select a job to see runs and edit it.",
  right slot shows the count ("5 jobs") as `ptahBadge`. Remove the grid classes.
- Below the header, a `ul` with `divide-y` (the section hairline colour of Settings). One `li` per job
  containing a `button` (full row, `w-full text-left`, focus ring from the DS) with
  `data-testid="cron-job-card"` (keep the id; keep the existing click handler that opens the drawer).
- Row layout, 1920 px and above `lg`: `grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]
  items-center gap-[var(--ptah-gap-4)] py-[var(--ptah-gap-3)]`:
  1. Name (font-medium, `truncate`) with, under it, the creator line ("Created by you" / "Created by
     agent session 7f3c2a9e") in muted caption. A "Paused" `ptahBadge` follows the name when disabled.
  2. Schedule: the human description on line 1 ("Every Monday at 07:30"), the cron expression in
     monospace muted on line 2. No "Schedule" label (a column caption row above the list names the
     columns: Job, Schedule, Next run, Last run; hidden below `lg`).
  3. Next run: "Nov 24, 6:35 PM" with "in 5d" muted below; "Paused" when disabled.
  4. Last run: `ptah-status` (Succeeded / Failed / Running / Skipped, same tones as today) with the
     relative time ("3h ago") beside it; "No runs yet" when empty.
  5. Actions (keep the existing handlers and test ids on them): `ptahButton` ghost xs "Run now"
     with play icon; `ptahIconButton` for Pause or Resume with `aria-label` "Pause job" / "Resume job" and
     a `title`; `ptahIconButton` "Delete job". Edit is removed from the row (a row click opens the drawer,
     which has Edit). Delete keeps the existing `ptah-inline-confirm` pattern, shown in place of the actions.
- Below `lg` (1024 px): each row becomes two lines: line 1 name + paused badge + actions at the right;
  line 2 a `flex flex-wrap gap-x-[var(--ptah-gap-4)]` of schedule, next run and last run, each with a small
  inline label ("Schedule", "Next", "Last"). Nothing truncates except the name (`truncate`).
- Footer note (settings.json) moves inside the same card as a `border-t` caption row; the text stays.
- Empty state and loading state stay (`ptah-state-panel`, `ptah-skeleton`); render them inside the card.

### 3.3 Drawer: detail mode

- Keep structure, order and footer. Changes only: time format (3.1); session ids `break-all` with
  `pr-[var(--ptah-gap-2)]` and `select-all`; fact labels use the same caption style as the instrument band
  (not smaller); "Edit" now switches the same drawer to form mode (3.4) with no scroll or route change.

### 3.4 Drawer: form mode (create and edit)

- Container: the existing `ptah-native-drawer`. "New job" (`data-testid="cron-new-job-btn"`, keep)
  opens it with title "New job" and no job; "Edit" on a job opens it with title "Edit job". The drawer
  header shows the title and, in edit mode, the job name as caption. The page no longer renders a form below
  the list. Delete the `max-w-2xl` form surface.
- `<form data-testid="cron-form">` is the drawer body: `flex flex-col gap-[var(--ptah-gap-4)]`, single
  column at every width. Drawer width follows the existing drawer (about 576 px at 1920); at 1024 px the
  drawer is at most `min(92vw, 576px)`. No two-column grid.
- If invalid summary exists: `ptah-alert` (warning) at the top of the body,
  `data-testid="cron-form-invalid-summary"`, text "Fix N fields before you save." (as today). A save
  failure uses a second `ptah-alert` (error) with `data-testid="cron-form-save-error"`, placed directly
  above the footer, so it is visible without scrolling.
- Field order and components (all text controls in `ptah-field` with a floating label, per the Settings
  rule; hint line carries all help text):
  1. Name: `ptah-field` label "Name" required, `ptahInput`, `data-testid="cron-form-name"`. Hint
     "Shown in the list and in run history." Error: "Enter a name."
  2. Schedule group (visual group: a `ptah-surface-card` density compact containing 2, 3 and 4):
     2. Cron expression: `ptah-field` label "Cron expression" required, `ptahInput` monospace,
        `data-testid="cron-form-expr"`. Hint: the human description when valid ("At 09:00, Monday through
        Friday"), "Five fields: minute hour day month weekday." when empty. Error: "Enter a cron
        expression." or "This is not a valid cron expression."
     3. Presets: a `flex flex-wrap gap-[var(--ptah-gap-2)]` of `ptahButton` ghost xs chips, text:
        "Every 30 min" (`*/30 * * * *`), "Hourly" (`0 * * * *`), "Daily 09:00" (`0 9 * * *`),
        "Weekdays 09:00" (`0 9 * * 1-5`), "Weekly Mon 07:30" (`30 7 * * 1`). A click sets the field value and
        focuses it. The chip whose expression equals the value gets the selected style.
     4. Timezone: `ptah-field` label "Timezone" containing `ptah-select`,
        `data-testid="cron-form-timezone"`. Hint "Detected timezone: Africa/Cairo" (keep).
     5. Next runs preview: under the group, a caption "Next runs" and an `ol` of up to 3 lines
        ("Wed, Nov 19, 9:00 AM", "in 14h" muted at the right), computed in the selected timezone from the
        same source that produces the human description. Invalid or empty expression: show "Enter a valid
        expression to preview runs." muted, no error colour. Add `aria-live="polite"`.
  3. Prompt: `ptah-field` label "Prompt" required, `ptahTextarea` 6 rows, `data-testid="cron-form-prompt"`.
     Hint "What the agent does each time the job runs." Error "Enter a prompt."
  4. Workspace root: `ptah-field` label "Workspace root", `ptahInput` monospace,
     `data-testid="cron-form-workspace"`. Hint "Optional. Leave it empty for a job without a workspace."
  5. Enabled: `ptah-setting-row`, title "Enabled", description "A job that is not enabled keeps its
     schedule but does not run.", control `ptahToggle` with `data-testid="cron-form-enabled"` and
     `aria-label="Enabled"`; no floating label, no inline sentence. Default on for a new job.
- Errors: only under the field (hint line replaced by the error in the error colour, as the shots show
  today) plus the summary alert above. Validate on submit and on blur; the first invalid field takes focus.
- Buttons: in the drawer footer (sticky, same bar as the detail footer), left to right: `ptahButton`
  primary "Create job" (edit mode: "Save changes"), `data-testid="cron-form-submit"`; `ptahButton` ghost
  "Cancel", `data-testid="cron-form-cancel"`. In edit mode a ghost danger "Delete" at the far right as in
  detail mode. Submit shows the busy state of `ptahButton` and disables both buttons while saving.
- Cancel or Escape with unsaved edits: show `ptah-inline-confirm` in the footer ("Discard changes?" /
  "Discard", "Keep editing"). Without edits it closes at once. After a successful create the drawer
  switches to detail mode of the new job; after a successful edit it returns to detail mode.
- At 1024 px nothing changes in the form (single column); the footer buttons stay on one row.

## 4. Priority

Must fix now:
1. Move create/edit into the drawer (A) and remove the form below the list; keep all `cron-form-*` ids.
2. Replace the card grid by rows in a section card (E), including the labelled Run now action and the
   named Pause/Resume and Delete icon buttons; fix the 1024 px truncation.
3. Enabled as `ptah-setting-row` (B).
4. Remove seconds everywhere (D).
5. Header band actions wrap and "Review runs" as a ghost button at 1024 px.
6. Schedule presets and the human-readable hint (C, presets part).

Can follow later:
1. Next-runs preview (C) if no next-run computation is available in the renderer; it then needs a
   preview source from the backend (do not duplicate cron parsing in the renderer).
2. Search toolbar (`ptah-toolbar`) and sorting once a user has more than about 8 jobs.
3. Stronger light-theme separation beyond the hairlines (check after the row change).
4. App shell nav label clipping at 1024 px (outside this page).
