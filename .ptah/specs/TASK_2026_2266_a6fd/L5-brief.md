# L5 brief — visual defects from the round 3 Electron shots

Worktree (work ONLY here): `D:\projects\ptah-extension\.claude-worktrees\fix-settings-providers-lanes-ae00bbe8bd36`
Branch `fix/settings-providers-lanes`. All task work is uncommitted. Never commit, push, stash, revert, restore or clean.
Deliverable: `.ptah/specs/TASK_2026_2266_a6fd/L5-report.md` in UTF-8 (per defect: cause, fix, files; checks run with result).

Look at the shots yourself (they are images): `.ptah/specs/TASK_2026_2266_a6fd/screens/iter3/providers-*-dark-{1824,1168,784,600}-after.jpg`.
Prototype: `docs/design-system/settings/prototype/screens/rev2b-providers-lanes-dark-1168.jpg`,
`rev2b-providers-lanes-dark-784-expanded.jpg`, `review-a3-providers-lanes-dark-1440.jpg`, and
`docs/design-system/settings/prototype/settings-prototype.html` (search "Lanes").
Main files: `libs/frontend/chat/src/lib/settings/ptah-ai/` lanes-table.component.{html,css,ts}, lanes-table-status,
lanes-table-detail, lane-row-identity, lanes-section-header, cli-capability-cells, agent-orchestration-config.component.{ts,html},
cli-orchestration-matrix.

## Defects to fix (all widths unless stated)
1. "Install guide" link overlaps the "Not installed" status text (Pi row). In the wide table put it in the Actions cell
   (same place and style as "Sign in" on the Cursor row). In the collapsed table (below 950 px table width) put it on
   the second line of the lane identity, under the name, as in rev2b-784-expanded. Never overlap the toggle.
2. Model cell: "CLI default · default" repeats a default, and "provider def · defau" is clipped at 1824.
   Omit the effort part when it is a default/"n/a"/empty value. Show default values ("CLI default", "Provider default")
   in the normal sans cell text; use mono only for a real model id. Never clip a short value; a long id gets an ellipsis
   with the full text in a `title`/tooltip. Same rule for the Model fact in the lane detail.
3. Collapsed table at 784 px: Status text is truncated ("Needs A…", "Not instal…") and the "Order" and "Lane" headers
   touch ("OrderLane"). Give Status a minWidth that fits "Needs API key" and "Not installed"; make Order narrow with
   normal cell padding; let the lane identity column shrink (version may ellipsize with a title). Rows keep equal height.
4. "Unavailable" in the Permission/Network cells (and detail facts) uses a larger font than other cell text. Use the
   same size as the other secondary cell text, muted color. Keep the word (specs may assert it).
5. Actions cell: the kebab ("More actions for …") must be at the same x on every row. On the Cursor row "Sign in"
   moves the kebab to the right. Use a fixed layout: the kebab is the last item, right-aligned; a text action
   (Sign in, Install guide) sits left of it.
6. Lane detail (expanded row): the actions are in two rows (Test + result in one, All capabilities / Edit tiers / Edit /
   Delete in another). Use ONE actions row in the `ptahDetailActions` slot, wrapping only when there is no space:
   Test, the test result text, All capabilities, Info, <CLI> settings, Edit tiers, Edit, Delete (Delete last, danger
   style). The Model fact value must start at the same x as the other fact values (no extra indent).
   "Native CLI behavior" must be a row of the same facts grid (same label column, no extra gap above).
7. Lanes header: "New Ptah CLI instance" is a filled primary button; the prototype shows it as the same outline
   style as "Edit order". Use the same ptahButton variant as "Edit order".
8. Orchestration toolbar (Max Concurrent field, "Order: 1. Codex → …" chain, edit pencil, "Re-detect CLIs"):
   at 600/784 the refresh icon button wraps alone onto its own line. Make it one row at wide width; at narrow width
   the field and the chain may wrap, but the pencil and the re-detect button stay together at the right end. No lone
   icon button on its own line. The Max Concurrent field keeps its floating label.
Do not change behavior, RPC calls or the Test logic.

## Hard rules
- Keep every `id`, `data-testid`, `aria-label`, and existing bindings. Update specs of changed components so they pass.
- Never edit files under `libs/frontend/ui/`. Use the public API of `@ptah-extension/ui` (ptahButton variants,
  ptah-table, ptah-table-detail-layout slots, ptah-select, ptah-field). If an option is missing, write it in the report.
- Angular: standalone, OnPush, signals, `input()`/`output()`, `inject()`, built-in control flow.
- No `$any(`, `as any`, `as unknown as`, `@ts-ignore`, `console.`, `[innerHTML]`, `.skip(`, `.fixme(`. No joined lines.
  A `.ts` file stays at most 700 lines, or not above its `main` size when it is already above 700.
- Checks you may run (only these; never `nx`, `npm run verify`, build, serve, e2e):
  - `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed specs>`
  - `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
  - `npx eslint <changed files>` and `npx prettier --write <changed files>`
  Write logs to `.ptah/specs/TASK_2026_2266_a6fd/L5-*.log`.
- Electron first. No user e-mail or Windows user name in any file.
