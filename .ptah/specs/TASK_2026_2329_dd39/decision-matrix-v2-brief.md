# Brief — Decision matrix dashboard v2 (glass elevation)

User-approved design: `.ptah/specs/TASK_2026_2329_dd39/decision-matrix-mock/index.html`
(open it and read its layout, CSS and render functions; its numbers are sample data only).
Current page: `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.ts`
and its children `host-routing-setting`, `lane-rotation-setting`, `performance-routing-setting`,
`routing-evidence`, `capability-matrix-setting` (same folder).
Current screenshot: `.ptah/specs/TASK_2026_2329_dd39/screens/routing-evidence-summary.png`.

User feedback: the page shows "lots of repeated cards for just small checkboxes" and dumps data
as is. They want a clean, well-architected dashboard with charts and progress bars, and
"visual architectural elevations for cards and sections to appear more elegant with our glass theme".

## Target layout (top to bottom)

1. Header: title, one-line description, "Routing model: On/Off" status pill, refresh + age.
2. KPI row, 4 glass tiles, each with a progress ring (`ptah-ring`) + label + sub-line:
   approved on review (approved/reviewed), delivered (delivered/spawned), matrix coverage
   (lane-model x task-kind cells with samples / total cells), catalogs ready (ok lanes / lanes).
3. Three chart cards in one row (wrap on narrow widths):
   - Run pipeline: funnel bars Spawned → Completed → Delivered → Reviewed → Approved with the
     drop count per step, plus one "Lost" stacked bar (failed, no deliverable, rejected,
     unverified).
   - Outcome mix by lane: one 100% stacked bar per lane + approval % + legend.
   - Who does the work: donut of runs per lane with total in the centre + legend with %.
4. Two-column row:
   - Routing controls: ONE card with three switch rows (suggest a lane, use measured
     performance, rotate close executors). Recent rotation picks as small chips under the
     rotation switch ("No recent picks yet" when empty). Replace the three separate
     form-section cards. Keep every existing setting behavior, RPC call, error and disabled
     state, and the decision-model availability messages.
   - Current pick per task kind: one row per OUTCOME_TASK_KINDS value: winner lane + model,
     a `ptah-meter` bar with a marker at the runner-up score, score number, and a
     "rotates with X" chip when the two are within the rotation margin. Empty kinds say
     "No evidence yet — falls back to lane order".
5. Outcome matrix: heatmap table, rows = lane · model, columns = task kinds; cell = score
   tinted by value + run count; dashed "—" for no samples; stale marker. Cells are buttons
   (keyboard operable, aria-pressed). A segmented switch "Measured outcomes | Model ratings"
   swaps the source to the capability-matrix ratings; this REPLACES the separate
   "Model ratings" section (keep its family filter / search / sort only if they still make
   sense as compact toolbar controls; keep its score provenance detail reachable).
   Side detail panel for the selected cell: score / 100 + runs, funnel bars, effort split
   stacked bar, measured vs rating comparison bars, the existing funnel fields that are not
   charted (revision rounds, effort not sent, capacity drop-outs) as a compact list.
6. Catalog health strip: one line, a status dot + lane + status/age per lane.

Derive every number from the data the page already loads (`AgentGetRoutingEvidenceResult`
funnels per lane/model/taskKind/effort, sample counts, scores, catalog status,
`AgentGetCapabilityMatrixResult`, rotation history). Put the aggregation in a pure,
unit-tested helper (for example `decision-matrix-dashboard.model.ts`), not in templates.
If a needed number does not exist in the RPC data, do not invent it: omit that element and
say so in the report. Loading, error (with Retry) and empty states must stay.

## Glass elevation

Use the existing glass system, not new ad-hoc styles: `data-glass-surface`
(`content`, `tile`, `plate`, `chrome`, ...), `libs/frontend/ui/src/lib/surfaces`
(`surface-card`, `surface-section`, `surface-tile`, `stat-card`), `libs/frontend/ui/src/lib/card/ptah-card.css`,
the glass rules in `apps/ptah-extension-webview/src/styles.css`, and `--ptah-*` tokens.
- Clear hierarchy: page → section plates → glass cards/tiles. No card inside a card inside a card.
- Cards: consistent radius token, a hairline border with a soft top highlight, a subtle
  elevation shadow, and a gold accent only on the key metric (for example a thin top accent
  on KPI tiles). Section headers: title + short muted description + right-aligned meta.
- Interactive cards/cells: hover and focus-visible states; honor `prefers-reduced-motion`
  and `prefers-reduced-transparency`; verify both dark and light (anubis, anubis-light) themes.
- If a shared improvement belongs in `libs/frontend/ui` (for example a glass elevation variant
  of `surface-card`), add it there with a spec, and keep other users of those components unchanged.

## Chart primitives

Reuse `libs/frontend/ui/src/lib/charts` (`ptah-ring`, `ptah-meter` with marker, `ptah-stat`).
Add only what is missing, in that folder, exported from its index, with unit + a11y specs in the
style of `charts.a11y.spec.ts`: a stacked bar (segments with labels, role="img" + aria-label
summary) and a donut. Inline SVG, theme colors from tokens, no chart library.

## Tests

- Update or replace the specs of every component you change or remove; keep coverage of the
  settings behaviors (toggle writes, rotation history states, decision-model states, evidence
  loading/error/empty, capability-matrix detail provenance).
- webview-e2e harness: `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/` —
  update specs and fixtures that target the old sections; give the fixtures enough evidence
  (several lanes, kinds and efforts) that every chart renders.
- Electron design-preview: `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`
  — add scenes `decision-matrix-dashboard-{800,1440,1824}.png` and one with a selected cell
  detail; assert no horizontal overflow and that the KPI row and chart cards render.

## Rules (mandatory)

- Electron first. Worktree `D:\projects\PtahCode\.claude-worktrees\settings-overlays`,
  branch `fix/settings-overlays`.
- Do NOT run `npm run verify`, `nx`, build, serve, e2e or Playwright. The coordinator runs them.
- Only focused checks: `npx.cmd jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx.cmd tsc --noEmit --project <tsconfig>`, `npx.cmd eslint <changed files>`, and
  `npx.cmd ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` (must report 0 over
  baseline; use `--ptah-*` spacing tokens, never raw spacing utilities or raw px).
- Strict types, no `any`, no non-null assertions to silence uncertainty, signals + `computed`
  for view state, OnPush, standalone components, import through library entry points.
- Do not commit or push.
