# Lane brief: adopt ptahButton / ptahIconButton in a batch of files

Goal: replace each raw button (`<button|a class="btn ...">`) in the listed files with the owner directives
`ptahButton` or `ptahIconButton`, imported only from `@ptah-extension/ui` (add to the component `imports`).
Owner API (read libs/frontend/ui/src/lib/button/*.ts first):
- `ptahButton`: variant primary | secondary (default) | ghost | danger | link; size xs | sm (default) | md; `type`; `busy`.
- `ptahIconButton`: same, default ghost; needs an accessible name (aria-label). Use for `btn-square`.
- Active state: `data-state="active"` or `aria-pressed` instead of `btn-active`. Disabled: `[disabled]`.
- Map: btn-primary->primary, btn-ghost->ghost, btn-error->danger, btn-link->link, btn-xs->xs, btn-sm->sm. btn-outline stays RAW (no mapping).
- The directive adds `btn` itself. Remove `btn` and `btn-*` classes from the template. Keep layout classes (w-full, flex, etc.).
  If a layout class fights the owner size (for example `h-auto min-h-8 flex-col`), keep the raw button and name it as an exception.
- Owner gaps stay RAW and go on the exception list: btn-warning, btn-success, btn-info, btn-gold, btn-circle.
  Do NOT change the owner (libs/frontend/ui). Do not change the look. Do not change behavior, text, or handlers.
- Update the spec files of the touched components when they select by `.btn` classes (spec files do not count in the file limit).
- Lower `tools/ui-class-audit/baseline.json` ONLY for the touched files (counts only decrease; remove an entry at 0).
  Run the audit to see the real new numbers: `npm run verify -- -t test -p ui-class-audit` (check project name in tools/ui-class-audit/project.json).
- Write only the listed files plus their spec files plus baseline.json. No other file.

RULES (mandatory):
- Work only in the worktree given in the task. Never edit the main checkout.
- Verify only with scoped `npm run verify -- -p A,B` (lint, test, typecheck under a machine-wide lock). After a template change run
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview` one time. Never run build, serve, dev, e2e, package or workspace-wide checks.
  At most ONE verify at a time. Filter output with `| tail`. The worktree may lack node_modules: if a suite cannot start for that reason, say so; CI is the judge.
- Angular: standalone, OnPush, inject(), input()/output(), no any, no @ts-ignore, import only from the public alias of a lib.
- Do not write agent role names in new lines outside .ptah/specs/**.
- Privacy: no user email and no Windows user name in any file. Do not write local paths in files. Never print a secret.
- Do not commit, push, or open a PR. Do not use git stash, rebase, reset, force. The coordinator commits.
- Final answer: short list: files changed, each visible change (variant mapping), exceptions with reason, verify results.
