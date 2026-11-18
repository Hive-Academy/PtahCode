# Rules for every lane of TASK_2026_2267_be46

- Worktree: `D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677`.
  Edit only inside it and only the files your brief assigns. Another lane edits other files at the same time.
- Read first: `.ptah/specs/TASK_2026_2267_be46/context.md`, `docs/design-system/settings/README.md`
  ("User decisions after rev 2"), `docs/design-system/settings/settings-design-spec.md`, the prototype markup
  `docs/design-system/settings/prototype/settings-prototype.html` (search `data-tab="context"` and `data-tab="matrix"`)
  and the screens named in context.md.
- Shared UI API (read the source, do not edit it): `libs/frontend/ui/src/lib/patterns/form-section/`
  (`ptah-form-section` with `wide`, `[ptahFieldGrid]`, `[ptahCardGrid]`), `libs/frontend/ui/src/lib/form-controls/`
  (`ptah-field`, `ptahToggle`, select), the `ptah-select` component (rich select), `ptah-setting-row`, `ptah-alert`,
  `ptahButton`, `ptahBadge`, `ptah-skeleton`, `ptah-table` (`libs/frontend/ui/src/lib/patterns/table/`),
  `ptah-popover` / tooltip. Use the public barrel `@ptah-extension/ui`.
- Do NOT edit `libs/frontend/ui/**` (another child owns it), Providers files (`libs/frontend/chat/src/lib/settings/providers/**`),
  the Advanced page, the Search & Voice page.
- Keep every `id`, `data-testid` and `aria-label` that exists today. Keep settings keys, RPC calls and behaviour
  unchanged. This is a UI change.
- Angular rules: standalone, OnPush, signals, `input()`/`output()`, `inject()`, built-in control flow,
  `[class]` not `ngClass`. No `$any(`, `as any`, `@ts-ignore`, `as unknown as`, `console.`, `[innerHTML]`,
  `.skip(`, `.fixme(` in new code. Prefer shared `ptah*` components/directives over raw daisyUI classes
  (`btn`, `toggle`, `select`, `input`, `badge`): the ui-class-audit baseline may only go down.
- Keep each file under 700 lines. A file already above 700 lines must not grow: extract a child component.
- Checks you may run (and only these): 
  `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec files>`,
  `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`,
  `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`,
  `npx eslint <changed files>`.
  Never run `npm run verify`, `nx`, build, serve, e2e or workspace-wide commands.
- Never commit, push, stash, merge or rebase. The coordinator commits.
- Write your report to the deliverable file of your brief: files changed, decisions, hooks kept, every check you ran
  with its result, and anything left open.
