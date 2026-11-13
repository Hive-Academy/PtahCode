# Lane brief: B8-B10 frontend fix round 2 (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Do not commit, push, or stage. Leave files unstaged.

Read first: `.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10.md` (the review that found these
defects). Another lane edits backend files at the same time. Do NOT edit any file under
`libs/backend/**`.

## Fixes

### Fix 1 (Serious): name the failed skill

The host result of `wizard:install-skills-with-consent` has `success`, `installed`, and on a
failure `failedSkill` and `reason` (`reason` is safe fixed text from the host). The shared type
(`libs/shared/src/lib/types/rpc.types.ts`, the install result near line 83) has only `success` and
`installed`. Add optional `failedSkill?: string` and `reason?: string` to that type. In
`team-builder-start.page.ts`, on `success: false` show an error that names the failed skill and
its reason, and lists the installed skills when there are some. Keep the installed skills in the
store. Stage goes back to `review`. Chat does not start. Render all of it by interpolation.

### Fix 2 (Serious): a workspace change keeps previous lists

On a workspace change (and on destroy) clear ALL workspace-bound state in
`team-builder-skill.store.ts`: recommendations, search results, search query, guidance facts,
installed names, preview, approval, selection, errors, loading flags. Give the store one `reset()`
method and call it. A failed guidance call clears old facts. Search results from an older request
or workspace must not render during a new load. Keep the request-version guards.

### Fix 3 (Minor): Escape during install

While the stage is `installing`, the consent dialog must not close. Read
`libs/frontend/ui` `native-modal.component.ts` (read only, do not edit) to find the supported way
(an input that blocks dismissal, or a cancel output that can be prevented). If the primitive has
no such way, keep the page state consistent instead: if the dialog closes during an install, the
page shows the install progress state on the review stage, and no second install can start.
Say which way you used.

### Fix 4 (Minor): raw error text

`message()` in `team-builder-start.page.ts` shows `Error.message` from any error. Show the message
only for errors that the RPC layer marks as user-facing (read how `ClaudeRpcService` reports a
failure and what other pages in `libs/frontend/onboarding` do; follow that pattern). For other
errors show a fixed sentence per action (load recommendations, search, preview, install, launch).

## Tests (add cases, do not weaken existing ones)

In `team-builder-start.page.spec.ts` (and the store or component specs if better placed):
- install failure with `failedSkill` and `reason` -> the error names the skill and the installed
  ones, stage is `review`, the chat launcher is not called;
- total failure (`installed: []`) -> the error names the failed skill;
- workspace change -> recommendations, search results, guidance facts and installed names are
  empty before the new load resolves;
- failed guidance call -> no old facts;
- a non-user-facing error -> fixed sentence, not the raw text.

## Write set (nothing else)

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`, `.html`, `.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts` (a spec for it is allowed:
  `team-builder-skill.store.spec.ts` in the same folder)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.{ts,html,spec.ts}`
- `libs/shared/src/lib/types/rpc.types.ts` (the two optional fields only)
- The deliverable.

Nothing else under `libs/frontend/**`. Nothing in `apps/ptah-extension-webview/**`. Not
`tools/ui-class-audit/baseline.json`. Nothing under `libs/backend/**`. If you need another file,
stop and name it in the report.

## Rules for code

Standalone OnPush components, signals, `inject()`, `input()`/`output()`, `ClaudeRpcService` only,
existing `libs/frontend/ui` primitives, no `[innerHTML]` (skill names, descriptions, file names and
reasons are untrusted text), no `any`, no `@ts-ignore`, no `as unknown as X`. Keep each file under
the file-size lint limit. Do not swallow errors.

## Verify (scoped only)

1. `npm run verify -- -t lint,typecheck,test -p @ptah-extension/onboarding 2>&1 | tail -40`
2. If a `.html` template changed:
   `npm run verify -- -t typecheck-templates -p ptah-extension-webview 2>&1 | tail -20`

If Nx fails with `spawn EPERM` or the verify lock does not start within 10 minutes, say so and run
the focused specs by Jest directly:
`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <each changed spec>`.
Report the real result. Do not claim a pass that you did not see.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Verification is scoped only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e` or
  `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push or history rewrite. Report an unexpected change; do not revert it.
- No personal data or home paths with a user name in files or in the report.
- Electron first: the renderer is `apps/ptah-extension-webview`, and visual checks are in Electron
  only.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B8-fix2-report.md` (UTF-8, short Simplified Technical English):
what changed per file (one line each), the way used for Fix 3, the real test results (command,
suites, tests, pass or fail), anything unexpected.

## Reply format

One short message: done or blocked, files changed, test results.
