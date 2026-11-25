# Fix brief — P2 review slice B1 (TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
Review: TF/code-logic-review-p2-B1.md. Read findings 1-5 in full; each has a suggested fix.
Fix ALL five findings as the review suggests (decision D41):
1. Blocking: `refreshSetupModel()` always derives `committed` from the fresh
   `wizard:get-setup-model` state; `commitSeq` stays a monotonic floor; a settled, non-superseded
   read that differs from the last receipt syncs the commit baseline and clears the stale Undo and
   commit feedback. Spec: local Set -> external Clear (unset read) -> refresh -> Save P2 + Undo
   back to `committed === null`.
2. Major: outside-popover Undo only when `setupCommit().status === 'saved'` and an undo entry
   exists; clear transient invalid/failed feedback when the Setup popover is cancelled/closed.
3. Major: `reportFailure` must not drop the failure of the latest save when an older overlapping
   save committed first. Spec: Save 1 succeeds before overlapping Save 2 fails with
   SETUP_MODEL_INVALID -> status invalid.
4. Minor: guard `toggleEdit('setup')`, the Setup cell `aria-disabled` and the `'setup'` deep-link
   effect while the Setup commit is saving.
5. Minor: include `this.setupModel()` in `commitHooks.sectionsReady()`.

## Write files (only these 6)
libs/frontend/core/src/lib/services/providers-settings-state.service.ts, .spec.ts;
libs/frontend/core/src/lib/services/providers-commit.service.ts, .spec.ts;
libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts, .spec.ts.
Do not edit other files (another lane edits the onboarding analyze page now).

## Checks (focused only)
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/core/src/lib/services/providers-commit.service.spec.ts`
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` and `.../chat/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

**Deliverable**: TF/batch-fix-p2-B1-report.md (skeleton first; per finding: change, file:line,
test; checks). Reply `WROTE: <absolute path>` plus one headline line.
