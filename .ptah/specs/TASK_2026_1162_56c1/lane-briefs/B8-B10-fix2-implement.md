# Lane brief: B8-B10 fix round 2 (kind: implement)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Do not commit, push or stage. Leave files unstaged.

## Objective

An independent review (`.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10.md`, read it fully)
rated the AI team builder skill flow 64/100, Blocker. Fix every item below. Read
`team-builder-start.page.ts`, its `.html`, the store, the review and consent components, and
`libs/shared/src/lib/types/rpc.types.ts` (types around the skill RPC) before you edit.
Phase 3 acceptance (program task): "Setup of a repository with weak practices writes labeled facts
and asks for the owner decision." The scope rules of that phase: (1) one owner decision at setup:
match the repository, or raise the standard; (2) new code follows the skill, a change to old code
stays local unless the task is a refactor; (3) debt is recorded, not fixed silently; (4) a phase
can say "cannot verify" and propose a baseline task.

## Items

### A. Owner decision (Blocker)

1. In the review stage, show the host text `ownerDecisionPrompt` (store it from the
   `wizard:get-project-guidance` response; add a store signal).
2. Show two radio choices with visible labels and one `fieldset`/legend: "Match the repository"
   and "Raise the standard". Use existing `libs/frontend/ui` primitives if one fits. No default
   choice. Store the choice in the store (`ownerDecision`: `'match' | 'raise' | null`).
3. Rule: when any guidance fact has the label `tolerate` or `do_not_copy` (weak practice), the
   owner decision is required before Continue and before Skip. Block with a clear inline message.
4. Where the choice goes: no new RPC. When the page launches the team builder chat, append a
   guidance block to the intent that is sent to `launcher.launchTeamBuilder(...)`. The block is
   plain text: the facts grouped by label (Follow, Tolerate, Do not copy), the owner decision, and
   these three rules: new code follows the installed skills; a change to old code stays local
   unless the task is a refactor; debt is recorded and not fixed silently. Keep the user's own
   intent first and unchanged. Build the text in a small pure function in a new file
   `team-builder-guidance-brief.ts` with its own spec. Keep it short (under 2 KB).
5. Analysis input: today the page always sends `{ projectType: 'unknown', frameworks: [] }`.
   Read the host methods `wizard:list-analyses` and `wizard:load-analysis` (types around
   `rpc.types.ts:1590`; handlers in `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`).
   If a stored analysis exists for the workspace, load the newest one through `ClaudeRpcService`
   and send its `projectType`, `frameworks`, and the optional fields that
   `WizardGetProjectGuidanceParams` accepts. If none exists, send the empty analysis and show a
   short note in the review stage: "No stored project analysis. Guidance is limited." Do not call
   `wizard:deep-analyze` (it is heavy). If a host contract blocks this, do not change the backend:
   write the exact blocker in your report.
6. Show the label `do_not_copy` as "Do not copy" (map the three labels in the component).

### B. Install failure names the skill (Serious)

1. `libs/shared/src/lib/types/rpc.types.ts`: add optional `failedSkill?: string` and
   `reason?: string` to `WizardInstallSkillsWithConsentResponse` (the host already returns them,
   `setup-rpc.handlers.ts` install method). Nothing else in that file.
2. The page: on `success: false` show "Could not install <failedSkill>: <reason>" and the list of
   skills that did install, set `installed` before the throw. When the RPC call itself fails
   (`isSuccess()` false), reset `installed` to an empty list so that an old list does not show.
   Do not launch chat after a failure.

### C. Install in progress locks the page (Serious)

While stage is `installing` or `launching`: Back, Skip and Continue of the review and the
consent dialog must be disabled or hidden. Escape and backdrop click on the consent dialog must
not leave stage and dialog out of step: if the dialog closes during install, the page must reopen
it or the page must keep it open (read `native-modal.component.ts` in `libs/frontend/ui`; do not
edit that file; use its inputs or an `effect`/handler on your side). Focus returns to the
trigger when the dialog closes in a normal way.

### D. Workspace change clears all lists (Serious)

In the workspace effect clear `recommendations`, `searchResults`, `guidanceFacts`,
`ownerDecision`, `installed`, `preview`, `approvedIds`, `selectedIds`, search text state and
errors, keep the message "Workspace changed. Review skills again."

### E. Cheap minors

1. A failed `wizard:get-project-guidance` call: log with the injected `Logger` if the library uses
   one (check how other onboarding files log); keep the previous facts out of the screen (clear
   `guidanceFacts`) and show a short note "Could not load project guidance."
2. Launching stage: add a Back control (calls `back()`).
3. Store: expose read-only signals (`asReadonly()`) and add the methods that the page needs
   (`setStage`, `reset...`) instead of public writable signals, only if this stays a small change;
   otherwise leave it and say so in the report.
4. Raw `Error.message` shown to the user: keep, but cut to 200 characters. Never show a secret.
5. Add spec cases: Back sets `stage()` to `'intent'`; install failure shows failed skill and
   reason and does not launch chat; owner decision is required for weak-practice facts and
   reaches the launch intent; workspace change clears the lists; `installing` disables Back, Skip
   and Continue.

### F. Two lint defects from the fix round 1 (backend, trivial)

1. `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts` line about 31: the import
   `TOKENS, type Logger` from `@ptah-extension/vscode-core` is unused now. Remove the unused
   names. If `vscode-core` is still needed for other names, keep only those.
2. `libs/backend/rpc-handlers/src/lib/di/register.ts`: remove the blank line before the final `}`
   of `registerSkillServices` (prettier).

## Write set (exact, nothing else)

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`, `.html`, `.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.{ts,html,spec.ts}`
- new: `libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.ts` and `.spec.ts`
- `libs/shared/src/lib/types/rpc.types.ts` (item B.1 only)
- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts` (item F.1 only)
- `libs/backend/rpc-handlers/src/lib/di/register.ts` (item F.2 only)

Do not edit `setup-rpc.handlers.ts`: a review of it runs now. Nothing else under
`libs/frontend/**`. Nothing in `apps/ptah-extension-webview/**`. Not
`tools/ui-class-audit/baseline.json`. Do not touch `libs/backend/harness-sync/**`.

## Code rules

Standalone OnPush components, signals, `inject()`, `input()`/`output()`, `ClaudeRpcService` only,
existing `libs/frontend/ui` primitives, no `[innerHTML]`, no `any`, no `@ts-ignore`, no
`as unknown as X`, no `console.*`, no swallowed error without a log. Skill and guidance text is
shown with interpolation only. Apply the angular-frontend-patterns skill if you can load it.

## Verify (scoped only; run them yourself and report real results)

1. `npm run verify -- -t test -p @ptah-extension/onboarding 2>&1 | tail -40`
2. `npm run verify -- -t typecheck-templates -p ptah-extension-webview 2>&1 | tail -30`
3. `npm run verify -- -t typecheck,lint -p @ptah-extension/onboarding,@ptah-extension/shared,@ptah-extension/rpc-handlers 2>&1 | tail -40`

Confirm the header project count of each run. If Nx fails with `spawn EPERM`, say so in the
report and run the focused Jest specs directly; do not claim a pass that you did not see. Other
checks queue behind a shared lock; wait for your slot.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Scoped verification only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e` or
  `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push or history rewrite. Report an unexpected change; do not revert it.
- No personal data or home paths with a user name in files or in the report.
- Electron first. The renderer lives in `apps/ptah-extension-webview`; do not edit it.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/B8-B10-fix2-report.md`: per item A1..F2 done or not done with the
file, the real test results (command, header, counts), and every blocker.

## Reply format

One short message: done or blocked, files changed, test results.
