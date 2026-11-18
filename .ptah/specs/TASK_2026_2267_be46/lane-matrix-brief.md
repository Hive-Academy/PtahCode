# Lane "matrix" brief (TASK_2026_2267_be46)

First read `lane-rules.md` and `context.md` in this folder and follow them exactly.

GOAL: the Settings page "Decision matrix" receives the routing settings from Context Management and is made to
match the prototype (`docs/design-system/settings/prototype/settings-prototype.html`, `data-tab="matrix"` and the
`c-routing` / `c-rotate` sections of `data-tab="context"`; screens `prototype/screens/rev2-matrix-light-1168.jpg`,
`review-a3-matrix-dark-1440.jpg`, `advanced-dark-1168.jpg` for the section pattern). The user judges by eye.
Current problems at 1824 px: controls are small and do not fill the card, no alignment, weak hierarchy, too much
text in table cells, native select menus.

YOU OWN ONLY these files (plus their .spec.ts files):
- libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts (and new child component
  files you create beside it, for example a score cell or a detail popover)
- libs/frontend/chat/src/lib/settings/settings.component.ts, settings.component.html
- libs/frontend/core/src/lib/services/app-state.service.ts (only the `PendingSettingsTab.section` union, if a new
  section id needs it)

Another lane edits orchestration-settings.component.ts at the same time: it removes `<ptah-host-routing-setting>`,
`<ptah-lane-rotation-setting>` and its `openMatrix` output. You remove the `(openMatrix)="..."` binding on
`<ptah-orchestration-settings>` in settings.component.html. Do not touch orchestration-settings files.

## Work

1. Page layout, top to bottom:
   a. Header row: ghost back button "Context management" (keep its aria-label), "Rated N days ago" meta, refresh
      icon button; meta and refresh at the right edge like the prototype.
   b. `ptah-instrument-band`: keep the existing segments and their ids. Add a segment "Routing model" with value
      "On" / "Needs a model" (tone ok / warn), driven by a new output of the host-routing component (for example
      `modelConfiguredChange`).
   c. `ptah-form-section wide` "Routing suggestions" (hint "Ptah suggests a lane for each task from its kind and
      size.") with the host routing setting.
   d. `ptah-form-section wide` "Rotate close executors" (hint "When two lanes rate the same, Ptah takes turns
      between them.") with the rotation setting.
   e. Section "Model ratings" (hint "Select a score to see where it came from."), full width: one filter row in
      `[ptahFieldGrid]` with three equal columns (family filter, model search, sort by task kind); then the
      Descending/Ascending toggle button and the result count on one line; then the table.
   Each section title is a real heading (page title h1 in the shell > section title > row title > hint). The
   host-routing and rotation components may render the `ptah-form-section` themselves. Keep their root testids
   (`host-routing-setting`, `lane-rotation-setting`) and the ids `host-routing-heading`, `lane-rotation-heading`
   on elements that still exist (the heading id can move to the real heading).
2. Host routing: `ptah-setting-row` with row title "Suggest a lane for each task" and hint "Suggestions appear
   before a lane starts. You can always choose another lane." Keep the help paragraph id `host-routing-help` (it
   can hold the existing explanation as the hint). Toggle with the shared `ptahToggle` directive at the right
   edge. Keep `id="host-routing-toggle"`, `data-testid="host-routing-toggle"`, the aria-label value (constant
   LABEL) and the aria-describedby logic. Remove the "See decision matrix" button and the `openMatrix` output.
   Needs-model state: a compact warn `ptah-alert` "Suggestions need a routing model. Choose one in Background
   models." with `id="host-routing-needs-model"` and `data-testid="host-routing-needs-model"`, and a ghost warning
   action "Choose model" that deep links to Providers > Background models with
   `AppStateService.requestSettingsTab({ tab: 'providers', section: 'background-models' })` or the existing
   equivalent (see libs/frontend/memory-curator-ui/**/memory-diagnostics-accordion.component.ts). Make sure the
   open settings page reacts (settings.component.ts consumes pending tabs; if it does not while already open, add
   the smallest fix there). Loading / error / Retry keep their testids and use ptah-skeleton / ptah-alert /
   ptahButton.
3. Lane rotation: `ptah-setting-row` row title "Take turns between close lanes", hint "Recent picks, newest
   first.", `ptahToggle` at the right edge; keep `lane-rotation-toggle` id / testid / aria-label. Recent picks: a
   wrapping list of `span[ptahBadge]` chips, newest first; each chip shows the executor name, the route label goes
   into a tooltip or a small muted prefix, the raw id moves from `<details>` into the tooltip/title. Keep
   `data-testid="lane-rotation-last-picks"`. "No recent picks yet" stays as a hint. Unavailable state: compact
   warn ptah-alert with a Retry action.
4. Filter row: replace both native `select[ptahSelect]` with the shared `ptah-select` component (designed popup
   menu). Keep the aria-labels "Sort by task kind" and "Filter by family". If `ptah-select` supports a floating
   `label`, use it ("Family", "Sort by"); otherwise use aria-label. Model search: keep `ptah-toolbar` only if it
   fits the three-column grid; otherwise use `ptah-field` with label "Search models". Equal control heights, each
   control fills its column.
5. Ratings table (capability-matrix-setting): one short value per cell. A rated cell shows the score and a small
   bar (`ptah-table-score` or the existing bar cell). Stale is a small clock icon with a tooltip "Stale: rated
   <date>", not a text line. The "Details" text button leaves the cell: a click on the score (a
   `button[ptahCellButton]` or similar) opens the existing detail popover / detail row with the long text.
   "Unrated" is a muted dash with aria-label "Unrated". Model column: model name only. Family group rows use
   `tr[ptahGroupRow]` / `ptah-table-group-title` with the "N models" count as a badge. Use `ptah-table` columns
   with `priority` so at 600 px the lower-priority task columns collapse into the detail row instead of a
   horizontal scroll. Keep all existing testids and aria-labels of the matrix and its popover.
6. Deep links in settings.component.ts `applyPendingTab`: sections `host-routing`, `routing-suggestions`,
   `lane-rotation` open the `matrix` tab in Electron, like `decision-matrix` (add them to the section union in
   app-state.service.ts if it is a closed union). Update the matrix tab description to name routing too, for
   example "Routing suggestions, executor rotation and the ratings behind them."
7. Specs: in decision-matrix-page.component.spec.ts assert that the page mounts `ptah-host-routing-setting` and
   `ptah-lane-rotation-setting`. Update the host-routing / lane-rotation / capability-matrix / settings specs for
   the new markup and keep their behaviour assertions (read-back, Undo, Retry). Add a settings.component spec for
   the new deep-link sections.

Run the allowed focused jest specs for every changed spec, tsc for the lib and spec tsconfig of libs/frontend/chat
(and libs/frontend/core if changed), and eslint on changed files. Report in `lane-matrix-report.md` in this folder.
