# Lane brief: B8-B10 frontend review (kind: review)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Write only the deliverable file. Do not edit source files.

## Objective

Independent review of the AI team builder skill flow in the setup hub. Check on disk. Earlier
reports ("Pass 100/100") were wrong before. The implementer is codex; you are a different family.

## Read set

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`, `.html`, `.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.{ts,html,spec.ts}`
- `.ptah/specs/TASK_2026_1162_56c1/ui-plan.md`, `B8-B10-implementation.md`
- RPC types: `libs/shared/src/lib/types/rpc.types.ts` (methods `wizard:recommend-skills`,
  `wizard:get-project-guidance`, `wizard:search-skills`, `wizard:preview-skills-for-consent`,
  `wizard:install-skills-with-consent`)
- Phase 3 section of `.ptah/specs/TASK_2026_977_0876/task-description.md` (starts at the line
  `### Phase 3 - Setup: skills by tech stack`)

## Acceptance to check (Pass or Fail with file:line evidence)

1. The recommendations of the detected tech stack show FIRST (`wizard:recommend-skills`,
   `wizard:get-project-guidance`). Search is an addition, not the entry point.
2. Project guidance shows labeled facts `follow`, `tolerate`, `do not copy`. Check what the page
   does with the owner decision ("match the repository" or "raise the standard") for weak
   repository practices. Report whether the UI asks for it and where the answer goes. If the UI
   does not ask for it, say so as a finding: do not guess the backend contract.
3. A third-party skill with scripts needs preview, then explicit per-skill consent (unchecked by
   default), then install. The install button stays blocked without consent. The consent record
   uses the content hash of the preview.
4. Install failure: the page shows which skill failed and which skills were installed. The page
   does not launch chat after a partial failure.
5. Stale-state safety: workspace change, Back, destroy, double click, request races, debounce of
   search. Check that stage, loading and `starting()` cannot stay stuck.
6. Angular rules: standalone, OnPush, `inject()`, `input()`/`output()`, signals, no
   `@Input`/`@Output`, no `NgModule`, no constructor injection, no `[innerHTML]`, no raw error
   text with secrets, `ClaudeRpcService` only, existing `libs/frontend/ui` primitives.
7. Write set: `git status --short` shows no change outside `libs/frontend/onboarding/src/lib/proposal/`
   (for the frontend). Nothing under `apps/ptah-extension-webview/**`. `tools/ui-class-audit/baseline.json`
   unchanged.
8. Accessibility: dialog role, focus return, labels, keyboard.

## Verify (real test run, mandatory)

`npm run verify -- -t test -p @ptah-extension/onboarding 2>&1 | tail -40`

Confirm "Running target test for 1 projects". If `spawn EPERM` blocks Nx, run the focused specs
with `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
--runTestsByPath <spec files>` and say so. Report the real result.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Scoped verification only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e`,
  `package` target.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push, history rewrite.
- No personal data or home paths with a user name in the deliverable.
- Write short Simplified Technical English.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10.md`: score 0-100, verdict (Pass, Pass with
notes, Blocker), table of items 1-8 with Pass or Fail and evidence, findings with severity
(Blocker, Serious, Minor), the test command and its real result.

## Reply format

One short message: verdict, score, Serious and Blocker findings, test result.
