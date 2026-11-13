# Lane brief: B8 fix round 3, owner decision and page lock (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Do not commit, push or stage. Leave files unstaged.

START ONLY AFTER lane 64c694f2 (B8-fix2) has ended. This brief is the delta that
`lane-briefs/B8-fix2-implement.md` does not cover. Read these first:
`.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10.md`, `B8-fix2-report.md`,
`lane-briefs/B8-B10-fix2-implement.md` (items A, C, E1, E2, F are the source of this brief), and the
current `team-builder-*` files (fix2 changed them: do not redo its work, do not undo it).

Phase 3 acceptance (program task): "Setup of a repository with weak practices writes labeled facts
and asks for the owner decision." Scope rules: (1) one owner decision at setup: match the
repository, or raise the standard; (2) new code follows the skill, a change to old code stays local
unless the task is a refactor; (3) debt is recorded, not fixed silently; (4) a phase can say
"cannot verify" and propose a baseline task.

## Items

### A. Owner decision (Blocker for the acceptance)

1. In the review stage show the host text `ownerDecisionPrompt` (from the
   `wizard:get-project-guidance` response). Add a store signal for it.
2. Show two radio choices with visible labels in one `fieldset` with a `legend`: "Match the
   repository" and "Raise the standard". Use a `libs/frontend/ui` primitive if one fits. No default
   choice. Store the choice (`ownerDecision`: `'match' | 'raise' | null`). `reset()` clears it.
3. Rule: when any guidance fact has the label `tolerate` or `do_not_copy`, the owner decision is
   required before Continue and before Skip. Block with a clear inline message.
4. Where the choice goes: no new RPC, no file write. When the page launches the team builder chat,
   append a short plain-text guidance block to the intent that goes to
   `launcher.launchTeamBuilder(...)`: the facts grouped by label (Follow, Tolerate, Do not copy), the
   owner decision, and the three rules: new code follows the installed skills; a change to old code
   stays local unless the task is a refactor; debt is recorded and not fixed silently. The user's own
   intent stays first and unchanged. Build the text in a pure function in a new file
   `team-builder-guidance-brief.ts` with its own `.spec.ts`. Keep it under 2 KB.
5. Analysis input: the page sends `{ projectType: 'unknown', frameworks: [] }` today. Read the host
   methods `wizard:list-analyses` and `wizard:load-analysis` (types near `rpc.types.ts:1590`;
   handlers in `setup-rpc.handlers.ts`, read only). If a stored analysis exists for the workspace,
   load the newest through `ClaudeRpcService` and send its `projectType`, `frameworks` and the
   optional fields that `WizardGetProjectGuidanceParams` accepts. If none exists, send the empty
   analysis and show: "No stored project analysis. Guidance is limited." Do not call
   `wizard:deep-analyze`. If a host contract blocks this, do not change the backend: write the exact
   blocker in the report.
6. Show label `do_not_copy` as "Do not copy" (map the three labels in the component).

### C. Page lock during install and launch

While stage is `installing` or `launching`: Back, Skip and Continue of the review and the consent
dialog must be disabled or hidden. The launching stage has a Back control that calls `back()`. If
fix2 already did a part of this, check it and fill the gaps only.

### E. Specs

Add cases: owner decision required for weak-practice facts (Continue and Skip blocked, inline
message); the choice reaches the launch intent; guidance brief function output (grouping, size under
2 KB, user intent first); no stored analysis shows the limited-guidance note; `installing` disables
Back, Skip and Continue; Back sets `stage()` to `'intent'`.

### F. Two lint defects (backend, trivial)

1. `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts` (about line 31): the import
   `TOKENS, type Logger` from `@ptah-extension/vscode-core` is unused. Remove the unused names. Keep
   names that other code in the file uses.
2. `libs/backend/rpc-handlers/src/lib/di/register.ts`: remove the blank line before the final `}` of
   `registerSkillServices` (prettier).

## Write set (exact, nothing else)

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts` (and its spec if fix2 added one)
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.{ts,html,spec.ts}`
- new: `libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.ts` and `.spec.ts`
- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts` (item F.1 only)
- `libs/backend/rpc-handlers/src/lib/di/register.ts` (item F.2 only)
- the deliverable

Do not edit `setup-rpc.handlers.ts`, `skills-sh*`, `libs/shared/**`, `libs/backend/harness-sync/**`,
`apps/ptah-extension-webview/**` or `tools/ui-class-audit/baseline.json`.

## Code rules

Standalone OnPush components, signals, `inject()`, `input()`/`output()`, `ClaudeRpcService` only,
existing `libs/frontend/ui` primitives, no `[innerHTML]`, no `any`, no `@ts-ignore`, no
`as unknown as X`, no `console.*`, no swallowed error without a log. Skill and guidance text by
interpolation only.

## Verify (scoped only; run them and report real results)

1. `npm run verify -- -t lint,typecheck,test -p @ptah-extension/onboarding 2>&1 | tail -40`
2. `npm run verify -- -t typecheck-templates -p ptah-extension-webview 2>&1 | tail -20`
3. `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers 2>&1 | tail -30`

Confirm the header project count of each run. If Nx fails with `spawn EPERM` or the verify lock does
not start in 10 minutes, say so and run the focused Jest specs directly with
`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`.
Do not claim a pass that you did not see.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Scoped verification only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e` or `package`.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`, commit,
  push, force push or history rewrite. Report an unexpected change; do not revert it.
- No personal data or home paths with a user name in files or in the report.
- Electron first. The renderer lives in `apps/ptah-extension-webview`; do not edit it.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B8-fix3-report.md`: per item A1..A6, C, E, F1, F2 done or not done
with the file, the real test results (command, header, counts), every blocker.

## Reply format

One short message: done or blocked, files changed, test results.
