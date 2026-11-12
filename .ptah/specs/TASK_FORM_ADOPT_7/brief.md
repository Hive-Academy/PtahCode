# Lane brief: adopt the form control owners (family 2, PR 5)

Worktree (your workingDirectory, stay inside it): D:\projects\ptah-extension\.claude-worktrees\ui-form-adopt-7
Read first: `CLAUDE.md`, `.ptah/specs/TASK_2026_950_ed73/family-2-look.md`,
`.ptah/specs/TASK_2026_940_eef5/form-controls-research.md`, and the owners in
`libs/frontend/ui/src/lib/form-controls/` (+ `rich-select/`) and their public exports in
`libs/frontend/ui/src/index.ts`. Merged button adoption examples: `git log --oneline -5 -- libs/frontend/chat`.

## Task
In ONLY your listed files, replace raw DaisyUI form recipes (`input`, `select`, `textarea`, `checkbox`,
`toggle`, `form-control`, `label` and their `-sm/-xs/-bordered/...` modifiers) with the owners from
`@ptah-extension/ui`:
- Form field (md/lg): `ptah-field` with floating label + `ptahInput` / `ptahTextarea` / `ptah-select`.
- Inline (toolbar, table, row): bare directive `ptahInput` size `sm`, `ptahCheckbox`, `ptahToggle`,
  native `ptahSelect` for short inline selects.
- Compact tone: NO floating label, stacked label only.
- Form selects with groups, search or icons: `ptah-select` (single selection only, CVA, `[(value)]`).
- Add the needed imports to the component `imports` array (public alias `@ptah-extension/ui` only).
- Radios, range, card radios, contenteditable, CodeMirror, the chat composer: leave raw.
- A place that needs a variant the owners do not have: LEAVE IT RAW and list it in your report. Do not
  invent a variant. Do not edit `libs/frontend/ui`. Do not convert button classes.

## Keep behavior
Keep every `data-testid`, `id`, `name`, `formControlName`, `ngModel`/`[(ngModel)]` binding, `aria-*`,
event binding and `@if/@for` logic. If an e2e or spec selector depends on a changed class or DOM,
update it (search `apps/*-e2e`, `*.spec.ts` for the old class or selector).

## Rules
- Do NOT run build, serve, dev, e2e, package, lint or workspace-wide checks. Do not run `npm run verify`
  (the coordinator runs it once). Do NOT git commit or push.
- Do not touch `tools/ui-class-audit/baseline.json`.
- No secrets, no user profile paths, no emails in files.
- Write at most your listed files (plus spec files that need selector updates; list them).

## Report (deliverable)
Write a short markdown report (file named in your task) with: files changed, DOM delta per file
(what element/classes changed), files or places left raw and why, spec selectors updated.

## Extra rules (PR 5)
- Do NOT change owner CSS or owner components in `libs/frontend/ui`. Do not add local template workarounds
  for owner look defects (focus ring, border, clear button, chevron).
- Change into the worktree first (`cd` to the path above). Use only absolute paths for files you write.
- Verification: you run none. Never run build, serve, dev, e2e, package or workspace-wide checks.
