# Lane brief: B8-B10 frontend re-review of fix 2 + fix 3 (kind: review)

Working directory: the task worktree for branch `feat/setup-stack-skills`. Do not use any other
checkout. Write only the deliverable file. Do not edit source files. Do not commit or push.
The implementer is codex. Use a family that is not codex.

## Objective

Short, focused re-review of the AI team builder frontend after fix 2 and fix 3. Check on disk.
Earlier "Pass 100/100" verdicts were wrong before. The earlier review is
`.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10.md` (verdict Blocker, three Serious findings).
Confirm that each Serious finding is closed. Look for new defects in the fix 2 + fix 3 diff.

## Read set (the diff is in the working tree; the files are new or changed)

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.{ts,html,spec.ts}`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.{ts,spec.ts}`
- `libs/shared/src/lib/types/rpc.types.ts` (`git diff` of the optional `failedSkill?`, `reason?`)
- Reports: `B8-fix2-report.md`, `B8-fix3-report.md`; decisions: `decisions.md` (last two sections)

## Check (Pass or Fail with file:line evidence)

1. Owner decision: prompt shown; two labeled radios in one fieldset; no default; Continue and
   Skip blocked until a choice when `tolerate` or `do_not_copy` facts exist; the choice reaches
   the chat intent; the guidance block is under 2 KB; guidance text from the backend cannot
   break out of the intent (check for injection of instructions: facts are repo-derived text).
2. Failed skill: the page names the failed skill and the installed skills; no chat launch after
   a partial failure; launch only after full success.
3. Workspace change, Back, destroy, double click, request races: stage, loading and
   `starting()` cannot stay stuck; the previous workspace lists are cleared; stale async results
   are dropped (check `requestVersion` and `workspaceRoot` guards, also in the analysis load).
4. Consent: unchecked by default; install blocked without consent; consent record uses the
   preview content hash; review actions disabled during install; no second install possible.
5. Angular rules: standalone, OnPush, `inject()`, `input()`/`output()`, signals, no
   `@Input`/`@Output`, `NgModule`, constructor injection, no `[innerHTML]`, no raw error text,
   `ClaudeRpcService` only, existing `libs/frontend/ui` primitives. Accessibility: fieldset
   legend, labels, focus, inert controls during install.
6. Write set: `git status --short` shows no frontend change outside
   `libs/frontend/onboarding/src/lib/proposal/`; the only shared change is optional fields in
   `rpc.types.ts`; nothing under `apps/ptah-extension-webview/**`;
   `tools/ui-class-audit/baseline.json` unchanged.
7. The file `team-builder-guidance-brief.ts` and its spec: the lane saw "a concurrent change".
   Check that the content is only what fix 3 intends. Report anything else.

## Verify (real test run, mandatory)

`npm run verify -- -t test -p @ptah-extension/onboarding` (filter the output). Confirm the header
"Running target test for 1 projects". Report suite and test counts from the real run. If Nx is
blocked by `spawn EPERM`, run focused Jest with `--runInBand --coverage=false --runTestsByPath`
and say so.

## Mandatory rules

- Work only in the task worktree. Never touch the main checkout.
- Scoped verification only. No workspace-wide checks. No `build`, `serve`, `dev`, `e2e`,
  `package` target. Another verify may run: it waits in the queue; do not stop it.
- Never run `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`,
  commit, push, force push, history rewrite.
- No personal data or home path with a user name in the deliverable.
- Write short Simplified Technical English.

## Deliverable

`.ptah/specs/TASK_2026_1162_56c1/code-review-B8-B10-2.md`: score 0-100, verdict (Pass, Pass with
notes, Blocker), table of checks 1-7, findings with severity (Blocker, Serious, Minor), the test
command and its real result.

## Reply format

One short message: verdict, score, Serious and Blocker findings, test result.
