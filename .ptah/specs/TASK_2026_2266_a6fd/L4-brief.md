# L4 brief — shared controls on the Providers page

Worktree (work ONLY here): `D:\projects\ptah-extension\.claude-worktrees\fix-settings-providers-lanes-ae00bbe8bd36`
Branch `fix/settings-providers-lanes`. All task work is uncommitted. Never commit, push, stash, revert, restore or clean.
Deliverable: `.ptah/specs/TASK_2026_2266_a6fd/L4-report.md` (files changed, line counts before/after, checks run with result,
anything not done and why).

## Goal
Every text/number input and every select on Settings > Providers uses the shared controls of `@ptah-extension/ui`:
- `ptah-field` (`libs/frontend/ui/src/lib/surfaces/field.component.ts`, true floating label) around `input[ptahInput]` /
  `textarea[ptahTextarea]`. Read its inputs (label, hint, error, appearance, size) before use.
- `ptah-select` (`libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`) for every select. Never a native
  `<select>`. Input `labelledBy`: inside `ptah-setting-row`, bind `[labelledBy]="<row>.titleId()"` (read
  `ptah-setting-row` for the exact API, a template ref is fine). Outside a setting row use `label` or `aria-label`.
- Lanes table control cells (Permission, Network, Model, Account selects in
  `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html` and the cell components it uses) carry the class
  `ptah-table-control-cell` on the `td` (or the wrapper the shared CSS expects; grep the ui lib for
  `ptah-table-control-cell`) so the select is compact. No label above the select in a table cell; aria-label = column header.
- Groups of fields use `[ptahFieldGrid]` (max three columns), not one small input per line.
Do NOT edit any file under `libs/frontend/ui/`. Use only the public API. If an option is missing, write it in the report.

## Files (Providers page only)
- `libs/frontend/chat/src/lib/settings/providers/`: agent-orchestration-config (Max Concurrent), cli-tier-mapping-modal,
  decision-model-key-field, decision-model-base-url-field, decision-model-timeout-field, decision-model-row.component.html,
  main-agent-reassign-popover.component.html, cursor-credential-popover, add-cli-instance-modal.component.html
  (find exact file names with a glob). Checkboxes/toggles stay as they are.
- `libs/frontend/chat/src/lib/settings/ptah-ai/`: lanes-table.component.html and its cell components, cli-shared-defaults,
  ptah-cli-instances.
- OUT of scope: provider-setup-wizard.component.ts (note it in the report), every other settings page.
First grep these folders for `<input`, `<select`, `<textarea`, `ptahSelect` to make a complete list.

## Hard rules
- Keep every `id`, `data-testid`, `aria-label`, `name`, `formControlName`/`[(ngModel)]`/event binding. Specs and e2e use them.
  If a test id was on a native `<select>`, put it on the `ptah-select` host and make the specs drive the ptah-select
  (see how `cli-lane-default-cell.component.spec.ts` and `decision-model-row.component.spec.ts` do it now).
- Angular: standalone, OnPush, signals, `input()`/`output()`, `inject()`, built-in control flow.
- No `$any(`, `as any`, `as unknown as`, `@ts-ignore`, `console.`, `[innerHTML]`, `.skip(`, `.fixme(`. No joined lines to beat
  max-lines. A `.ts` file must not get more lines than on `main` when it is already above 700 lines
  (`git show main:<path> | wc -l`). Prefer external `.html` templates for new markup.
- Update the specs of each changed component so they pass.
- Checks you may run (only these; never `nx`, `npm run verify`, build, serve, e2e):
  - `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed specs>`
  - `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
  - `npx eslint <changed files>`
  - `npx prettier --write <changed files>`
  Write logs to `.ptah/specs/TASK_2026_2266_a6fd/L4-*.log` and read them with tail/grep.
- Electron first: the renderer is `apps/ptah-extension-webview`; it is not a VS Code host.
- No user e-mail or Windows user name in any file.
