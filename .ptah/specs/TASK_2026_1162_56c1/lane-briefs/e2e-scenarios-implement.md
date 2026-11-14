# Lane brief: update the team builder e2e scenarios (kind: tests)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not commit, stage or
push. Leave files unstaged. Another lane edits `libs/backend/**` and
`libs/frontend/onboarding/**` at the same time: do not edit those folders.

## Problem

CI job `webview-e2e` fails in
`libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts`:

- `team-builder-start` and `narrow-team-builder-start` (line 114): no button "Start team builder".
- `team-builder-launches-chat` and `narrow-team-builder-launches-chat` (line 161): the click on
  "Start team builder" times out.

Cause: the page `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.{ts,html}` now
has stages. The intent stage has the button "Review skills". It opens a skill review stage
(component `team-builder-skill-review.component.{ts,html}`), which calls the RPC methods
`wizard:list-analyses`, `wizard:load-analysis`, `wizard:get-project-guidance`,
`wizard:recommend-skills` (and `wizard:search-skills` on search). From the review stage, the Skip
action launches the chat with no install. This is the intended new behavior. Do not change it.

## Work

1. Read the page, the review component, their templates and the store
   (`team-builder-skill.store.ts`) to get the exact accessible names and the exact RPC calls.
   Read `onboarding-proposal.fixtures.ts` and how the other onboarding fixtures answer RPC calls.
2. Update the four scenarios to the new flow:
   - `team-builder-start`: expect the button of the intent stage with its real name.
   - `team-builder-launches-chat`: fill the intent, press the intent-stage button, wait for the
     review stage, press the Skip action (real accessible name), then keep the existing
     expectations (no `onboarding-shell`, the intent text is visible in the chat). The launch
     intent can now contain a guidance block after the user text: use a text match that still
     passes (the user text stays first and unchanged).
3. Add fixture answers for each RPC method that the review stage calls, with the response types
   of `libs/shared/src/lib/types/rpc.types.ts`: no stored analysis, two recommended skills
   with evidence, guidance with only `follow` facts (so no owner decision is required). Follow
   the existing fixture pattern. No real network.
4. Add one scenario with a screenshot (`shoot`) of the review stage, in the same wide and narrow
   loop: `team-builder-skill-review`. Read how `shoot` stores or compares images. If it compares
   against committed baseline files, say so in the report and do NOT create image files by hand.

## Write set (exact)

- Files under `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/` only
- the deliverable

## Verify

Do NOT run `npm run verify`, any `nx` command, Playwright, `build`, `serve`, `dev`, `e2e` or
`package`. CI runs the scenarios. Run only:

- `npx tsc --noEmit --project <the tsconfig of libs/frontend/webview-e2e-harness that includes the specs>`
- `npx eslint <changed files>`

Because you cannot run the scenarios, read each locator against the template two times, and list
each locator with the template line that it matches in the report.

## Mandatory rules

- Work only in the task worktree. Electron is the priority host; the renderer lives in
  `apps/ptah-extension-webview`; do not edit it.
- Never run commit, stage, push, `git restore`, `git checkout -- <path>`, `git reset`, `git stash`,
  `git clean`. Report an unexpected change; do not revert it.
- No home paths with a user name in any file.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/e2e-scenarios-report.md`, short Simplified Technical English:
what changed, the locator table, each command with its real result, open risks. Reply with one
short message.
